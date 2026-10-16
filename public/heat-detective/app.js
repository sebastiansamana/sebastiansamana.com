import { BuildingViewer } from './viewer.js';

const $ = id => document.getElementById(id);
const number = (v,d=1) => Number.isFinite(Number(v)) ? Number(v).toLocaleString('en-GB',{maximumFractionDigits:d,minimumFractionDigits:d}) : '—';
const text = (id,value) => { $(id).textContent=value; };
const show = (id,value=true) => { $(id).hidden=!value; };
const make = (tag,content,className) => {const el=document.createElement(tag);if(content!==undefined)el.textContent=content;if(className)el.className=className;return el;};
let manifest,baseline,ideas,viewer,phase='baseline',revision=0,bridge=null,requestSerial=0,loaded=false,loading=false,completedRevision=null;
const history=[];
let previousParameters='';
const parameterFields = {g:'param-g',U:'param-U',dayACH:'param-day',nightACH:'param-night',screenOpacity:'param-screen'};
const initialData=Promise.all(['./model/object-manifest.json','./data/baseline.json','./data/ideas.json'].map(async url=>{const r=await fetch(url);if(!r.ok)throw Error('Could not load the prepared case study. Please reload.');return r.json();})).then(data=>{[manifest,baseline,ideas]=data;initialiseData();}).catch(e=>{text('upload-error',e.message);throw e;});

function parameters(){return Object.fromEntries(Object.entries(parameterFields).map(([key,id])=>[key,Number($(id).value)]));}
function defaultParameters(){const p=baseline.parameters;return {g:p.g,U:p.u,dayACH:p.ach_day,nightACH:p.ach_night,screenOpacity:0};}
function setParameters(p){for(const [key,id]of Object.entries(parameterFields))$(id).value=p[key];previousParameters=JSON.stringify(parameters());}
function initialiseData(){
  setParameters(defaultParameters());
  text('baseline-eval',baseline.evalId);text('baseline-score',number(baseline.metrics.scoreKh));text('baseline-peak',number(baseline.metrics.peakOperativeC,2));text('baseline-hours',number(baseline.metrics.occupiedHoursAbove28,0));
  text('baseline-method','Official supplied reference '+baseline.evalId+' · fixed single atrium · one future Manchester hot week. 320.6 K·h sums occupied temperature exceedance above 26°C. This is not a fresh calculation of the uploaded file. Interior wall moves do not redefine the thermal room, and no vertical temperature profile is calculated.');
  drawChart();
  for(const idea of ideas.ideas){
    const card=make('button',undefined,'idea-card');card.type='button';
    const img=make('img');img.src='./images/'+idea.id+'.png';img.alt=idea.title+' — AI concept illustration';img.loading='lazy';
    img.addEventListener('error',()=>{const placeholder=make('div','Concept preview','idea-placeholder');img.replaceWith(placeholder);},{once:true});
    const label=make('div',undefined,'idea-label');label.append(make('strong',idea.title),make('p',idea.summary));card.append(img,label);card.addEventListener('click',()=>openIdea(idea));$('ideas-list').append(card);
  }
  const categories=[...new Set(manifest.objects.filter(o=>o.editable&&o.vertexCount).map(o=>o.originalCategory))].sort();
  for(const cat of categories){const option=make('option',cat.split('::').pop());option.value=cat;$('category-filter').append(option);}
  $('category-filter').value=categories.find(c=>c.endsWith('Exterior Walls'))||'';populatePicker();
  text('structural-count',manifest.objects.filter(o=>o.layer==='structural').length.toLocaleString());text('changeable-count',manifest.changeableObjectCount.toLocaleString());
  const information=[['Case study','Geoffrey Manton · Group 1'],['Source',manifest.sourceFileName],['Layer mapping','239 protected / 9,384 changeable'],['Display','Derived from this exact Rhino file; cached mesh geometry retained.'],['Identity check','File size + SHA-256. This demo accepts only the supplied case study.'],['Privacy','The selected .3dm is verified in your browser. The original file is not uploaded to the website.'],['Coordinates','Metres, Z up. Source model uses millimetres.'],['SHA-256',manifest.sourceSha256],['Analysis scope','Original fixed atrium; no room-level or structural assessment.']];
  for(const [label,value]of information){const row=make('div',undefined,'info-row');row.append(make('strong',label),make('p',value));$('model-information').append(row);}
}
function drawChart(){
  const svg=$('baseline-chart'),ns='http://www.w3.org/2000/svg',values=baseline.hourly.operativeC;
  const node=(tag,attrs)=>{const e=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);svg.append(e);return e;};
  const y=v=>88-(v-15)/30*76;
  [20,26,40].forEach(v=>{node('line',{x1:22,y1:y(v),x2:297,y2:y(v),stroke:v===26?'#be6b56':'#e3e6e0','stroke-dasharray':v===26?'3 3':'0'});node('text',{x:0,y:y(v)+3,fill:'#727a71','font-size':8}).textContent=v;});
  node('polyline',{points:values.map((v,i)=>(22+i/(values.length-1)*275)+','+y(v)).join(' '),fill:'none',stroke:'#bd4c3e','stroke-width':1.7});
  node('text',{x:22,y:99,fill:'#727a71','font-size':8}).textContent='Day 1';node('text',{x:275,y:99,fill:'#727a71','font-size':8}).textContent='Day 7';
}
function populatePicker(){const category=$('category-filter').value;const matches=manifest.objects.filter(o=>o.editable&&o.vertexCount&&(!category||o.originalCategory===category));$('element-picker').replaceChildren(make('option','Choose an element…'));$('element-picker').firstChild.value='';for(const [i,o]of matches.entries()){const opt=make('option',`${o.originalCategory.split('::').pop()} ${i+1} · ${o.id.slice(0,8)}`);opt.value=o.id;$('element-picker').append(opt);}}

async function upload(file){
  if(!file||loaded||loading)return;loading=true;
  show('upload-progress');text('upload-error','');$('model-file').disabled=true;
  try{
    await initialData;
    if(!file.name.toLowerCase().endsWith('.3dm'))throw Error('Choose the prepared Geoffrey Manton .3dm file.');
    await new Promise((resolve,reject)=>{const worker=new Worker('./model-reader.worker.js');worker.onmessage=({data})=>{if(data.error){worker.terminate();reject(Error(data.error));return;}if(data.progress){$('upload-bar').value=data.progress;text('upload-status',data.message);}if(data.verified){worker.terminate();resolve();}};worker.onerror=()=>{worker.terminate();reject(Error('The file could not be verified. Please try again.'));};worker.postMessage({file,expected:manifest});});
    text('upload-status','Preparing the interactive display…');const response=await fetch('./model/geometry.bin');if(!response.ok)throw Error('Could not load the display geometry.');const buffer=await response.arrayBuffer();
    if(buffer.byteLength!==manifest.geometryBytes)throw Error('The display geometry is incomplete. Please reload.');
    $('upload-bar').value=90;show('welcome',false);show('workspace');
    viewer=new BuildingViewer($('viewer'),manifest,buffer,{onSelect:updateSelection,onMove:(_,delta)=>{['x','y','z'].forEach((a,i)=>$('move-'+a).value=numberRaw(delta[i]));},onCommit:event=>{revision++;addHistory(event.action==='reset'?'Reset geometry':event.action==='undo'?'Undid element move':event.action==='redo'?'Restored element move':'Moved '+(viewer.objects.get(event.id)?.originalCategory.split('::').pop()||'element'));updateChanges();}});
    loaded=true;text('header-project','Geoffrey Manton / Group 1');text('model-status','10,325 Rhino elements · Identity verified');
    $('cut-height').min=Math.floor(viewer.bounds.min.z);$('cut-height').max=Math.ceil(viewer.bounds.max.z);$('cut-height').value=8;text('cut-output','8 m');
    setPhase('baseline');updateChanges();
  }catch(e){text('upload-error',e.message);show('welcome');show('workspace',false);show('upload-progress',false);$('model-file').disabled=false;}finally{loading=false;}
}
const numberRaw=v=>Math.round(v*1000)/1000;
$('model-file').addEventListener('change',e=>upload(e.target.files[0]));
['dragenter','dragover'].forEach(name=>$('drop-zone').addEventListener(name,e=>{e.preventDefault();$('drop-zone').classList.add('dragging');}));
['dragleave','drop'].forEach(name=>$('drop-zone').addEventListener(name,e=>{e.preventDefault();$('drop-zone').classList.remove('dragging');}));$('drop-zone').addEventListener('drop',e=>upload(e.dataTransfer.files[0]));

function setPhase(value){
  if(!viewer)return;phase=value;document.querySelector('.sidebar').scrollTop=0;
  document.querySelectorAll('[data-phase]').forEach(el=>{if(el.dataset.phase===value)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});
  ['baseline','edit','compare'].forEach(p=>show(p+'-panel',p===value));
  const labels={baseline:['01 / BASELINE','Know where you start.','Existing building'],edit:['02 / PAUSE & EDIT','Make room for change.','Ⅱ Analysis paused'],compare:['03 / COMPARE & IDEAS','See what changes.','Review this version']};
  const l=labels[value];text('panel-eyebrow',l[0]);text('panel-title',l[1]);text('phase-state',l[2]);
  viewer.setEditable(value==='edit');show('selection-tip',value==='edit'&&!viewer.selected);text('viewport-label',revision?'DESIGN VERSION '+revision:'EXISTING BUILDING');
  text('analysis-status',value==='edit'?'Paused · No calculations while editing':value==='baseline'?'Official supplied reference · No new calculation':'Compare results & prepared concepts');
  updateChanges();
}
document.querySelectorAll('[data-phase]').forEach(el=>el.addEventListener('click',()=>setPhase(el.dataset.phase)));
$('begin-edit').onclick=()=>setPhase('edit');$('back-to-edit').onclick=()=>setPhase('edit');
function updateSelection(o,delta){show('selection-empty',!o);show('selection-info',!!o);show('selection-tip',phase==='edit'&&!o);if(!o)return;text('selection-name',o.originalCategory?.split('::').pop()||o.objectName||'Model element');text('selection-lock',o.editable?'Changeable':'Locked');$('selection-lock').className='chip'+(o.editable?'':' locked');text('selection-id',o.id);show('move-controls',o.editable);['x','y','z'].forEach((a,i)=>$('move-'+a).value=numberRaw(delta[i]));if(o.editable)$('element-picker').value=o.id;}
function updateChanges(){if(!viewer)return;const n=viewer.transforms.size;const p=parameters(),defaults=defaultParameters(),changed=Object.keys(p).filter(k=>p[k]!==defaults[k]).length;text('edit-count',n+' moved element'+(n===1?'':'s')+' · '+changed+' input'+(changed===1?'':'s'));show('changed-key',n>0);$('undo').disabled=phase!=='edit'||!viewer.undoStack.length;$('redo').disabled=phase!=='edit'||!viewer.redoStack.length;text('viewport-label',revision?'DESIGN VERSION '+revision:'EXISTING BUILDING');if(completedRevision!==null&&completedRevision!==revision){show('comparison',false);text('result-intro','The last completed calculation belongs to version '+completedRevision+'. Your current version '+revision+' has not been calculated. Resume to analyse it.');text('result-provenance','Previous results remain in the exported design history.');}}
function addHistory(message){history.push({revision,at:new Date().toISOString(),message});text('history-count',history.length);const item=make('div',undefined,'history-item');item.append(make('strong','v'+revision+' · '+message),make('small',new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})));$('history-list').prepend(item);}
$('history-toggle').onclick=()=>show('history-list',$('history-list').hidden);
$('category-filter').onchange=populatePicker;$('element-picker').onchange=e=>viewer?.select(e.target.value);
['x','y','z'].forEach(a=>{const commit=()=>{if(['x','y','z'].some(k=>$('move-'+k).value===''))return;const value=['x','y','z'].map(k=>Number($('move-'+k).value));if(!viewer?.applyTranslation(viewer.selected?.id,value))message('Enter a finite displacement between −30 and 30 metres.');};$('move-'+a).addEventListener('change',commit);$('move-'+a).addEventListener('input',commit);});
$('snap').onchange=e=>viewer?.setSnap(e.target.checked);$('reset-element').onclick=()=>viewer?.applyTranslation(viewer.selected?.id,[0,0,0]);
$('undo').onclick=()=>viewer?.undo();$('redo').onclick=()=>viewer?.redo();
$('reset-design').onclick=()=>{if(phase!=='edit')return;setParameters(defaultParameters());viewer.reset();};
for(const id of Object.values(parameterFields)){const commit=()=>{if(phase!=='edit')return;const next=JSON.stringify(parameters());if(next===previousParameters)return;previousParameters=next;revision++;addHistory('Updated atrium inputs');updateChanges();};$(id).addEventListener('change',commit);$(id).addEventListener('input',commit);}
document.addEventListener('keydown',e=>{if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||!viewer)return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?viewer.redo():viewer.undo();}if(e.key==='Escape')viewer.select(null);});
function view(mode){if(!viewer)return;viewer.setView(mode);$('view-3d').setAttribute('aria-pressed',mode==='3d');$('view-plan').setAttribute('aria-pressed',mode==='plan');text('navigation-hint',mode==='plan'?'Right-drag to pan · Scroll to zoom · Select to move':'Drag to orbit · Scroll to zoom · Right-drag to pan');if(mode==='plan')setCut(true);}
$('view-3d').onclick=()=>view('3d');$('view-plan').onclick=()=>view('plan');$('fit-view').onclick=()=>viewer?.fit();
document.querySelectorAll('[data-camera]').forEach(el=>el.onclick=()=>{if(el.dataset.camera==='top')view('plan');else{view('3d');viewer?.orient(el.dataset.camera);}});
function setCut(value){if(!viewer)return;viewer.setClipping(value,Number($('cut-height').value));$('tool-cut').setAttribute('aria-pressed',value);show('cut-control',value);}
$('tool-cut').onclick=()=>setCut(!viewer?.cut);$('cut-height').oninput=e=>{text('cut-output',number(e.target.value,2)+' m');viewer?.setClipping(true,Number(e.target.value));};
[['show-structural','structural'],['show-changeable','changable'],['show-context','context']].forEach(([id,layer])=>$(id).onchange=e=>viewer?.setVisibility(layer,e.target.checked));
$('tool-structure').onclick=()=>{if(!viewer)return;const isolated=$('tool-structure').getAttribute('aria-pressed')!=='true';$('tool-structure').setAttribute('aria-pressed',isolated);$('show-changeable').checked=!isolated;viewer.setVisibility('changable',!isolated);if(isolated){$('show-structural').checked=true;viewer.setVisibility('structural',true);}};
$('opacity').oninput=e=>viewer?.setOpacity(Number(e.target.value));$('tool-transparent').onclick=()=>{const active=$('tool-transparent').getAttribute('aria-pressed')!=='true';$('tool-transparent').setAttribute('aria-pressed',active);$('opacity').value=active?.18:1;viewer?.setOpacity(active?.18:1);};$('tool-select').onclick=()=>viewer?.select(null);
let messageTimer;function message(value){text('canvas-message',value);show('canvas-message');clearTimeout(messageTimer);messageTimer=setTimeout(()=>show('canvas-message',false),7000);}

function dialog(id){$(id).showModal();}
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
[['connection-button','connection-dialog'],['help-button','help-dialog'],['details-toggle','model-dialog']].forEach(([b,d])=>$(b).onclick=()=>dialog(d));
$('help-connect').onclick=()=>{$('help-dialog').close();dialog('connection-dialog');};
if(location.hostname==='127.0.0.1'&&location.port==='8767')$('bridge-url').value=location.origin;
async function connect(){
  text('connection-status','Connecting to Rhino / Grasshopper…');$('connect-bridge').disabled=true;
  try{const url=new URL($('bridge-url').value);if(!['127.0.0.1','localhost'].includes(url.hostname))throw Error('Use the local bridge on 127.0.0.1 or localhost.');
    const r=await fetch(url.origin+'/api/health',{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('The bridge returned '+r.status);const h=await r.json();if(!h.ready)throw Error(h.message||'The engine is not ready.');
    bridge={url:url.origin,token:h.authToken||$('bridge-token').value,health:h};if(!bridge.token){show('bridge-token-row');throw Error('Enter the token from the local launcher.');}
    $('connection-dot').classList.add('connected');text('connection-status',h.message||'Connected. Resume will submit one version to the local engine.');text('resume-note','Connected to local Rhino / Grasshopper. Edits are submitted only when you resume.');return true;
  }catch(e){bridge=null;$('connection-dot').classList.remove('connected');text('connection-status','Connection unavailable. Start START_LOCAL.ps1, then try again. '+e.message);return false;}finally{$('connect-bridge').disabled=false;}
}
$('connect-bridge').onclick=connect;
function canonicalMetrics(result){const m=result?.metrics||result||{};return {scoreKh:m.scoreKh??m.score,peakOperativeC:m.peakOperativeC??m.peak,occupiedHoursAbove28:m.occupiedHoursAbove28??m.hotHours};}
function showResult(result,submittedRevision,health){
  const current=submittedRevision===revision;show('calculation-state',false);show('result-state');
  if(!current){text('result-intro','Version '+submittedRevision+' finished, but your model is now version '+revision+'. Resume again to calculate the current edits.');show('comparison',false);return;}
  const m=canonicalMetrics(result);const wrappedReference=result.baseline||health?.baseline;const reference=wrappedReference?.result||wrappedReference;
  const evalId=result.evalId||result.provenance?.evalId;const referenceEval=reference?.evalId||reference?.provenance?.evalId;
  const matching=reference&&evalId&&evalId===referenceEval&&result.provenance?.engineConfigSha256===reference.provenance?.engineConfigSha256;const b=matching?canonicalMetrics(reference):null;completedRevision=submittedRevision;
  text('result-intro','Fresh Grasshopper calculation for version '+submittedRevision+'. '+(matching?'Compared with an unchanged baseline from the same evaluation setup.':'A matching local baseline is needed before comparing performance.'));
  show('comparison');text('version-label','v'+submittedRevision);
  const fields=[['score','scoreKh',1],['peak','peakOperativeC',2],['hours','occupiedHoursAbove28',0]];
  for(const [label,key,d]of fields){text('compare-base-'+label,b?number(b[key],d):'—');text('compare-new-'+label,number(m[key],d));$('compare-new-'+label).style.color=b&&m[key]>b[key]?'#b44737':b&&m[key]<b[key]?'#327352':'#34443a';}
  const details=result.limitations||[];text('result-provenance','EVAL '+(evalId||'reported in export')+' · fixed atrium · '+(Array.isArray(details)?details.join(' '):String(details)));
  addHistory('Calculation finished for v'+submittedRevision);history[history.length-1].result=result;text('analysis-status','Fresh calculation · Version '+submittedRevision+' · fixed atrium');
}
async function analyse(){
  if(!viewer)return;
  for(const id of Object.values(parameterFields)){if(!$(id).checkValidity()){$(id).reportValidity();return;}}
  if(!bridge){dialog('connection-dialog');text('connection-status','Connect the local engine, then press Resume & analyse again.');return;}
  const submittedRevision=revision,serial=++requestSerial;
  const payload={caseId:'geoffrey-manton',modelSha256:manifest.sourceSha256,revision:submittedRevision,transforms:viewer.getTransforms(),parameters:parameters()};
  setPhase('compare');show('calculation-state');show('result-state',false);text('calculation-message','Sending version '+submittedRevision+' to Rhino / Grasshopper…');text('analysis-status','Calculating version '+submittedRevision);$('resume-analysis').disabled=true;
  try{
    const response=await fetch(bridge.url+'/api/analyse',{method:'POST',headers:{'Content-Type':'application/json','X-Heat-Detective-Token':bridge.token},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
    const started=await response.json();if(!response.ok)throw Error(started.error||started.message||'Could not start the calculation ('+response.status+').');
    addHistory('Submitted v'+submittedRevision+' to Grasshopper');
    const deadline=Date.now()+15*60*1000;
    while(Date.now()<deadline&&serial===requestSerial){
      const r=await fetch(bridge.url+'/api/jobs/'+encodeURIComponent(started.jobId),{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('The calculation status is unavailable.');const job=await r.json();
      text('calculation-message',typeof job.message==='string'?job.message:(job.stage||job.progress?.message||'Rhino / Grasshopper is calculating. You can continue orbiting the model.'));
      if(['completed','complete','succeeded','success'].includes(job.status)){
        const h=await fetch(bridge.url+'/api/health').then(r=>r.json()).catch(()=>bridge.health);if(serial!==requestSerial)return;
        if(job.revision!==submittedRevision||job.result?.revision!==submittedRevision||job.result?.provenance?.modelSha256!==manifest.sourceSha256)throw Error('The returned result does not match the submitted model version.');
        showResult(job.result,submittedRevision,h);return;
      }
      if(['failed','error','cancelled'].includes(job.status))throw Error(job.error||job.message||job.result?.error||'The simulation failed. No new result was generated.');
      await new Promise(resolve=>setTimeout(resolve,2000));
    }
    if(serial===requestSerial)throw Error('This run is taking longer than expected. Check the local launcher for its status.');
  }catch(e){if(serial!==requestSerial)return;show('calculation-state',false);show('result-state');show('comparison',false);text('result-intro','Calculation unavailable. '+e.message);text('result-provenance','Your edits are preserved. No reference values have been substituted for this failed calculation.');text('analysis-status','No new result · Edits preserved');}
  finally{if(serial===requestSerial)$('resume-analysis').disabled=false;}
}
$('resume-analysis').onclick=analyse;
$('stop-waiting').onclick=()=>{requestSerial++;show('calculation-state',false);show('result-state');$('resume-analysis').disabled=false;setPhase('edit');message('Editing resumed. The submitted run may still finish locally; it will not be attached to a newer design.');};

function openIdea(idea){
  text('idea-title',idea.title);const body=$('idea-content');body.replaceChildren();
  const image=make('img',undefined,'idea-image');image.src='./images/'+idea.id+'.png';image.alt=idea.title+' — concept, not an as-built view';image.onerror=()=>image.remove();body.append(image);
  body.append(make('p','AI-generated illustration · prepared concept for the original building','small-note'),make('p',idea.summary));
  const metrics=idea.storedResult.metrics;body.append(make('p','Official reference case: '+number(metrics.scoreKh)+' K·h overheating · '+number(metrics.peakOperativeC,2)+'°C peak · '+number(metrics.occupiedHoursAbove28,0)+' occupied hours above 28°C.','idea-metrics'));
  body.append(make('p','EVAL '+idea.storedResult.evalId+' / row '+idea.storedResult.sourceRowId+'. These results come from the supplied fixed-atrium sweep. They are not calculations of this image or your edited model.','small-note'));
  if(idea.reversibility){body.append(make('h3','Can you change it later?'),make('p',idea.reversibility.label),make('p',idea.reversibility.details,'small-note'));}
  body.append(make('h3','Will it work across future climates?'),make('p','Not established yet. These references use one hot-week weather scenario. A robust / fragile label needs results across all three proposed climate scenarios.','small-note'));
  for(const [label,items]of [['Benefits',idea.benefits],['Trade-offs',idea.tradeoffs],['Check before applying',idea.checksBeforeApplying]]){if(!items)continue;body.append(make('h3',label));const ul=make('ul');for(const item of items)ul.append(make('li',typeof item==='string'?item:JSON.stringify(item)));body.append(ul);}
  if(idea.parameters.screen_opacity===0){const apply=make('button','Try these inputs in a paused version →','primary full');apply.onclick=()=>{setPhase('edit');const p=idea.parameters;setParameters({g:p.g,U:p.u,dayACH:p.ach_day,nightACH:p.ach_night,screenOpacity:0});revision++;addHistory('Applied '+idea.title+' inputs');updateChanges();$('idea-dialog').close();message('Inputs applied. Resume to calculate; the preview image is not added as geometry.');};body.append(apply);}else body.append(make('p','This screen requires explicit shading geometry. Its stored comparison is available for discussion; the current bridge has no live screen-opacity input.','small-note'));
  dialog('idea-dialog');
}
$('export-design').onclick=()=>{if(!viewer)return;const record={schemaVersion:1,project:'Heat Detective',owner:'Group 1',caseId:'geoffrey-manton',sourceFile:manifest.sourceFileName,modelSha256:manifest.sourceSha256,revision,exportedAt:new Date().toISOString(),parameters:parameters(),transforms:viewer.getTransforms(),reference:{evalId:baseline.evalId,mode:'stored-reference'},history,calculationState:completedRevision===revision?'completed':'not-calculated-for-current-version',scope:'Fixed reference atrium. Completed live runs are identified in history by mode and input provenance.',referenceLimitations:baseline.limitations};const blob=new Blob([JSON.stringify(record,null,2)],{type:'application/json'});const a=make('a');a.href=URL.createObjectURL(blob);a.download='Heat-Detective-v'+revision+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
