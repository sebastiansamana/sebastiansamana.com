import test from 'node:test';
import assert from 'node:assert/strict';
import {inputHash,cachedResult} from './reliability.mjs';
import {verifiedSolarRadiation,solarSolverFingerprint,SOLAR_COMPONENT_GUID,sanitizeSolarResult} from './solar-reliability.mjs';
const fingerprints={modelSha256:'model',definitionSha256:'gh',weatherSha256:'weather'};
const request={...fingerprints,revision:3,parameters:{g:.6,U:2.8,dayACH:4,nightACH:1,screenOpacity:0},transforms:[{id:'wall',translationM:[0,0,5]}]};
const solver=solarSolverFingerprint('exe');
const solar={schemaVersion:1,kind:'ladybug-edited-radiation',modelSha256:'model',revision:3,inputSha256:inputHash(request),transforms:request.transforms,
 mesh:{vertices:[[0,0,0],[1,0,0],[0,1,0]],faces:[[0,1,2]],areaM2:[.5],category:['facade'],units:'m',upAxis:'Z'},
 studies:{hot_week:{values:[12],min:12,max:12,unit:'kWh/m²'}},
 provenance:{...fingerprints,revision:3,inputSha256:inputHash(request),componentGuid:SOLAR_COMPONENT_GUID,component:'LB Incident Radiation',componentVersion:'1.10.0',sourceCodeUnmodified:true,geometry:'current-transformed-model',transforms:request.transforms,completedAt:'2026-10-16T15:00:00Z',solverFingerprint:solver}};
test('accepts complete radiation tied to exact model, geometry and solver',()=>assert.equal(verifiedSolarRadiation(solar,request,fingerprints,solver),true));
test('rejects missing or empty current solver fingerprint',()=>{
 for(const value of [undefined,null,'','   '])assert.equal(verifiedSolarRadiation(solar,request,fingerprints,value),false);
});
test('fresh invalid solar is removed while valid thermal fields survive',()=>{
 const thermal={calculationState:'completed',metrics:{scoreKh:320.2},hourly:{operativeC:[24,25]},provenance:{inputSha256:inputHash(request)},solarRadiation:structuredClone(solar)};
 thermal.solarRadiation.mesh.faces[0][2]=999;
 const originalThermal=structuredClone({...thermal,solarRadiation:undefined});
 const cleaned=sanitizeSolarResult(thermal,request,fingerprints,solver);
 assert.equal(cleaned.solarRadiation,undefined);assert.equal(cleaned.solarRadiationError.code,'SOLAR_UNAVAILABLE');
 for(const key of ['calculationState','metrics','hourly','provenance'])assert.deepEqual(cleaned[key],originalThermal[key]);
});
test('fresh valid solar is retained and thermal-only results stay unchanged',()=>{
 const result={calculationState:'completed',solarRadiation:structuredClone(solar)};
 assert.deepEqual(sanitizeSolarResult(result,request,fingerprints,solver),result);
 const thermalOnly={calculationState:'completed',metrics:{scoreKh:320.2}};
 assert.deepEqual(sanitizeSolarResult(thermalOnly,request,fingerprints,solver),thermalOnly);
});
for(const [name,alter] of [
 ['legacy result',s=>delete s.kind],['wrong model',s=>s.modelSha256='other'],['wrong input',s=>s.inputSha256='other'],
 ['wrong geometry',s=>s.transforms=[]],['wrong source',s=>s.provenance.definitionSha256='other'],['wrong solver',s=>s.provenance.solverFingerprint='other'],
 ['wrong component',s=>s.provenance.componentGuid='other'],['misaligned values',s=>s.studies.hot_week.values=[]],['nonfinite vertex',s=>s.mesh.vertices[0][0]=Infinity],
 ['invalid index',s=>s.mesh.faces[0][2]=999],['negative energy',s=>s.studies.hot_week.values[0]=-1],['wrong units',s=>s.studies.hot_week.unit='°C'],
 ['wrong range',s=>s.studies.hot_week.max=13],['false provenance',s=>s.provenance.sourceCodeUnmodified=false]
])test(`rejects ${name}`,()=>{const copy=structuredClone(solar);alter(copy);assert.equal(verifiedSolarRadiation(copy,request,fingerprints,solver),false);});
test('cached presentation revision can differ while exact physics stays bound',()=>{
 const cached=cachedResult({revision:3,provenance:{},solarRadiation:solar},99,'source-job');
 assert.equal(cached.revision,99);assert.equal(cached.solarRadiation.revision,3);
 assert.equal(verifiedSolarRadiation(cached.solarRadiation,{...request,revision:99},fingerprints,solver),true);
});
