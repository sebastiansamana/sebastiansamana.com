import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';

const root = path.dirname(fileURLToPath(import.meta.url));
const runtime = path.join(root, 'runtime');
const publicRoot = path.resolve(root, '../public/heat-detective');
const port = Number(process.env.HEAT_DETECTIVE_PORT || 8767);
const token = crypto.randomBytes(32).toString('hex');
const ghHash = 'af44e228c1c78fc65cb913749720906f96147f9a6c5c51adbc182a165d2d64d7';
const modelHash = '53aa21467ee80479c45d0cc523f4d19bce3d8898b674de66cc22a82172a66ea6';
const weatherHash = '65787a077176d2cc1ae9a281e8b1d0bf618bb6b58e83dfc7ca6989516e0aa6d6';
const allowedOrigins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`, 'https://sebastiansamana.com', 'https://www.sebastiansamana.com']);
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
const jobs = new Map();
let activeJob = null;
let ownBaseline = null;
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fileSha = name => sha(fs.readFileSync(path.join(runtime, name)));
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const writeJSON = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2));
const engineConfigPath = path.join(runtime,'engine-config.json');
const currentEngineHash = () => fs.existsSync(engineConfigPath) ? sha(fs.readFileSync(engineConfigPath)) : null;
function normalizeResult(result) {
  const values=result?.hourly?.operativeC;
  if (Array.isArray(values) && values.length===168 && values.every(Number.isFinite)) {
    result.metrics.ghReportedPeakOperativeC ??= result.metrics.peakOperativeC;
    result.metrics.peakOperativeC=result.metrics.peak=Math.max(...values);
    result.provenance.metricDerivations={...result.provenance.metricDerivations,peakOperativeC:'Maximum of the 168 calculated operative-temperature values, before display rounding'};
  }
  return result;
}
fs.mkdirSync(path.join(runtime, 'jobs'), { recursive: true });
try {
  const cached=readJSON(path.join(runtime,'baseline.json'));
  if (cached.result?.provenance?.modelSha256 === modelHash && cached.result?.provenance?.definitionSha256 === ghHash && cached.result?.provenance?.weatherSha256 === weatherHash && cached.result?.provenance?.engineConfigSha256 === currentEngineHash()) {
    cached.result=normalizeResult(cached.result); ownBaseline=cached;
    writeJSON(path.join(runtime,'baseline.json'),cached);
  }
} catch {}
let configurationError = null, manifest, objectMap;
try {
  manifest = readJSON(path.join(runtime, 'object-manifest.json'));
  objectMap = new Map(manifest.objects.map(o => [o.id.toLowerCase(), o]));
  if (fileSha('source.gh') !== ghHash || fileSha('source.3dm') !== modelHash || manifest.sourceSha256 !== modelHash) throw new Error('Source files do not match the verified case.');
  if (fileSha('weather/present.epw') !== weatherHash) throw new Error('Present EPW copy does not match the verified original weather.');
  const engineConfig=readJSON(engineConfigPath);
  for (const file of [engineConfig.pythonExe,path.join(engineConfig.openstudioPath,'openstudio.exe'),path.join(engineConfig.energyplusPath,'energyplus.exe')]) if (!fs.existsSync(file)) throw new Error('Private simulation engine is missing; restore its prepared runtime.');
} catch (e) { configurationError = e.message; }

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
  res.end(JSON.stringify(data));
}

function validate(input) {
  if (input.caseId !== 'geoffrey-manton' || input.modelSha256?.toLowerCase() !== modelHash) throw new Error('Only the verified Geoffrey Manton model can run this definition.');
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new Error('revision must be a non-negative integer.');
  const p = input.parameters || {};
  const parameters = { g:p.g ?? 0.6, U:p.U ?? p.u ?? 2.8, dayACH:p.dayACH ?? p.ach_day ?? 4, nightACH:p.nightACH ?? p.ach_night ?? 1, screenOpacity:p.screenOpacity ?? p.screen_opacity ?? 0 };
  for (const [key, min, max] of [['g',0.1,0.9],['U',0.8,5.8],['dayACH',0.5,15],['nightACH',0,10],['screenOpacity',0,0]]) {
    if (typeof parameters[key] !== 'number' || !Number.isFinite(parameters[key]) || parameters[key] < min || parameters[key] > max) throw new Error(key === 'screenOpacity' ? 'This bridge currently requires screenOpacity = 0; no unmodelled shading shortcut is applied.' : `${key} is outside the supported range ${min}–${max}.`);
  }
  const transforms = input.transforms ?? [];
  if (!Array.isArray(transforms) || transforms.length > 10000) throw new Error('Invalid transforms array.');
  const seen = new Set();
  const normalized = transforms.map(t => {
    if (typeof t.id !== 'string') throw new Error('Each transform needs a Rhino object GUID.');
    const id = t.id.toLowerCase(), object = objectMap.get(id);
    if (!object?.editable || object.layer !== 'changable' || seen.has(id)) throw new Error('Unknown, protected, or repeated object GUID.');
    seen.add(id);
    if (!Array.isArray(t.translationM) || t.translationM.length !== 3 || t.translationM.some(v => typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 100)) throw new Error('Translation must be three finite metre values in ±100 m.');
    return { id, translationM:t.translationM };
  }).filter(t => t.translationM.some(v => v !== 0)).sort((a,b) => a.id.localeCompare(b.id));
  return { caseId:'geoffrey-manton', modelSha256:modelHash, definitionSha256:ghHash, revision:input.revision, parameters, transforms:normalized };
}

function launch(request) {
  const jobId = crypto.randomUUID();
  const jobDirName = jobId.replaceAll('-','').slice(0,12);
  const directory = path.join(runtime, 'jobs', jobDirName);
  fs.mkdirSync(directory);
  request.inputSha256 = sha(JSON.stringify({ modelSha256:request.modelSha256, definitionSha256:ghHash, parameters:request.parameters, transforms:request.transforms }));
  // Read process IDs only. Never attach to any existing Rhino process.
  try {
    const raw = execFileSync('powershell.exe', ['-NoProfile','-Command', '@(Get-Process Rhino -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id) | ConvertTo-Json -Compress'], { windowsHide:true, encoding:'utf8' }).trim();
    const ids = raw ? JSON.parse(raw) : [];
    request.protectedRhinoPids = Array.isArray(ids) ? ids : [ids];
  } catch { throw new Error('Could not capture protected Rhino process list.'); }
  writeJSON(path.join(directory, 'request.json'), request);
  fs.writeFileSync(path.join(directory, 'run.py'), `import sys\nsys.path.insert(0, ${JSON.stringify(root)})\nimport bridge_engine\nbridge_engine.run(${JSON.stringify(directory)})\n`);
  const job = { jobId, status:'running', revision:request.revision, stage:'Starting isolated Rhino', request, directory };
  jobs.set(jobId, job);
  activeJob = jobId;
  const log = fs.openSync(path.join(directory,'launcher.log'),'w');
  const child = spawn('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'run_job.ps1'),'-JobDirName',jobDirName], { windowsHide:true, stdio:['ignore',log,log] });
  child.on('error', error => { job.status='failed'; job.message=error.message; if (activeJob===jobId) activeJob=null; });
  child.on('close', code => {
    try {
      const result = readJSON(path.join(directory,'result.json'));
      if (result.status==='completed') result.result=normalizeResult(result.result);
      Object.assign(job, result);
      if (result.status === 'completed' && request.transforms.length === 0 && request.parameters.g === 0.6 && request.parameters.U === 2.8 && request.parameters.dayACH === 4 && request.parameters.nightACH === 1) {
        ownBaseline = { jobId, result:result.result };
        writeJSON(path.join(runtime,'baseline.json'),ownBaseline);
      }
    } catch { job.status='failed'; job.message=`Rhino job ended without a result (exit ${code}). See local launcher.log.`; }
    if (activeJob===jobId) activeJob=null;
    fs.closeSync(log);
  });
  return job;
}

const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.bin':'application/octet-stream', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.woff2':'font/woff2' };
const server = http.createServer(async (req, res) => {
  if (!allowedHosts.has(req.headers.host)) return send(res,403,{error:'Host is not allowed.'});
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.has(origin)) return send(res,403,{error:'Origin is not allowed.'});
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Vary','Origin');
    res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Content-Type, X-Heat-Detective-Token');
    res.setHeader('Access-Control-Allow-Private-Network','true');
  }
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url,`http://127.0.0.1:${port}`).pathname); } catch { return send(res,400,{error:'Invalid URL.'}); }
  if (pathname === '/api/health' && req.method === 'GET') {
    let probe = {}, engineConfig={}; try { probe=readJSON(path.join(runtime,'probe.json')); } catch {} try { engineConfig=readJSON(engineConfigPath); } catch {}
    return send(res,200,{ready:!configurationError,engine:'Rhino 8 / supplied Grasshopper / Honeybee / EnergyPlus',engineVersion:engineConfig.versions?.energyplus || probe.energyPlusVersion?.join('.'),libraryVersions:engineConfig.versions,engineValidated:!!ownBaseline,message:configurationError || 'Local isolated simulation bridge ready. Resume starts a real run; results appear only after completion.',authToken:token,modelSha256:modelHash,definitionSha256:ghHash,activeJobId:activeJob,baseline:ownBaseline,capabilities:{translations:true,screenOpacity:false,thermalDomain:'fixed reference atrium'}});
  }
  if (pathname === '/api/analyse' && req.method === 'POST') {
    if (req.headers['x-heat-detective-token'] !== token) return send(res,403,{error:'Connect the local bridge first; session token missing or incorrect.'});
    if (configurationError) return send(res,503,{error:configurationError});
    if (activeJob) return send(res,409,{error:'A simulation is already running. Keep editing paused or wait for this run to finish.',jobId:activeJob});
    if (!(req.headers['content-type'] || '').startsWith('application/json')) return send(res,415,{error:'Expected application/json.'});
    try {
      let size=0; const chunks=[];
      for await (const chunk of req) { size+=chunk.length; if (size>4*1024*1024) throw new Error('Request is too large.'); chunks.push(chunk); }
      const request = validate(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      if (activeJob) return send(res,409,{error:'A simulation is already running.',jobId:activeJob});
      const job=launch(request); return send(res,202,{jobId:job.jobId,status:job.status,revision:job.revision});
    } catch(e) { return send(res,400,{error:e.message}); }
  }
  if (pathname.startsWith('/api/jobs/') && req.method === 'GET') {
    const job=jobs.get(pathname.slice('/api/jobs/'.length));
    if (!job) return send(res,404,{error:'Job not found in this bridge session.'});
    let progress={}; if (job.status === 'running') { try { progress=readJSON(path.join(job.directory,'progress.json')); } catch {} }
    return send(res,200,{jobId:job.jobId,status:job.status,stage:progress.stage || job.stage,revision:job.revision,result:job.result,message:job.message,baseline:ownBaseline});
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res,405,{error:'Method not allowed.'});
  let relative = pathname.replace(/^\/heat-detective\/?/,'/');
  if (relative === '/') relative='/index.html';
  const file=path.resolve(publicRoot,'.'+relative);
  if (file !== publicRoot && !file.startsWith(publicRoot+path.sep)) return send(res,403,{error:'Path is not allowed.'});
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res,404,{error:'File not found.'});
  res.writeHead(200,{'Content-Type':mime[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
  if (req.method==='HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
});
server.listen(port,'127.0.0.1',() => console.log(`Heat Detective local bridge: http://127.0.0.1:${port}/heat-detective/`));
