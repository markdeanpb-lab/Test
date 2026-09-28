// Race profiles: distance as a function of race time, from real Strava data
// (per-km splits, or distance/time streams), scaled to the official finish time.
import runs from '../../data/gps/runs.json';

export class RunProfile {
  readonly d: number[]; // metres
  readonly t: number[]; // seconds
  readonly distance: number;
  readonly finish: number;
  constructor(d: number[], t: number[], official?: number) {
    // enforce monotone and scale time so the last sample is the official finish
    const t0 = t[0];
    let tt = t.map((x) => x - t0);
    const end = tt[tt.length - 1];
    if (official && end > 0) tt = tt.map((x) => (x * official) / end);
    this.d = d.map((x) => x - d[0]);
    this.t = tt;
    for (let i = 1; i < this.d.length; i++) if (this.d[i] < this.d[i - 1]) this.d[i] = this.d[i - 1];
    this.distance = this.d[this.d.length - 1];
    this.finish = this.t[this.t.length - 1];
  }

  static fromSplits(splits: number[], distanceKm: number, official?: number) {
    const d = [0], t = [0];
    let acc = 0;
    splits.forEach((s, i) => {
      const km = Math.min(i + 1, distanceKm);
      const frac = km - i;
      acc += s * frac;
      d.push(km * 1000);
      t.push(acc);
    });
    if (distanceKm > splits.length) {
      const last = splits[splits.length - 1];
      acc += last * (distanceKm - splits.length);
      d.push(distanceKm * 1000);
      t.push(acc);
    }
    return new RunProfile(d, t, official);
  }

  /** full distance/time streams (e.g. finsbury-parkrun.json) */
  static fromStream(j: { dist: number[]; time: number[] }, official?: number) {
    return new RunProfile(j.dist, j.time, official);
  }

  /** a GPS json's ~1 km profile {d, t} */
  static fromGpsProfile(j: { profile: { d: number[]; t: number[] } }, official?: number) {
    return new RunProfile(j.profile.d, j.profile.t, official);
  }

  static fromRuns(key: keyof typeof runs) {
    const r = runs[key] as unknown as { d: number[]; t: number[]; official: string | number };
    return new RunProfile(r.d, r.t, Number(r.official));
  }

  /** distance (m) at race time T (clamped) */
  distAt(T: number) {
    const { t, d } = this;
    if (T <= 0) return 0;
    if (T >= this.finish) return this.distance;
    let lo = 0, hi = t.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (t[m] <= T) lo = m;
      else hi = m;
    }
    return d[lo] + ((d[hi] - d[lo]) * (T - t[lo])) / (t[hi] - t[lo] || 1);
  }
  /** race time at distance D */
  timeAt(D: number) {
    const { t, d } = this;
    if (D <= 0) return 0;
    if (D >= this.distance) return this.finish;
    let lo = 0, hi = d.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (d[m] <= D) lo = m;
      else hi = m;
    }
    return t[lo] + ((t[hi] - t[lo]) * (D - d[lo])) / (d[hi] - d[lo] || 1);
  }
  /** instantaneous speed (m/s) at race time T, smoothed over +-w seconds */
  speedAt(T: number, w = 4) {
    const a = Math.max(0, T - w), b = Math.min(this.finish, T + w);
    return b > a ? (this.distAt(b) - this.distAt(a)) / (b - a) : 0;
  }
  /** projected finish if the average pace so far holds for the rest */
  projection(T: number) {
    const d = this.distAt(T);
    return d > 50 ? (T / d) * this.distance : NaN;
  }
}
