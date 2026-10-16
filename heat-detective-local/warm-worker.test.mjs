import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {WarmWorker} from './warm-worker.mjs';

test('warmup deadline stays terminal and refuses reuse while cleanup is pending',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'heat-detective-worker-test-'));
  const worker=new WarmWorker(directory);
  let rejected=false;
  try{
    fs.writeFileSync(path.join(directory,'state.json'),JSON.stringify({state:'starting',message:'stale status'}));
    worker.worker={id:'test-only',directory,child:{},state:'starting',startedMs:Date.now()-120001,lastHeartbeat:Date.now(),pending:{dispatched:false,reject:()=>{rejected=true;}}};
    worker.poll();
    assert.equal(worker.status().state,'failed');
    assert.equal(worker.worker.forceStop,true);
    assert.ok(fs.existsSync(path.join(directory,'stop.flag')));
    assert.equal(rejected,false,'waiting slot must remain reserved until controller closes');
    worker.poll();
    assert.equal(worker.status().state,'failed','stale controller state must not override timeout');
    assert.throws(()=>worker.run('abcdef123456',{}),/cleanup is still pending/);
  }finally{
    clearInterval(worker.timer);worker.worker=null;
    // Only these files created by this test are removed, never recursive paths.
    for(const name of ['state.json','stop.flag','owner-heartbeat']){const file=path.join(directory,name);if(fs.existsSync(file))fs.unlinkSync(file);}
    fs.rmdirSync(directory);
  }
});
