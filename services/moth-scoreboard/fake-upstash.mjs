// An in-memory stand-in for Upstash's Redis REST API: only the commands the
// scoreboard function uses. For tests (moth-scoreboard.test.mjs,
// scripts/verify-moth-scoreboard.mjs).
import assert from 'node:assert/strict';
import http from 'node:http';

export function fakeUpstash() {
  const data = new Map();
  const zset = key => { if (!data.has(key)) data.set(key, new Map()); return data.get(key); };
  const sorted = key => [...zset(key)].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
  const run = ([cmd, ...a]) => {
    switch (cmd.toUpperCase()) {
      case 'ZREVRANGE': return sorted(a[0]).reverse().slice(+a[1], +a[2] + 1).map(([m]) => m);
      case 'ZRANGE': { const r = sorted(a[0]).slice(+a[1], +a[2] + 1); return a[3] === 'WITHSCORES' ? r.flatMap(([m, s]) => [m, String(s)]) : r.map(([m]) => m); }
      case 'ZCARD': return zset(a[0]).size;
      case 'ZADD': zset(a[0]).set(a[2], +a[1]); return 1;
      case 'ZREMRANGEBYRANK': { const r = sorted(a[0]); const stop = +a[2] < 0 ? r.length + +a[2] : +a[2]; const gone = stop < +a[1] ? [] : r.slice(+a[1], stop + 1); /* Redis: an empty range removes nothing */ gone.forEach(([m]) => zset(a[0]).delete(m)); return gone.length; }
      case 'SET': { if (a.includes('NX') && data.has(a[0])) return null; data.set(a[0], a[1]); return 'OK'; }
      case 'INCR': { const v = Number(data.get(a[0]) || 0) + 1; data.set(a[0], String(v)); return v; }
      case 'GET': return data.has(a[0]) ? data.get(a[0]) : null;
      case 'EXISTS': return a.filter(key => data.has(key)).length;
      case 'DEL': return a.filter(key => data.delete(key)).length;
      default: throw new Error('unsupported ' + cmd);
    }
  };
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', c => { body += c; });
    req.on('end', () => {
      assert.equal(req.headers.authorization, 'Bearer test-token');
      const parsed = JSON.parse(body);
      const result = req.url === '/pipeline' ? parsed.map(c => ({result: run(c)})) : {result: run(parsed)};
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(result));
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({server, data, url: `http://127.0.0.1:${server.address().port}`})));
}
