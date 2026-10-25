export const SNOW_BUILDUP_MS = 10 * 60_000;
export const SNOW_MELT_MS = 15 * 60_000;

const clamp01 = value => Math.max(0, Math.min(1, value));
const snowAt = (entry, now) => now < entry.endsAt
  ? clamp01((now - entry.startsAt) / SNOW_BUILDUP_MS)
  : clamp01((entry.endsAt - entry.startsAt) / SNOW_BUILDUP_MS) * clamp01(1 - (now - entry.endsAt) / SNOW_MELT_MS);

/** Read only absolute server timestamps; entering/reloading never restarts snow.
 * Rain can begin while existing snow melts. The newest snowfall owns brushes,
 * while a previous melting layer prevents a sudden disappearance on change.
 */
export function weatherAt(schedule, now) {
  const active = schedule.find(entry => entry.startsAt <= now && now < entry.endsAt);
  const snow = schedule.filter(entry => entry.type === 'snow' && entry.startsAt <= now && now < entry.endsAt + SNOW_MELT_MS);
  const occurrence = active?.type === 'snow' ? active
    : snow.reduce((latest, entry) => !latest || entry.startsAt >= latest.startsAt ? entry : latest, null);
  return { type: active?.type ?? 'clear', occurrenceId: occurrence?.id ?? null,
    snowCoverage: snow.reduce((amount, entry) => Math.max(amount, snowAt(entry, now)), 0) };
}

/** A brush remains effective through the occurrence's snowfall and melt. */
export function seatSnowCoverage(weather, seatId, now) {
  const sample = weatherAt(weather.schedule, now);
  return weather.clearedSeats.some(record => record.seatId === seatId && record.occurrenceId === sample.occurrenceId)
    ? 0 : sample.snowCoverage;
}
