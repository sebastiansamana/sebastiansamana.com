import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';

const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const write=(file,value)=>{const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2));fs.renameSync(temp,file);};
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function rhinoProcesses(){
  const code="@(Get-Process Rhino -ErrorAction SilentlyContinue | ForEach-Object { @{pid=$_.Id;startTicks=$_.StartTime.ToUniversalTime().Ticks.ToString()} }) | ConvertTo-Json -Compress";
  const raw=execFileSync('powershell.exe',['-NoProfile','-Command',code],{windowsHide:true,encoding:'utf8'}).trim();
  const values=raw?JSON.parse(raw):[];return Array.isArray(values)?values:[values];
}

export class WarmWorker {
  constructor(root){
    this.root=root;this.runtime=path.join(root,'runtime');this.worker=null;
    this.timer=setInterval(()=>this.poll(),250);this.timer.unref();
    process.once('exit',()=>{try{if(this.worker?.child)fs.writeFileSync(path.join(this.worker.directory,'stop.flag'),'Bridge exited');}catch{}});
  }
  status(){
    const w=this.worker;
    return w?{state:w.state,startedAt:w.startedAt,readyAt:w.readyAt,message:w.message,workerId:w.id}:{state:'stopped',message:'Prepare the private engine before a fresh analysis'};
  }
  prepare(){
    if(this.worker?.child)return this.status();
    const id=crypto.randomUUID(),name=id.replaceAll('-','').slice(0,12),directory=path.join(this.runtime,'workers',name);
    fs.mkdirSync(directory,{recursive:true});
    const safety={workerId:id,protectedRhinoPids:rhinoProcesses().map(p=>p.pid),engineConfigSha256:hash(path.join(this.runtime,'engine-config.json')),bridgeCodeSha256:hash(path.join(this.root,'bridge_engine.py'))};
    write(path.join(directory,'safety.json'),safety);
    fs.writeFileSync(path.join(directory,'owner-heartbeat'),new Date().toISOString());
    fs.writeFileSync(path.join(directory,'prepare.py'),`import sys\nsys.path.insert(0, ${JSON.stringify(this.root)})\nimport bridge_engine\nbridge_engine.prepare_worker(${JSON.stringify(directory)})\n`);
    const log=fs.openSync(path.join(directory,'controller.log'),'w');
    const w={id,name,directory,safety,state:'starting',startedAt:new Date().toISOString(),startedMs:Date.now(),message:'Warming private Rhino and Grasshopper',log,pending:null,lastHeartbeat:0};
    this.worker=w;
    const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(this.root,'warm_worker.ps1'),'-WorkerDirName',name],{windowsHide:true,stdio:['ignore',log,log]});w.child=child;
    const ended=(error)=>{
      if(!w.child)return;
      w.child=null;w.state=w.forceStop||error?'failed':'stopped';w.message=w.forceStop?w.message:error?.message||'Private worker stopped';
      if(w.pending){w.pending.reject(error||new Error('Private worker stopped before reset completed'));w.pending=null;}
      try{fs.closeSync(log);}catch{}
    };
    child.on('error',ended);child.on('close',code=>ended(code?new Error(`Private worker ended (exit ${code}); see controller.log`):null));
    return this.status();
  }
  poll(){
    const w=this.worker;if(!w?.child)return;
    try{
      if(Date.now()-w.lastHeartbeat>2000){fs.writeFileSync(path.join(w.directory,'owner-heartbeat'),new Date().toISOString());w.lastHeartbeat=Date.now();}
      let state;try{state=read(path.join(w.directory,'state.json'));}catch{}
      if(state&&!w.forceStop){w.state=state.state;w.message=state.message;}
      if(!w.readyAt&&!w.forceStop&&Date.now()-w.startedMs>=120000)this.stop('Private engine warmup exceeded 120 seconds; owned worker is being safely closed',true);
      if(w.state==='failed'&&!w.forceStop)this.stop(w.message||'Private worker preparation failed',true);
      if(w.state==='ready'&&!w.readyAt){const p=read(path.join(w.directory,'prepared.json'));w.readyAt=p.readyAt;}
      if(w.pending?.dispatched){
        let completion;try{completion=read(path.join(w.directory,'completion.json'));}catch{}
        if(completion?.commandId===w.pending.commandId){const done=w.pending;w.pending=null;done.resolve({completedAt:completion.completedAt,workerId:w.id});}
      }
      if(w.pending&&!w.pending.dispatched&&w.state==='ready'&&!w.forceStop)this.dispatchPending(w);
      if(w.forceStop&&!w.stopBusy&&fs.existsSync(path.join(w.directory,'ownership.json'))){
        w.stopBusy=true;
        const stopper=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(this.root,'stop_worker.ps1'),'-WorkerDirName',w.name],{windowsHide:true,stdio:['ignore',w.log,w.log]});
        stopper.on('error',()=>{w.stopBusy=false;});stopper.on('close',()=>{w.stopBusy=false;});
      }
    }catch(error){this.stop(error.message,true);}
  }
  run(jobDirName,request){
    this.prepare();const w=this.worker;
    if(w.forceStop)throw new Error('Private worker cleanup is still pending');
    if(w.pending)throw new Error('Private worker already has a request');
    return new Promise((resolve,reject)=>{w.pending={jobDirName,request,commandId:crypto.randomUUID(),resolve,reject,dispatched:false};});
  }
  dispatchPending(w){
    const pending=w.pending;
    try{
      if(w.forceStop||fs.existsSync(path.join(w.directory,'stop.flag')))throw new Error('Private worker is retiring; wait for safe cleanup');
      if(hash(path.join(this.runtime,'engine-config.json'))!==w.safety.engineConfigSha256||hash(path.join(this.root,'bridge_engine.py'))!==w.safety.bridgeCodeSha256)throw new Error('Warm runtime changed; prepare a new private worker');
      const identity=read(path.join(w.directory,'ownership.json'));
      const processes=rhinoProcesses();
      if(identity.workerId!==w.id||w.safety.protectedRhinoPids.includes(identity.pid)||!processes.some(p=>p.pid===identity.pid&&p.startTicks===identity.processStartTicksUtc))throw new Error('Private worker process identity cannot be verified');
      pending.request.protectedRhinoPids=[...new Set([...w.safety.protectedRhinoPids,...processes.filter(p=>p.pid!==identity.pid).map(p=>p.pid)])];
      pending.request.workerIdentity=identity;
      write(path.join(this.runtime,'jobs',pending.jobDirName,'request.json'),pending.request);
      pending.dispatched=true;w.state='busy';
      write(path.join(w.directory,'command.json'),{commandId:pending.commandId,jobDirName:pending.jobDirName});
    }catch(error){pending.reject(error);w.pending=null;this.stop(error.message,true);}
  }
  stop(reason='Private worker stopped',force=false){
    const w=this.worker;if(!w?.child)return;
    w.forceStop=force;w.message=reason;
    if(force)w.state='failed';
    try{fs.writeFileSync(path.join(w.directory,'stop.flag'),reason);}catch(error){w.message=reason+'; stop flag could not be written: '+error.message;}
    // Keep a waiting request reserved until COM has actually released its worker.
  }
}
