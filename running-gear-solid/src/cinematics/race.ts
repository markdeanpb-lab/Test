import { clockAt, paceAt, type BossEncounter } from '../data/activities';
import { clamp, interp } from '../core/util';

/** Race state at a given GPS kilometre, straight from the activity's laps. */
export function raceAt(e: BossEncounter, km: number) {
  const k = clamp(km, 0, e.distanceKm);
  const clock = clockAt(e.splits, k);
  const pace = paceAt(e.splits, k);
  const hrs = e.splitHr ?? [];
  const hr = hrs.length ? interp(hrs.map((_, i) => i + 0.5), hrs, k) : e.hrAvg ?? 0;
  return { km: k, clock, pace, hr, remaining: 1 - k / e.distanceKm };
}

/** Piecewise-linear mapping from sequence time to race km. keys: [t, km][] */
export const kmTimeline = (keys: [number, number][]) => (t: number) =>
  interp(
    keys.map((k) => k[0]),
    keys.map((k) => k[1]),
    t,
  );

/** A crude but monotonic "life" model: drains with distance and heart strain. */
export function lifeAt(e: BossEncounter, km: number, extraDrain = 0) {
  const s = raceAt(e, km);
  const frac = s.km / e.distanceKm;
  const strain = clamp(((e.hrMax ?? 190) - s.hr) / 40);
  return clamp(1 - frac * (0.55 + extraDrain) - (1 - strain) * 0.12 * frac);
}
