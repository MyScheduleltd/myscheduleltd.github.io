// The suites' stand-in for the scoreboard API, which refuses local pages:
// STORY MODE's ticket request and any board read get a quiet answer, so a
// suite's console stays clean. verify-moth-scoreboard.mjs runs the real API.
import {SCOREBOARD_API} from './moth-scoreboard-client.mjs';

export function stubScoreboard(target) {
  return target.route(SCOREBOARD_API + '*', route => {
    const request = route.request();
    const headers = {'access-control-allow-origin': '*', 'access-control-allow-headers': 'Content-Type', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'content-type': 'application/json'};
    if (request.method() === 'OPTIONS') return route.fulfill({status: 204, headers});
    if (request.method() === 'POST') return route.fulfill({status: 201, headers, body: JSON.stringify({run: crypto.randomUUID()})});
    return route.fulfill({status: 200, headers, body: JSON.stringify({mode: new URL(request.url()).searchParams.get('mode'), entries: []})});
  });
}
