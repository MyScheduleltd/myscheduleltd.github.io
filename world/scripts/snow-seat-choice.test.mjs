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

function fixture(){
 const log=[],root={children:[],querySelector:()=>null,append(element){this.children.push(element);element.parent=this;element.isConnected=true;}},document={activeElement:null};
 const eventTarget=extra=>{const listeners=new Map();return {...extra,addEventListener(type,listener){listeners.set(type,listener);},fire(type,event={}){const e={preventDefault(){this.defaultPrevented=true;},...event};listeners.get(type)?.(e);return e;}};};
 const previous={isConnected:true,focus(){document.activeElement=this;log.push('restore-focus');}};document.activeElement=previous;
 document.createElement=()=>{
  const element=eventTarget({parent:null,isConnected:false,buttons:[],
   querySelectorAll(){return this.buttons;},querySelector(){return this.buttons[0];},
   remove(){this.parent.children=this.parent.children.filter(child=>child!==this);this.isConnected=false;},
  });
  Object.defineProperty(element,'innerHTML',{set(html){this.html=html;this.buttons=[...html.matchAll(/<button[^>]*data-choice="([^"]+)"/g)].map(([,choice])=>eventTarget({dataset:{choice},focus(){document.activeElement=this;},click(){this.fire('click');}}));}});
  return element;
 };
 const globals={document,window:{location:{hostname:'test.invalid'}}};runInNewContext(compiled,globals);
 const ui=new globals.SnowHarness();
 Object.assign(ui,{root,language:'zh-TW',arcadePlaying:false,arcadeNotice:undefined,activePanel:undefined,danceWheel:undefined,snowSeatChoice:undefined,
  world:{setMenuOpen(open){log.push(['capture',open]);},takeSnowSeat(id,choice){log.push(['take',id,choice]);}},
  menuFocusables(){throw Error('Snow navigation must not fall through to the hidden pass');},
  openFestivalPass(){throw Error('The gamepad must not open another menu over the snow choice');},
 });
 const open=()=>ui.handleWorldAction({type:'snowSeat',seatId:'BEACH-MAT-1'});
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
 assert.equal(dialog.fire('keydown',{key:'Tab',shiftKey:true}).defaultPrevented,true);assert.equal(f.focus(),'cancel');
 assert.equal(dialog.fire('keydown',{key:'Tab',shiftKey:false}).defaultPrevented,true);assert.equal(f.focus(),'brush');
 assert.equal(dialog.fire('keydown',{key:'Escape'}).defaultPrevented,true);
 assert.equal(f.document.activeElement,f.previous);assert.equal(f.root.children.length,0);
 assert.ok(!f.log.some(entry=>Array.isArray(entry)&&entry[0]==='take'));
});
