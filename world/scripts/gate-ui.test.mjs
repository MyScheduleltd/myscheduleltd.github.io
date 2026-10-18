import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Exercise App's real optional-preview lifecycle without constructing WebGL.
// Entry must remain possible during failed/slow preview downloads, and a late
// download may finish during admission, but never after the actual world or
// teardown. Pending module loading and the first painted frame are separate.
const source = await readFile('src/ui/App.ts', 'utf8');
const tree = ts.createSourceFile('App.ts', source, ts.ScriptTarget.Latest, true);
const appClass = tree.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'App');
const methods = ['mountGatePreview', 'disposeGatePreview', 'beginGateEntry', 'startGateTips', 'showGateTip', 'stopGateTips', 'setGateEntryProgress',
  'retainGateEntry', 'prepareGateEntry', 'waitForGateExit', 'completeGateEntry', 'cancelGateEntry', 'enterWhenThereIsRoom'].map(name => {
  const method = appClass.members.find(node => node.name?.getText(tree) === name);
  assert.ok(method, name);
  return method.getText(tree);
}).join('\n').replace("import('../world/GatePreview')", 'loadPreview()');
const deadline = (await readFile('src/network/RequestDeadline.ts', 'utf8')).replace('export async function', 'async function');
const tipsSource = (await readFile('src/ui/EntryTips.ts', 'utf8')).replaceAll('export function', 'function').replaceAll('export class', 'class');
const script = ts.transpileModule(`${tipsSource}\n${deadline}\nclass GateLifecycle {
  gatePreviewGeneration = 0;
  gatePreviewFailed = false;
  gateEntryProgress = 0;
  gateEntryAttempt = 0;
  gateEntryFrames = [];
  gateEntryKeyCapture = () => {};
  reviewsGateMotion = () => false;
  palette = { hair: '#402a2a' };
  graphicsMode = 'normal';
  language = 'en';
  ${methods}
}; globalThis.GateLifecycle = GateLifecycle; globalThis.TipRotation = TipRotation; globalThis.entryTips = entryTips;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

const settle = async () => { for (let n = 0; n < 10; n++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function fixture({ manualFrames = false } = {}) {
  const instances = [];
  const nodes = { host: {}, avatar: {}, status: { hidden: false, textContent: '' } };
  let module = deferred(), imports = 0, clock = 0, nextHandle = 0;
  const timers = new Map(), frames = new Map(), intervals = new Map();
  const later = (callback, milliseconds) => { const id = ++nextHandle; timers.set(id, { callback, at: clock + milliseconds }); return id; };
  const stepFrame = () => { const batch = [...frames.values()]; frames.clear(); for (const callback of batch) callback(clock); };
  const requestFrame = callback => {
    const id = ++nextHandle; frames.set(id, callback);
    if (!manualFrames) queueMicrotask(() => { if (frames.has(id)) { frames.delete(id); callback(clock); } });
    return id;
  };
  class Preview {
    constructor(options) { this.options = options; this.mounts = []; this.disposed = 0; this.readiness = deferred(); this.calls = []; instances.push(this); }
    mount(host, avatar) { this.mounts.push({ host, avatar }); }
    setPalette(palette) { this.palette = palette; }
    beginEntry() { if (!this.entering) { this.entering = true; this.calls.push('begin'); } }
    setEntryProgress(value) { this.calls.push(value); }
    ready() { return this.readiness.promise; }
    paint() { this.options.onReady(); this.readiness.resolve(true); }
    fail() { this.options.onError(); this.readiness.resolve(false); }
    cancelEntry() { this.entering = false; this.calls.push('cancel'); }
    dispose() { this.disposed++; this.readiness.resolve(false); }
  }
  const document = new EventTarget(); document.hidden = false;
  const window = new EventTarget(); window.innerWidth = 1280; window.setTimeout = later; window.clearTimeout = id => timers.delete(id);
  const history = new Map();
  window.localStorage = { getItem:key=>history.get(key)??null, setItem:(key,value)=>history.set(key,value) };
  window.matchMedia = () => ({matches:false});
  window.setInterval = (callback, milliseconds) => { const id=++nextHandle; intervals.set(id,{callback,milliseconds,at:clock+milliseconds}); return id; };
  window.clearInterval = id => intervals.delete(id);
  const context = { loadPreview: () => { imports++; return module.promise; }, document, window, AbortController,
    setTimeout: later, clearTimeout: id => timers.delete(id),
    cancelAnimationFrame: id => frames.delete(id), requestAnimationFrame: requestFrame };
  runInNewContext(script, context);
  const app = new context.GateLifecycle();
  app.prepareWorldTopology = () => Promise.resolve();
  app.root = { querySelector(selector) {
    return selector === '[data-gate-backdrop]' ? nodes.host
      : selector === '[data-gate-avatar]' ? nodes.avatar : nodes.status;
  } };
  return { app, nodes, instances, context, stepFrame, pendingTimers: timers, intervals,
    imports: () => imports,
    advance(milliseconds) { clock += milliseconds; for(const timer of intervals.values()) if(timer.at<=clock){timer.at=clock+timer.milliseconds;timer.callback();} for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); timer.callback(); } },
    pendingModule: () => module, replaceModule: () => { module = deferred(); },
    resolve: (which = module) => which.resolve({ GatePreview: Preview }), reject: error => module.reject(error) };
}

test('a late preview download cannot construct WebGL after the actual world or teardown', async () => {
  for (const entered of [true, false]) {
    const f = fixture();
    f.app.mountGatePreview();
    await settle();
    if (entered) f.app.world = {};
    else f.app.disposeGatePreview();
    f.resolve();
    await settle();
    assert.equal(f.instances.length, 0);
    assert.equal(f.app.gatePreviewMount, undefined);
  }
});

test('language redraw during loading mounts the latest nodes and palette', async () => {
  const f = fixture();
  f.app.mountGatePreview();
  await settle();
  const oldHost = f.nodes.host;
  f.nodes.host = {};
  f.nodes.avatar = {};
  f.app.palette = { hair: '#a05030' };
  f.app.mountGatePreview();
  f.resolve();
  await settle();
  assert.equal(f.instances.length, 1);
  assert.notEqual(f.instances[0].mounts[0].host, oldHost);
  assert.equal(f.instances[0].mounts[0].host, f.nodes.host);
  assert.equal(f.instances[0].options.palette, f.app.palette);
});

test('redrawing a ready gate reuses its renderer instead of loading another world', async () => {
  const f = fixture();
  f.app.mountGatePreview();
  f.resolve();
  await settle();
  const preview = f.instances[0];
  f.nodes.host = {};
  f.app.palette = { hair: '#201a16' };
  f.app.mountGatePreview();
  assert.equal(f.instances.length, 1);
  assert.equal(preview.mounts.length, 2);
  assert.equal(preview.mounts[1].host, f.nodes.host);
  assert.equal(preview.palette, f.app.palette);
});

test('disposal is idempotent and obsolete load callbacks cannot edit the next gate', async () => {
  const f = fixture();
  f.app.mountGatePreview();
  f.resolve();
  await settle();
  const preview = f.instances[0];
  f.app.disposeGatePreview();
  f.app.disposeGatePreview();
  f.nodes.status = { hidden: false, textContent: 'new visit' };
  preview.options.onReady();
  preview.options.onError();
  assert.equal(preview.disposed, 1);
  assert.equal(f.nodes.status.hidden, false);
  assert.equal(f.nodes.status.textContent, 'new visit');
});

test('preview failure leaves admission state untouched and permits a retry', async () => {
  const f = fixture();
  f.app.mountGatePreview();
  f.reject(new Error('Optional preview unavailable'));
  await settle();
  assert.equal(f.app.gatePreviewMount, undefined);
  assert.equal(f.app.openingWorld, undefined);
  assert.equal(f.app.world, undefined);
  assert.equal(f.instances.length, 0);
  f.replaceModule();
  const retry = f.app.mountGatePreview(); f.resolve(); await retry;
  assert.equal(f.instances.length, 1, 'a rejected optional import must be retryable');
});

test('a failed renderer is replaced on redraw and its error remains visible until ready', async () => {
  const f = fixture();
  f.app.mountGatePreview();
  f.resolve();
  await settle();
  const first = f.instances[0];
  first.options.onReady();
  first.options.onError();
  assert.equal(f.nodes.status.hidden, false);
  f.app.mountGatePreview();
  await settle();
  assert.equal(first.disposed, 1);
  assert.equal(f.instances.length, 2);
  assert.equal(f.nodes.status.hidden, false);
  f.instances[1].options.onReady();
  assert.equal(f.nodes.status.hidden, true);
});

function transitionFixture({ preview: hasPreview = true, manualFrames = false } = {}) {
  const f = fixture({ manualFrames });
  const classes = new Set(['gate--live']);
  const layout = { inert: false, setAttribute() { this.inert = true; }, removeAttribute() { this.inert = false; } };
  const label = { textContent: '' }, tip = {textContent:''}, signInTip = {textContent:''};
  const track = { value: 0, style: { setProperty() {} }, setAttribute(_name, value) { this.value = Number(value); } };
  const indicator = { hidden: true, querySelector: name => name === '[data-gate-entry-label]' ? label : track };
  const card = { getBoundingClientRect: () => ({ left: 60, right: 510, width: 450 }) };
  const avatar = { getBoundingClientRect: () => ({ left: 650, right: 1220, width: 570 }) };
  const gate = { style: { setProperty() {} }, classList: { add: n => classes.add(n), remove: n => classes.delete(n) },
    querySelector: name => name === '[data-gate-entry-tip]' ? tip : name === '[data-gate-signin-tip]' ? signInTip : name === '#gate-form' ? {} : name === '.gate__layout' ? layout : name === '.gate-card' ? card : name === '.gate-avatar' ? avatar : indicator,
    querySelectorAll: () => [],
    remove() { this.removed = true; } };
  let ownedByRoot = true;
  f.context.document.body = { append() { ownedByRoot = false; } };
  const beforeQuery = f.app.root.querySelector;
  f.app.root = { querySelector: name => name.startsWith('[data-gate-') ? beforeQuery(name) : ownedByRoot ? gate : undefined,
    replaceChildren() { ownedByRoot = true; } };
  f.app.openingWorld = true;
  let finish;
  const completion = new Promise(resolve => { finish = resolve; });
  const calls = [];
  const preview = { beginEntry: () => calls.push('begin'), setEntryProgress: n => calls.push(n),
    cancelEntry: () => calls.push('cancel'), awaitEntryComplete: () => completion,
    dispose: () => calls.push('dispose') };
  if (hasPreview) f.app.gatePreview = preview;
  return { ...f, gate, layout, indicator, track, tip, signInTip, classes, calls, finish, ownedByRoot: () => ownedByRoot };
}

test('entry progress stays at completed work while a download stalls or restarts', () => {
  const f = transitionFixture();
  f.app.beginGateEntry();
  f.app.setGateEntryProgress(.72, 'download');
  f.app.setGateEntryProgress(.2, 'retry');
  assert.equal(f.track.value, 72);
  assert.equal(f.app.gateEntryProgress, .72);
  assert.equal(f.layout.inert, true);
  assert.ok(f.classes.has('gate--entering'));
  assert.deepEqual(f.calls, ['begin', .1, .72, .72]);
});

test('the retained gate covers construction until the destination frame finishes painting', async () => {
  const f = transitionFixture();
  f.app.beginGateEntry();
  f.app.retainGateEntry();
  assert.equal(f.ownedByRoot(), false);
  const done = f.app.completeGateEntry();
  await settle();
  assert.equal(f.track.value, 100);
  assert.equal(f.gate.removed, undefined);
  assert.equal(f.calls.includes('dispose'), false);
  f.finish();
  await done;
  assert.equal(f.gate.removed, true);
  assert.equal(f.calls.filter(value => value === 'dispose').length, 1);
  assert.equal(f.app.gateEntryOverlay, undefined);
});

test('the covered world yields rendering after its first paints and resumes after preview disposal', async () => {
  const f = transitionFixture({ manualFrames: true });
  f.app.world = { setEntryHandoffPaused: paused => f.calls.push(paused ? 'pause world' : 'resume world') };
  f.app.beginGateEntry(); f.app.retainGateEntry();
  const done = f.app.completeGateEntry();
  assert.equal(f.calls.includes('pause world'), false);
  f.stepFrame(); assert.equal(f.calls.includes('pause world'), false);
  f.stepFrame(); await settle();
  assert.equal(f.calls.includes('pause world'), true);
  assert.equal(f.calls.includes('resume world'), false);
  f.finish(); await done;
  assert.ok(f.calls.indexOf('pause world') < f.calls.indexOf('dispose'));
  assert.ok(f.calls.indexOf('dispose') < f.calls.indexOf('resume world'));
});

test('entry render pause preserves XR and stopped worlds, and drains covered time before resuming gameplay', async () => {
  const source = await readFile('src/world/FestivalWorld.ts', 'utf8');
  const tree = ts.createSourceFile('FestivalWorld.ts', source, ts.ScriptTarget.Latest, true);
  const worldClass = tree.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'FestivalWorld');
  const method = worldClass.members.find(node => node.name?.getText(tree) === 'setEntryHandoffPaused');
  assert.ok(method);
  const code = ts.transpileModule(`class HandoffWorld { ${method.getText(tree)} }\nHandoffWorld;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const World = runInNewContext(code);
  for (const flag of ['preview', 'disposed', 'xrActive', undefined]) {
    const world = new World(), calls = [], render = () => {};
    if (flag) world[flag] = true;
    world.render = render;
    world.clock = { getDelta: () => calls.push('drain covered clock') };
    world.renderer = { setAnimationLoop: loop => calls.push(loop) };
    world.setEntryHandoffPaused(true); world.setEntryHandoffPaused(false);
    assert.deepEqual(calls, flag ? [] : [null, 'drain covered clock', render], flag);
  }
});

test('failed admission loading restores the same editable menu and preview for retry', () => {
  const f = transitionFixture();
  f.app.beginGateEntry();
  f.app.retainGateEntry();
  f.app.cancelGateEntry();
  assert.equal(f.ownedByRoot(), true);
  assert.equal(f.layout.inert, false);
  assert.equal(f.indicator.hidden, true);
  assert.equal(f.classes.has('gate--entering'), false);
  assert.equal(f.classes.has('gate--handoff'), false);
  assert.equal(f.calls.includes('cancel'), true);
  assert.equal(f.calls.includes('dispose'), false);
});

test('an early click shares the pending lazy import and starts that controller at the real current load progress', async () => {
  const f = transitionFixture({ preview: false });
  const initialMount = f.app.mountGatePreview(); await settle();
  f.app.beginGateEntry(); let prepared = false;
  const ready = f.app.prepareGateEntry().then(() => { prepared = true; });
  f.app.setGateEntryProgress(.63, 'model bytes'); await settle();
  assert.equal(f.imports(), 1, 'entry started a duplicate controller import');
  assert.equal(f.instances.length, 0); assert.equal(prepared, false);
  f.resolve(); await initialMount; await settle();
  assert.equal(f.instances.length, 1, 'a pending controller must still mount during admission');
  const preview = f.instances[0];
  assert.equal(preview.calls.filter(call => call === 'begin').length, 1);
  assert.ok(preview.calls.includes(.63), 'late controller missed download progress already completed');
  assert.equal(prepared, false, 'constructing the controller is not its first painted frame');
  preview.paint(); await ready;
  assert.equal(prepared, true); assert.equal(preview.disposed, 0); assert.equal(f.pendingTimers.size, 0);
  f.app.disposeGatePreview();
});

test('an existing controller waits for its aerial frame instead of assuming its world is already rendered', async () => {
  const f = transitionFixture({ preview: false });
  const mounted = f.app.mountGatePreview(); f.resolve(); await mounted;
  f.app.beginGateEntry(); let prepared = false;
  const ready = f.app.prepareGateEntry().then(() => { prepared = true; }); await settle();
  assert.equal(f.instances.length, 1); assert.equal(prepared, false);
  f.instances[0].paint(); await ready;
  assert.equal(prepared, true); assert.equal(f.instances[0].disposed, 0);
  f.app.disposeGatePreview();
});

test('optional preview import, paint, disposal and deadlines fail open without a late renderer', async () => {
  for (const outcome of ['import-error', 'paint-error', 'dispose', 'module-timeout', 'paint-timeout']) {
    const f = transitionFixture({ preview: false }); f.app.beginGateEntry();
    const ready = f.app.prepareGateEntry(); await settle();
    if (outcome === 'import-error') f.reject(new Error('optional module failed'));
    else if (outcome === 'module-timeout') f.advance(12_001);
    else {
      f.resolve(); await settle(); assert.equal(f.instances.length, 1);
      if (outcome === 'paint-error') f.instances[0].fail();
      if (outcome === 'dispose') f.app.disposeGatePreview();
      if (outcome === 'paint-timeout') f.advance(12_001);
    }
    await ready;
    assert.equal(f.app.gatePreview, undefined, outcome);
    assert.equal(f.app.gatePreviewMount, undefined, outcome);
    assert.equal(f.app.openingWorld, true, 'optional failure cancelled real admission');
    if (outcome === 'module-timeout') { f.resolve(); await settle(); assert.equal(f.instances.length, 0); }
    assert.equal(f.pendingTimers.size, 0, `${outcome}: the obsolete readiness deadline survived`);
  }
});

test('an obsolete ready result or timeout cannot restart entry or dispose the next attempt preview', async () => {
  for (const outcome of ['late-failure', 'late-timeout']) {
    const f = transitionFixture({ preview: false }); f.app.beginGateEntry();
    const firstReady = f.app.prepareGateEntry(); f.resolve(); await settle();
    const first = f.instances[0]; assert.equal(first.entering, true);
    f.app.cancelGateEntry();
    const next = new first.constructor(first.options); f.app.gatePreview = next;
    f.app.beginGateEntry(); const nextReady = f.app.prepareGateEntry(); await settle();
    next.paint(); await nextReady;
    if (outcome === 'late-failure') first.readiness.resolve(false);
    else f.advance(12_001);
    await firstReady;
    assert.equal(f.app.gatePreview === next, true, outcome);
    assert.equal(next.disposed, 0, outcome);
    assert.equal(first.calls.filter(call => call === 'begin').length, 1, 'old readiness restarted its cancelled entry');
    assert.equal(f.pendingTimers.size, 0);
    f.app.disposeGatePreview();
  }
});

test('a cached entry without a preview still waits for the real sideways CSS animation to finish or cancel', async () => {
  for (const outcome of ['finish', 'cancel', 'hide']) {
    const f = transitionFixture({ preview: false }), slide = deferred();
    f.gate.querySelectorAll = () => [{ getAnimations: () => [{ finished: slide.promise }] }];
    f.app.beginGateEntry(); f.app.retainGateEntry();
    let completed = false; const done = f.app.completeGateEntry().then(() => { completed = true; });
    await settle();
    assert.equal(f.track.value, 100); assert.equal(completed, false);
    assert.equal(f.gate.removed, undefined, 'two RAF alone cut the 480 ms menu slide off');
    if (outcome === 'finish') slide.resolve();
    if (outcome === 'cancel') slide.reject(new Error('CSS transition cancelled'));
    if (outcome === 'hide') { f.context.document.hidden = true; f.context.document.dispatchEvent(new Event('visibilitychange')); }
    await done; assert.equal(completed, true); assert.equal(f.gate.removed, true);
  }
});

test('a cancelled entry completion cannot advance or remove the following attempt', async () => {
  const f = transitionFixture({ manualFrames: true });
  f.app.beginGateEntry(); f.app.retainGateEntry();
  const oldCompletion = f.app.completeGateEntry();
  f.app.cancelGateEntry(); f.app.beginGateEntry(); f.app.setGateEntryProgress(.27, 'next attempt');
  f.stepFrame(); f.stepFrame(); await settle();
  const progress = f.app.gateEntryProgress;
  f.finish(); await oldCompletion;
  assert.equal(progress, .27, 'an old two-RAF callback advanced the next loading camera to 100%');
  assert.equal(f.gate.removed, undefined); assert.equal(f.calls.includes('dispose'), false);
});

test('queueing and refusal retain the editable gate; only successful admission begins the entry sequence', async () => {
  for (const place of [{ waiting: { inside: 20, capacity: 20, position: 2 } }, { error: 'Name already connected' }, {}]) {
    const f = fixture(), buttons = [{ disabled: false }, { disabled: false }], notice = { hidden: true, textContent: '' };
    const form = { querySelectorAll: () => buttons }; let entries = 0;
    f.app.root = { querySelector: name => name === '#gate-form' ? form : notice };
    f.app.festivalServiceReady = true; f.app.festivalClient = { requestPlace: async () => place };
    f.app.enterWorldAfterGateFeedback = () => { entries++; };
    await f.app.enterWhenThereIsRoom(true);
    if (place.waiting) {
      assert.equal(entries, 0); assert.equal(f.app.waitingForPlace, true);
      assert.ok(buttons.every(button => button.disabled)); assert.match(notice.textContent, /number 2/);
      assert.equal(f.pendingTimers.size, 1);
    } else if (place.error) {
      assert.equal(entries, 0); assert.equal(f.app.waitingForPlace, false);
      assert.ok(buttons.every(button => !button.disabled)); assert.equal(notice.textContent, place.error);
    } else { assert.equal(entries, 1); assert.equal(f.app.waitingForPlace, false); }
  }
});


test('loading tips rotate through a complete shuffled round and clean up on successful entry', async()=>{
  const f=transitionFixture();f.context.window.matchMedia=()=>({matches:true});f.app.language='zh-TW';
  f.app.beginGateEntry();const seen=[f.tip.textContent];assert.equal(f.intervals.size,1);
  const expected=Array.from(f.context.entryTips('zh-TW',true));
  for(let i=1;i<expected.length;i++){f.advance(5000);seen.push(f.tip.textContent);}
  assert.deepEqual(new Set(seen),new Set(expected),'show every mobile tip once before repeating');
  f.app.retainGateEntry();const last=f.tip.textContent;f.advance(5000);assert.notEqual(f.tip.textContent,last);
  const done=f.app.completeGateEntry();await settle();f.finish();await done;assert.equal(f.intervals.size,0);
});

test('sign-in tips rotate under Donate, survive locale rerender, and resume after an admission retry',()=>{
  const f=transitionFixture();f.app.startGateTips('sign-in');
  const first=f.signInTip.textContent;assert.equal(f.intervals.size,1);
  f.advance(5000);assert.notEqual(f.signInTip.textContent,first);
  const index=f.app.gateSignInTips.current;
  f.app.language='zh-TW';f.context.window.matchMedia=()=>({matches:true});
  f.app.startGateTips('sign-in');assert.equal(f.intervals.size,1,'rerender must replace, not duplicate, the timer');
  assert.equal(f.app.gateSignInTips.current,index,'locale changes must retain the current place');
  assert.equal(f.signInTip.textContent,f.context.entryTips('zh-TW',true)[index]);
  const before=f.signInTip.textContent;f.app.beginGateEntry();assert.equal(f.intervals.size,1);
  f.app.cancelGateEntry();assert.equal(f.intervals.size,1,'retry restores the one visible sign-in timer');
  assert.equal(f.signInTip.textContent,before);f.advance(5000);assert.notEqual(f.signInTip.textContent,before);
  const loadingFirst=f.tip.textContent;f.app.beginGateEntry();assert.notEqual(f.tip.textContent,loadingFirst,'a new admission starts with a different tip');
  f.app.stopGateTips();assert.equal(f.intervals.size,0);
});

test('tip rounds change every position across visits and never repeat at the cycle boundary',()=>{
  const f=fixture(),history=new Map();
  const storage={getItem:key=>history.get(key)??null,setItem:(key,value)=>history.set(key,value)};
  for(const random of [()=>0,()=>.999,Math.random]){
    let previous;
    for(let visit=0;visit<30;visit++){
      const deck=new f.context.TipRotation(7,'round',storage,random),order=[];
      for(let i=0;i<7;i++){order.push(deck.current);deck.next();}
      assert.deepEqual([...order].sort(),[0,1,2,3,4,5,6]);
      if(previous)assert.ok(order.every((value,index)=>value!==previous[index]));
      assert.notEqual(deck.current,order[6],'new cycle repeats the last tip');
      // History keeps the opening round, even after rotating into later rounds.
      previous=JSON.parse(history.get('round'));
    }
  }
});

test('corrupt or blocked tip history cannot block the sign-in or loading tips',()=>{
  const f=fixture();
  for(const getItem of [()=>'{broken',()=>JSON.stringify([0,0,1,2,3,4,5]),()=>{throw Error('blocked');}]){
    const deck=new f.context.TipRotation(7,'round',{getItem,setItem(){throw Error('blocked');}},()=>0);
    const shown=[];for(let i=0;i<7;i++){shown.push(deck.current);deck.next();}
    assert.equal(new Set(shown).size,7);
  }
  const t=transitionFixture();t.app.startGateTips('sign-in');t.gate.querySelector=()=>undefined;
  t.advance(5000);assert.equal(t.intervals.size,0,'removed tip node must stop its timer');
});


test('a long visit does not replace the opening-order history used by the next visit',()=>{
  const f=fixture(),history=new Map();
  const storage={getItem:key=>history.get(key)??null,setItem:(key,value)=>history.set(key,value)};
  const first=new f.context.TipRotation(7,'long-visit',storage,()=>0);
  const opening=JSON.parse(history.get('long-visit'));
  for(let i=0;i<80;i++)first.next();
  assert.deepEqual(JSON.parse(history.get('long-visit')),opening);
  const next=new f.context.TipRotation(7,'long-visit',storage,()=>0),shown=[];
  for(let i=0;i<7;i++){shown.push(next.current);next.next();}
  assert.ok(shown.every((value,index)=>value!==opening[index]));
});
