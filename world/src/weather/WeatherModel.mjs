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

/** A cleared surface collects fresh snow over the same ten-minute buildup.
 * Once precipitation ends, only the layer rebuilt before that time can melt.
 * Reuse the caller's authoritative sample and cached record for support caps.
 */
export function seatSnowCoverageFromSample(sample, schedule, record, now) {
  if (!record || record.occurrenceId !== sample.occurrenceId) return sample.snowCoverage;
  const period = schedule.find(entry => entry.id === record.occurrenceId && entry.type === 'snow');
  if (!period || !Number.isFinite(record.clearedAt)) return sample.snowCoverage;
  const rebuilt = clamp01((Math.min(now, period.endsAt) - Math.max(record.clearedAt, period.startsAt)) / SNOW_BUILDUP_MS);
  const melt = now < period.endsAt ? 1 : clamp01(1 - (now - period.endsAt) / SNOW_MELT_MS);
  return Math.min(sample.snowCoverage, rebuilt * melt);
}

export function seatSnowCoverage(weather, seatId, now) {
  return seatSnowCoverageFromSample(weatherAt(weather.schedule, now), weather.schedule,
    weather.clearedSeats.find(record => record.seatId === seatId), now);
}
