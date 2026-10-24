# Read-only persistence and database audit — 2026-10-24

Scope: active festival and its integrated M.O.T.H scoreboard source. No credentials, local `.env` files, Upstash tokens, private admin records, production Redis commands, test attendees, chat messages, donations, or data deletes were used. Public GET endpoints were queried; only aggregate counts are retained here. This is not an inspection of the private Redis keyspace or payment history.

## Public live observations

`https://myschedule-festival.onrender.com/health`: HTTP200, healthy, 7 current visitors, uptime831s; response37bytes and400ms in this one request. `/api/config`: HTTP200, build`45e5828`,23,321bytes,437ms in this request. These are individual samples, not a load-test or latency guarantee.

| Category | Live public count |
| --- | ---: |
| Wish notes | 1 |
| Jukebox catalogue | 10 |
| Jukebox request queue | 0 |
| NPC profiles | 12 |
| Custom videos | 5 |
| Unique playable videos across current schedules/customs/jukebox | 59 |
| Duration metadata | 56 |
| Tempo metadata | 13 |
| Video title overrides | 0 |
| Immersive-source metadata | 49 |

No duplicate jukebox video IDs, wish IDs or NPC IDs were found. No duration, tempo, title or immersive metadata keys refer to a video outside the current playable set. The committed `server/festival-seed.json` has matching aggregate catalogue/metadata counts. No live public orphan records are justified for deletion by this evidence. Catalogue references overlap by design; counting schedule IDs and custom-video IDs together duplicates references, not stored assets or video requests.

## Architecture and existing bounds

- `server/wish-store.mjs`: one Upstash Redis JSON value, `festival:wishes`; `createWishPersistence` loads before replacing, merges by note ID, serializes writes, retries failed load/save with bounded backoff. `server/index.mjs:1372` retains newest30 notes; each message60characters/name24characters. This is a few kilobytes, not an asset database. No private database configuration or actual keyspace was independently verified.
- `server/index.mjs:774`: festival settings, chat, donations and arcade preview grants are persisted to a JSON state file via serialized atomic temp-file replacement. `server/festival-seed.json` is redeploy boot configuration; it intentionally excludes attendee sessions, chat and private donor entitlements. A seed plus runtime state is not redundant storage to remove blindly.
- Runtime attendees normally capped20; disconnected sessions expire after120s unless an active payment holds the session. Seats and streams release on attendee removal. No permanent attendee table is used by this source.
- Chat accepts at most5messages per attendee per10s, and a new message trims the running array to50. Staff history response also returns50.
- Jukebox catalogue max120, requested queue max60; queue is deliberately not persisted. DJ venue queues max12. Embed-check cache max200 with60s freshness.
- Completed donation history retains newest50 completed records; unpaid pending/awaiting payments expire after10days. Paid records awaiting invoice completion are protected, because deleting them can prevent legitimate invoicing. No current private donation counts were inspected.
- Arcade challenge/rate maps have60s expiry/caps2048. Preview grants expire at public release, 2026-11-02 00:00 Taiwan; restore has20,000grant cap, code unlock-list cap50. These are current entitlements, not redundant data today.
- `services/moth-scoreboard/moth-scoreboard.js`: separate Vercel/Upstash path. Board sorted sets retain top10 per difficulty. Start rate keys expire1hour, score rate keys10minutes, unused run tickets60days and replay-prevention keys90days. Those TTL keys serve current anti-replay/resume behavior and are not demonstrated orphans. No live scoreboard or keyspace query was made.

## Bounded follow-ups, no runtime changes in this audit

1. Restore inconsistency: `server/index.mjs:943` reads up to500 old messages, while running history/staff history cap50. On a legacy overlong state file, public attendee state may temporarily include more history until a new message trims it. Normalize after validation/deduplication using the same cap if a future server patch is approved; test restore/restart plus normal new-chat behavior. This source does not prove live state is overlong.
2. Removed-video metadata has no explicit prune in the admin removal route, so accumulated historical IDs could eventually grow settings/public config. The current live aggregate has zero such metadata orphans; do not delete valid metadata speculatively. If needed, use an explicit complete reference set including schedules, special videos, custom videos, jukebox, pamphlet and any retained staff content before proposing removal.
3. Private record/keyspace cleanup remains unperformed. Owner clarification is to preserve real records and remove only confirmed test/orphan records. No such private records have been demonstrated; no deletion is justified yet. Preserve backups.
4. A JSON-state disk on a diskless host is not the same as durable Redis storage; deployment/persistence configuration must be independently inspected through an authorized dashboard before certifying restart safety. Do not infer it from a successful public GET.

No evidence here identifies database bloat as the cause of rendering lag or first-film crashes. Removing these small legitimate records would not materially reduce GPU texture memory, shader compilation, model loading, or external video decoder workload. Sign-in loading and live scene/media lifecycle require separate browser/runtime measurement.
