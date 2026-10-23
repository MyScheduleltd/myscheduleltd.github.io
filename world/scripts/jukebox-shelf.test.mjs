import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const result=await build({stdin:{contents:"export * from './src/ui/JukeboxShelf';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node'});
const {movedJukeboxShelf,jukeboxShelfMarkup,bindJukeboxShelf}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const tracks=[{id:'XcKvndexQYE',youtubeId:'XcKvndexQYE',title:'FIRST <&"'},{id:'KvMY1uzSC1E',youtubeId:'KvMY1uzSC1E',title:'SECOND'},{id:'jLXTBbMRxK8',youtubeId:'jLXTBbMRxK8',title:'THIRD'}];
const escape=s=>s.replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[ch]);
test('staff shelf controls preserve titles and IDs, escape labels and disable the actual two boundaries',()=>{
 const order=movedJukeboxShelf(tracks,tracks[2].id,'up');assert.deepEqual(order,[tracks[0].id,tracks[2].id,tracks[1].id]);assert.equal(tracks[1].title,'SECOND');
 assert.equal(movedJukeboxShelf(tracks,tracks[0].id,'up'),undefined);assert.equal(movedJukeboxShelf(tracks,tracks[2].id,'down'),undefined);assert.equal(movedJukeboxShelf(tracks,'missing','up'),undefined);
 for(const zh of [false,true]){
  const html=jukeboxShelfMarkup(tracks,zh,escape);assert.equal((html.match(/data-jukebox-stock-move=/g)??[]).length,6);assert.equal((html.match(/ disabled/g)??[]).length,2);assert.match(html,/FIRST &lt;&amp;&quot;/);assert.ok(!html.includes('data-jukebox-move='),'queue controls remain independent');
 }
});
test('the actual shelf click sends a full permutation once until its authenticated update finishes',async()=>{
 const buttons=tracks.map(t=>({dataset:{jukeboxStockMove:t.id,direction:'up'},addEventListener(_name,handler){this.click=handler;}})),sent=[];let release;
 bindJukeboxShelf({querySelectorAll:()=>buttons},tracks,async order=>{sent.push(order);await new Promise(resolve=>release=resolve);});
 buttons[0].click();assert.equal(sent.length,0,'boundary cannot create an invalid order');buttons[2].click();buttons[1].click();assert.equal(sent.length,1);assert.equal(buttons[2].disabled,true);assert.deepEqual(sent[0],[tracks[0].id,tracks[2].id,tracks[1].id]);
 release();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(buttons[2].disabled,false);
});
