// Game controller: owns the universe, the live weekend, the renderer loop, the director, commentary,
// autosave and background simulation. The UI observes it and issues commands.
import type { Universe, Meeting } from '../sim/types';
import { createUniverse } from '../sim/universe';
import { nextTask, runTask, loadSetup } from '../sim/world/season';
import { ENGINE_VERSION } from '../sim/types';
import { LiveSession } from './live';
import { Director, type Shot } from './director';
import { Commentator, type Line, type Density } from '../narrative/commentary';
import { Renderer, type CarFrame, type Conditions } from '../render/renderer';
import { RaceAudio } from '../render/audio';
import type { CityData } from '../render/city';
import { saveUniverse, getPref, setPref } from '../persist/db';
import type { WorkerOut, Until } from '../worker/sim.worker';
import type { FeedItem } from '../sim/race/engine';
import { monthOf, dayOf } from '../sim/dates';

export type Screen = 'start' | 'loading' | 'game';
export type Destination = 'live' | 'season' | 'people' | 'history' | 'stories';
export interface Prefs { quality: 'low' | 'medium' | 'high'; density: Density; spoilers: boolean; reducedMotion: boolean; volume: number; muted: boolean; pauseInPanels: boolean; periodLook: boolean }
export type View =
  | { kind: 'person'; id: string; asOf?: number }
  | { kind: 'team'; id: string; asOf?: number }
  | { kind: 'race'; id: string }
  | { kind: 'season'; year: number }
  | { kind: 'layout'; id: string }
  | { kind: 'story'; id: string }
  | { kind: 'compare'; a: string; b: string };
export interface Progress { label: string; done: number; total: number; year: number; cancellable: boolean }
export interface Notice { text: string; action?: { label: string; run: () => void } }
/** Where the player was in a live weekend; autosaves happen between weekends, so resuming re-runs the same
 * weekend deterministically from its stored state and fast-forwards to this point. */
interface ResumePoint { uid: string; meetingId: string; stage: 'quali' | 'race'; t: number }
interface Suspended { live: LiveSession; director: Director | null; commentary: Commentator | null; follow: number | null; camManual: 'follow' | 'free' | null; wasPlaying: boolean }

export class Controller {
  u: Universe | null = null;
  live: LiveSession | null = null;
  director: Director | null = null;
  commentary: Commentator | null = null;
  renderer: Renderer | null = null;
  city: CityData | null = null;
  screen: Screen = 'start';
  dest: Destination = 'live';
  progress: Progress | null = null;
  follow: number | null = null; // entrant index followed by the player (manual)
  camManual: 'follow' | 'free' | null = null;
  prefs: Prefs = { quality: 'medium', density: 'normal', spoilers: true, reducedMotion: false, volume: 0.6, muted: true, pauseInPanels: false, periodLook: true };
  message: string | null = null;
  private messageAt = 0;
  // performance measurement: frame times and simulation cost over the last 240 frames
  private perfDt = new Float32Array(240); private perfSim = new Float32Array(240); private perfI = 0;
  showPerf = false;
  perf() {
    const n = Math.min(this.perfI, 240); if (!n) return null;
    const dts = Array.from(this.perfDt.subarray(0, n)).sort((a, b) => a - b), sims = Array.from(this.perfSim.subarray(0, n));
    const info = this.renderer?.renderer.info;
    return { fps: Math.round(1000 / dts[Math.floor(n / 2)]), p95FrameMs: +dts[Math.floor(n * 0.95)].toFixed(1), simMsPerFrame: +(sims.reduce((a, b) => a + b, 0) / n).toFixed(2), drawCalls: info?.render.calls ?? 0, triangles: info?.render.triangles ?? 0, heapMB: (performance as any).memory ? Math.round((performance as any).memory.usedJSHeapSize / 1048576) : null };
  }
  notice: Notice | null = null;
  /** Spoiler-safe exploration: views show history as known on this day (undefined = everything). */
  cutoff: number | undefined = undefined;
  /** Set while watching a past race rebuilt from its stored setup. */
  replaying: { meetingId: string; label: string; note?: string; suspended: Suspended | null } | null = null;
  /** Background generation (explore mode) runs while the player keeps watching. */
  bgProgress: Progress | null = null;
  exploreMode = false;
  audio = new RaceAudio();
  private resumePoint: ResumePoint | null = null;
  lastResume: { stage: string; t: number; s: number[] } | null = null;
  private lastResumeSave = 0;
  private workerBackground = false;
  private listeners = new Set<() => void>();
  private lastNotify = 0;
  private raf = 0;
  private lastFrame = performance.now();
  private worker: Worker | null = null;
  private workerResolve: ((u: Universe | null) => void) | null = null;
  alpha = 1;
  lastShot: Shot | null = null;
  feedListeners = new Set<(items: FeedItem[]) => void>();

  subscribe(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  notify(force = false) { const now = performance.now(); if (!force && now - this.lastNotify < 120) return; this.lastNotify = now; for (const l of this.listeners) l(); }

  async loadPrefs() {
    this.prefs = { ...this.prefs, ...(await getPref<Partial<Prefs>>('prefs', {})) };
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) this.prefs.reducedMotion = true;
    if (!(await getPref('prefsSet', false))) this.prefs.quality = /Android|iPhone|Mobile/i.test(navigator.userAgent) ? 'low' : 'medium';
    // sound stays off until the player turns it on; a saved "on" resumes at the first interaction (autoplay rules)
    this.audio.enabled = !this.prefs.muted; this.audio.volume = this.prefs.volume;
    const wake = () => { if (!this.prefs.muted) this.audio.setEnabled(true, this.prefs.volume); window.removeEventListener('pointerdown', wake); };
    window.addEventListener('pointerdown', wake);
  }
  savePrefs() { setPref('prefs', this.prefs); setPref('prefsSet', true); this.audio.setEnabled(!this.prefs.muted, this.prefs.volume); if (this.renderer) this.renderer.reducedMotion = this.prefs.reducedMotion; if (this.commentary) this.commentary.density = this.prefs.density; this.notify(true); }

  async ensureCity(): Promise<CityData> {
    if (this.city) return this.city;
    const res = await fetch('./data/stalbans-city.json');
    this.city = await res.json();
    return this.city!;
  }

  attachCanvas(canvas: HTMLCanvasElement) {
    if (this.renderer) return;
    this.renderer = new Renderer(canvas, this.prefs.quality);
    this.renderer.reducedMotion = this.prefs.reducedMotion;
    this.renderer.onPick = (carIdx) => { if (!this.live) return; const ent = this.live.st.cars[carIdx]?.i; if (ent !== undefined) this.followEntrant(ent); };
    this.renderer.onUserCamera = () => { this.camManual = 'free'; if (this.director) this.director.auto = false; this.renderer!.setMode('free'); this.notify(true); };
  }

  // ------------------------------------------------------------------ lifecycle
  async newUniverse(seed: string, opts: { raceFormat: 'gp' | 'sprint'; fatalities: boolean }) {
    this.screen = 'loading'; this.notify(true);
    await this.ensureCity();
    await new Promise((r) => setTimeout(r, 30));
    this.u = createUniverse(seed, undefined, { raceFormat: opts.raceFormat, fatalities: opts.fatalities } as any);
    this.advanceToMeeting();
    await saveUniverse(this.u);
    await this.enterGame();
  }

  async openUniverse(u: Universe) {
    this.screen = 'loading'; this.notify(true);
    await this.ensureCity();
    this.u = u;
    this.resumePoint = await getPref<ResumePoint | null>('resume', null);
    this.advanceToMeeting();
    await this.enterGame();
  }

  private async enterGame() {
    this.screen = 'game';
    this.dest = 'live';
    this.notify(true);
    await new Promise((r) => setTimeout(r, 0));
    if (this.renderer && this.city && !this.renderer.city) this.renderer.loadCity(this.city);
    this.beginNextMeeting();
    this.startLoop();
  }

  /** Run cheap non-race tasks (new year, testing, season end) until the next meeting. */
  advanceToMeeting() {
    const u = this.u!;
    for (let i = 0; i < 20; i++) { const t = nextTask(u); if (t.kind === 'meeting') return; runTask(u, t); }
  }

  nextMeeting(): Meeting | null {
    const u = this.u!; const t = nextTask(u);
    if (t.kind !== 'meeting') return null;
    return u.seasons[t.year].meetings[t.idx!];
  }

  beginNextMeeting() {
    const u = this.u!;
    this.advanceToMeeting();
    const m = this.nextMeeting();
    if (!m) { this.live = null; this.notify(true); return; }
    const live = LiveSession.begin(u, m);
    if (!live) { // meeting cancelled or season interrupted: move on
      this.advanceToMeeting();
      if (this.nextMeeting() && this.nextMeeting() !== m) return this.beginNextMeeting();
      this.live = null; this.notify(true); return;
    }
    this.attachLive(live);
    const rp = this.resumePoint;
    if (rp && rp.uid === u.meta.id && rp.meetingId === m.id) { this.resumePoint = null; this.fastForward(rp.stage, rp.t); }
  }

  /** Advance the current weekend with the same engine to a stored point, without commentary or camera cuts. */
  private fastForward(stage: 'quali' | 'race', t: number) {
    const live = this.live!; const onFeed = live.onFeed; live.onFeed = undefined;
    let guard = 0;
    while ((live.stage as string) !== 'done' && (live.stage !== stage || live.st.t < t) && guard++ < 3_000_000) live.stepOnce();
    live.onFeed = onFeed; live.feedSeen = live.st.feed.length;
    this.lastResume = { stage: live.stage, t: live.st.t, s: Array.from(live.st.cars, (x) => x.s) }; // for verification
    this.message = `Resumed where you left off${live.stage === 'race' ? ` (lap ${Math.max(1, (live.st.cars[live.st.order[0]]?.lap ?? 0) + 1)})` : ''}.`;
    this.notify(true);
  }

  /** Wire a live session (new weekend or replay) to the director, commentary and scene. */
  private attachLive(live: LiveSession) {
    const u = this.u!;
    this.live = live;
    this.director = new Director(u, live.setup);
    this.commentary = new Commentator(u, live.setup);
    this.commentary.density = this.prefs.density;
    this.follow = null; this.camManual = null;
    live.onFeed = (items, st) => {
      this.commentary!.onFeed(items, st); this.director!.onFeed(items, st); for (const f of this.feedListeners) f(items);
      if (!live.busySkipping) for (const f of items) { if (f.kind === 'start' || f.kind === 'sc' || f.kind === 'red') this.audio.cue(f.kind); else if (f.kind === 'lead' && st.kind === 'race') this.audio.cue('overtake'); else if (f.kind === 'finish') this.audio.cue('finish'); }
    };
    live.onStage = (stage) => { if (stage === 'race') this.setupCars(); if (stage === 'done') { this.follow = null; this.camManual = 'free'; if (this.director) this.director.auto = false; this.renderer?.setMode('overview'); if (!live.replay) this.afterMeeting(); } this.notify(true); };
    this.setupScene();
    this.notify(true);
  }

  // ------------------------------------------------------------------ replays
  /** Rebuild a past weekend from its stored setup and watch it; the current live weekend is paused, not lost. */
  replay(meetingId: string) {
    const u = this.u!; const rec = u.races[meetingId];
    const m = rec ? u.seasons[rec.year]?.meetings.find((x) => x.id === meetingId) : undefined;
    const setup = loadSetup(u, meetingId);
    if (!rec || !m || !setup) { this.message = 'This race has no stored setup, so it cannot be replayed.'; this.notify(true); return; }
    if (!this.replaying) this.replaying = { meetingId, label: '', suspended: this.live ? { live: this.live, director: this.director, commentary: this.commentary, follow: this.follow, camManual: this.camManual, wasPlaying: this.live.playing } : null };
    if (this.replaying.suspended) this.replaying.suspended.live.playing = false;
    this.replaying.meetingId = meetingId;
    this.replaying.label = `${rec.name} ${rec.year}`;
    this.replaying.note = rec.engineVersion !== ENGINE_VERSION ? `Recorded with engine ${rec.engineVersion}; this is engine ${ENGINE_VERSION}, so the replay may differ from the record.` : undefined;
    this.attachLive(new LiveSession(u, m, setup, { expectHash: rec.hash }));
    this.dest = 'live'; this.views = [];
    this.notify(true);
  }
  /** Leave a replay and return to exactly where the live weekend was. */
  exitReplay() {
    const r = this.replaying; if (!r) return;
    this.replaying = null;
    const s = r.suspended;
    if (s && s.live.u === this.u) {
      this.live = s.live; this.director = s.director; this.commentary = s.commentary; this.follow = s.follow; this.camManual = s.camManual;
      s.live.playing = s.wasPlaying;
      this.setupScene();
      if (s.live.stage === 'done') this.renderer?.setMode('overview');
      this.dest = 'live'; this.views = [];
      this.notify(true);
    } else { this.live = null; this.dest = 'live'; this.views = []; this.beginNextMeeting(); }
  }

  refreshScene() { if (this.live) this.setupScene(); }
  private setupScene() {
    const live = this.live!; const r = this.renderer; const u = this.u!;
    if (!r || !this.city) return;
    if (!r.city) r.loadCity(this.city);
    const lv = u.layouts[live.meeting.layoutVersionId];
    const season = u.seasons[live.meeting.year];
    r.setTrack(live.tr, { surface: lv.surface, barrier: lv.barrier, year: live.meeting.year, pitQuality: lv.pitQuality, popularity: (u.venues[live.meeting.venueId].popularity + u.world.popularity) / 2, teams: season.entries.map((e) => ({ colour: e.colours.primary, colour2: e.colours.secondary })), quality: this.prefs.quality });
    this.setupCars();
    r.setMode('overview');
  }
  private setupCars() {
    const live = this.live!; const r = this.renderer; if (!r) return;
    const st = live.st;
    r.setCars(st.cars.map((c) => { const e = live.setup.entrants[c.i]; return { visual: e.vis, colour: e.colour, colour2: e.colour2, accent: e.accent, pattern: e.pattern, no: e.no }; }));
  }

  private async afterMeeting() {
    const u = this.u!;
    const year = this.live!.meeting.year;
    try { await saveUniverse(u, [year]); } catch (err) { this.message = `Autosave failed: ${err}`; }
    this.notify(true);
  }

  continueAfterRace() { this.beginNextMeeting(); }

  // ------------------------------------------------------------------ frame loop
  startLoop() {
    if (this.raf) return;
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = (now - this.lastFrame) / 1000;
      this.lastFrame = now;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private frame(dt: number) {
    const live = this.live, r = this.renderer;
    // toasts clear themselves after a few seconds
    const nowS = performance.now() / 1000;
    if (this.message && !this.messageAt) this.messageAt = nowS;
    else if (!this.message) this.messageAt = 0;
    else if (nowS - this.messageAt > 6) { this.message = null; this.messageAt = 0; this.notify(true); }
    if (!r) return;
    if (!live) { r.frame([], 1, defaultCond(), 1); return; }
    const panelPause = this.prefs.pauseInPanels && this.dest !== 'live';
    const wasPlaying = live.playing;
    if (panelPause) live.playing = false;
    const simT0 = performance.now();
    this.alpha = live.tick(dt);
    const k = this.perfI++ % 240; this.perfDt[k] = dt * 1000; this.perfSim[k] = performance.now() - simT0;
    if (panelPause) live.playing = wasPlaying;
    const st = live.st;
    // camera: player's choice wins; otherwise the director
    const now = performance.now() / 1000;
    if (this.director) {
      if (this.follow !== null) { const k = live.carOf(this.follow); if (k >= 0) r.setModeIfChanged('follow', [k]); }
      else if (this.camManual !== 'free') { const shot = this.director.update(st, now); this.lastShot = shot; r.setModeIfChanged(shot.mode, shot.cars); }
    }
    this.commentary?.observe(st);
    const frames: CarFrame[] = st.cars.map((c) => {
      const inPit = c.mode === 'pit' || (c.mode === 'out' && st.kind === 'quali');
      const f: CarFrame = { s0: live.prevS[c.i], s1: c.s, lat0: live.prevLat[c.i], lat1: c.lat, spin: c.inc?.kind === 'spin' ? Math.min(1, (st.t - c.inc.t) / 1.5) * Math.PI * 1.3 : 0, visible: c.mode !== 'out', inPit };
      if (inPit) { const p = pitPoint(live.tr, c.s); f.pitX = p[0]; f.pitZ = p[1]; }
      return f;
    });
    const w = st.w;
    const hour = 14 + st.t / 3600;
    const cond: Conditions = { cloud: w.cloud, rain: w.rain, water: w.water, vis: w.vis, snow: w.snow, hour, month: monthOf(live.meeting.day), flagState: st.phase === 'red' ? 'red' : st.phase === 'sc' ? 'sc' : st.phase === 'fin' || st.phase === 'done' ? 'chequered' : 'green', yellows: st.yellows };
    r.frame(frames, this.alpha, cond, live.playing ? live.speed : 0);
    if (this.audio.enabled) {
      const k = this.follow !== null ? live.carOf(this.follow) : this.lastShot?.cars[0] ?? st.order[0];
      const car = st.cars[k] ?? st.cars[0];
      const near = r.mode === 'follow' ? 1 : r.mode === 'battle' ? 0.8 : r.mode === 'free' ? 0.5 : 0.25;
      const u = this.u!;
      this.audio.update({ playing: live.playing && !live.busySkipping && this.dest === 'live', speed: live.speed, carV: car && car.mode !== 'out' ? car.v : 0, near, crowd: (u.venues[live.meeting.venueId]?.popularity ?? 30) / 100, rain: w.rain, era: live.setup.entrants[0]?.vis.era ?? 'vintage' });
    }
    // remember the position within a live weekend (cheap: a few numbers), so a reload resumes it
    if (!this.replaying && live.stage !== 'done' && now - this.lastResumeSave > 5) { this.lastResumeSave = now; setPref('resume', { uid: this.u!.meta.id, meetingId: live.meeting.id, stage: live.stage, t: live.st.t } as ResumePoint); }
    this.notify();
  }

  // ------------------------------------------------------------------ player commands
  setSpeed(s: number) { if (this.live) { this.live.speed = s; this.live.playing = true; } this.notify(true); }
  togglePlay() { if (this.live) this.live.playing = !this.live.playing; this.notify(true); }
  nextMoment() { this.live?.skipToNextMoment(0.6); this.notify(true); }
  skipSession() { this.live?.skipSession(); this.notify(true); }
  finishRaceNow() { this.live?.skipToEnd(); this.notify(true); }
  followEntrant(ent: number | null) { this.follow = ent; this.camManual = ent === null ? null : 'follow'; if (this.director) this.director.auto = ent === null; this.notify(true); }
  autoCamera() { this.follow = null; this.camManual = null; if (this.director) this.director.auto = true; this.renderer?.setMode('overview'); this.notify(true); }
  overview() { this.follow = null; this.camManual = 'free'; if (this.director) this.director.auto = false; this.renderer?.setMode('overview'); this.notify(true); }
  freeCamera() { this.follow = null; this.camManual = 'free'; if (this.director) this.director.auto = false; this.renderer?.setMode('free'); this.notify(true); }
  go(d: Destination) { this.dest = d; this.views = []; this.notify(true); }
  views: View[] = [];
  open(v: View) { if (this.dest === 'live') this.dest = v.kind === 'story' ? 'stories' : v.kind === 'person' || v.kind === 'team' ? 'people' : 'history'; this.views.push(v); this.notify(true); }
  back() { this.views.pop(); this.notify(true); }
  toggleFavourite(kind: 'people' | 'teams', id: string) { const u = this.u!; const arr = u.favourites[kind]; const i = arr.indexOf(id); if (i >= 0) arr.splice(i, 1); else arr.push(id); this.notify(true); }

  /** Test/automation hook: advance the live session synchronously by `seconds` of sporting time. */
  advanceSim(seconds: number) {
    const live = this.live; if (!live) return;
    const target = live.st.t + seconds;
    let guard = 0;
    while (live.stage !== 'done' && live.st.t < target && guard++ < 2_000_000) { const before = live.stage; live.stepOnce(); if (live.stage !== before) break; }
    this.notify(true);
  }

  // ------------------------------------------------------------------ background simulation
  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('../worker/sim.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<WorkerOut>) => {
        const m = e.data;
        if (m.type === 'progress') { const p = { label: `${m.year}: ${m.label}`, done: m.done, total: m.total, year: m.year, cancellable: true }; if (this.workerBackground) this.bgProgress = p; else this.progress = p; this.notify(); }
        else if (m.type === 'done') { const res = this.workerResolve; this.workerResolve = null; this.progress = null; res?.(m.universe); }
        else if (m.type === 'error') { const res = this.workerResolve; this.workerResolve = null; this.progress = null; this.bgProgress = null; this.message = `Simulation error: ${m.message.split('\n')[0]}`; res?.(null); }
      };
    }
    return this.worker;
  }

  /** Simulate in the background with identical rules; the live race (if any) is finished first. */
  async simulate(until: Until, label: string) {
    const u = this.u!;
    if (this.bgProgress) { this.message = 'History is still being generated in the background.'; this.notify(true); return; }
    if (this.replaying) { const s = this.replaying.suspended; this.replaying = null; this.live = s && s.live.u === u ? s.live : null; }
    if (this.live && this.live.stage !== 'done') {
      // finish the current weekend with the same engine, fast
      this.progress = { label: 'Finishing the current race', done: 0, total: 1, year: u.clock.year, cancellable: false };
      this.notify(true);
      while ((this.live.stage as string) !== 'done') { this.live.skipToEnd(); this.live.tick(0); await new Promise((r) => setTimeout(r, 0)); }
    }
    this.live = null;
    this.progress = { label, done: 0, total: 1, year: u.clock.year, cancellable: true };
    this.notify(true);
    const w = this.ensureWorker();
    const result = await new Promise<Universe | null>((resolve) => { this.workerResolve = resolve; w.postMessage({ type: 'run', universe: u, until }); });
    if (result) { this.u = result; try { await saveUniverse(result); } catch (err) { this.message = `Save failed: ${err}`; } }
    this.progress = null;
    this.beginNextMeeting();
  }
  cancelSimulation() { this.worker?.postMessage({ type: 'cancel' }); }

  /**
   * Explore mode: generate history in a worker from a copy of the universe while the player keeps watching
   * the opening weekend on the main thread. Both copies run the same deterministic code from the same state,
   * so the race being watched is exactly the one in the generated history; it is verified when it ends.
   */
  async generateInBackground(until: Until, label: string) {
    const u = this.u!;
    this.workerBackground = true;
    this.bgProgress = { label, done: 0, total: 1, year: u.clock.year, cancellable: true };
    this.notify(true);
    const w = this.ensureWorker();
    const result = await new Promise<Universe | null>((resolve) => { this.workerResolve = resolve; w.postMessage({ type: 'run', universe: u, until }); });
    this.workerBackground = false; this.bgProgress = null;
    if (result) await this.adoptUniverse(result);
    this.notify(true);
  }

  /** Switch to a universe produced elsewhere (the worker); a weekend in progress becomes a verified replay. */
  private async adoptUniverse(nu: Universe) {
    const old = this.live;
    this.u = nu;
    if (old && old.u !== nu) {
      if (old.stage !== 'done') old.replay = { expectHash: nu.races[old.meeting.id]?.hash };
      this.replaying = { meetingId: old.meeting.id, label: `${old.meeting.name} ${old.meeting.year}`, note: 'This weekend is part of the history just generated; its result is checked against the record when it ends.', suspended: null };
    }
    try { await saveUniverse(nu); } catch (err) { this.message = `Save failed: ${err}`; }
    const years = Object.keys(nu.seasons).map(Number);
    const y0 = Math.min(...years), y1 = Math.max(...years);
    // spoilers hidden (the default): the century is revealed one chapter (decade) at a time from the start
    if (this.exploreMode && this.prefs.spoilers) this.cutoff = dayOf(Math.min(y1, Math.floor(y0 / 10) * 10 + 9), 12, 31);
    const champs = new Set(Object.values(nu.seasons).map((s) => s.championId).filter(Boolean)).size;
    this.notice = { text: this.cutoff !== undefined ? `History generated: ${y0}–${y1}, ${Object.keys(nu.races).length} races. Outcomes are hidden and revealed a chapter at a time.` : `History generated: ${y0}–${y1}, ${Object.keys(nu.races).length} races, ${champs} different champions.`, action: { label: 'Explore the century', run: () => { this.notice = null; this.go('stories'); } } };
  }
}

function defaultCond(): Conditions { return { cloud: 0.3, rain: 0, water: 0, vis: 10000, snow: false, hour: 14, month: 5, flagState: 'green', yellows: [] }; }

function pitPoint(tr: import('../sim/track').Track, s: number): [number, number] {
  const path = tr.g.pit.path;
  const f = Math.max(0, Math.min(1, tr.pitFraction(s)));
  const idx = f * (path.length - 1);
  const i = Math.floor(idx), t = idx - i;
  const a = path[i], b = path[Math.min(path.length - 1, i + 1)];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
