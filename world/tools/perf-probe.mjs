// Frame-time and CPU profile of the real world in headless Chrome (2026-10-01).
// Needs `npm run dev` running (client 5173 + local service 8787; test visitors
// join only the local service). Enters the gate as PerfTestNNN.
//   node tools/perf-probe.mjs "http://127.0.0.1:5173/?era=ps2&review=perf&island" [W H]
// Env: DPR=2|3, LITE=1 (精簡), CPU=4 (throttle, phone-like), SETTLE=ms,
//   BEFORE='js expr' (e.g. window.__festivalAerial([x,y,z],[x,y,z])),
//   SHOT=out.png, PROFILE_OUT=prof.json, TOP=n. The PS2 preview is the ISLAND
//   with the planet curve: measure with &island, the flat map is not it.
// node perf.mjs URL [W H] — frame times, world counters, top JS self-time.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
const [url, W = 1440, H = 900] = process.argv.slice(2);
const dir = mkdtempSync('/tmp/claude-501/perf-');
const port = 9800 + Math.floor(Math.random() * 100);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, `--window-size=${W},${H}`, '--use-angle=metal', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let target; for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const waiting = new Map(); const errs = [];
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 300)); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: +(process.env.DPR ?? 1), mobile: false });
if (process.env.CPU) await send('Emulation.setCPUThrottlingRate', { rate: +process.env.CPU });
await send('Page.navigate', { url });
for (let i = 0; i < 40; i++) { await sleep(500); if (await ev('!!document.querySelector("input[name=festivalId], .gate input[type=text], input[autocomplete=nickname]")')) break; }
await sleep(1500);
console.log('GATE', await ev(`(()=>{const i=document.querySelector('input[name=festivalId]')||document.querySelector('.gate input[type=text]')||document.querySelector('input[type=text]');if(!i)return 'no input';const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'PerfTest'+Math.floor(Math.random()*900+100));i.dispatchEvent(new Event('input',{bubbles:true}));${process.env.LITE ? "[...document.querySelectorAll('button')].find(b=>/精簡|LITE/.test(b.textContent))?.click();" : ''}const b=[...document.querySelectorAll('button')].find(b=>/靜音進入|ENTER MUTED/.test(b.textContent));if(!b)return 'no button';b.click();return 'entered';})()`));
for (let i = 0; i < 90; i++) { await sleep(500); if (await ev('typeof window.__festivalPerf === "function" && !!window.__festivalPerf()')) break; }
await sleep(+(process.env.SETTLE ?? 6000));
if (process.env.BEFORE) console.log('BEFORE', String(JSON.stringify(await ev(process.env.BEFORE))).slice(0, 20000));
await ev(`window.__ft=[];(function f(t){window.__ft.push(t);if(window.__ft.length<100000)requestAnimationFrame(f)})(performance.now())`);
await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 200 }); await send('Profiler.start');
await sleep(8000);
const prof = (await send('Profiler.stop')).result.profile;
const ft = await ev('(()=>{const a=window.__ft;const d=[];for(let i=1;i<a.length;i++)d.push(a[i]-a[i-1]);d.sort((x,y)=>x-y);const q=p=>+d[Math.floor(p*(d.length-1))].toFixed(1);return {frames:d.length,fps:+(1000*d.length/(a[a.length-1]-a[0])).toFixed(1),p50:q(.5),p90:q(.9),p99:q(.99),max:q(1)}})()');
console.log('FRAMES', JSON.stringify(ft));
console.log('PERF', JSON.stringify(await ev('window.__festivalPerf()')));
// self time per function
const self = new Map(); const byId = new Map(prof.nodes.map(n => [n.id, n]));
const dt = prof.timeDeltas; const counts = new Map();
prof.samples.forEach((sid, i) => counts.set(sid, (counts.get(sid) ?? 0) + (dt[i] ?? 0)));
let total = 0;
for (const [sid, us] of counts) { const n = byId.get(sid); const cf = n.callFrame; const k = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop().split('?')[0]}:${cf.lineNumber + 1}`; self.set(k, (self.get(k) ?? 0) + us); total += us; }
const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, +(process.env.TOP ?? 30));
console.log('TOTAL_MS', (total / 1000).toFixed(0));
for (const [k, us] of top) console.log(((us / total) * 100).toFixed(1).padStart(5) + '%', (us / 1000).toFixed(0).padStart(6) + 'ms', k);
if (process.env.SHOT) { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(process.env.SHOT, Buffer.from(r.result.data, 'base64')); }
if (process.env.PROFILE_OUT) writeFileSync(process.env.PROFILE_OUT, JSON.stringify(prof));
if (errs.length) console.log('ERRORS', errs.slice(0, 5).join('\n'));
ws.close(); chrome.kill(); await sleep(300); rmSync(dir, { recursive: true, force: true }); process.exit(0);
