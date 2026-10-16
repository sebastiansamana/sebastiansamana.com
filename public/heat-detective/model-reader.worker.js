self.onmessage = async ({data}) => {
  try {
    const {file, expected} = data;
    if (file.size !== expected.sourceBytes) throw new Error('This demo supports the prepared Geoffrey Manton structural/changeable file. Please choose that exact .3dm.');
    self.postMessage({progress:12,message:'Reading your Rhino model…'});
    const buffer = await file.arrayBuffer();
    self.postMessage({progress:40,message:'Checking the model against its prepared display geometry…'});
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2,'0')).join('');
    if (hash.toLowerCase() !== expected.sourceSha256.toLowerCase()) throw new Error('This model differs from the prepared case study. Use GeoffreyManton_CaseStudy_structural_changable.3dm supplied for this demo.');
    self.postMessage({progress:65,message:'Model verified. Preparing the viewport…',verified:true,sha256:hash});
  } catch(error) {self.postMessage({error:error.message || 'The Rhino file could not be read.'});}
};
