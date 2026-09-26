// Automatic broadcast direction. Scores developing action, anticipates battles, respects minimum dwell
// times and switching thresholds, and yields immediately to the player's own camera choice.
import type { RaceState, FeedItem } from '../sim/race/engine';
import type { WeekendSetup } from '../sim/race/setup';
import type { Universe } from '../sim/types';
import { relBetween } from '../sim/world/relationships';

export interface Shot { mode: 'overview' | 'follow' | 'battle'; cars: number[]; why: string; score: number; since: number }

export class Director {
  auto = true;
  shot: Shot = { mode: 'overview', cars: [], why: 'Overview of the circuit', score: 0, since: 0 };
  private incident: { car: number; t: number; why: string; sig: number } | null = null;
  private lastEval = 0;
  minDwell = 9; // real seconds

  constructor(private u: Universe, private setup: WeekendSetup) {}

  /** The viewer's saved favourites get more airtime (drivers, or any car of a followed team). */
  private fav(k: number, st: RaceState): boolean {
    const e = this.setup.entrants[st.cars[k]?.i]; if (!e) return false;
    return this.u.favourites.people.includes(e.driverId) || this.u.favourites.teams.includes(e.teamId);
  }

  onFeed(items: FeedItem[], st: RaceState) {
    for (const f of items) {
      if (f.a === undefined) continue;
      const important = ['lead', 'contact', 'spin', 'retire', 'puncture', 'overtake', 'pit', 'qfastest'].includes(f.kind);
      if (!important) continue;
      const pos = st.cars[f.a]?.pos ?? 99;
      let sig = f.sig + (pos <= 3 ? 0.2 : 0) + (this.fav(f.a, st) ? 0.3 : 0);
      if (f.kind === 'pit' && pos > 3) sig -= 0.3;
      if (!this.incident || sig > this.incident.sig || performance.now() / 1000 - this.incident.t > 8) this.incident = { car: f.a, t: performance.now() / 1000, why: describe(f, this.setup, st), sig };
    }
  }

  update(st: RaceState, now: number): Shot {
    if (!this.auto) return this.shot;
    if (now - this.lastEval < 0.8) return this.shot;
    this.lastEval = now;
    const cands: Shot[] = [];
    if (st.kind === 'quali') {
      // follow whoever is on a flying lap and closest to the top of the times
      const flying = st.cars.map((c, k) => ({ c, k })).filter(({ c, k }) => c.mode === 'run' && c.lap >= 0 && (st.q?.flying[k] ?? 0) > 0);
      if (flying.length) {
        const best = flying.sort((a, b) => (this.setup.entrants[a.c.i].d.pace - this.setup.entrants[b.c.i].d.pace) * -1)[0];
        cands.push({ mode: 'follow', cars: [best.k], why: `${this.setup.entrants[best.c.i].name} on a flying lap`, score: 0.5, since: now });
      }
    } else {
      const ord = st.order.filter((k) => !st.cars[k].ret && st.cars[k].mode !== 'out' && st.cars[k].mode !== 'fin');
      // battles, weighted by position, closing speed, attacks, rivalries and title stakes
      for (let i = 1; i < ord.length; i++) {
        const A = st.cars[ord[i]], B = st.cars[ord[i - 1]];
        if (A.gapAhead > 1.6 || A.mode === 'pit' || B.mode === 'pit') continue;
        const ea = this.setup.entrants[A.i], eb = this.setup.entrants[B.i];
        let sc = 0.3 + Math.max(0, 1.6 - A.gapAhead) * 0.2 + (i <= 3 ? 0.45 : i <= 6 ? 0.2 : i <= 10 ? 0 : -0.2) + (A.atk >= 0 ? 0.25 : 0) + Math.max(0, A.v - B.v) * 0.02;
        const riv = relBetween(this.u, ea.driverId, eb.driverId, 'rivalry'); if (riv) sc += riv.intensity * 0.3;
        if (ea.contender && eb.contender) sc += 0.3;
        if (ea.teamId === eb.teamId) sc += 0.1;
        if (this.fav(ord[i], st) || this.fav(ord[i - 1], st)) sc += 0.35;
        const pos = i + 1;
        cands.push({ mode: 'battle', cars: [ord[i], ord[i - 1]], why: `Battle for P${i}: ${ea.name} chasing ${eb.name}${A.atk >= 0 ? ' — attacking now' : ''}`, score: sc, since: now });
        void pos;
      }
      const favK = ord.find((k) => this.fav(k, st));
      if (favK !== undefined) cands.push({ mode: 'follow', cars: [favK], why: `Following your favourite, ${this.setup.entrants[st.cars[favK].i].name} (P${ord.indexOf(favK) + 1})`, score: 0.55, since: now });
      const opening = st.phase === 'run' && (st.cars[ord[0]]?.lap ?? 0) < 1;
      if (ord.length) cands.push({ mode: opening ? 'battle' : 'follow', cars: opening ? ord.slice(0, 3) : [ord[0]], why: opening ? 'The opening lap: the leading group' : `Following the leader, ${this.setup.entrants[st.cars[ord[0]].i].name}`, score: opening ? 1.2 : 0.3, since: now });
      if (this.incident && now - this.incident.t < 6) cands.push({ mode: 'follow', cars: [this.incident.car], why: this.incident.why, score: 0.6 + this.incident.sig * 0.6, since: now });
      if (st.phase === 'sc' || st.phase === 'red' || st.phase === 'grid') cands.push({ mode: 'overview', cars: [], why: st.phase === 'sc' ? 'Safety car: the field bunches up' : st.phase === 'red' ? 'Red flag' : 'The grid', score: 0.9, since: now });
    }
    if (!cands.length) cands.push({ mode: 'overview', cars: [], why: 'Overview of the circuit', score: 0.1, since: now });
    cands.sort((a, b) => b.score - a.score);
    const best = cands[0];
    const same = best.mode === this.shot.mode && best.cars.join() === this.shot.cars.join();
    if (same) { this.shot = { ...best, since: this.shot.since }; return this.shot; }
    const dwell = now - this.shot.since;
    const urgent = best.score > 1.1;
    const current = cands.find((c) => c.mode === this.shot.mode && c.cars.join() === this.shot.cars.join());
    const curScore = current?.score ?? 0;
    if ((dwell > this.minDwell && best.score > curScore * 1.25) || (urgent && dwell > 3 && best.score > curScore * 1.1) || !current) this.shot = best;
    return this.shot;
  }
}

function describe(f: FeedItem, setup: WeekendSetup, st: RaceState): string {
  const n = (k?: number) => (k === undefined ? '' : setup.entrants[st.cars[k].i].name);
  switch (f.kind) {
    case 'lead': return `${n(f.a)} takes the lead`;
    case 'contact': return `Contact: ${n(f.a)} and ${n(f.b)}`;
    case 'spin': return `${n(f.a)} spins at ${f.where}`;
    case 'retire': return `${n(f.a)} retires`;
    case 'puncture': return `${n(f.a)} has a puncture`;
    case 'overtake': return `${n(f.a)} passes ${n(f.b)}`;
    case 'pit': return `${n(f.a)} in the pits`;
    case 'qfastest': return `${n(f.a)} goes fastest`;
    default: return f.kind;
  }
}
