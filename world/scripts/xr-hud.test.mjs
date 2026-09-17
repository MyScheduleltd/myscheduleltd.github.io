import test from 'node:test';
import assert from 'node:assert/strict';
import {xrBindings,xrStickRows,xrQuickActions,xrBindingFor,xrHintRow,xrHintItems,XR_HINT_SEPARATOR,XR_HOLD_MS} from '../src/world/XrControls.ts';
import {describeHud,layoutHud,hudHitAt,wrapHudText,clampHudScroll,hudRoleStyles} from '../src/world/XrHudLayout.ts';

const measure=(text,style)=>text.length*style.size*.5;

test('no two headset buttons share a hand and an index',()=>{
  const seen=new Set();
  for(const binding of xrBindings){
    const key=`${binding.hand}:${binding.button}`;
    assert.ok(!seen.has(key),`${key} is bound twice`);
    seen.add(key);
  }
});

test('the two hands no longer mean the same thing on the face buttons',()=>{
  // This is the fault that was reported: A and X ran one action between them,
  // and B and Y another, which left four buttons doing nothing at all.
  for(const button of [4,5]){
    const left=xrBindingFor('left',button);
    const right=xrBindingFor('right',button);
    assert.ok(left&&right,`button ${button} must be bound on both hands`);
    assert.notEqual(left.action,right.action,`button ${button} means the same on both hands`);
  }
});

test('every vital action reaches a button or the pointer',()=>{
  const onButtons=new Set(xrBindings.flatMap((binding)=>[binding.action,binding.hold].filter(Boolean)));
  for(const action of ['click','interact','pickUp','jump','dance','photo','run','recenter','pass'])
    assert.ok(onButtons.has(action),`${action} is not bound to anything`);
  const pointed=new Set(xrQuickActions.map(([action])=>action));
  for(const action of ['offer','punch'])
    assert.ok(pointed.has(action),`${action} is not reachable with the pointer`);
  // Deliberately absent: a headset *is* the camera, so the follow and
  // perspective rigs mean nothing in there and the owner asked for it gone.
  assert.ok(!pointed.has('camera'),'changing the camera has no meaning in a headset');
});

test('only run is a hold, and only the interact button carries a long press',()=>{
  assert.deepEqual(xrBindings.filter((b)=>b.sustained).map((b)=>b.action),['run','run']);
  const holds=xrBindings.filter((b)=>b.hold);
  assert.equal(holds.length,1);
  assert.equal(holds[0].action,'interact');
  assert.equal(holds[0].hold,'pickUp');
  assert.ok(XR_HOLD_MS>250&&XR_HOLD_MS<900,'a hold has to be longer than a tap and shorter than a wait');
});

test('both languages label every row, and the painted strip names the sticks and faces',()=>{
  for(const binding of xrBindings){
    assert.equal(binding.label.length,2);
    assert.equal(binding.describes.length,2);
    for(const text of [...binding.label,...binding.describes])assert.ok(text.trim().length,'an empty label');
  }
  assert.equal(xrStickRows.length,3);
  for(const row of [xrHintRow(false),xrHintRow(true)]){
    for(const token of ['A','B','X','Y'])assert.ok(row.includes(token),`the hint strip never mentions ${token}`);
  }
  assert.ok(xrHintRow(true).includes('通行證'));
  assert.ok(xrHintRow(false).includes('PASS'));
});

test('the painted strip is a list of whole bindings, so a wrap cannot split one',()=>{
  // It is packed onto two lines at these boundaries. Wrapping on spaces put
  // "L STICK PRESS" on one line and "RECENTER" on the next, which reads as
  // two separate controls.
  for(const zh of [false,true]){
    const items=xrHintItems(zh);
    assert.equal(items.length,10);
    for(const item of items){
      assert.ok(item.trim().length,'an empty item');
      assert.ok(!item.includes(XR_HINT_SEPARATOR.trim()),'an item must not contain the separator');
    }
    assert.equal(items.join(XR_HINT_SEPARATOR),xrHintRow(zh));
  }
});

test('a painted panel keeps the real elements as its click targets',()=>{
  const nodes=describeHud({tag:'nav',children:[
    {tag:'p',classes:['festival-pass__title'],text:'影展通行證'},
    {tag:'button',text:'01 任務',ref:0},
    {tag:'button',text:'02 地圖',ref:1},
    {tag:'button',text:'03 節目表',ref:2,disabled:true},
  ]});
  assert.deepEqual(nodes.map((node)=>node.role),['text','button','button','button']);
  assert.deepEqual(nodes.filter((node)=>node.role==='button').map((node)=>node.target),[0,1,2]);
  assert.equal(nodes[1].target,0);
  assert.equal(nodes[3].disabled,true);
  assert.equal(nodes[0].target,-1,'plain text must not be clickable');
});

test('a hidden element and an inline drawing are never painted',()=>{
  const nodes=describeHud({tag:'div',children:[
    {tag:'svg',text:'a map nobody can paint'},
    {tag:'button',text:'HIDDEN',ref:0,hidden:true},
    {tag:'button',text:'SHOWN',ref:1},
  ]});
  assert.deepEqual(nodes.map((node)=>node.text),['SHOWN']);
});

test('a closed section hides its body and an open one does not',()=>{
  const section=(open)=>({tag:'div',children:[{tag:'details',open,children:[
    {tag:'summary',text:'KEYBOARD',ref:0},
    {tag:'dl',children:[{tag:'div',children:[{tag:'dt',text:'SPACE'},{tag:'dd',text:'Jump'}]}]},
  ]}]});
  const closed=describeHud(section(false));
  assert.deepEqual(closed.map((node)=>node.role),['summary']);
  assert.equal(closed[0].target,0,'the summary is what gets clicked');
  const open=describeHud(section(true));
  assert.deepEqual(open.map((node)=>node.role),['summary','row']);
  assert.equal(open[1].text,'SPACE');
  assert.equal(open[1].value,'Jump');
  assert.ok(open[1].indent>open[0].indent,'a section body sits in from its summary');
});

test('a row keeps its buttons as their own targets rather than swallowing them',()=>{
  const nodes=describeHud({tag:'dl',children:[{tag:'div',children:[
    {tag:'dt',text:'A'},
    {tag:'dd',text:'Jump CHANGE RESET',children:[
      {tag:'span',children:[{tag:'button',text:'CHANGE',ref:7},{tag:'button',text:'RESET',ref:8,disabled:true}]},
    ]},
  ]}]});
  assert.equal(nodes[0].role,'row');
  const buttons=nodes.filter((node)=>node.role==='button');
  assert.deepEqual(buttons.map((node)=>node.target),[7,8]);
  assert.equal(buttons[1].disabled,true);
});

test('a label with a control becomes one clickable field carrying its value',()=>{
  const nodes=describeHud({tag:'div',children:[
    {tag:'label',text:'攝影機',children:[
      {tag:'span',text:'攝影機'},
      {tag:'select',ref:3,value:'FaceTime HD'},
    ]},
  ]});
  assert.equal(nodes.length,1);
  assert.equal(nodes[0].role,'field');
  assert.equal(nodes[0].target,3);
  assert.equal(nodes[0].value,'FaceTime HD');
});

test('the layout stacks downward and only clickable rows get hit areas',()=>{
  const nodes=describeHud({tag:'nav',children:[
    {tag:'p',text:'PASS'},
    {tag:'button',text:'OBJECTIVES',ref:0},
    {tag:'button',text:'MAP',ref:1},
  ]});
  const layout=layoutHud(nodes,1024,measure,30);
  assert.equal(layout.blocks.length,3);
  assert.equal(layout.hits.length,2);
  for(let i=1;i<layout.blocks.length;i+=1)
    assert.ok(layout.blocks[i].y>=layout.blocks[i-1].y+layout.blocks[i-1].h,'blocks overlap');
  assert.ok(layout.height>layout.blocks[2].y+layout.blocks[2].h);
  for(const hit of layout.hits)assert.ok(hit.h>=44,'a pointer needs a row it can hit at arm’s length');
});

test('a pointer lands on the row it is over, and on nothing between them',()=>{
  const nodes=describeHud({tag:'nav',children:[
    {tag:'button',text:'OBJECTIVES',ref:11},
    {tag:'button',text:'MAP',ref:12},
  ]});
  const layout=layoutHud(nodes,1024,measure,30);
  const [first,second]=layout.hits;
  assert.equal(hudHitAt(layout,first.x+10,first.y+5)?.target,11);
  assert.equal(hudHitAt(layout,second.x+10,second.y+5)?.target,12);
  assert.equal(hudHitAt(layout,first.x-20,first.y+5),undefined,'the padding is not a button');
  assert.equal(hudHitAt(layout,first.x+10,layout.height+50),undefined);
});

test("a row's own buttons share one line instead of stacking full width",()=>{
  const row=(index)=>({tag:'div',children:[
    {tag:'dt',text:`BUTTON ${index}`},
    {tag:'dd',text:'Jump',children:[{tag:'span',children:[
      {tag:'button',text:'CHANGE',ref:index*2},
      {tag:'button',text:'RESET',ref:index*2+1},
    ]}]},
  ]});
  const nodes=describeHud({tag:'dl',children:[row(0),row(1)]});
  const inline=nodes.filter((node)=>node.inline);
  assert.equal(inline.length,4,'both buttons on both rows share their row');
  const layout=layoutHud(nodes,1024,measure,30);
  const change=layout.hits.find((hit)=>hit.target===0);
  const reset=layout.hits.find((hit)=>hit.target===1);
  assert.equal(change.y,reset.y,'a pair must sit on one line');
  assert.equal(change.h,reset.h,'a pair must square off to the same height');
  assert.ok(change.x+change.w<=reset.x,'a pair must not overlap');
  assert.ok(reset.w>=140,'a pointer still needs a target it can hit');
  // The whole point: two rows of two buttons, not four full-width slabs.
  const stacked=layoutHud(nodes.map(({inline,...rest})=>rest),1024,measure,30);
  assert.ok(layout.height<stacked.height*0.75,'packing must shorten the panel');
});

test('long text wraps, and a run without spaces still breaks',()=>{
  const style=hudRoleStyles.text;
  const wrapped=wrapHudText('the festival runs three public screenings every evening',200,style,measure);
  assert.ok(wrapped.length>1);
  for(const line of wrapped)assert.ok(measure(line,style)<=200,`"${line}" is wider than the panel`);
  const cjk=wrapHudText('三座影廳都在進行公開放映，從我的廣場可前往皇宮影廳。',200,style,measure);
  assert.ok(cjk.length>1,'a Chinese sentence has no spaces to break on and must still wrap');
  for(const line of cjk)assert.ok(measure(line,style)<=200);
  assert.equal(wrapHudText('',200,style,measure).length,0);
});

test('a caps role is painted in caps and measured that way too',()=>{
  const [line]=wrapHudText('objectives',4000,hudRoleStyles.button,measure);
  assert.equal(line,'OBJECTIVES');
});

test('scrolling stops at both ends of the content',()=>{
  assert.equal(clampHudScroll(-40,3000,1330),0);
  assert.equal(clampHudScroll(9000,3000,1330),3000-1330);
  assert.equal(clampHudScroll(400,3000,1330),400);
  assert.equal(clampHudScroll(120,800,1330),0,'content shorter than the panel never scrolls');
});
