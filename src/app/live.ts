// A live race weekend. Sporting time advances at speed x real time in fixed engine steps (DT), so the
// outcome is identical whether watched at 1x, 20x or skipped: only the number of steps per frame changes.
import type { Universe, Meeting } from '../sim/types';
import { getTrack, type Track } from '../sim/track';
import { createQuali, createRace, stepRace, isOver, DT, type RaceState, type FeedItem } from '../sim/race/engine';
import type { WeekendSetup } from '../sim/race/setup';
import { beginMeeting, finishMeeting } from '../sim/world/season';

export type Stage = 'quali' | 'race' | 'done';
export interface MomentFilter { minSig: number; kinds?: string[] }

export class LiveSession {
  u: Universe;
  meeting: Meeting;
  setup: WeekendSetup;
  tr: Track;
  quali: RaceState;
  race: RaceState | null = null;
  stage: Stage = 'quali';
  speed = 1;
  playing = true;
  acc = 0;
  prevS: Float64Array; prevLat: Float64Array;
  feedSeen = 0;
  onFeed?: (items: FeedItem[], st: RaceState) => void;
  onStage?: (stage: Stage) => void;
  skipping: { until: (st: RaceState, fresh: FeedItem[]) => boolean; budgetMs: number } | null = null;

  static begin(u: Universe, m: Meeting): LiveSession | null {
    const w = beginMeeting(u, m);
    if (!w) return null;
    return new LiveSession(u, m, w.setup);
  }

  constructor(u: Universe, m: Meeting, setup: WeekendSetup) {
    this.u = u; this.meeting = m; this.setup = setup;
    this.tr = getTrack(setup.layout.geometryId);
    this.quali = createQuali(setup, this.tr);
    const n = setup.entrants.length;
    this.prevS = new Float64Array(n); this.prevLat = new Float64Array(n);
    this.snapshot();
    if (isOver(this.quali)) this.startRace();
  }

  get st(): RaceState { return this.stage === 'quali' ? this.quali : this.race ?? this.quali; }

  /** Entrant index -> car index in the current session. */
  carOf(entrant: number): number { return this.st.cars.findIndex((c) => c.i === entrant); }

  private snapshot() { const st = this.st; for (const c of st.cars) { this.prevS[c.i] = c.s; this.prevLat[c.i] = c.lat; } }

  startRace() {
    const q = this.quali;
    const grid = q.q!.gridOrder.map((k) => q.cars[k].i);
    this.race = createRace(this.setup, this.tr, grid);
    this.stage = 'race';
    this.feedSeen = 0;
    this.snapshot();
    this.onStage?.('race');
  }

  /** Advance one fixed engine step. */
  stepOnce() {
    const st = this.st;
    this.snapshot();
    stepRace(st);
    this.emitFeed();
    if (isOver(st)) {
      if (this.stage === 'quali') this.startRace();
      else if (this.stage === 'race') this.complete();
    }
  }

  private emitFeed() {
    const st = this.st;
    if (st.feed.length > this.feedSeen) {
      const fresh = st.feed.slice(this.feedSeen);
      this.feedSeen = st.feed.length;
      this.onFeed?.(fresh, st);
      if (this.skipping && this.skipping.until(st, fresh)) this.skipping = null;
    }
  }

  complete() {
    if (this.stage === 'done' || !this.race) return;
    finishMeeting(this.u, this.meeting, this.setup, this.quali, this.race);
    this.stage = 'done';
    this.skipping = null;
    this.onStage?.('done');
  }

  /** Called every animation frame with real elapsed seconds. Returns interpolation alpha. */
  tick(realDt: number): number {
    if (this.stage === 'done') return 1;
    if (this.skipping) {
      const t0 = performance.now();
      while (this.skipping && (this.stage as Stage) !== 'done' && performance.now() - t0 < this.skipping.budgetMs) this.stepOnce();
      this.acc = 0;
      return 1;
    }
    if (!this.playing) return this.acc / DT;
    this.acc += Math.min(realDt, 0.25) * this.speed;
    let guard = 0;
    while (this.acc >= DT && guard < 2000 && (this.stage as Stage) !== 'done') { this.stepOnce(); this.acc -= DT; guard++; }
    return Math.min(1, this.acc / DT);
  }

  /** Fast-forward the same simulation until something meaningful happens. */
  skipToNextMoment(minSig = 0.6) {
    const startT = this.st.t;
    this.skipping = { budgetMs: 12, until: (st, fresh) => fresh.some((f) => f.sig >= minSig && f.kind !== 'grid') || (st.t - startT > 900 && this.stage === 'race') };
  }
  skipSession() { this.skipping = { budgetMs: 14, until: () => false }; const stage = this.stage; const orig = this.skipping; orig.until = () => this.stage !== stage; }
  skipToEnd() { this.skipping = { budgetMs: 16, until: () => false }; }
  get busySkipping() { return !!this.skipping; }
}
