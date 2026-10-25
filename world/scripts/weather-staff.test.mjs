import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundled = await build({ entryPoints: ['src/ui/WeatherStaff.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { taipeiInput, taipeiTimestamp, weatherStaffContent, bindWeatherStaff } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const tick = () => new Promise(resolve => setImmediate(resolve));
const state = schedule => ({ version: 1, updatedAt: 0, schedule, clearedSeats: [] });
const period = (start, end, id = 'rain-1', type = 'rain') => ({ id, type, startsAt: taipeiTimestamp(start), endsAt: taipeiTimestamp(end) });

// This fixture calls the real delegated handlers. It models only DOM operations
// those handlers use, so duplicate submission and errors can be exercised in Node.
class Element {
  listeners = new Map(); dataset = {}; textContent = ''; disabled = false;
  addEventListener(type, handler) { const handlers = this.listeners.get(type) ?? []; handlers.push(handler); this.listeners.set(type, handlers); }
  fire(type, target = this) { const event = { target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }; for (const handler of this.listeners.get(type) ?? []) handler(event); return event; }
}
const makeRow = (start, end, id, type = 'rain') => {
  const row = new Element(), select = { value: type, focused: false, focus() { this.focused = true; } };
  row.dataset.periodId = id;
  row.inputs = { select, '[name="weatherStart"]': { value: start }, '[name="weatherEnd"]': { value: end } };
  row.querySelector = key => row.inputs[key] ?? null;
  row.closest = key => key === '[data-weather-row]' ? row : null;
  return row;
};
function fixture(rows, save, zh = false) {
  const root = new Element(), form = new Element(), list = new Element(), add = new Element(), submit = new Element(), error = new Element();
  list.children = rows;
  for (const row of rows) row.remove = () => { list.children = list.children.filter(child => child !== row); };
  list.querySelectorAll = () => list.children;
  Object.defineProperty(list, 'lastElementChild', { get: () => list.children.at(-1) });
  list.insertAdjacentHTML = (_where, html) => { const start = /name="weatherStart"[^>]*value="([^"]*)"/.exec(html)[1], end = /name="weatherEnd"[^>]*value="([^"]*)"/.exec(html)[1]; list.children.push(makeRow(start, end)); };
  form.querySelector = key => ({ '.weather-periods': list, '[data-weather-add]': add, '[type="submit"]': submit, '[data-weather-error]': error }[key] ?? null);
  root.querySelector = key => key === '#staff-weather-form' ? form : null;
  bindWeatherStaff(root, zh, save);
  return { root, form, list, add, submit, error };
}

test('staff dates always convert through UTC+8, including the release midnight and year boundary', () => {
  assert.equal(taipeiInput(Date.UTC(2026, 10, 1, 16)), '2026-11-02T00:00');
  assert.equal(taipeiTimestamp('2026-11-02T00:00'), Date.UTC(2026, 10, 1, 16));
  assert.equal(taipeiInput(Date.UTC(2026, 11, 31, 16, 30)), '2027-01-01T00:30');
  assert.equal(taipeiTimestamp('2027-01-01T00:30'), Date.UTC(2026, 11, 31, 16, 30));
  assert.equal(taipeiTimestamp('2024-02-29T23:59'), Date.UTC(2024, 1, 29, 15, 59));
  assert.equal(taipeiInput(NaN), ''); assert.equal(taipeiInput(Infinity), '');
});

test('impossible calendar values never silently move the saved schedule to a different day', () => {
  for (const value of ['2026-02-29T12:00', '2026-02-30T12:00', '2026-04-31T12:00', '2026-00-10T12:00', '2026-13-10T12:00', '2026-10-00T12:00', '2026-10-24T24:00', '2026-10-24T12:60', '0000-01-01T00:00', '2026-1-01T00:00', '2026-10-24T12:00:00', '2026-10-24T12:00Z', '<script>']) assert.ok(Number.isNaN(taipeiTimestamp(value)), value);
});

test('only current/future schedule is editable and a saved id cannot inject DOM attributes', () => {
  const attack = 'x" onfocus="alert(1)\'><img src=x onerror=alert(2)>&';
  const weather = state([period('2026-10-23T12:00', '2026-10-23T13:00', 'past'), period('2026-10-24T12:00', '2026-10-24T14:00', attack, 'snow')]);
  const content = weatherStaffContent(weather, false, taipeiTimestamp('2026-10-24T13:00'));
  assert.ok(!content.includes('data-period-id="past"'));
  assert.ok(!content.includes('data-period-id="x" onfocus=')); assert.ok(!content.includes('<img'));
  assert.ok(content.includes('data-period-id="x&quot; onfocus=&quot;alert(1)&#39;&gt;&lt;img src=x onerror=alert(2)&gt;&amp;"'));
  assert.match(content, /UTC\+8/); assert.match(content, /value="snow" selected/);
  assert.match(weatherStaffContent(undefined, true), /尚未啟用/);
  assert.ok(!weatherStaffContent(undefined, false).includes('<form'));
});

test('invalid dates, backwards windows and overlaps stay local; adjacent windows save exact UTC instants', async () => {
  const saved = [], row = makeRow('2026-02-30T12:00', '2026-03-01T12:00', 'a');
  const f = fixture([row], async periods => { saved.push(periods); });
  assert.equal(f.form.fire('submit').defaultPrevented, true); await tick();
  assert.equal(saved.length, 0); assert.match(f.error.textContent, /Check each/);
  row.inputs['[name="weatherStart"]'].value = '2026-10-24T14:00'; row.inputs['[name="weatherEnd"]'].value = '2026-10-24T13:00';
  f.form.fire('submit'); await tick(); assert.equal(saved.length, 0);
  row.inputs['[name="weatherStart"]'].value = '2026-10-24T12:00'; row.inputs['[name="weatherEnd"]'].value = '2026-10-24T14:00';
  const second = makeRow('2026-10-24T13:59', '2026-10-24T15:00', 'b', 'snow'); f.list.children.push(second);
  f.form.fire('submit'); await tick(); assert.match(f.error.textContent, /cannot overlap/); assert.equal(saved.length, 0);
  second.inputs['[name="weatherStart"]'].value = '2026-10-24T14:00';
  f.form.fire('submit'); await tick(); assert.equal(saved.length, 1); assert.equal(f.error.textContent, '');
  assert.deepEqual(saved[0], [period('2026-10-24T12:00', '2026-10-24T14:00', 'a'), period('2026-10-24T14:00', '2026-10-24T15:00', 'b', 'snow')]);
  assert.equal(f.submit.disabled, false);
});

test('a pending save suppresses repeated submit and both asynchronous and synchronous failures allow retry', async () => {
  let calls = 0, rejectSave;
  const errorText = '<img src=x onerror=alert(1)>';
  const f = fixture([makeRow('2026-10-24T12:00', '2026-10-24T13:00', 'a')], () => {
    calls++; if (calls === 1) return new Promise((_resolve, reject) => { rejectSave = reject; });
    if (calls === 2) throw new Error('sync failure'); return Promise.resolve();
  });
  f.form.fire('submit'); f.form.fire('submit'); await tick();
  assert.equal(calls, 1); assert.equal(f.submit.disabled, true);
  rejectSave(new Error(errorText)); await tick(); assert.equal(f.error.textContent, errorText); assert.equal(f.submit.disabled, false);
  assert.equal(f.error.innerHTML, undefined, 'server error is placed in textContent, never interpreted as markup');
  f.form.fire('submit'); await tick(); assert.equal(calls, 2); assert.equal(f.error.textContent, 'sync failure'); assert.equal(f.submit.disabled, false);
  f.form.fire('submit'); await tick(); assert.equal(calls, 3); assert.equal(f.error.textContent, ''); assert.equal(f.submit.disabled, false);
});

test('staff rows are bounded to 24 and delegated remove supports a nested icon target', () => {
  const rows = Array.from({ length: 23 }, (_, i) => makeRow('2026-10-24T12:00', '2026-10-24T13:00', String(i)));
  const f = fixture(rows, async () => {});
  f.add.fire('click'); assert.equal(f.list.children.length, 24); assert.equal(f.list.lastElementChild.inputs.select.focused, true);
  f.add.fire('click'); assert.equal(f.list.children.length, 24);
  const selected = f.list.children[0], button = { closest: key => key === '[data-weather-row]' ? selected : null };
  f.list.fire('click', { closest: key => key === '[data-weather-remove]' ? button : null });
  assert.equal(f.list.children.length, 23);
  bindWeatherStaff({ querySelector: () => null }, false, async () => { throw new Error('unreachable'); });
});
