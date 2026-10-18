// Frame cost at fixed spots on the island, in headless Chrome (2026-10-18).
// Needs the local client and a disposable service (see CLAUDE_HANDOFF.md):
//   node tools/frame-cost-probe.mjs "http://127.0.0.1:4183/?era=ps2&island&review=perf&cycleMinute=12" LABEL
// Env: MODE=normal|lite (一般/精簡), PHONE=1 (390x844 @3x, touch, iPhone UA),
//   CPU=4 (throttle after admission, phone-like), PIN=1 (hold the adaptive
//   render scale at 1 so runs compare like for like), OUT=dir (json, png),
//   LOCS=gate,square,shore,club,rooftop, SETTLE=ms, SAMPLE=ms, NOSHOT=1.
// Per spot: fps and frame-gap percentiles, GPU ms per frame (timer query),
// main-thread task/script ms per frame, main-pass draws (__festivalPerf) and
// shadow-pass draws (three.js resets its draw counter after the shadow pass,
// so __festivalPerf's drawCalls never included them). Screenshots hang under
// CPU throttling in headless Chrome: phone runs want NOSHOT=1.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const [url, label = 'run'] = process.argv.slice(2);
const phone = !!process.env.PHONE;
const W = phone ? 390 : 1440, H = phone ? 844 : 900, DPR = phone ? 3 : 1;
const out = process.env.OUT ?? '.'; mkdirSync(out, { recursive: true });
const dir = mkdtempSync(join(tmpdir(), 'frame-cost-'));
const port = 9700 + Math.floor(Math.random() * 100);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, `--window-size=${W},${H}`, '--use-angle=metal', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let target; for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const waiting = new Map(); const errs = [];
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 300)); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.exception?.description?.slice(0, 400) }; return r.result?.result?.value; };
await send('Runtime.enable'); await send('Page.enable'); await send('Performance.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: phone });
if (phone) {
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', platform: 'iPhone' });
}
await send('Page.navigate', { url });
for (let i = 0; i < 60; i++) { await sleep(500); if (await ev('!!document.querySelector("input[name=festivalId]")')) break; }
await sleep(1500);
const mode = process.env.MODE ?? 'normal';
console.log('GATE', await ev(`(()=>{const i=document.querySelector('input[name=festivalId]');if(!i)return 'no input';const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'PerfTest'+Math.floor(Math.random()*900+100));i.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-graphics=${mode}]')?.click();const b=[...document.querySelectorAll('button')].find(b=>/靜音進入|ENTER MUTED/.test(b.textContent));if(!b)return 'no button';b.click();return 'entered, coarse pointer '+matchMedia('(pointer: coarse) and (hover: none)').matches;})()`));
for (let i = 0; i < 120; i++) { await sleep(500); if (await ev('typeof window.__festivalPerf === "function" && !!window.__festivalPerf() && !!window.__islandWorld')) break; }
// Throttled only once inside, so admission does not time out.
if (process.env.CPU) await send('Emulation.setCPUThrottlingRate', { rate: +process.env.CPU });
await sleep(+(process.env.WARM ?? 6000));
if (process.env.PIN) console.log('PIN', await ev(`(()=>{const w=window.__islandWorld;w.tuneRenderScale=()=>{};w.adaptiveRenderScale=1;w.applyRenderPixelRatios();return w.renderer.getPixelRatio()})()`));
// Wraps the world's frame in a GPU timer query and counts shadow-pass draws.
// Re-installed per spot: the world re-arms its own loop after admission.
const HOOK = `(()=>{const w=window.__islandWorld,R=w.renderer,gl=R.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');window.__fc={gpu:[],q:[],shadow:0,frames:0};const sm=R.shadowMap;sm.__probeRender??=sm.render;sm.render=function(){const c=R.info.render.calls;sm.__probeRender.apply(sm,arguments);window.__fc.shadow+=R.info.render.calls-c;};const frame=w.render;R.setAnimationLoop((t,f)=>{const g=window.__fc;let q=null;if(ext&&g.q.length<8){q=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,q);}frame(t,f);g.frames++;if(q){gl.endQuery(ext.TIME_ELAPSED_EXT);g.q.push(q);}while(g.q.length){const h=g.q[0];if(!gl.getQueryParameter(h,gl.QUERY_RESULT_AVAILABLE))break;if(!gl.getParameter(ext.GPU_DISJOINT_EXT))g.gpu.push(gl.getQueryParameter(h,gl.QUERY_RESULT)/1e6);gl.deleteQuery(h);g.q.shift();}});return !!ext})()`;
const metric = async () => Object.fromEntries((await send('Performance.getMetrics')).result.metrics.map(m => [m.name, m.value]));
// Fixed spots and orbits, so runs before and after a change share a camera.
const LOCS = {
  gate: `w.fastTravel('gate'); w.player.rotation.y=0; o(0,.25)`,
  square: `w.fastTravel('square'); w.player.rotation.y=Math.PI; o(Math.PI,.22)`,
  shore: `w.fastTravel('shore'); w.player.rotation.y=Math.PI; o(Math.PI,.2)`,
  club: `w.focusClubForReview(false); o(Math.PI,.2)`,
  rooftop: `w.fastTravel('rooftop'); o(Math.PI,.22)`,
};
const results = {};
for (const loc of (process.env.LOCS ?? 'gate,square,shore,club,rooftop').split(',')) {
  console.log('LOC', loc, JSON.stringify(await ev(`(()=>{const w=window.__islandWorld;const o=(y,p)=>{w.cameraMode='follow';w.cameraOrbit.follow.yaw=y;w.cameraOrbit.follow.pitch=p;};${LOCS[loc]};return w.locationName();})()`)));
  await sleep(+(process.env.SETTLE ?? 3500));
  await ev(HOOK); await sleep(300); await ev('window.__fc.gpu=[];window.__fc.shadow=0;window.__fc.frames=0');
  await ev(`window.__ft=[];window.__ftOn=true;(function f(t){if(!window.__ftOn)return;window.__ft.push(t);requestAnimationFrame(f)})(performance.now())`);
  const m0 = await metric();
  await sleep(+(process.env.SAMPLE ?? 5000));
  const m1 = await metric();
  const ft = await ev('(()=>{window.__ftOn=false;const a=window.__ft,d=[];for(let i=1;i<a.length;i++)d.push(a[i]-a[i-1]);d.sort((x,y)=>x-y);const q=p=>+d[Math.floor(p*(d.length-1))].toFixed(1);return {frames:d.length,fps:+(1000*d.length/(a[a.length-1]-a[0])).toFixed(1),p50:q(.5),p90:q(.9),p99:q(.99),max:q(1)}})()');
  const gpu = await ev('(()=>{const g=window.__fc,d=g.gpu.slice().sort((a,b)=>a-b),q=p=>d.length?+d[Math.floor(p*(d.length-1))].toFixed(2):null;return {gpu50:q(.5),gpu90:q(.9),shadowDraws:g.frames?Math.round(g.shadow/g.frames):null}})()');
  const p = await ev(`(()=>{const p=window.__festivalPerf();return {draws:p.drawCalls,tris:p.triangles,programs:p.programs,lampsLit:p.lampsLit,shadowCastersSkipped:p.shadowCastersSkipped,visitors:p.crowd.visitors,mode:p.mode,phases:Object.fromEntries(Object.entries(p.crowd.phases).map(([k,v])=>[k,+v.toFixed(2)]))}})()`);
  const frames = ft.frames || 1;
  results[loc] = { ...ft, ...gpu, taskMsPerFrame: +((m1.TaskDuration - m0.TaskDuration) * 1000 / frames).toFixed(2), scriptMsPerFrame: +((m1.ScriptDuration - m0.ScriptDuration) * 1000 / frames).toFixed(2), ...p };
  console.log('RESULT', loc, JSON.stringify(results[loc]));
  if (!process.env.NOSHOT) {
    const r = await Promise.race([send('Page.captureScreenshot', { format: 'png' }), sleep(20000).then(() => null)]);
    if (r?.result?.data) writeFileSync(`${out}/${label}-${loc}.png`, Buffer.from(r.result.data, 'base64'));
  }
}
writeFileSync(`${out}/${label}.json`, JSON.stringify(results, null, 1));
if (errs.length) console.log('ERRORS', errs.slice(0, 5).join('\n'));
ws.close(); chrome.kill(); await sleep(300); rmSync(dir, { recursive: true, force: true }); process.exit(0);
