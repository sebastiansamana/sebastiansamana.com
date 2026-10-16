import test from 'node:test';
import assert from 'node:assert/strict';
import {inputHash,cacheKey,verifiedResult,cachedResult,verifiedFreshEnvelope} from './reliability.mjs';
const request={modelSha256:'model',definitionSha256:'definition',revision:1,parameters:{g:.6,U:2.8,dayACH:4,nightACH:1,screenOpacity:0},transforms:[]};
const fingerprints={modelSha256:'model',definitionSha256:'definition',weatherSha256:'weather',engineConfigSha256:'engine'};
const result={mode:'live',calculationState:'completed',revision:1,evalId:'EC2F526D',metrics:{scoreKh:320.6},hourly:{operativeC:Array(168).fill(26)},provenance:{...fingerprints,inputSha256:inputHash(request),evalId:'EC2F526D',completedAt:'2026-10-16T12:00:00Z'}};
test('verified case requires all source and engine hashes',()=>{
  assert.ok(verifiedResult(result,request,fingerprints));
  for(const field of Object.keys(fingerprints)) {
    const changed={...fingerprints,[field]:'changed'};
    assert.equal(verifiedResult(result,request,changed),false,field);
    assert.notEqual(cacheKey(request,changed),cacheKey(request,fingerprints));
  }
});
test('geometry and parameter changes cannot reuse an earlier result',()=>{
  for(const changed of [{...request,transforms:[{id:'roof',translationM:[0,0,5]}]},{...request,parameters:{...request.parameters,nightACH:6}}]) {
    assert.equal(verifiedResult(result,changed,fingerprints),false);
    assert.notEqual(cacheKey(request,fingerprints),cacheKey(changed,fingerprints));
  }
});
test('failed, reference, incomplete or nonfinite results are rejected',()=>{
  for(const changed of [{...result,calculationState:'failed'},{...result,mode:'stored-reference'},{...result,hourly:{operativeC:Array(167).fill(26)}},{...result,hourly:{operativeC:[NaN,...Array(167).fill(26)]}}]) assert.equal(verifiedResult(changed,request,fingerprints),false);
});
test('cache response preserves execution evidence and explicitly changes delivery mode',()=>{
  const reused=cachedResult(result,99,'original-job');
  assert.equal(reused.mode,'verified-cache');assert.equal(reused.executionSource,'verified-cache');assert.equal(reused.revision,99);
  assert.equal(reused.provenance.completedAt,result.provenance.completedAt);assert.equal(reused.provenance.inputSha256,result.provenance.inputSha256);
  assert.equal(reused.provenance.cache.originalRevision,1);assert.equal(reused.provenance.cache.sourceJobId,'original-job');
  assert.equal(result.mode,'live');assert.equal(result.revision,1);
  assert.equal(cacheKey({...request,revision:99},fingerprints),cacheKey(request,fingerprints));
});
test('fresh completion requires both envelope and result revisions to match',()=>{
  const envelope={status:'completed',revision:1,result};
  assert.ok(verifiedFreshEnvelope(envelope,request,fingerprints));
  assert.equal(verifiedFreshEnvelope({...envelope,revision:2},request,fingerprints),false);
  assert.equal(verifiedFreshEnvelope({...envelope,result:{...result,revision:2}},request,fingerprints),false);
});
