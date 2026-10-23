import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['src/ui/NoirMode.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {NOIR_PREFERENCE_KEY,readNoirPreference,saveNoirPreference,applyNoirMode,noirButtonMarkup,syncNoirButton}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));

test('noir persists only a local display bit and remains usable when storage is denied',()=>{
 const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 assert.equal(readNoirPreference(storage),false);saveNoirPreference(true,storage);assert.deepEqual([...values],[[NOIR_PREFERENCE_KEY,'1']]);assert.equal(readNoirPreference(storage),true);
 saveNoirPreference(false,storage);assert.equal(readNoirPreference(storage),false);
 for(const malformed of ['', 'true','2','null','{}']){values.set(NOIR_PREFERENCE_KEY,malformed);assert.equal(readNoirPreference(storage),false);}
 const denied={getItem(){throw Error('denied');},setItem(){throw Error('denied');}};
 assert.equal(readNoirPreference(denied),false);assert.doesNotThrow(()=>saveNoirPreference(true,denied));
 const root={dataset:{era:'ps2'}};applyNoirMode(root,true);assert.deepEqual(root.dataset,{era:'ps2',noir:'on'});applyNoirMode(root,false);assert.equal(root.dataset.noir,'off');
});

test('power button exposes bilingual wording and pressed state, and updates without rebuilding/focusing the menu',()=>{
 for(const zh of [true,false])for(const enabled of [true,false]){
  const html=noirButtonMarkup(enabled,zh);assert.match(html,/type="button"/);assert.match(html,/data-noir-toggle/);assert.match(html,/aria-hidden="true"/);assert.ok(html.includes(`aria-pressed="${enabled}"`));assert.match(html,/黑白電影/);assert.match(html,/NOIR/);assert.ok(html.includes(enabled?'>ON<':'>OFF<'));
 }
 const attrs=new Map(),status={textContent:''};const button={setAttribute:(key,value)=>attrs.set(key,value),querySelector:selector=>{assert.equal(selector,'[data-noir-status]');return status;}};
 syncNoirButton(button,true,true);assert.equal(attrs.get('aria-pressed'),'true');assert.equal(attrs.get('aria-label'),'黑白電影 / NOIR: ON');assert.equal(status.textContent,'ON');
 syncNoirButton(button,false,false);assert.equal(attrs.get('aria-pressed'),'false');assert.equal(attrs.get('aria-label'),'NOIR / 黑白電影: OFF');assert.equal(status.textContent,'OFF');
});
