import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import { EntryRecovery } from '../src/ui/EntryRecovery.ts';
const source=await readFile('src/ui/App.ts','utf8');
const tree=ts.createSourceFile('App.ts',source,ts.ScriptTarget.Latest,true);
const app=tree.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='App');
const helperNames=['normalizeIdForSafety','isValidId','readProfile','readSession','readActiveProfile','saveProfile'];
const helpers=tree.statements.filter(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>helperNames.includes(d.name.getText(tree)))).map(n=>n.getText(tree)).join('\n');
const methods=['rejoinAfterDiscard','recordBlackBox','preparePhoneFilmPlayback','rememberPalette'].map(name=>app.members.find(n=>n.name?.getText(tree)===name).getText(tree)).join('\n');
const keys={PROFILE_KEY:'profile',TAB_PROFILE_KEY:'tab-profile',INSIDE_KEY:'inside',REJOIN_TRIES_KEY:'tries',AUDIO_MUTED_KEY:'muted',BLACK_BOX_KEY:'blackbox',ENTRY_PHASE_KEY:'entry-phase'};
function store(){const values=new Map();return{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};}
function harness(overrides={}){
 const globals={...keys,sessionStorage:store(),localStorage:store(),performance:{now:()=>1000},...overrides};
 runInNewContext(ts.transpileModule(`${helpers}; class Harness { lastFilmCheckpointAt=-Infinity; ${methods} }; globalThis.api={readActiveProfile,saveProfile,Harness};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,globals);
 const entryRecovery=new EntryRecovery({storage:()=>globals.sessionStorage,phaseKey:keys.ENTRY_PHASE_KEY,retryKey:keys.REJOIN_TRIES_KEY,setTimeout:()=>0,clearTimeout(){}});
 globals.api.Harness.prototype.entryRecovery=entryRecovery;
 globals.api.Harness.prototype.disposeGatePreview=()=>{};
 return{...globals,...globals.api,entryRecovery};
}
const profile={id:'Visitor',language:'zh-TW',graphicsMode:'lite',palette:{top:'#123456'}};
test('blocked tab storage cannot prevent the sign-in screen or saved-device fallback',()=>{
 const blocked={getItem(){throw new DOMException('Storage blocked','SecurityError');}};
 const local=store();local.setItem('profile',JSON.stringify(profile));
 const h=harness({sessionStorage:blocked,localStorage:local});
 assert.equal(h.readActiveProfile().id,'Visitor');
 const allBlocked=harness({sessionStorage:blocked,localStorage:blocked});
 assert.equal(allBlocked.readActiveProfile(),null);
});
test('a malformed tab identity falls back without breaking startup',()=>{
 const h=harness();h.localStorage.setItem('profile',JSON.stringify(profile));
 h.sessionStorage.setItem('inside','1');h.sessionStorage.setItem('tab-profile',JSON.stringify({id:123}));
 assert.equal(h.readActiveProfile().id,'Visitor');
});
test('declining Remember Me still recovers the admitted tab without persisting a device profile',()=>{
 const h=harness();h.saveProfile(profile,false);assert.equal(h.localStorage.getItem('profile'),null);
 assert.equal(h.readActiveProfile(),null,'fresh tabs still show the gate');
 h.sessionStorage.setItem('inside','1');assert.equal(h.readActiveProfile().id,'Visitor');
 const ui=new h.Harness();ui.reviewsGateMotion=()=>false;ui.enterWhenThereIsRoom=muted=>{ui.entered={muted,id:ui.currentId};};
 ui.rejoinAfterDiscard();assert.deepEqual(ui.entered,{muted:true,id:'Visitor'});
 assert.equal(h.sessionStorage.getItem('tries'),'1');
 ui.rejoinAfterDiscard();assert.equal(h.sessionStorage.getItem('tries'),'2');
 ui.entered=undefined;ui.rejoinAfterDiscard();assert.equal(ui.entered,undefined,'retain the crash-loop guard');
 assert.equal(h.sessionStorage.getItem('inside'),null);
});
test('a different remembered profile cannot replace this tabs active identity',()=>{
 const h=harness();h.saveProfile({...profile,id:'Other'},true);h.saveProfile(profile,false);h.sessionStorage.setItem('inside','1');
 assert.equal(h.readActiveProfile().id,'Visitor');
 h.sessionStorage.removeItem('inside');assert.equal(h.readActiveProfile(),null);
});
test('an interrupted entrance stops before auto-admission and keeps its tab identity and credentials',()=>{
 const h=harness();h.saveProfile(profile,false);h.sessionStorage.setItem('inside','1');
 h.sessionStorage.setItem('server-session','same-visitor');h.entryRecovery.begin();
 const ui=new h.Harness(),notice={hidden:true,textContent:''};
 ui.root={querySelector:()=>notice};ui.language='en';ui.reviewsGateMotion=()=>false;
 ui.enterWhenThereIsRoom=()=>assert.fail('must not automatically allocate the crashed world again');
 ui.rejoinAfterDiscard();
 assert.equal(h.entryRecovery.phase(),'interrupted');assert.equal(h.sessionStorage.getItem('inside'),null);
 assert.equal(h.readActiveProfile().id,'Visitor');assert.equal(h.localStorage.getItem('profile'),null);
 assert.equal(h.sessionStorage.getItem('server-session'),'same-visitor');assert.equal(notice.hidden,false);
 ui.rejoinAfterDiscard();assert.equal(h.entryRecovery.phase(),'interrupted');
});
test('a delayed support probe cannot classify a current manual entry as a previous crash',()=>{
 const h=harness();h.saveProfile(profile,false);h.sessionStorage.setItem('inside','1');h.entryRecovery.begin();
 const ui=new h.Harness();ui.reviewsGateMotion=()=>false;ui.openingWorld=true;
 ui.enterWhenThereIsRoom=()=>assert.fail('must not enter twice while admission is active');
 ui.rejoinAfterDiscard();assert.equal(h.entryRecovery.phase(),'loading');
 assert.equal(h.sessionStorage.getItem('inside'),'1');
 ui.openingWorld=false;ui.world={};ui.rejoinAfterDiscard();assert.equal(h.entryRecovery.phase(),'loading');
 h.entryRecovery.finish();assert.equal(h.entryRecovery.phase(),'ready');
});
test('the phone writes a pre-decoder checkpoint even between periodic samples, and silences jukebox',()=>{
 const h=harness(),ui=new h.Harness();let stops=0,samples=0;
 ui.usesSingleFilmPlayer=()=>true;ui.stopJukebox=()=>stops++;
 ui.world={diagnosticSample:()=>{samples++;return{venue:'shore',warmFilm:'stopped',playerW:800,playerH:450};}};
 ui.preparePhoneFilmPlayback();const saved=JSON.parse(h.localStorage.getItem('blackbox'));
 assert.equal(saved.checkpoint,'film-start');assert.equal(saved.playerW,800);assert.equal(saved.clean,false);
 ui.preparePhoneFilmPlayback();assert.equal(samples,1,'commands in one burst do not repeatedly traverse the scene');assert.equal(stops,2);
 ui.usesSingleFilmPlayer=()=>false;ui.preparePhoneFilmPlayback();assert.equal(stops,2);
});
test('fixed audio completes under the entry overlay before gameplay starts',()=>{
 const method=app.members.find(n=>n.name?.getText(tree)==='enterWorld').getText(tree);
 const barrier=method.indexOf('await Promise.all([ambience, this.entryAudio.loadInterfaceSounds()])');
 assert.ok(barrier>0&&barrier<method.indexOf('this.world.start()'));
 assert.ok(barrier<method.indexOf('await this.completeGateEntry()'));
 assert.doesNotMatch(method,/AMBIENCE_ENTRY_WAIT_MS|Promise\.race\(\[ambience/);
});
test('mobile entrance retires its preview before construction and starts stability only after handoff',()=>{
 const enter=app.members.find(n=>n.name?.getText(tree)==='enterWorld').getText(tree);
 assert.ok(enter.indexOf('freezeEntryForWorld()')<enter.indexOf('new FestivalWorld('));
 assert.match(enter,/matchMedia\('\(max-width: 800px\), \(pointer: coarse\)'\)\.matches && this\.gatePreview/);
 assert.doesNotMatch(enter,/setTimeout\(\(\) => sessionStorage\.removeItem\(REJOIN_TRIES_KEY\)/);
 const finish=app.members.find(n=>n.name?.getText(tree)==='completeGateEntry').getText(tree);
 assert.ok(finish.indexOf('this.entryRecovery.finish()')>finish.indexOf('this.world?.setEntryHandoffPaused(false)'));
 assert.ok(finish.indexOf('this.entryRecovery.finish()')>finish.indexOf('this.gateEntryOverlay?.remove()'));
 const begin=app.members.find(n=>n.name?.getText(tree)==='enterWorldAfterGateFeedback').getText(tree);
 assert.ok(begin.indexOf('this.entryRecovery.begin()')<begin.indexOf('this.beginGateEntry()'));
 assert.match(begin,/this\.entryRecovery\.fail\(\)/);
});

test('tab recovery keeps later outfit and quality changes without enabling device remembering',()=>{
 const h=harness();h.saveProfile(profile,false);h.sessionStorage.setItem('inside','1');
 const ui=new h.Harness();Object.assign(ui,{palette:{top:'#abcdef'},graphicsMode:'normal',language:'en'});
 ui.rememberPalette();const saved=h.readActiveProfile();
 assert.equal(saved.palette.top,'#abcdef');assert.equal(saved.graphicsMode,'normal');
 assert.equal(h.localStorage.getItem('profile'),null);
});
