import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

const compiled=await build({stdin:{contents:"export * from './src/world/NeonSigns';export * as THREE from 'three';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node'});
const {THREE,NEON_SIGN_PALETTES,createNeonSignTexture,repaintNeonSignTexture,updateNeonSignTexture,neonSignTextureSize,neonSignStyleForLines,createNeonSignFrame,disposeNeonSignFrame,disposeNeonSignTextures}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));

function canvasFixture(){
  const priorDocument=globalThis.document,canvases=[],text=[];
  globalThis.document={createElement:kind=>{
    assert.equal(kind,'canvas');
    const canvas={width:0,height:0};
    const context=new Proxy({
      font:'',measureText:line=>({width:[...line].length*parseFloat(context.font.match(/[\d.]+px/)?.[0]??'20')*.62}),
      fillText:(line,x,y)=>text.push({line,x,y,font:context.font,canvas}),
      strokeText:(line,x,y)=>text.push({line,x,y,font:context.font,canvas}),
    },{get:(target,key)=>key in target?target[key]:()=>{}});
    canvas.getContext=()=>context;canvases.push(canvas);return canvas;
  }};
  return {canvases,text,restore:()=>{globalThis.document=priorDocument;}};
}

test('all venue signs keep the physical panel aspect and have bounded bitmap allocations',()=>{
  const cases=[['entrance',22/3.8],['palace',15.8/3.3],['drive-in',3.55/.9],['shore',5.6/3.15],['club',11/2.8],['rooftop',7.4/2],['temple',8.4/2.4],['pamphlet',1.75/.72]];
  const f=canvasFixture();
  try{
    for(const [style,aspect] of cases){
      const texture=createNeonSignTexture(['EXACT VENUE NAME','EXACT SUBTITLE'],{style,aspect}),r=texture.userData.neonSign;
      assert.ok(Math.abs(r.width/r.height-aspect)<.025,style+' is stretched');
      assert.ok(r.width<=1024&&r.height<=1024);assert.ok(r.decodedBytesWithMips<=Math.ceil(1024*1024*4*4/3));
      assert.equal(texture.colorSpace,THREE.SRGBColorSpace);assert.equal(r.paints,1);texture.dispose();
    }
    assert.deepEqual(neonSignTextureSize(.5,512),{width:256,height:512});
    assert.equal(neonSignTextureSize(1,9000).width,1536);
    for(const bad of [0,-1,NaN,Infinity])assert.throws(()=>neonSignTextureSize(bad),RangeError);
  }finally{f.restore();}
});

test('CJK and staff renames retain exact wording, their venue style, and one texture/canvas allocation',()=>{
  const f=canvasFixture();
  try{
    const texture=createNeonSignTexture(['美麗本人','THE TEMPLE'],{style:'temple',aspect:8.4/2.4});
    assert.deepEqual([...new Set(f.text.map(t=>t.line))],['美麗本人','THE TEMPLE']);
    const source=texture.image,version=texture.version,paints=texture.userData.neonSign.paints;
    assert.equal(updateNeonSignTexture(texture,['美麗本人','THE TEMPLE']),false);assert.equal(texture.version,version);
    assert.equal(updateNeonSignTexture(texture,['STAFF’S NEW & EXACT NAME','映畫・LIVE / 88']),true);
    assert.equal(texture.image,source);assert.equal(f.canvases.length,1);assert.equal(texture.userData.neonSign.style,'temple');
    assert.deepEqual(texture.userData.neonSign.lines,['STAFF’S NEW & EXACT NAME','映畫・LIVE / 88']);
    assert.equal(texture.userData.neonSign.paints,paints+1);assert.ok(texture.version>version);
    for(const t of f.text){assert.ok(t.x>=0&&t.x<=t.canvas.width);assert.ok(t.y>=0&&t.y<=t.canvas.height);}
    const updated=texture.version;repaintNeonSignTexture(texture);assert.ok(texture.version>updated);
    texture.dispose();const disposedPaints=texture.userData.neonSign.paints;
    repaintNeonSignTexture(texture);assert.equal(updateNeonSignTexture(texture,['CLOSED']),false);assert.equal(texture.userData.neonSign.paints,disposedPaints);
  }finally{f.restore();}
});

test('neon surrounds leave the original lettering plane clear and contain no lights or animation resources',()=>{
  const scene=new THREE.Scene(),frame=createNeonSignFrame(5.6,3.15,'shore');scene.add(frame);
  const bounds=new THREE.Box3().setFromObject(frame);assert.ok(bounds.max.z<.035);assert.ok(bounds.min.z>-.23);
  assert.equal(frame.children.length,3);assert.equal(frame.userData.neonSignFrame.triangles,108);
  assert.ok(frame.children.every(mesh=>mesh.isMesh&&mesh.layers.isEnabled(1)&&!mesh.material.transparent));
  let lights=0,geometries=0,materials=0;
  frame.traverse(o=>{if(o.isLight)lights++;if(o.isMesh){o.geometry.addEventListener('dispose',()=>geometries++);o.material.addEventListener('dispose',()=>materials++);}});
  assert.equal(lights,0);disposeNeonSignFrame(frame);disposeNeonSignFrame(frame);
  assert.equal(geometries,3);assert.equal(materials,3);assert.equal(frame.parent,null);
  assert.throws(()=>createNeonSignFrame(0,1),RangeError);
});

test('all existing default names get their own palette and inference never changes their text',()=>{
  const names=[['MYSCHEDULE','entrance'],['THE PALACE','palace'],['SLAP AND POP','club'],['NIMA ROOFTOP','rooftop'],['美麗本人','temple'],['THE SHORE','shore'],['DRIVE-IN 88','drive-in'],['FESTIVAL','pamphlet']];
  for(const [name,style] of names){const lines=[name,name==='FESTIVAL'?'PAMPHLET':'SUBTITLE'];assert.equal(neonSignStyleForLines(lines),style);assert.equal(lines[0],name);}
  assert.equal(new Set(names.map(([,style])=>NEON_SIGN_PALETTES[style].tube)).size,8);
});

test('scene teardown releases shared live neon maps and cloned sign materials once without touching other slots or nodes',()=>{
  const f=canvasFixture();
  try{
    const root=new THREE.Group(),frame=createNeonSignFrame(5.6,3.15,'shore');root.add(frame);
    const texture=createNeonSignTexture(['THE SHORE','MUSIC VIDEO'],{style:'shore'}),material=new THREE.MeshBasicMaterial({map:texture}),clone=material.clone(),geometry=new THREE.PlaneGeometry(5.6,3.15);
    frame.add(new THREE.Mesh(geometry,material),new THREE.Mesh(geometry,material),new THREE.Mesh(geometry,clone));
    const plainCanvas=new THREE.CanvasTexture(f.canvases[0]),imported=new THREE.Texture(),normal=new THREE.Texture(),other=new THREE.MeshStandardMaterial({map:imported,normalMap:normal}),plain=new THREE.MeshBasicMaterial({map:plainCanvas});
    imported.userData.neonSign={style:'palace'};clone.alphaMap=plainCanvas;root.add(new THREE.Mesh(geometry,other),new THREE.Mesh(geometry,plain));
    let textureEvents=0,materialEvents=0,unrelatedEvents=0,geometryEvents=0;
    texture.addEventListener('dispose',()=>textureEvents++);[material,clone].forEach(m=>m.addEventListener('dispose',()=>materialEvents++));
    [plainCanvas,imported,normal,other,plain].forEach(resource=>resource.addEventListener('dispose',()=>unrelatedEvents++));geometry.addEventListener('dispose',()=>geometryEvents++);
    const rootChildren=[...root.children],frameChildren=[...frame.children];
    assert.deepEqual(disposeNeonSignTextures(root),{textures:1,materials:2});assert.deepEqual(disposeNeonSignTextures(root),{textures:0,materials:0});
    assert.equal(textureEvents,1);assert.equal(materialEvents,2);assert.equal(unrelatedEvents,0);assert.equal(geometryEvents,0);
    assert.deepEqual(root.children,rootChildren);assert.deepEqual(frame.children,frameChildren);assert.equal(clone.alphaMap,plainCanvas);assert.equal(other.normalMap,normal);
    assert.equal(updateNeonSignTexture(texture,['CLOSED']),false,'disposed signs cannot schedule another upload');
    disposeNeonSignFrame(frame);assert.equal(textureEvents,1);assert.equal(materialEvents,2,'frame teardown must not release sign children twice');
  }finally{f.restore();}
});

test('a previously replaced neon map is not disposed again while its remaining sign material is released',()=>{
  const f=canvasFixture();
  try{
    const root=new THREE.Group(),texture=createNeonSignTexture(['OLD NAME']),material=new THREE.MeshBasicMaterial({map:texture});root.add(new THREE.Mesh(new THREE.PlaneGeometry(),material));
    let textureEvents=0,materialEvents=0;texture.addEventListener('dispose',()=>textureEvents++);material.addEventListener('dispose',()=>materialEvents++);texture.dispose();
    assert.deepEqual(disposeNeonSignTextures(root),{textures:0,materials:1});assert.deepEqual(disposeNeonSignTextures(root),{textures:0,materials:0});assert.equal(textureEvents,1);assert.equal(materialEvents,1);
  }finally{f.restore();}
});
