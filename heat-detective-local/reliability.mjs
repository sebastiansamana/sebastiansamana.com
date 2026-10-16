import crypto from 'node:crypto';

const sha = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function inputHash(request) {
  return sha({modelSha256:request.modelSha256,definitionSha256:request.definitionSha256,parameters:request.parameters,transforms:request.transforms});
}
export function cacheKey(request, fingerprints) {
  return sha({inputSha256:inputHash(request),...fingerprints});
}
export function verifiedResult(result, request, fingerprints) {
  const p=result?.provenance, values=result?.hourly?.operativeC;
  return result?.calculationState==='completed' && result?.mode==='live' &&
    p?.inputSha256===inputHash(request) && p.modelSha256===fingerprints.modelSha256 &&
    p.definitionSha256===fingerprints.definitionSha256 && p.weatherSha256===fingerprints.weatherSha256 &&
    p.engineConfigSha256===fingerprints.engineConfigSha256 && !!p.evalId && !!p.completedAt &&
    result.evalId===p.evalId && Number.isFinite(result.metrics?.scoreKh) &&
    Array.isArray(values) && values.length===168 && values.every(Number.isFinite);
}
export function cachedResult(source, revision, sourceJobId) {
  const result=structuredClone(source);
  result.mode='verified-cache';
  result.executionSource='verified-cache';
  result.revision=revision;
  result.provenance.cache={sourceJobId,servedAt:new Date().toISOString(),originalRevision:source.revision};
  return result;
}
export function verifiedFreshEnvelope(envelope,request,fingerprints){
  return envelope?.status==='completed'&&envelope.revision===request.revision&&envelope.result?.revision===request.revision&&verifiedResult(envelope.result,request,fingerprints);
}
