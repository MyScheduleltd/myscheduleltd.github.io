import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const compiled = await build({ stdin: { contents: "export * from './src/world/AvatarShadeLighting';export * from './src/world/AvatarPixelStyle';export * as THREE from 'three';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'esm' });
const { THREE, AVATAR_SHADE_LIGHTING, applyAvatarShadeLighting, avatarLightBands } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const shader = () => ({ uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader });

test('shadow readability composes after real scene light bands, with one shared diffuse uniform and no emissive bypass', () => {
  const a = shader(), b = shader();
  const originalVertex = a.vertexShader;
  const originalEmission = a.fragmentShader.match(/totalEmissiveRadiance[^\n]*/g);
  avatarLightBands(a, { value: .72 }); avatarLightBands(b, { value: .72 });
  assert.match(a.fragmentShader, /AVATAR_SCENE_LIGHT_BANDS_V1/);
  assert.match(a.fragmentShader, /material\.diffuseColor \* avatarShadeFloor/);
  assert.match(a.fragmentShader, /max\(reflectedLight\.directDiffuse, avatarBounceFloor\)/);
  assert.ok(a.fragmentShader.indexOf('AVATAR_SHADE_BOUNCE_V1') > a.fragmentShader.indexOf('avatarLitDiffuse*mix'));
  assert.equal(a.uniforms.avatarShadeFloor, b.uniforms.avatarShadeFloor, 'all wardrobes and generated people share the same bounded bounce');
  assert.equal(a.uniforms.avatarShadeContrast, b.uniforms.avatarShadeContrast);
  assert.equal(a.uniforms.avatarShadeContrast.value, .40);
  assert.deepEqual(a.uniforms.avatarShadeFloor.value.toArray(), [...AVATAR_SHADE_LIGHTING.diffuseFloor]);
  assert.equal(a.vertexShader, originalVertex, 'skeletons, skinning and geometry stay untouched');
  assert.deepEqual(a.fragmentShader.match(/totalEmissiveRadiance[^\n]*/g), originalEmission);
  const patched = a.fragmentShader; applyAvatarShadeLighting(a); assert.equal(a.fragmentShader, patched);
});

const smoothstep = (a, b, value) => { const t = Math.min(1, Math.max(0, (value - a) / (b - a))); return t * t * (3 - 2 * t); };
const response = (albedo, diffuse, irradiance, normalDotKey=0, contrast=AVATAR_SHADE_LIGHTING.directionalContrast) => {
  const weight = 1 - smoothstep(AVATAR_SHADE_LIGHTING.fadeStart, AVATAR_SHADE_LIGHTING.fadeEnd, irradiance);
  const directional = 1 + Math.min(.40, Math.max(0, contrast)) * (smoothstep(-.45, .75, normalDotKey) - .70);
  return diffuse.map((value, index) => value + (Math.max(value, albedo[index] * AVATAR_SHADE_LIGHTING.diffuseFloor[index] * directional) - value) * weight);
};
test('the floor is albedo dependent and fades out under a healthy key, retaining face modelling and black clothing', () => {
  const skin = [.58, .31, .20], black = [.009, .009, .010];
  const shadowed = response(skin, [.01, .008, .009], .04);
  assert.ok(shadowed.every((value, index) => value >= [.01, .008, .009][index]));
  assert.ok(shadowed.every(value => value < .08), 'the bounce is restrained linear diffuse, not a uniformly bright face');
  assert.ok(response(black, [0, 0, 0], 0, 1).every(value => value < .0017), 'even the brightest bounce cannot turn black cloth grey');
  assert.deepEqual(response(skin, [.40, .21, .15], .8), [.40, .21, .15], 'the sunlit side is exact');
  assert.ok(response(skin, [.08, .06, .05], .25).every((value, index) => value >= [.08, .06, .05][index]));
  assert.deepEqual(response([0, 0, 0], [0, 0, 0], 0), [0, 0, 0]);
});

test('deeply shaded facial planes gain contrast while retaining the old readability floor and healthy highlights',()=>{
 const skin=[.58,.31,.20],zero=[0,0,0],old=response(skin,zero,0,0,0);
 const keySide=response(skin,zero,0,1),farSide=response(skin,zero,0,-1);
 for(let channel=0;channel<3;channel++){
  assert.ok(keySide[channel]>old[channel],'planes facing the key get a small lift, rather than darkening the whole face');
  assert.ok(farSide[channel]>=old[channel]*.70,'the deepest side keeps at least70% of prior readability');
  assert.ok(keySide[channel]/farSide[channel]>1.5,'opposite shaded planes no longer clamp to one flat colour');
  assert.ok(keySide[channel]<=old[channel]*1.13,'retain the restrained diffuse budget');
 }
 for(const facing of [-1,-.5,0,.5,1]){
  assert.deepEqual(response(skin,[.4,.21,.15],.8,facing),[.4,.21,.15],'healthy direct light and its contrast are untouched');
  assert.deepEqual(response(skin,zero,0,facing,0),old,'the comparison scalar reproduces the exact prior uniform bounce');
 }
});

test('directional shade follows the world key rather than the camera and safely reuses ambient-only programs',()=>{
 const avatar=shader();avatarLightBands(avatar,{value:.72});
 assert.match(avatar.fragmentShader,/#if NUM_DIR_LIGHTS > 0/);
 assert.match(avatar.fragmentShader,/directionalLights\[ i \]\.color/);
 assert.match(avatar.fragmentShader,/avatarShadeKey = directionalLights\[ i \]\.direction/);
 assert.match(avatar.fragmentShader,/viewMatrix \* vec4\(0\., 1\., 0\., 0\.\)/,'ambient-only fallback is sky-up with no camera translation');
 const normal=new THREE.Vector3(.6,.2,.77).normalize(),key=new THREE.Vector3(-.4,.8,.2).normalize(),skin=[.58,.31,.2];
 const expected=response(skin,[0,0,0],0,normal.dot(key));
 for(const angles of [[0,0,0],[1,.8,-.3],[-.7,2.6,.2]]){
  const view=new THREE.Quaternion().setFromEuler(new THREE.Euler(...angles));
  const actual=response(skin,[0,0,0],0,normal.clone().applyQuaternion(view).dot(key.clone().applyQuaternion(view)));
  actual.forEach((value,i)=>assert.ok(Math.abs(value-expected[i])<1e-12));
 }
});

test('non-avatar programs are not patched and no additional map or light uniforms are introduced', () => {
  const ordinary = shader(), before = ordinary.fragmentShader;
  applyAvatarShadeLighting(ordinary);
  assert.equal(ordinary.fragmentShader, before); assert.deepEqual(ordinary.uniforms, {});
  const avatar = shader(); avatarLightBands(avatar, { value: .72 });
  assert.deepEqual(Object.keys(avatar.uniforms).sort(), ['avatarEven', 'avatarShadeContrast', 'avatarShadeFloor']);
});
