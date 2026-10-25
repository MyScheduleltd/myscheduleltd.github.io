export const SNOW_BUILDUP_MS: number;
export const SNOW_MELT_MS: number;
export interface WeatherPeriod { id: string; type: 'rain' | 'snow'; startsAt: number; endsAt: number }
export interface ClearedSnowSeat { seatId: string; occurrenceId: string; clearedAt: number }
export interface SharedWeather { version: 1; updatedAt: number; schedule: WeatherPeriod[]; clearedSeats: ClearedSnowSeat[] }
export interface WeatherSample { type: 'clear' | 'rain' | 'snow'; occurrenceId: string | null; snowCoverage: number }
export function weatherAt(schedule: readonly WeatherPeriod[], now: number): WeatherSample;
export function seatSnowCoverage(weather: Pick<SharedWeather, 'schedule' | 'clearedSeats'>, seatId: string, now: number): number;
