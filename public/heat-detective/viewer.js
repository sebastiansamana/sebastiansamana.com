import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { TransformControls } from './vendor/TransformControls.js';

const colour = { changable: 0xb9beb8, structural: 0xc2453b, context: 0xcdd3ca, edited: 0x478fe0 };
const zero = v => v.every(n => Math.abs(n) < 0.00001);

export class BuildingViewer {
  constructor(container, manifest, buffer, callbacks = {}) {
    this.manifest = manifest; this.callbacks = callbacks; this.container = container;
    this.objects = new Map(manifest.objects.map(o => [o.id, o]));
    this.transforms = new Map(); this.undoStack = []; this.redoStack = [];
    this.editable = false; this.selected = null; this.dragging = false; this.cut = false; this.snap=.25;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0xeef1ec);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.localClippingEnabled = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute('aria-label', 'Geoffrey Manton building. Use the element selector for keyboard editing.');
    container.append(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x879482, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 3); sun.position.set(-70,-80,100); this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xe2ecff, 1); fill.position.set(60,30,40); this.scene.add(fill);
    this.clip = new THREE.Plane(new THREE.Vector3(0,0,-1), 8);
    this.groups = manifest.groups.map((group, i) => {
      const geometry = new THREE.BufferGeometry();
      const b = group.buffers;
      const positions = new Float32Array(buffer, b.positions.byteOffset, b.positions.byteLength / 4).slice();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
      geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(buffer,b.normals.byteOffset,b.normals.byteLength/4),3));
      geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(buffer,b.indices.byteOffset,b.indices.byteLength/4),1));
      const colors = new Float32Array(positions.length), c = new THREE.Color(colour[group.layer] || colour.context);
      for (let k=0;k<colors.length;k+=3) { colors[k]=c.r; colors[k+1]=c.g; colors[k+2]=c.b; }
      geometry.setAttribute('color',new THREE.BufferAttribute(colors,3).setUsage(THREE.DynamicDrawUsage));
      geometry.computeBoundingSphere(); geometry.computeBoundingBox();
      const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85, metalness: .03, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geometry,material); mesh.userData.groupIndex=i;
      mesh.visible = group.layer !== 'context'; mesh.frustumCulled=false; this.scene.add(mesh);
      const objects=manifest.objects.filter(o=>o.groupIndex===i && o.indexCount>0).sort((a,b)=>a.indexStart-b.indexStart);
      return { mesh, base: positions.slice(), objects, layer: group.layer };
    });
    this.bounds = new THREE.Box3();
    manifest.groups.filter(g=>g.layer !== 'context').forEach(g=>{
      this.bounds.expandByPoint(new THREE.Vector3(...g.bboxM[0])); this.bounds.expandByPoint(new THREE.Vector3(...g.bboxM[1]));
    });
    this.center = this.bounds.getCenter(new THREE.Vector3()); this.size=this.bounds.getSize(new THREE.Vector3());
    this.radius=Math.max(this.size.x,this.size.y,this.size.z)*.72;
    const grid=new THREE.GridHelper(240,48,0xc8d1c4,0xdde3d9); grid.rotation.x=Math.PI/2;
    grid.position.z=this.bounds.min.z-.1; this.scene.add(grid); this.grid=grid;
    this.perspective = new THREE.PerspectiveCamera(40,1,.1,3000); this.perspective.up.set(0,0,1);
    this.orthographic = new THREE.OrthographicCamera(-50,50,50,-50,.1,3000); this.orthographic.up.set(0,1,0);
    this.camera=this.perspective; this.viewMode='3d';
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);
    this.controls.enableDamping=true; this.controls.dampingFactor=.1; this.controls.maxPolarAngle=Math.PI*.95;
    this.proxy=new THREE.Object3D(); this.scene.add(this.proxy);
    this.gizmo=new TransformControls(this.camera,this.renderer.domElement); this.gizmo.setMode('translate');
    this.gizmo.setSpace('world'); this.gizmo.setTranslationSnap(.25); this.gizmo.setSize(.85);
    this.scene.add(this.gizmo.getHelper());
    this.gizmo.addEventListener('dragging-changed',e=>{this.dragging=e.value; this.controls.enabled=!e.value;});
    this.gizmo.addEventListener('mouseDown',()=>{this.beforeDrag=this.getTranslation(this.selected?.id);});
    this.gizmo.addEventListener('objectChange',()=>{
      if(this.selected && this.dragging) this.applyTranslation(this.selected.id,this.proxy.position.clone().sub(this.selectionCenter).toArray().map(v=>Math.max(-30,Math.min(30,this.snap?Math.round(v/this.snap)*this.snap:v))),false);
    });
    this.gizmo.addEventListener('mouseUp',()=>{
      if(this.selected && this.beforeDrag) {
        const after=this.getTranslation(this.selected.id);
        if(after.some((x,i)=>Math.abs(x-this.beforeDrag[i])>1e-5)) this.record(this.selected.id,this.beforeDrag,after);
        this.beforeDrag=null;
      }
    });
    this.raycaster=new THREE.Raycaster(); this.pointer=new THREE.Vector2();
    this.renderer.domElement.addEventListener('pointerdown',e=>{ this.pointerStart={x:e.clientX,y:e.clientY,gizmo:!!this.gizmo.axis}; });
    this.renderer.domElement.addEventListener('pointerup',e=>{
      if(!this.pointerStart || this.pointerStart.gizmo || e.button!==0 || this.dragging || Math.hypot(e.clientX-this.pointerStart.x,e.clientY-this.pointerStart.y)>4) return;
      const r=this.renderer.domElement.getBoundingClientRect(); this.pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);
      this.raycaster.setFromCamera(this.pointer,this.camera);
      const hits=this.raycaster.intersectObjects(this.groups.filter(g=>g.mesh.visible).map(g=>g.mesh),false);
      const hit=hits.find(h=>!this.cut || h.point.z<=this.clip.constant+.001); if(!hit) {this.select(null);return;}
      const group=this.groups[hit.object.userData.groupIndex], index=hit.faceIndex*3;
      let lo=0,hi=group.objects.length-1,found=null;
      while(lo<=hi){const mid=(lo+hi)>>1,o=group.objects[mid];if(index<o.indexStart)hi=mid-1;else if(index>=o.indexStart+o.indexCount)lo=mid+1;else{found=o;break;}}
      this.select(found?.id || null);
    });
    this.resizeObserver=new ResizeObserver(()=>this.resize()); this.resizeObserver.observe(container);
    this.fit(); this.resize();
    this.renderer.setAnimationLoop(()=>{this.controls.update(); this.renderer.render(this.scene,this.camera);});
  }
  resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;const changed=Math.abs(this.perspective.aspect-w/h)>.1;this.renderer.setSize(w,h);this.perspective.aspect=w/h;this.perspective.updateProjectionMatrix();const span=this.radius;this.orthographic.left=-span*w/h;this.orthographic.right=span*w/h;this.orthographic.top=span;this.orthographic.bottom=-span;this.orthographic.updateProjectionMatrix();if(changed)this.fit();}
  fit(){this.controls.target.copy(this.center);if(this.viewMode==='plan'){this.camera.position.copy(this.center).add(new THREE.Vector3(0,0,250));this.camera.zoom=Math.min(1,this.perspective.aspect);this.camera.updateProjectionMatrix();}else{this.camera.position.copy(this.center).add(new THREE.Vector3(-1,-1,.75).normalize().multiplyScalar(this.radius*2.9*Math.max(1,1.2/this.perspective.aspect)));}this.camera.lookAt(this.center);this.controls.update();}
  setView(mode){this.viewMode=mode;this.camera=mode==='plan'?this.orthographic:this.perspective;this.controls.object=this.camera;this.controls.enableRotate=mode!=='plan';this.gizmo.camera=this.camera;this.gizmo.showZ=mode!=='plan';for(const g of this.groups.filter(g=>g.layer==='structural')){const c=g.mesh.geometry.attributes.color;for(const o of g.objects){const floor=/Floor/.test(o.originalCategory);const col=new THREE.Color(mode==='plan'&&floor?0xecd8d2:colour.structural);for(let i=o.vertexStart;i<o.vertexStart+o.vertexCount;i++)c.setXYZ(i,col.r,col.g,col.b);}c.needsUpdate=true;}this.resize();this.fit();}
  orient(direction){if(direction==='top'){this.setView('plan');return;}this.setView('3d');const vectors={west:[-1,0,.05],east:[1,0,.05],north:[0,1,.05],iso:[-1,-1,.75]};this.camera.position.copy(this.center).add(new THREE.Vector3(...vectors[direction]).normalize().multiplyScalar(this.radius*2.9));this.camera.lookAt(this.center);this.controls.update();}
  setEditable(value){this.editable=value;this.gizmo.detach();if(value&&this.selected?.editable)this.gizmo.attach(this.proxy);}
  select(id){
    this.gizmo.detach(); if(this.highlight){this.scene.remove(this.highlight);this.highlight.geometry.dispose();this.highlight.material.dispose();this.highlight=null;}
    this.selected=this.objects.get(id)||null;
    if(this.selected?.vertexCount){const o=this.selected,g=this.groups[o.groupIndex], start=o.vertexStart*3,end=start+o.vertexCount*3;
      const position=g.base.slice(start,end);const box=new THREE.Box3().setFromBufferAttribute(new THREE.BufferAttribute(position,3));
      this.selectionCenter=box.getCenter(new THREE.Vector3());
      for(let i=0;i<position.length;i+=3){position[i]-=this.selectionCenter.x;position[i+1]-=this.selectionCenter.y;position[i+2]-=this.selectionCenter.z;}
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(position,3));
      const src=g.mesh.geometry.index.array; const idx=new Uint32Array(o.indexCount);for(let i=0;i<idx.length;i++)idx[i]=src[o.indexStart+i]-o.vertexStart;geo.setIndex(new THREE.BufferAttribute(idx,1));
      const mat=new THREE.MeshBasicMaterial({color:o.editable?0x438de0:0xf48070,transparent:true,opacity:.48,side:THREE.DoubleSide,depthTest:false,depthWrite:false,clippingPlanes:this.cut?[this.clip]:[]});
      this.highlight=new THREE.Mesh(geo,mat);this.highlight.renderOrder=2;this.scene.add(this.highlight);
      this.proxy.position.copy(this.selectionCenter).add(new THREE.Vector3(...this.getTranslation(id)));this.highlight.position.copy(this.proxy.position);
      if(this.editable&&o.editable)this.gizmo.attach(this.proxy);
    }
    this.callbacks.onSelect?.(this.selected,this.getTranslation(id));
  }
  getTranslation(id){return [...(this.transforms.get(id)||[0,0,0])];}
  applyTranslation(id,delta,record=true){
    const o=this.objects.get(id);if(!this.editable||!o?.editable||!delta.every(Number.isFinite)||delta.some(n=>Math.abs(n)>30))return false;
    const before=this.getTranslation(id),g=this.groups[o.groupIndex],p=g.mesh.geometry.attributes.position,c=g.mesh.geometry.attributes.color;
    const col=new THREE.Color(zero(delta)?colour.changable:colour.edited);
    for(let i=o.vertexStart;i<o.vertexStart+o.vertexCount;i++){for(let a=0;a<3;a++)p.array[i*3+a]=g.base[i*3+a]+delta[a];c.setXYZ(i,col.r,col.g,col.b);}
    p.needsUpdate=true;c.needsUpdate=true;g.mesh.geometry.computeBoundingSphere();g.mesh.geometry.computeBoundingBox();
    if(zero(delta))this.transforms.delete(id);else this.transforms.set(id,[...delta]);
    if(this.selected?.id===id){this.proxy.position.copy(this.selectionCenter).add(new THREE.Vector3(...delta));this.highlight?.position.copy(this.proxy.position);}
    this.callbacks.onMove?.(o,delta);
    if(record&&delta.some((v,i)=>Math.abs(v-before[i])>1e-5))this.record(id,before,delta);
    return true;
  }
  record(id,before,after){this.undoStack.push({id,before:[...before],after:[...after]});this.redoStack=[];this.callbacks.onCommit?.({id,before,after});}
  undo(){if(!this.editable)return;const item=this.undoStack.pop();if(!item)return;this.applyTranslation(item.id,item.before,false);this.redoStack.push(item);this.select(item.id);this.callbacks.onCommit?.({...item,action:'undo'});}
  redo(){if(!this.editable)return;const item=this.redoStack.pop();if(!item)return;this.applyTranslation(item.id,item.after,false);this.undoStack.push(item);this.select(item.id);this.callbacks.onCommit?.({...item,action:'redo'});}
  reset(){if(!this.editable)return;for(const id of [...this.transforms.keys()])this.applyTranslation(id,[0,0,0],false);this.undoStack=[];this.redoStack=[];this.callbacks.onCommit?.({action:'reset'});}
  getTransforms(){return [...this.transforms].map(([id,translationM])=>({id,translationM:[...translationM]}));}
  setVisibility(layer,value){this.groups.filter(g=>g.layer===layer).forEach(g=>g.mesh.visible=value);if(this.selected?.layer===layer&&!value)this.select(null);}
  setOpacity(value){this.groups.filter(g=>g.layer==='changable').forEach(g=>{g.mesh.material.opacity=value;g.mesh.material.transparent=value<1;g.mesh.material.depthWrite=value===1;g.mesh.material.needsUpdate=true;});}
  setClipping(value,height=this.clip.constant){this.cut=value;this.clip.constant=height;this.groups.forEach(g=>{g.mesh.material.clippingPlanes=value?[this.clip]:[];g.mesh.material.needsUpdate=true;});if(this.highlight)this.highlight.material.clippingPlanes=value?[this.clip]:[];}
  setSnap(value){this.snap=value?.25:null;this.gizmo.setTranslationSnap(this.snap);}
}
