import { BuildingViewer } from './viewer.js?v=20261016-phase3map1';

const $ = id => document.getElementById(id);
const number = (v,d=1) => Number.isFinite(Number(v)) ? Number(v).toLocaleString('en-GB',{maximumFractionDigits:d,minimumFractionDigits:d}) : '—';
const text = (id,value) => { $(id).textContent=value; };
const show = (id,value=true) => { $(id).hidden=!value; };
const make = (tag,content,className) => {const el=document.createElement(tag);if(content!==undefined)el.textContent=content;if(className)el.className=className;return el;};
let manifest,baseline,ideas,viewer,phase='baseline',revision=0,bridge=null,requestSerial=0,loaded=false,loading=false,completedRevision=null,resultMode=null;
const history=[];
let solarData=null,solarError=null,lastHeatmapStudy='hot_week';
const solarReady=fetch('./data/ladybug-radiation.json?v=20261016-dark1',{signal:AbortSignal.timeout(15000)}).then(async response=>{
  if(!response.ok)throw Error('The Ladybug solar map could not be loaded.');
  const data=await response.json();const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data)));const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!=='dfed9861e8ee43cd99f892462a39a9e9b3b1932c7776a54460d13f5e82c58d65')throw Error('The Ladybug map failed its evidence check.');
  solarData=data;updateHeatmap();return data;
}).catch(error=>{solarError=error.message;updateHeatmap();return null;});
const recordedDemo=fetch('./data/verified-demo.json?v=20261016-reliable1',{signal:AbortSignal.timeout(10000)}).then(async r=>{if(!r.ok)throw Error('The recorded example could not be loaded. Reload the page before presenting.');const data=await r.json();const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data)));const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');if(hash!=='263f52e4f139d23b02f2e1f209def4cd378adf1e23c470f3189baae656d42ac5')throw Error('The recorded evidence failed its integrity check. Reload before presenting.');return data;}).catch(error=>({error:error.message}));
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
  [20,26,40].forEach(v=>{node('line',{x1:22,y1:y(v),x2:297,y2:y(v),stroke:v===26?'#d3937e':'#32313d','stroke-dasharray':v===26?'3 3':'0'});node('text',{x:0,y:y(v)+3,fill:'#b0acbb','font-size':8}).textContent=v;});
  node('polyline',{points:values.map((v,i)=>(22+i/(values.length-1)*275)+','+y(v)).join(' '),fill:'none',stroke:'#ff938d','stroke-width':1.7});
  node('text',{x:22,y:99,fill:'#b0acbb','font-size':8}).textContent='Day 1';node('text',{x:275,y:99,fill:'#b0acbb','font-size':8}).textContent='Day 7';
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
    viewer=new BuildingViewer($('viewer'),manifest,buffer,{onSelect:updateSelection,onHeatmapState:showHeatmapState,onHeatmapHover:showHeatmapHover,onMove:(_,delta)=>{['x','y','z'].forEach((a,i)=>$('move-'+a).value=numberRaw(delta[i]));},onCommit:event=>{revision++;addHistory(event.action==='reset'?'Reset geometry':event.action==='undo'?'Undid element move':event.action==='redo'?'Restored element move':'Moved '+(viewer.objects.get(event.id)?.originalCategory.split('::').pop()||'element'));updateChanges();}});
    loaded=true;text('header-project','Geoffrey Manton / Group 1');text('model-status','10,325 Rhino elements · Identity verified');
    $('cut-height').min=Math.floor(viewer.bounds.min.z);$('cut-height').max=Math.ceil(viewer.bounds.max.z);$('cut-height').value=8;text('cut-output','8 m');
    setPhase('baseline');updateChanges();if(['127.0.0.1','localhost'].includes(location.hostname)&&['8767','8780'].includes(location.port))void connect();
  }catch(e){text('upload-error',e.message);show('welcome');show('workspace',false);show('upload-progress',false);$('model-file').disabled=false;}finally{loading=false;}
}
const numberRaw=v=>Math.round(v*1000)/1000;
function showHeatmapState(state){
  show('heatmap-legend',!!state.visible);show('structure-legend',!state.visible);
  text('viewport-label',state.visible?(phase==='compare'?'BASELINE SOLAR REFERENCE':'BASELINE SOLAR EXPOSURE'):revision?'DESIGN VERSION '+revision:'EXISTING BUILDING');
  $('compare-map').setAttribute('aria-pressed',String(!!state.visible));$('compare-design').setAttribute('aria-pressed',String(!state.visible));
  text('compare-map-note',state.visible?'Original envelope · saved Ladybug solar results. The thermal outcome below is separate; this map is not recalculated for your edits.':'Your edited geometry. Switch to the saved Ladybug baseline map for a solar reference; your edits are kept.');
  if(!state.visible){show('heatmap-tooltip',false);return;}
  const study=solarData.studies[state.study];
  text('heatmap-title',state.study==='annual'?'Annual solar radiation':'Hot-week solar radiation');
  text('heatmap-min',number(study.min));text('heatmap-mid',number((study.min+study.max)/2));text('heatmap-max',number(study.max));
  text('heatmap-note','Ladybug baseline · '+study.period+' · original envelope'+(phase==='compare'?' · edits preserved':''));
}
function showHeatmapHover(hit){
  show('heatmap-tooltip',!!hit);if(!hit)return;
  text('heatmap-tooltip',number(hit.value)+' '+hit.unit+' · baseline surface');
  const bounds=$('canvas-area').getBoundingClientRect();
  $('heatmap-tooltip').style.left=Math.max(8,Math.min(hit.x+14,bounds.width-225))+'px';
  $('heatmap-tooltip').style.top=Math.max(8,Math.min(hit.y+14,bounds.height-45))+'px';
}
function updateHeatmap(){
  if(!viewer)return;
  const selected=$('heatmap-study').value;
  $('heatmap-study').disabled=phase==='edit';show('heatmap-unavailable',false);
  if(selected==='off'||phase==='edit'){viewer.clearHeatmap();showHeatmapState({visible:false});return;}
  if(viewer.getTransforms().length&&phase!=='compare'){viewer.clearHeatmap();showHeatmapState({visible:false});text('heatmap-unavailable','Solar map: original geometry only. View the baseline reference in Phase 3, or reset geometry.');show('heatmap-unavailable');return;}
  if(!solarData){viewer.clearHeatmap();showHeatmapState({visible:false});text('heatmap-unavailable',solarError||'Loading the Ladybug solar map…');show('heatmap-unavailable');return;}
  try{
    if(solarData.modelSha256!==manifest.sourceSha256)throw Error('Solar map and building identity do not match.');
    lastHeatmapStudy=selected;
    for(const layer of ['structural','changable'])viewer.setVisibility(layer,true);viewer.setOpacity(1);
    $('show-structural').checked=true;$('show-changeable').checked=true;$('opacity').value=1;
    $('tool-structure').setAttribute('aria-pressed','false');$('tool-transparent').setAttribute('aria-pressed','false');
    const state=viewer.setHeatmap(solarData,selected,{baselineReference:phase==='compare'});showHeatmapState(state);
  }catch(error){viewer.clearHeatmap();showHeatmapState({visible:false});text('heatmap-unavailable',error.message);show('heatmap-unavailable');}
}
function showStructureColours(){if($('heatmap-study').value!=='off'){$('heatmap-study').value='off';updateHeatmap();}}
$('heatmap-study').onchange=updateHeatmap;
$('compare-map').onclick=()=>{$('heatmap-study').value=lastHeatmapStudy;updateHeatmap();};
$('compare-design').onclick=()=>{$('heatmap-study').value='off';updateHeatmap();};
$('model-file').addEventListener('change',e=>upload(e.target.files[0]));
['dragenter','dragover'].forEach(name=>$('drop-zone').addEventListener(name,e=>{e.preventDefault();$('drop-zone').classList.add('dragging');}));
['dragleave','drop'].forEach(name=>$('drop-zone').addEventListener(name,e=>{e.preventDefault();$('drop-zone').classList.remove('dragging');}));$('drop-zone').addEventListener('drop',e=>upload(e.dataTransfer.files[0]));

function setPhase(value){
  if(!viewer)return;phase=value;document.querySelector('.sidebar').scrollTop=0;
  if(value==='compare')$('heatmap-study').value=lastHeatmapStudy;
  document.querySelectorAll('[data-phase]').forEach(el=>{if(el.dataset.phase===value)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});
  ['baseline','edit','compare'].forEach(p=>show(p+'-panel',p===value));
  const labels={baseline:['01 / BASELINE','Know where you start.','Existing building'],edit:['02 / PAUSE & EDIT','Make room for change.','Ⅱ Analysis paused'],compare:['03 / COMPARE & IDEAS','See what changes.','Review this version']};
  const l=labels[value];text('panel-eyebrow',l[0]);text('panel-title',l[1]);text('phase-state',l[2]);document.querySelector('.presentation-card').classList.toggle('compact',value==='compare');
  viewer.setEditable(value==='edit');show('selection-tip',value==='edit'&&!viewer.selected);text('viewport-label',revision?'DESIGN VERSION '+revision:'EXISTING BUILDING');
  text('analysis-status',value==='edit'?'Paused · No calculations while editing':value==='baseline'?'Official supplied reference · No new calculation':'Compare results & prepared concepts');
  updateChanges();
}
document.querySelectorAll('[data-phase]').forEach(el=>el.addEventListener('click',()=>setPhase(el.dataset.phase)));
$('begin-edit').onclick=()=>setPhase('edit');$('back-to-edit').onclick=()=>setPhase('edit');
function updateSelection(o,delta){show('selection-empty',!o);show('selection-info',!!o);show('selection-tip',phase==='edit'&&!o);if(!o)return;text('selection-name',o.originalCategory?.split('::').pop()||o.objectName||'Model element');text('selection-lock',o.editable?'Changeable':'Locked');$('selection-lock').className='chip'+(o.editable?'':' locked');text('selection-id',o.id);show('move-controls',o.editable);['x','y','z'].forEach((a,i)=>$('move-'+a).value=numberRaw(delta[i]));if(o.editable)$('element-picker').value=o.id;}
function updateChanges(){if(!viewer)return;const n=viewer.transforms.size;const p=parameters(),defaults=defaultParameters(),changed=Object.keys(p).filter(k=>p[k]!==defaults[k]).length;text('edit-count',n+' moved element'+(n===1?'':'s')+' · '+changed+' input'+(changed===1?'':'s'));show('changed-key',n>0);$('undo').disabled=phase!=='edit'||!viewer.undoStack.length;$('redo').disabled=phase!=='edit'||!viewer.redoStack.length;text('viewport-label',revision?'DESIGN VERSION '+revision:'EXISTING BUILDING');if(completedRevision!==null&&completedRevision!==revision){show('comparison',false);show('result-source',false);text('result-intro','The last completed calculation belongs to version '+completedRevision+'. Your current version '+revision+' has not been calculated. Resume to analyse it.');text('result-provenance','Previous results remain in the exported design history.');}updateHeatmap();}
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
[['show-structural','structural'],['show-changeable','changable'],['show-context','context']].forEach(([id,layer])=>$(id).onchange=e=>{showStructureColours();viewer?.setVisibility(layer,e.target.checked);});
$('tool-structure').onclick=()=>{if(!viewer)return;showStructureColours();const isolated=$('tool-structure').getAttribute('aria-pressed')!=='true';$('tool-structure').setAttribute('aria-pressed',isolated);$('show-changeable').checked=!isolated;viewer.setVisibility('changable',!isolated);if(isolated){$('show-structural').checked=true;viewer.setVisibility('structural',true);}};
$('opacity').oninput=e=>{showStructureColours();viewer?.setOpacity(Number(e.target.value));};$('tool-transparent').onclick=()=>{showStructureColours();const active=$('tool-transparent').getAttribute('aria-pressed')!=='true';$('tool-transparent').setAttribute('aria-pressed',active);$('opacity').value=active?.18:1;viewer?.setOpacity(active?.18:1);};$('tool-select').onclick=()=>viewer?.select(null);
let messageTimer;function message(value){text('canvas-message',value);show('canvas-message');clearTimeout(messageTimer);messageTimer=setTimeout(()=>show('canvas-message',false),7000);}

function dialog(id){$(id).showModal();}
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
[['connection-button','connection-dialog'],['help-button','help-dialog'],['details-toggle','model-dialog']].forEach(([b,d])=>$(b).onclick=()=>dialog(d));
$('help-connect').onclick=()=>{$('help-dialog').close();dialog('connection-dialog');};
if(['127.0.0.1','localhost'].includes(location.hostname)&&['8767','8780'].includes(location.port))$('bridge-url').value=location.origin;
async function prepareEngine(connection,startWorker=true){
  const monitor=(connection.monitor||0)+1;connection.monitor=monitor;
  const current=()=>bridge===connection&&connection.monitor===monitor;
  const label=document.querySelector('.connection-label');
  const update=worker=>{if(!current())return;const state=worker?.state;const preparing=state==='starting';$('connection-dot').classList.toggle('warming',preparing||state==='busy');label.textContent=preparing?'Engine preparing':state==='ready'?'Engine ready':state==='busy'?'Engine running':'Analysis engine';text('connection-status',worker?.message||'Local calculation bridge connected.');if(preparing)text('resume-note','Preparing Rhino once in the background. You can edit now. Wait for Engine ready before starting a timed demonstration.');else if(state==='ready')text('resume-note','Engine ready. New designs use the prepared worker; exact verified inputs can reuse a recorded result.');else if(state==='busy')text('resume-note','The engine is calculating or resetting. You can edit now; wait for Engine ready before submitting again.');};
  try{
    if(startWorker){update({state:'starting',message:'Preparing the private Rhino / Grasshopper worker.'});
      const response=await fetch(connection.url+'/api/warmup',{method:'POST',headers:{'X-Heat-Detective-Token':connection.token},signal:AbortSignal.timeout(10000)});const start=await response.json();if(!response.ok)throw Error(start.error||'Engine preparation could not start.');if(!current())return;update(start.warmWorker);}
    const deadline=Date.now()+130000;
    while(Date.now()<deadline&&current()){
      const response=await fetch(connection.url+'/api/health',{signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error('Engine preparation status is unavailable.');const health=await response.json();if(!current())return;connection.health=health;update(health.warmWorker);
      if(health.warmWorker?.state==='ready')return;
      if(['failed','stopped'].includes(health.warmWorker?.state))throw Error(health.warmWorker.message||'Engine preparation stopped.');
      await new Promise(resolve=>setTimeout(resolve,2000));
    }
    if(current())throw Error('The engine is taking longer than expected. Reconnect to check its status.');
  }catch(error){if(!current())return;$('connection-dot').classList.remove('warming','connected');label.textContent='Check engine';text('connection-status',error.message);text('resume-note','Engine preparation unavailable. '+error.message);}
}
async function connect(){
  text('connection-status','Connecting to the local calculation bridge…');$('connect-bridge').disabled=true;
  try{const url=new URL($('bridge-url').value);if(!['127.0.0.1','localhost'].includes(url.hostname))throw Error('Use the local bridge on 127.0.0.1 or localhost.');
    const r=await fetch(url.origin+'/api/health',{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('The bridge returned '+r.status);const h=await r.json();if(!h.ready)throw Error(h.message||'The engine is not ready.');
    bridge={url:url.origin,token:h.authToken||$('bridge-token').value,health:h};if(!bridge.token){show('bridge-token-row');throw Error('Enter the token from the local launcher.');}
    $('connection-dot').classList.add('connected');text('connection-status',h.message||'Connected. Resume will submit one version to the local engine.');text('resume-note','Connected. A new run is limited to two minutes; exact verified inputs can reuse a recorded result.');if(h.warmWorker)void prepareEngine(bridge);return true;
  }catch(e){bridge=null;$('connection-dot').classList.remove('connected','warming');document.querySelector('.connection-label').textContent='Check engine';text('connection-status','Connection unavailable. Start the launcher, then use Open local presentation demo if this browser blocks the connection. '+e.message);return false;}finally{$('connect-bridge').disabled=false;}
}
$('connect-bridge').onclick=async()=>{if(await connect())$('connection-dialog').close();};
function canonicalMetrics(result){const m=result?.metrics||result||{};return {scoreKh:m.scoreKh??m.score,peakOperativeC:m.peakOperativeC??m.peak,occupiedHoursAbove28:m.occupiedHoursAbove28??m.hotHours};}
async function designHash(modelSha256,definitionSha256,p,transforms){const normalized={g:p.g,U:p.U,dayACH:p.dayACH,nightACH:p.nightACH,screenOpacity:p.screenOpacity};const moved=transforms.filter(t=>t.translationM.some(v=>v!==0)).map(t=>({id:t.id,translationM:t.translationM})).sort((a,b)=>a.id.localeCompare(b.id));const raw=JSON.stringify({modelSha256,definitionSha256,parameters:normalized,transforms:moved});const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
function showResult(result,submittedRevision,health){
  const current=submittedRevision===revision;show('calculation-state',false);show('result-state');
  if(!current){text('result-intro','Version '+submittedRevision+' finished, but your model is now version '+revision+'. Resume again to calculate the current edits.');show('comparison',false);return;}
  const m=canonicalMetrics(result);const wrappedReference=result.baseline||health?.baseline;const reference=wrappedReference?.result||wrappedReference;
  const evalId=result.evalId||result.provenance?.evalId;const referenceEval=reference?.evalId||reference?.provenance?.evalId;
  const matching=reference&&evalId&&evalId===referenceEval&&result.provenance?.engineConfigSha256===reference.provenance?.engineConfigSha256;const b=matching?canonicalMetrics(reference):null;completedRevision=submittedRevision;
  const recorded=['recorded-verified','verified-cache','cached-verified'].includes(result.mode)||result.cache?.hit===true;resultMode=recorded?'recorded-verified':'fresh';
  const date=result.provenance?.completedAt;const when=date?new Date(date).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'previously';
  show('result-source');$('result-source').classList.toggle('live',!recorded);text('result-source',recorded?'RECORDED ENERGYPLUS RUN · '+when+' · Not a new calculation':'NEW ENERGYPLUS RUN · Completed '+when);
  text('result-intro',(recorded?'Recorded result for these exact inputs (v':'Fresh Grasshopper calculation (v')+submittedRevision+'). '+(matching?'Compared with the same unchanged baseline.':'A matching local baseline is needed before comparing performance.'));
  show('comparison');text('version-label','v'+submittedRevision);
  const fields=[['score','scoreKh',1],['peak','peakOperativeC',2],['hours','occupiedHoursAbove28',0]];
  for(const [label,key,d]of fields){text('compare-base-'+label,b?number(b[key],d):'—');text('compare-new-'+label,number(m[key],d));$('compare-new-'+label).style.color=b&&m[key]>b[key]?'#ff9b92':b&&m[key]<b[key]?'#8fdaa9':'#eeedf4';}
  const details=result.limitations||[];text('result-provenance','EVAL '+(evalId||'reported in export')+' · fixed atrium · '+(Array.isArray(details)?details.join(' '):String(details)));
  addHistory((recorded?'Loaded recorded result for v':'Calculation finished for v')+submittedRevision);history[history.length-1].result=result;text('analysis-status',(recorded?'Recorded run · Not a new calculation':'Fresh calculation')+' · Version '+submittedRevision+' · fixed atrium');
}
async function analyse(){
  if(!viewer)return;
  viewer.finishDrag();
  for(const id of Object.values(parameterFields)){if(!$(id).checkValidity()){$(id).reportValidity();return;}}
  if(!bridge){dialog('connection-dialog');text('connection-status','For an immediate presentation, close this window and choose Load verified example. A new calculation needs the local launcher.');return;}
  const submittedRevision=revision,serial=++requestSerial;
  const payload={caseId:'geoffrey-manton',modelSha256:manifest.sourceSha256,revision:submittedRevision,transforms:viewer.getTransforms(),parameters:parameters()};
  setPhase('compare');show('calculation-state');show('result-state',false);text('calculation-message','Sending version '+submittedRevision+' to the local calculation bridge…');text('analysis-status','Calculating version '+submittedRevision);$('resume-analysis').disabled=true;
  const start=Date.now();const tick=()=>{if(serial===requestSerial)text('calculation-elapsed',Math.floor((Date.now()-start)/1000)+' seconds elapsed · New runs stop after 120 seconds.');};tick();const timer=setInterval(tick,1000);
  try{
    const response=await fetch(bridge.url+'/api/analyse',{method:'POST',headers:{'Content-Type':'application/json','X-Heat-Detective-Token':bridge.token},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});
    const started=await response.json();if(serial!==requestSerial)return;if(!response.ok)throw Error(started.error||started.message||'Could not start the calculation ('+response.status+').');
    if(bridge.health.warmWorker&&!started.cacheHit){bridge.monitor=(bridge.monitor||0)+1;document.querySelector('.connection-label').textContent='Engine running';$('connection-dot').classList.add('warming');}
    addHistory('Submitted v'+submittedRevision+' to Grasshopper');history[history.length-1].submittedDesign=payload;
    const deadline=start+130000;
    while(Date.now()<deadline&&serial===requestSerial){
      const r=await fetch(bridge.url+'/api/jobs/'+encodeURIComponent(started.jobId),{signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('The calculation status is unavailable.');const job=await r.json();if(serial!==requestSerial)return;
      text('calculation-message',typeof job.message==='string'?job.message:(job.stage||job.progress?.message||'Rhino / Grasshopper is calculating. The viewer remains interactive.'));
      if(['completed','complete','succeeded','success'].includes(job.status)){
        const h=await fetch(bridge.url+'/api/health',{signal:AbortSignal.timeout(3000)}).then(r=>r.json()).catch(()=>bridge.health);if(serial!==requestSerial)return;
        if(job.revision!==submittedRevision||job.result?.revision!==submittedRevision||job.result?.provenance?.modelSha256!==manifest.sourceSha256)throw Error('The returned result does not match the submitted model version.');
        const identity=await designHash(payload.modelSha256,job.result.provenance.definitionSha256,payload.parameters,payload.transforms);if(serial!==requestSerial)return;if(identity!==job.result.provenance.inputSha256)throw Error('The returned result does not match the exact submitted inputs.');
        showResult(job.result,submittedRevision,h);return;
      }
      if(['failed','error','cancelled'].includes(job.status))throw Error(job.error||job.message||job.result?.error||'The simulation failed. No new result was generated.');
      await new Promise(resolve=>setTimeout(resolve,1500));
    }
    if(serial===requestSerial)throw Error('The calculation exceeded its time limit. Use Load verified example to continue the presentation immediately.');
  }catch(e){if(serial!==requestSerial)return;show('calculation-state',false);show('result-state');show('comparison',false);show('result-source',false);text('result-intro','Calculation unavailable. '+e.message);text('result-provenance','Your edits are preserved. No reference values have been substituted. Load verified example is a separate recorded design, ready for presentation.');text('analysis-status','No new result · Edits preserved');}
  finally{clearInterval(timer);if(serial===requestSerial)$('resume-analysis').disabled=false;if(bridge?.health.warmWorker)void prepareEngine(bridge,false);}
}
async function loadVerifiedExample(){
  if(!viewer)return;
  viewer.finishDrag();const startedRevision=revision,startedSerial=requestSerial;
  $('load-verified-example').disabled=true;show('presentation-status');text('presentation-status','Loading the recorded evidence…');
  try{
    const demo=await recordedDemo;if(demo.error)throw Error(demo.error);
    const run=demo.runs?.night6,reference=demo.runs?.baseline;
    if(!run||!reference||[run,reference].some(r=>r.mode!=='recorded-verified'||r.provenance?.modelSha256!==manifest.sourceSha256||r.transforms?.length!==0||r.hourly?.operativeC?.length!==168||r.hourly.operativeC.some(v=>!Number.isFinite(v)))||run.evalId!==reference.evalId||['definitionSha256','engineConfigSha256','weatherSha256','futureWeatherSha256'].some(k=>!run.provenance[k]||run.provenance[k]!==reference.provenance[k]))throw Error('The recorded evidence does not match this case study. No result was applied.');
    const expected={...defaultParameters(),nightACH:6};if(Object.keys(expected).some(k=>run.parameters[k]!==expected[k]||reference.parameters[k]!==defaultParameters()[k]))throw Error('The recorded example inputs do not match.');
    for(const entry of [run,reference]){const hash=await designHash(manifest.sourceSha256,entry.provenance.definitionSha256,entry.parameters,entry.transforms);if(hash!==entry.provenance.inputSha256)throw Error('The recorded evidence input checksum does not match.');}
    viewer.finishDrag();if(revision!==startedRevision||requestSerial!==startedSerial)throw Error('Your design changed while the example loaded. Click Load verified example again when ready.');
    addHistory('Saved design before loading verified example');history[history.length-1].design={revision,parameters:parameters(),transforms:viewer.getTransforms(),calculationState:completedRevision===revision?'completed':'not-calculated'};
    requestSerial++;$('resume-analysis').disabled=false;setPhase('edit');viewer.reset();setParameters(run.parameters);viewer.select(null);updateChanges();
    const result={...run,revision,baseline:reference};setPhase('compare');showResult(result,revision,null);
    text('presentation-status','Original geometry · 6 ACH night ventilation.');show('presentation-status',false);
  }catch(e){text('presentation-status',e.message);}finally{$('load-verified-example').disabled=false;}
}
$('load-verified-example').onclick=loadVerifiedExample;
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
$('export-design').onclick=()=>{if(!viewer)return;viewer.finishDrag();const record={schemaVersion:1,project:'Heat Detective',owner:'Group 1',caseId:'geoffrey-manton',sourceFile:manifest.sourceFileName,modelSha256:manifest.sourceSha256,revision,exportedAt:new Date().toISOString(),parameters:parameters(),transforms:viewer.getTransforms(),reference:{evalId:baseline.evalId,mode:'stored-reference'},history,calculationState:completedRevision===revision?'completed':'not-calculated-for-current-version',resultMode:completedRevision===revision?resultMode:null,scope:'Fixed reference atrium. Completed live runs are identified in history by mode and input provenance.',referenceLimitations:baseline.limitations};const blob=new Blob([JSON.stringify(record,null,2)],{type:'application/json'});const a=make('a');a.href=URL.createObjectURL(blob);a.download='Heat-Detective-v'+revision+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
