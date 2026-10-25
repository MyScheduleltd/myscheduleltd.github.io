import { randomUUID } from 'node:crypto';
import { weatherAt, SNOW_BUILDUP_MS, SNOW_MELT_MS } from '../src/weather/WeatherModel.mjs';
export { weatherAt, SNOW_BUILDUP_MS, SNOW_MELT_MS } from '../src/weather/WeatherModel.mjs';

export const WEATHER_VERSION = 1;
export const WEATHER_SCHEDULE_LIMIT = 24;
export const WEATHER_HISTORY_LIMIT = 24;
export const MAX_WEATHER_DURATION_MS = 366 * 24 * 60 * 60_000;
export const WEATHER_HORIZON_MS = 366 * 24 * 60 * 60_000;
export const OUTDOOR_SNOW_SEATS = new Set([
  ...Array.from({ length: 2 }, (_, row) => Array.from({ length: 3 }, (_, column) => `DRIVE-${row + 1}-${column + 1}`)).flat(),
  ...Array.from({ length: 6 }, (_, index) => `DRIVE-${index + 1}-PASSENGER`),
  ...Array.from({ length: 3 }, (_, row) => Array.from({ length: 7 }, (_, column) => `SHORE-${row + 1}-${column + 1}`)).flat(),
  ...Array.from({ length: 3 }, (_, column) => `ROOFTOP-BENCH-${column + 1}`),
  ...Array.from({ length: 6 }, (_, column) => `BEACH-CHAIR-${column + 1}`),
  ...Array.from({ length: 4 }, (_, column) => `BEACH-MAT-${column + 1}`),
]);

export class WeatherError extends Error {
  constructor(message, status = 400) { super(message); this.name = 'WeatherError'; this.status = status; }
}

const validId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(id)
  && !['__proto__', 'prototype', 'constructor'].includes(id);
const validTime = value => Number.isSafeInteger(value) && value >= Date.UTC(2020, 0, 1) && value < Date.UTC(2100, 0, 1);
const expiresAt = entry => entry.endsAt + (entry.type === 'snow' ? SNOW_MELT_MS : 0);
const sameWindow = (a, b) => a.type === b.type && a.startsAt === b.startsAt && a.endsAt === b.endsAt;

/** Bounded shared weather configuration and at most one snow mark per seat.
 * No visitor identity is stored in public seat-clearing records.
 */
export class FestivalWeather {
  schedule = [];
  clearedSeats = new Map();
  updatedAt = 0;

  constructor({ now = Date.now, id = randomUUID, outdoorSeats = OUTDOOR_SNOW_SEATS } = {}) {
    this.now = now; this.id = id; this.outdoorSeats = new Set(outdoorSeats);
  }

  validateSchedule(rows, { restore = false } = {}) {
    const now = this.now();
    if (!Array.isArray(rows) || rows.length > WEATHER_SCHEDULE_LIMIT + WEATHER_HISTORY_LIMIT
      || rows.filter(row => row?.endsAt > now).length > WEATHER_SCHEDULE_LIMIT) {
      throw new WeatherError(`At most ${WEATHER_SCHEDULE_LIMIT} current or future weather periods are allowed.`);
    }
    const ids = new Set();
    const schedule = rows.map(row => {
      if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).some(key => !['id', 'type', 'startsAt', 'endsAt'].includes(key))) {
        throw new WeatherError('Each weather period needs only type, startsAt, endsAt and an optional id.');
      }
      if (!['rain', 'snow'].includes(row.type) || !validTime(row.startsAt) || !validTime(row.endsAt)
        || row.endsAt <= row.startsAt || row.endsAt - row.startsAt > MAX_WEATHER_DURATION_MS) {
        throw new WeatherError('Weather requires rain or snow and a valid start/end interval of at most one year.');
      }
      if (!restore && (row.startsAt < now - MAX_WEATHER_DURATION_MS || row.endsAt > now + WEATHER_HORIZON_MS)) {
        throw new WeatherError('Weather periods must be within the current scheduling horizon.');
      }
      if (row.id !== undefined && !validId(row.id)) throw new WeatherError('Invalid weather period id.');
      if (row.id && ids.has(row.id)) throw new WeatherError('Duplicate weather period id.');
      if (row.id) ids.add(row.id);
      const previous = this.schedule.find(entry => entry.id === row.id);
      // Editing a period creates a new occurrence; previous brush marks cannot
      // migrate onto different snowfall with a reused client-supplied id.
      const id = restore ? row.id : previous && sameWindow(previous, row) ? previous.id : this.id();
      if (!validId(id)) throw new WeatherError('Invalid weather occurrence id.');
      return { id, type: row.type, startsAt: row.startsAt, endsAt: row.endsAt };
    }).sort((a, b) => a.startsAt - b.startsAt);
    if (new Set(schedule.map(entry => entry.id)).size !== schedule.length) throw new WeatherError('Duplicate weather occurrence id.');
    const upcoming = schedule.filter(entry => entry.endsAt > now);
    for (let index = 1; index < upcoming.length; index++) {
      if (upcoming[index].startsAt < upcoming[index - 1].endsAt) {
        throw new WeatherError('Precipitation periods cannot overlap.');
      }
    }
    return schedule;
  }

  replace(rows) {
    const now = this.now();
    const requested = this.validateSchedule(rows).filter(entry => entry.endsAt > now);
    // Removal/change ends existing snowfall now, retaining its completed
    // accumulation as a bounded melt tail instead of instantly erasing snow.
    const previousSnow = this.schedule.filter(entry => entry.type === 'snow' && entry.startsAt < now && expiresAt(entry) > now);
    const retained = previousSnow.flatMap(entry => {
      if (requested.some(next => next.id === entry.id)) return [];
      return [{ ...entry, endsAt: Math.min(entry.endsAt, now) }];
    });
    const history = retained.sort((a, b) => b.endsAt - a.endsAt).slice(0, WEATHER_HISTORY_LIMIT);
    this.schedule = [...history, ...requested].sort((a, b) => a.startsAt - b.startsAt);
    this.updatedAt = Math.max(this.updatedAt + 1, now);
    this.prune();
    return this.snapshot();
  }

  prune() {
    const now = this.now();
    const before = this.schedule.length;
    this.schedule = this.schedule.filter(entry => expiresAt(entry) > now);
    const known = new Map(this.schedule.map(entry => [entry.id, entry]));
    let changed = this.schedule.length !== before;
    for (const [seatId, record] of this.clearedSeats) {
      const entry = known.get(record.occurrenceId);
      if (!entry || entry.type !== 'snow' || record.clearedAt < entry.startsAt || record.clearedAt > now || expiresAt(entry) <= now) {
        this.clearedSeats.delete(seatId); changed = true;
      }
    }
    if (changed) this.updatedAt = Math.max(this.updatedAt + 1, now);
    return changed;
  }

  /** Called after authentication/occupancy checks by the seat route. */
  clearSeat(seatId, occurrenceId) {
    this.prune();
    if (!this.outdoorSeats.has(seatId)) throw new WeatherError('That seat does not collect outdoor snow.', 404);
    const active = weatherAt(this.schedule, this.now());
    if (!active.occurrenceId || active.snowCoverage <= 0 || occurrenceId !== active.occurrenceId) {
      throw new WeatherError('That snowfall is no longer on this seat.', 409);
    }
    const existing = this.clearedSeats.get(seatId);
    if (existing?.occurrenceId === occurrenceId) return { cleared: false, record: { ...existing } };
    const record = { seatId, occurrenceId, clearedAt: this.now() };
    this.clearedSeats.set(seatId, record);
    this.updatedAt = Math.max(this.updatedAt + 1, this.now());
    return { cleared: true, record: { ...record } };
  }

  snapshot() {
    this.prune();
    return { version: WEATHER_VERSION, updatedAt: this.updatedAt,
      schedule: this.schedule.map(entry => ({ ...entry })),
      clearedSeats: [...this.clearedSeats.values()].map(record => ({ ...record })),
    };
  }

  /** Malformed weather must not prevent the unrelated festival state booting. */
  restore(saved) {
    if (!saved || typeof saved !== 'object' || saved.version !== WEATHER_VERSION) return false;
    let schedule;
    try { schedule = this.validateSchedule(saved.schedule, { restore: true }); }
    catch { return false; }
    this.schedule = schedule;
    this.clearedSeats.clear();
    this.updatedAt = Number.isSafeInteger(saved.updatedAt) && saved.updatedAt >= 0 ? Math.min(saved.updatedAt, this.now() + 60_000) : 0;
    const known = new Map(schedule.map(entry => [entry.id, entry]));
    for (const record of Array.isArray(saved.clearedSeats) ? saved.clearedSeats.slice(0, this.outdoorSeats.size) : []) {
      const entry = known.get(record?.occurrenceId);
      if (!this.outdoorSeats.has(record?.seatId) || !entry || entry.type !== 'snow' || !Number.isSafeInteger(record.clearedAt)
        || record.clearedAt < entry.startsAt || record.clearedAt > this.now() || expiresAt(entry) <= this.now()) continue;
      this.clearedSeats.set(record.seatId, { seatId: record.seatId, occurrenceId: entry.id, clearedAt: record.clearedAt });
    }
    this.prune();
    return true;
  }
}
