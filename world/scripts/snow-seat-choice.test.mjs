import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Real dialog, App dispatch and input capture. The DOM stand-in only implements
// button events, focus and attachment; it does not reproduce navigation logic.
const source=await readFile('src/ui/App.ts','utf8');
const tree=ts.createSourceFile('App.ts',source,ts.ScriptTarget.Latest,true);
const app=tree.statements.find(node=>ts.isClassDeclaration(node)&&node.name?.text==='App');
const methods=['handleWorldAction','handleGamepadMenu','syncMenuCapture'].map(name=>{
 const method=app.members.find(node=>node.name?.getText(tree)===name);assert.ok(method,name);return method.getText(tree);
}).join('\n');
const choiceSource=await readFile('src/ui/SnowSeatChoice.ts','utf8');
const compiled=ts.transpileModule(choiceSource.replace('export class SnowSeatChoice','class SnowSeatChoice')+`\nclass SnowHarness {${methods}};globalThis.SnowHarness=SnowHarness;`,{
 compilerOptions:{target:ts.ScriptTarget.ES2022},
}).outputText;

function fixture({outdoor=true,seatId='BEACH-MAT-1',zh=true}={}){
 const log=[],root={children:[],querySelector:()=>null,append(element){this.children.push(element);element.parent=this;element.isConnected=true;}},document={activeElement:null};
 const eventTarget=extra=>{const listeners=new Map();return {...extra,addEventListener(type,listener){const list=listeners.get(type)??[];list.push(listener);listeners.set(type,list);},fire(type,event={}){const e={preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.propagationStopped=true;},...event};for(const listener of listeners.get(type)??[])listener(e);return e;}};};
 const previous={isConnected:true,focus(){document.activeElement=this;log.push('restore-focus');}};document.activeElement=previous;
 document.createElement=()=>{
  const element=eventTarget({parent:null,isConnected:false,buttons:[],
   querySelectorAll(selector){return selector==='[data-choice]'?this.buttons.filter(b=>b.dataset.choice):this.buttons;},querySelector(selector){return selector==='[data-snow-close]'?this.buttons.find(b=>b.dataset.snowClose):this.buttons.find(b=>b.dataset.choice===/data-choice="([^"]+)"/.exec(selector)?.[1]);},
   remove(){this.parent.children=this.parent.children.filter(child=>child!==this);this.isConnected=false;},
  });
  Object.defineProperty(element,'innerHTML',{set(html){this.html=html;this.buttons=[...html.matchAll(/<button([^>]*)>/g)].map(([,attributes])=>eventTarget({dataset:{choice:/data-choice="([^"]+)"/.exec(attributes)?.[1],snowClose:attributes.includes('data-snow-close')},focus(){document.activeElement=this;},click(){this.fire('click');}}));}});
  return element;
 };
 const globals={document,window:{location:{hostname:'test.invalid'}}};runInNewContext(compiled,globals);
 const ui=new globals.SnowHarness();
 Object.assign(ui,{root,language:zh?'zh-TW':'en',arcadePlaying:false,arcadeNotice:undefined,activePanel:undefined,danceWheel:undefined,snowSeatChoice:undefined,
  world:{canBrushSnowSeat(){return outdoor;},setMenuOpen(open){log.push(['capture',open]);},takeSnowSeat(id,choice){log.push(['take',id,choice]);}},
  menuFocusables(){throw Error('Snow navigation must not fall through to the hidden pass');},
  openFestivalPass(){throw Error('The gamepad must not open another menu over the snow choice');},
 });
 const open=()=>ui.handleWorldAction({type:'snowSeat',seatId});
 return {ui,root,document,previous,log,open,element:()=>root.children[0],focus:()=>document.activeElement?.dataset?.choice};
}

test('App opens one snow choice, captures movement and routes gamepad brush selection before hidden menus',()=>{
 const f=fixture();f.open();const dialog=f.element();f.open();
 assert.equal(f.root.children.length,1);assert.equal(f.element(),dialog);assert.equal(f.focus(),'brush');
 assert.deepEqual(f.log,[['capture',true]],'opening and duplicate actions perform no brushing or claim');
 f.ui.handleGamepadMenu('down');assert.equal(f.focus(),'sit');
 f.ui.handleGamepadMenu('up');assert.equal(f.focus(),'brush');
 f.ui.handleGamepadMenu('up');assert.equal(f.focus(),'cancel','up wraps within the dialog');
 f.ui.handleGamepadMenu('down');assert.equal(f.focus(),'brush');
 f.ui.handleGamepadMenu('confirm');
 assert.equal(f.root.children.length,0);assert.equal(f.ui.snowSeatChoice,undefined);assert.equal(f.document.activeElement,f.previous);
 assert.deepEqual(f.log,[['capture',true],'restore-focus',['capture',false],['take','BEACH-MAT-1','brush']],'input is returned before the world takes the selected seat');
});

test('gamepad sit, cancel, back and toggle all preserve their distinct semantics and restore prior focus',async t=>{
 for(const [name,nav,expected]of[
  ['sit',['down','confirm'],'sit'],['cancel',['down','down','confirm'],undefined],
  ['back',['back'],undefined],['toggle',['toggle'],undefined],
 ])await t.test(name,()=>{
  const f=fixture();f.open();for(const direction of nav)f.ui.handleGamepadMenu(direction);
  const selections=f.log.filter(entry=>Array.isArray(entry)&&entry[0]==='take');
  assert.deepEqual(selections,expected?[['take','BEACH-MAT-1',expected]]:[]);
  assert.equal(f.root.children.length,0);assert.equal(f.document.activeElement,f.previous);
  assert.ok(f.log.some(entry=>Array.isArray(entry)&&entry[0]==='capture'&&entry[1]===false));
 });
});

test('keyboard Tab stays in the snow dialog and Escape cancels without claiming',()=>{
 const f=fixture();f.open();const dialog=f.element();
 const backwards=dialog.fire('keydown',{key:'Tab',shiftKey:true});assert.equal(backwards.defaultPrevented,true);assert.equal(backwards.propagationStopped,true);assert.equal(f.document.activeElement.dataset.snowClose,true);
 assert.equal(dialog.fire('keydown',{key:'Tab',shiftKey:true}).defaultPrevented,true);assert.equal(f.focus(),'cancel');
 assert.equal(dialog.fire('keydown',{key:'Tab',shiftKey:false}).defaultPrevented,true);assert.equal(f.document.activeElement.dataset.snowClose,true);
 assert.equal(dialog.fire('keydown',{key:'Tab',shiftKey:false}).defaultPrevented,true);assert.equal(f.focus(),'brush');
 assert.equal(dialog.fire('keydown',{key:'Escape'}).defaultPrevented,true);
 assert.equal(f.document.activeElement,f.previous);assert.equal(f.root.children.length,0);
 assert.ok(!f.log.some(entry=>Array.isArray(entry)&&entry[0]==='take'));
});

test('the sitting-menu close control cancels without issuing a claim or brush',()=>{
 const f=fixture();f.open();const dialog=f.element();
 assert.match(dialog.html,/class="seat-menu snow-seat-choice__card"/);
 assert.match(dialog.html,/class="seat-menu__actions"/);
 assert.match(dialog.html,/class="seat-menu__close"/);
 dialog.querySelector('[data-snow-close]').click();
 assert.equal(f.root.children.length,0);assert.equal(f.document.activeElement,f.previous);
 assert.ok(!f.log.some(entry=>Array.isArray(entry)&&entry[0]==='take'));
});

test('a stale indoor snow prompt continues normal seating without exposing a snow choice',()=>{
 const f=fixture({outdoor:false});f.ui.handleWorldAction({type:'snowSeat',seatId:'PALACE-1-1'});
 assert.equal(f.root.children.length,0);assert.equal(f.ui.snowSeatChoice,undefined);
 assert.deepEqual(f.log,[['take','PALACE-1-1','sit']]);
});

test('each native beach mat names the mat and lying down in both languages, without changing shared claim semantics',()=>{
 for(const zh of [true,false])for(let index=1;index<=4;index++){
  const seatId=`BEACH-MAT-${index}`,f=fixture({seatId,zh});f.open();
  const html=f.element().html;
  for(const label of zh?['沙灘墊上有雪','躺下前，要先把雪拂掉嗎？','拂掉雪再躺','直接躺下']:['SNOW ON THE BEACH MAT','Brush it off before lying down?','BRUSH OFF SNOW & LIE DOWN','LIE DOWN ANYWAY'])assert.ok(html.includes(label),label);
  assert.ok(!html.includes(zh?'拂掉雪再坐':'BRUSH OFF SNOW & SIT'));
  f.ui.handleGamepadMenu('down');f.ui.handleGamepadMenu('confirm');
  assert.deepEqual(f.log.filter(row=>Array.isArray(row)&&row[0]==='take'),[['take',seatId,'sit']],'the authoritative protocol remains sit/brush for the mat pose');
 }
});

test('chairs, vehicle seats and benches keep seating copy rather than mat wording',()=>{
 for(const zh of [true,false])for(const seatId of ['BEACH-CHAIR-1','DRIVE-1-1','DRIVE-1-PASSENGER','SHORE-1-1','ROOFTOP-BENCH-1']){
  const f=fixture({seatId,zh});f.open();const html=f.element().html;
  for(const label of zh?['座位上有雪','要先把雪拂掉嗎？','拂掉雪再坐','直接坐下']:['A SNOWY SEAT','Brush it off before resting?','BRUSH OFF SNOW & SIT','SIT ANYWAY'])assert.ok(html.includes(label),label);
  assert.ok(!html.includes(zh?'沙灘墊':'BEACH MAT'));f.ui.handleGamepadMenu('back');
 }
});
