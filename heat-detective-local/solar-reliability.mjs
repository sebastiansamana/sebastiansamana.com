import crypto from 'node:crypto';
import {inputHash} from './reliability.mjs';

export const SOLAR_COMPONENT_GUID='df8c45bd-26d1-41e8-b61f-228bcfbe2a14';
export const SOLAR_ALGORITHM='ladybug-incident-radiation-1.10.0-envelope-grid-v1';
export const SOLAR_DISTRIBUTION_SHA256='c4f02efcb4a33f4a43b7ce0ba58100544abc317a1be61f7b0425a64a66eb8a09';
export function solarSolverFingerprint(gendaymtxSha256){
 return crypto.createHash('sha256').update([SOLAR_ALGORITHM,SOLAR_DISTRIBUTION_SHA256,gendaymtxSha256].join('|')).digest('hex');
}
export function verifiedSolarRadiation(solar,request,fingerprints,solverFingerprint){
 try{
  if(typeof solverFingerprint!=='string'||!solverFingerprint.trim())return false;
  const p=solar?.provenance,m=solar?.mesh,s=solar?.studies?.hot_week;
  if(solar?.schemaVersion!==1||solar.kind!=='ladybug-edited-radiation'||solar.modelSha256!==fingerprints.modelSha256||solar.inputSha256!==inputHash(request))return false;
  if(!Number.isSafeInteger(solar.revision)||solar.revision<0||p?.revision!==solar.revision)return false;
  if(p?.componentGuid!==SOLAR_COMPONENT_GUID||p.component!=='LB Incident Radiation'||p.componentVersion!=='1.10.0'||p.sourceCodeUnmodified!==true||p.geometry!=='current-transformed-model')return false;
  if(p.modelSha256!==fingerprints.modelSha256||p.definitionSha256!==fingerprints.definitionSha256||p.weatherSha256!==fingerprints.weatherSha256||p.inputSha256!==solar.inputSha256||!Number.isFinite(Date.parse(p.completedAt)))return false;
  if(p.solverFingerprint!==solverFingerprint)return false;
  const normalize=a=>JSON.stringify(a.map(t=>({id:t.id.toLowerCase(),translationM:t.translationM})).sort((a,b)=>a.id.localeCompare(b.id)));
  if(!Array.isArray(solar.transforms)||normalize(solar.transforms)!==normalize(request.transforms)||normalize(p.transforms)!==normalize(request.transforms))return false;
  if(m?.units!=='m'||m.upAxis!=='Z'||!Array.isArray(m.vertices)||!m.vertices.length||!Array.isArray(m.faces)||!m.faces.length)return false;
  if(m.vertices.some(v=>!Array.isArray(v)||v.length!==3||v.some(x=>!Number.isFinite(x))))return false;
  if(m.faces.some(f=>!Array.isArray(f)||![3,4].includes(f.length)||f.some(i=>!Number.isSafeInteger(i)||i<0||i>=m.vertices.length)))return false;
  if(!Array.isArray(m.category)||m.category.length!==m.faces.length||m.category.some(v=>typeof v!=='string'))return false;
  if(!Array.isArray(m.areaM2)||m.areaM2.length!==m.faces.length||m.areaM2.some(v=>!Number.isFinite(v)||v<0))return false;
  if(!['kWh/m²','kWh/m2'].includes(s?.unit)||!Array.isArray(s.values)||s.values.length!==m.faces.length||s.values.some(v=>!Number.isFinite(v)||v<0))return false;
  return Number.isFinite(s.min)&&Number.isFinite(s.max)&&Math.abs(Math.min(...s.values)-s.min)<1e-9&&Math.abs(Math.max(...s.values)-s.max)<1e-9;
 }catch{return false;}
}
export function sanitizeSolarResult(result,request,fingerprints,solverFingerprint){
 if(result?.solarRadiation&&!verifiedSolarRadiation(result.solarRadiation,request,fingerprints,solverFingerprint)){
  delete result.solarRadiation;
  result.solarRadiationError={code:'SOLAR_UNAVAILABLE',message:'The solar map did not match the verified geometry, source and current solver. Thermal results remain available.',inputSha256:inputHash(request),revision:request.revision};
 }
 return result;
}
