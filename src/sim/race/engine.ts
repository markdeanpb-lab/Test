// The race engine. One fixed time step (DT) advances every car using the same rules whether the race is
// watched at 1x, fast-forwarded, or simulated headless. Positions, gaps and classification emerge from
// car motion; incidents, failures, flags and penalties are explicit state that affects that motion.
import { Rng, streamFor, type RngState } from '../rng';
import { clamp, dsqrt, dexp } from '../dmath';
import type { Track } from '../track';
import type { RaceEventRec } from '../types';
import { computeProfile, accelAt, brakeAt, lapTimeOf, type ProfileParams, G } from './physics';
import { type WeatherState, initialWeather, stepWeather, wetGrip, forecastRain, isUnsafe, weatherLabel } from '../weather';
import type { WeekendSetup, EntrantSetup } from './setup';

export const DT = 0.1;
const WEATHER_TICK = 10; // s

export const TYRES: Record<string, { grip: number; wear: number; sens: number; opt: number; label: string; colour: string }> = {
  treaded: { grip: 0.96, wear: 0.55, sens: 0.15, opt: 55, label: 'Treaded', colour: '#aaa' },
  hard: { grip: 1.0, wear: 0.7, sens: 0.55, opt: 95, label: 'Hard', colour: '#eee' },
  medium: { grip: 1.022, wear: 1.0, sens: 0.6, opt: 90, label: 'Medium', colour: '#f5c518' },
  soft: { grip: 1.045, wear: 1.5, sens: 0.65, opt: 85, label: 'Soft', colour: '#e8323c' },
  inter: { grip: 1.0, wear: 1.5, sens: 0.3, opt: 60, label: 'Intermediate', colour: '#3cb44b' },
  wet: { grip: 1.0, wear: 2.2, sens: 0.3, opt: 50, label: 'Wet', colour: '#2f6fdf' },
};

export type CarMode = 'grid' | 'run' | 'pit' | 'fin' | 'out';
export interface Incident { kind: 'lockup' | 'wide' | 'spin' | 'stall' | 'slow' | 'yield'; t: number; dur: number; vCap: number; latTo: number }
export interface CarState {
  i: number;
  s: number; lap: number; dist: number;
  v: number; lat: number; latT: number;
  mode: CarMode;
  grid: number;
  tyre: string; wear: number; ttemp: number; tyreLaps: number; used: string[];
  fuel: number;
  dmgAero: number; dmgSusp: number; puncture: boolean; engWear: number; limp: number;
  push: number; conf: number; fatigue: number;
  inc: Incident | null;
  atk: number; atkT: number; atkSide: number; defUsed: boolean; defLap: number; yieldT: number; blueT: number;
  pitReq: string | null; pitPhase: number; pitT: number; pitIn: number; pits: number; pitWork: { tyre: string | null; fuel: number; repair: boolean; dt: boolean };
  pen: { kind: string; seconds: number; reason: string; served: boolean }[];
  lapStart: number; lastLap: number; best: number; bestLapNo: number; sec: number; secStart: number; secBest: number[]; lapTimes: number[]; clean: boolean; cleanTimes: number[];
  led: number; finT: number | null;
  ret: null | { t: number; lap: number; reason: string; cat: 'mechanical' | 'driver' | 'contact' | 'other'; where: string; s: number };
  react: number; launch: number;
  jump?: boolean; // anticipated the start (penalised at lights out)
  lastCornerI: number; lastHazardT: number;
  pos: number; overtakes: number; lostPos: number;
  gapAhead: number; gapLeader: number; interval: number;
  mistakes: number; contacts: number;
  paceMult: number; // per-corner consistency draw
  startT: number; // time the car may move (lights + reaction)
  passedBy: number; passedT: number;
  wearBias: number;
  lapValid: boolean; // false for the partial lap after a red-flag restart
  outAt: number; // retired car recovered from the circuit at this time
  dnsReason?: string;
}
export type Phase = 'delay' | 'grid' | 'run' | 'sc' | 'red' | 'fin' | 'done' | 'abandoned' | 'postponed';
export interface FeedItem { t: number; lap: number; kind: string; text?: string; a?: number; b?: number; pos?: number; where?: string; detail?: string; sig: number; value?: number }
export interface QualiInfo {
  format: 'ballot' | 'practice' | 'single-lap' | 'knockout';
  seg: number; // 1..3 for knockout
  segs: number;
  runLaps: number;
  best: number[]; // best valid lap per car index (Infinity if none)
  segBest: number[][]; // per segment
  eliminated: boolean[];
  segStart: number;
  flying: number[]; // flying laps remaining for each car
  done: boolean;
  gridOrder: number[];
}
export interface RaceState {
  kind: 'race' | 'quali';
  q?: QualiInfo;
  v: string;
  meetingId: string;
  t: number; step: number;
  phase: Phase;
  laps: number; maxT: number;
  cars: CarState[];
  order: number[];
  rng: RngState; wrng: RngState;
  w: WeatherState;
  wAcc: number;
  sc: { on: boolean; dist: number; v: number; laps: number; clearT: number; deployT: number; reason: string; inNext: boolean; count: number; restartT: number };
  yellows: { s0: number; s1: number; until: number; cause: string }[];
  red: null | { since: number; resumeAt: number; reason: string; count: number };
  delayUntil: number; delayed: number;
  lightsT: number;
  leaderDone: boolean;
  fastest: { t: number; i: number; lap: number } | null;
  events: RaceEventRec[];
  feed: FeedItem[];
  leadChanges: number; overtakeCount: number; scCount: number; redCount: number;
  lastLeader: number;
  startLap: number;
  status: 'finished' | 'shortened' | 'abandoned' | '';
  endNote: string;
  hazardClock: number;
  wetLaps: number; maxRain: number; changeable: boolean; startWeather: string;
  pending: { a: number; b: number; t: number; reason: string; lap: number; where: string }[];
  swapT: Record<string, number>;
  redOrder: number[] | null;
  leadCand: number; leadCandT: number; lapNow: number;
  tried: Record<number, number>;
}

interface Cache { keys: Float64Array; lastBuild: number[]; pp: ProfileParams[]; prof: Float64Array[]; key: number[]; lapEst: number[]; tr: Track; setup: WeekendSetup; rng: Rng; wrng: Rng; baseProf: Float64Array; carsPerMin: number }
const caches = new WeakMap<RaceState, Cache>();

const n01 = (x: number) => (x - 70) / 20; // attribute 0..100 -> roughly -3.5..+1.5 around a typical 70
const SIG = { lead: 0.95, overtake: 0.45, pit: 0.35, retire: 0.7, mistake: 0.4, contact: 0.7, sc: 0.8, red: 0.95, penalty: 0.6, weather: 0.6, fastest: 0.3, finish: 1, start: 0.8 };

// ---------------------------------------------------------------------------- setup helpers
function carDims(e: EntrantSetup) { return { len: e.vis.length, w: e.vis.width }; }

/** Starting fuel and tyre decision (team pre-race strategy with the information available). */
function initialStrategy(st: RaceState, e: EntrantSetup, tr: Track, rules: WeekendSetup['rules'], rng: Rng) {
  const lapKm = tr.length / 1000;
  const raceKm = lapKm * st.laps;
  const w = st.w;
  const fc = forecastRain(w, 30, e.forecastSkill, rng);
  let tyre: string;
  const dry = rules.compounds;
  if (dry.length === 1) tyre = dry[0];
  else {
    // wetness decides first; otherwise risk appetite and track tyre stress
    tyre = dry.includes('medium') ? 'medium' : dry[0];
    if (dry.includes('soft') && (e.strategyRisk > 0.55 || st.laps * lapKm < 70)) tyre = 'soft';
    if (dry.includes('hard') && e.strategyRisk < 0.3) tyre = 'hard';
  }
  if (rules.wetTyres.length) {
    if (w.water > 0.62 && rules.wetTyres.includes('wet')) tyre = 'wet';
    else if (w.water > 0.2 || (fc > 0.8 && w.water > 0.1)) tyre = rules.wetTyres.includes('inter') ? 'inter' : rules.wetTyres[0];
  }
  let fuel: number;
  const burn = e.c.fuelPerKm;
  if (rules.refuel) {
    const stints = e.strategyRisk > 0.6 ? 3 : 2;
    fuel = (raceKm / stints) * burn * 1.08;
  } else fuel = raceKm * burn * (1.035 + rng.range(-0.01, 0.02));
  if (rules.fuelLimitKg) fuel = Math.min(fuel, rules.fuelLimitKg);
  return { tyre, fuel };
}

export function createRace(setup: WeekendSetup, tr: Track, gridOrder: number[]): RaceState {
  const rng = streamFor(setup.seed, 'race');
  const wrng = streamFor(setup.seed, 'weather-race');
  const w = initialWeather(streamFor(setup.seed, 'weather-day'), setup.month);
  // weather evolves between qualifying and the race start
  for (let k = 0; k < 90; k++) stepWeather(w, wrng, 60, 0);
  const lapsTotal = setup.rules.laps;
  const st: RaceState = {
    kind: 'race', v: setup.v, meetingId: setup.meetingId, t: 0, step: 0, phase: 'grid', laps: lapsTotal, maxT: setup.rules.maxSeconds,
    cars: [], order: [], rng: rng.s, wrng: wrng.s, w, wAcc: 0,
    sc: { on: false, dist: 0, v: 0, laps: 0, clearT: 0, deployT: 0, reason: '', inNext: false, count: 0, restartT: -1 },
    yellows: [], red: null, delayUntil: 0, delayed: 0, lightsT: 8, leaderDone: false, fastest: null, events: [], feed: [],
    leadChanges: 0, overtakeCount: 0, scCount: 0, redCount: 0, lastLeader: -1, startLap: 0, status: '', endNote: '', hazardClock: 0,
    wetLaps: 0, maxRain: w.rain, changeable: false, startWeather: weatherLabel(w), pending: [], swapT: {}, redOrder: null, leadCand: -1, leadCandT: 0, lapNow: 1, tried: {},
  };
  const unsafe = isUnsafe(w);
  if (unsafe) { st.phase = 'delay'; st.delayUntil = 900; pushEvent(st, { t: 0, lap: 0, kind: 'delay', detail: unsafe, sig: SIG.red }); }
  const L = tr.length;
  gridOrder.forEach((ei, p) => {
    const e = setup.entrants[ei];
    const { tyre, fuel } = initialStrategy(st, e, tr, setup.rules, rng);
    const back = 12 + p * 7.5;
    const side = p % 2 === 0 ? -1 : 1;
    const s = L - back;
    const lat = side * Math.min(2.2, tr.w[tr.idx(s)] / 2 - 1.1);
    st.cars.push({
      i: ei, s, lap: -1, dist: -back, v: 0, lat, latT: lat, mode: 'grid', grid: p + 1,
      tyre, wear: 0, ttemp: w.trackTemp + 15, tyreLaps: 0, used: [tyre], fuel,
      dmgAero: 0, dmgSusp: 0, puncture: false, engWear: 0, limp: 0,
      push: 1, conf: e.d.confidence, fatigue: 0, inc: null,
      atk: -1, atkT: 0, atkSide: 0, defUsed: false, defLap: -1, yieldT: 0, blueT: 0,
      pitReq: null, pitPhase: 0, pitT: 0, pitIn: 0, pits: 0, pitWork: { tyre: null, fuel: 0, repair: false, dt: false }, pen: [],
      lapStart: 0, lastLap: 0, best: Infinity, bestLapNo: 0, sec: 0, secStart: 0, secBest: [Infinity, Infinity, Infinity], lapTimes: [], clean: true, cleanTimes: [],
      led: 0, finT: null, ret: null,
      react: clamp(rng.gauss(0.32 - n01(e.d.consistency) * 0.04 - n01(e.d.pace) * 0.02 + (e.d.rookie ? 0.05 : 0), 0.08), 0.12, 1.2),
      launch: clamp(rng.gauss(1 + 0.03 * n01(e.d.mechSympathy) + 0.05 * (e.c.drivability - 0.5), 0.05), 0.7, 1.15),
      lastCornerI: -1, lastHazardT: 0, pos: p + 1, overtakes: 0, lostPos: 0, gapAhead: 0, gapLeader: 0, interval: 0,
      mistakes: 0, contacts: 0, paceMult: 1, startT: 0, passedBy: -1, passedT: 0, wearBias: 0, lapValid: true, outAt: 0,
    });
    // Rare poor launch (stall / wheelspin)
    const car = st.cars[st.cars.length - 1];
    if (rng.chance(0.025 + (e.d.rookie ? 0.015 : 0) + (st.w.water > 0.3 ? 0.02 : 0))) { car.launch *= 0.45; car.react += rng.range(0.4, 2.5); }
    // Rare jump start: impatient, undisciplined drivers occasionally move before the lights
    else if (rng.chance(0.006 + n01(e.d.aggression) * 0.008 + (1 - n01(e.d.discipline)) * 0.006)) { car.react = rng.range(-0.3, 0.02); car.jump = true; }
  });
  st.order = st.cars.map((_, k) => k);
  attachCache(st, setup, tr);
  pushEvent(st, { t: 0, lap: 0, kind: 'grid', detail: st.startWeather, sig: 0.2 });
  return st;
}

/** Qualifying session using the same car physics. Cars leave the pit lane spread out and run solo laps. */
export function createQuali(setup: WeekendSetup, tr: Track): RaceState {
  const n = setup.entrants.length;
  const order = setup.entrants.map((_, k) => k);
  const fake = createRace(setup, tr, order);
  const rng = streamFor(setup.seed, 'quali');
  const st: RaceState = { ...fake, kind: 'quali', rng: rng.s, wrng: streamFor(setup.seed, 'weather-quali').s, phase: 'grid', lightsT: 5, events: [], feed: [] };
  // qualifying happens before the race: use the day's initial weather (not the race-time evolution)
  st.w = initialWeather(streamFor(setup.seed, 'weather-day'), setup.month);
  const f = setup.rules.qualiFormat;
  const segs = f === 'knockout' ? 3 : 1;
  st.q = { format: f, seg: 1, segs, runLaps: f === 'single-lap' ? 1 : f === 'knockout' ? 2 : 3, best: order.map(() => Infinity), segBest: [[], [], []].map(() => order.map(() => Infinity)), eliminated: order.map(() => false), segStart: 5, flying: order.map(() => 0), done: false, gridOrder: [] };
  st.laps = 999; st.maxT = 99999;
  const release = rng.shuffle(order.slice());
  const gap = f === 'single-lap' ? 25 : 9;
  st.cars.forEach((car) => { car.lap = -1; car.v = 0; });
  release.forEach((k, idx) => {
    const car = st.cars[k];
    positionInPits(st, tr, car, idx);
    car.startT = 5 + idx * gap;
    car.fuel = (setup.entrants[car.i].c.fuelPerKm * tr.length / 1000) * (st.q!.runLaps + 2.5); // out-lap, flying laps, in-lap and a margin
    car.tyre = setup.rules.compounds[setup.rules.compounds.length - 1];
    st.q!.flying[k] = st.q!.runLaps;
  });
  attachCache(st, setup, tr);
  const c = caches.get(st)!;
  for (let k = 0; k < st.cars.length; k++) { st.cars[k].tyre = qualiTyre(st, c); refreshProfile(st, c, k, true); }
  const unsafe = isUnsafe(st.w);
  if (unsafe && f !== 'ballot') {
    // session cannot run safely: grid set by championship order (a recorded, explicit rule)
    st.q.done = true; st.phase = 'done';
    st.q.gridOrder = order.slice().sort((a, b) => setup.entrants[a].champPos - setup.entrants[b].champPos);
    pushEvent(st, { t: 0, lap: 0, kind: 'qcancelled', detail: `qualifying cancelled (${unsafe}); grid in championship order`, sig: 0.8 });
    return st;
  }
  if (f === 'ballot') { st.q.done = true; st.q.gridOrder = rng.shuffle(order.slice()); st.phase = 'done'; pushEvent(st, { t: 0, lap: 0, kind: 'ballot', detail: 'grid drawn by ballot', sig: 0.5 }); }
  void n;
  return st;
}
function positionInPits(st: RaceState, tr: Track, car: CarState, idx: number) {
  car.mode = 'pit'; car.pitPhase = 3; car.s = tr.wrap(tr.pitEntry + tr.pitSpan * (0.35 + 0.01 * (idx % 10))); car.dist = car.s - tr.length; car.lap = -1; car.v = 0; car.pitReq = null;
  car.lat = tr.pitSide * (tr.w[tr.idx(car.s)] / 2 + 3);
}
function qualiTyre(st: RaceState, c: Cache): string {
  const r = c.setup.rules;
  if (r.wetTyres.length) { if (st.w.water > 0.7 && r.wetTyres.includes('wet')) return 'wet'; if (st.w.water > 0.22) return r.wetTyres.includes('inter') ? 'inter' : r.wetTyres[0]; }
  return r.compounds.includes('soft') ? 'soft' : r.compounds[r.compounds.length - 1];
}

function stepQualiLogic(st: RaceState, c: Cache) {
  const q = st.q!;
  if (q.done) return;
  const tr = c.tr;
  // segment ends when every active car has finished its runs (or a time cap passes)
  let active = 0;
  for (let k = 0; k < st.cars.length; k++) { const car = st.cars[k]; if (!q.eliminated[k] && car.mode !== 'out' && !car.ret) active++; }
  const cap = st.t - q.segStart > 1500;
  if (active > 0 && !cap) return;
  const ranked = st.cars.map((_, k) => k).filter((k) => !q.eliminated[k]).sort((a, b) => q.segBest[q.seg - 1][a] - q.segBest[q.seg - 1][b]);
  if (q.format === 'knockout' && q.seg < q.segs) {
    const n = st.cars.length;
    const keep = q.seg === 1 ? Math.max(10, Math.ceil(n * 0.72)) : Math.min(10, Math.ceil(n * 0.42));
    ranked.forEach((k, idx) => { if (idx >= keep) q.eliminated[k] = true; });
    pushEvent(st, { t: st.t, lap: 0, kind: 'qseg', value: q.seg, detail: `Q${q.seg} complete`, sig: 0.5 });
    q.seg++; q.segStart = st.t + 30;
    const rng = c.rng;
    let idx = 0;
    for (const k of rng.shuffle(ranked.slice(0, keep))) {
      const car = st.cars[k];
      positionInPits(st, tr, car, idx);
      car.startT = st.t + 30 + idx * 9; car.ret = null; car.inc = null; q.flying[k] = q.runLaps; idx++;
      car.tyre = qualiTyre(st, c); car.wear = 0; car.fuel = (c.setup.entrants[car.i].c.fuelPerKm * tr.length / 1000) * (q.runLaps + 2.5); refreshProfile(st, c, k, true);
    }
    return;
  }
  // final order: later segments first, then earlier eliminations by their segment times
  const order: number[] = [];
  for (let sgi = q.segs - 1; sgi >= 0; sgi--) {
    const inSeg = st.cars.map((_, k) => k).filter((k) => !order.includes(k) && (sgi === 0 || !q.eliminated[k] || q.segBest[sgi][k] < Infinity));
    const ranked2 = inSeg.filter((k) => q.segBest[sgi][k] < Infinity || sgi === 0).sort((a, b) => q.segBest[sgi][a] - q.segBest[sgi][b]);
    for (const k of ranked2) if (!order.includes(k)) order.push(k);
  }
  for (let k = 0; k < st.cars.length; k++) if (!order.includes(k)) order.push(k);
  q.gridOrder = order; q.done = true;
  st.phase = 'done';
  pushEvent(st, { t: st.t, lap: 0, kind: 'qend', a: order[0], value: q.best[order[0]], sig: 0.8 });
}

export function attachCache(st: RaceState, setup: WeekendSetup, tr: Track): Cache {
  const c: Cache = { keys: new Float64Array(st.cars.length), lastBuild: st.cars.map(() => -99), pp: [], prof: [], key: [], lapEst: [], tr, setup, rng: Rng.wrap(st.rng), wrng: Rng.wrap(st.wrng), baseProf: new Float64Array(0), carsPerMin: 0 };
  caches.set(st, c);
  for (let k = 0; k < st.cars.length; k++) { c.prof.push(new Float64Array(tr.n)); c.key.push(-1); c.lapEst.push(0); c.pp.push(null as any); refreshProfile(st, c, k, true); }
  // a reference profile (median car) used for safety car pace
  c.baseProf = c.prof[0].slice();
  return c;
}
export function cacheOf(st: RaceState): Cache | undefined { return caches.get(st); }

// ---------------------------------------------------------------------------- grip & profiles
function driverCornerFactor(e: EntrantSetup, car: CarState, st: RaceState, quali = false): number {
  const d = e.d;
  let f = 1 + 0.02 * n01(d.pace) + 0.006 * d.form + 0.01 * (car.conf - 0.5) + (d.health - 1) * 0.08 + 0.0035 * e.fit;
  f += d.trackExp >= 3 ? 0 : -0.004 * (3 - d.trackExp) * (1 - d.adaptability / 140);
  if (d.starts < 12) f -= 0.003 * (1 - d.starts / 12) * (1.2 - d.adaptability / 100);
  f += 0.004 * (e.engineering - 0.5);
  if (quali) f += 0.008 * n01(d.quali);
  f -= car.fatigue * 0.02;
  return f;
}

export function tyreGrip(car: CarState, e: EntrantSetup, w: WeatherState): number {
  const T = TYRES[car.tyre] ?? TYRES.medium;
  let g = T.grip;
  const wr = car.wear;
  g *= 1 - 0.07 * wr - (wr > 0.72 ? (wr - 0.72) * 1.1 : 0);
  const dt = (car.ttemp - T.opt) / 45;
  g *= clamp(1 - T.sens * 0.08 * dt * dt, 0.93, 1);
  const tyreKind = car.tyre === 'inter' || car.tyre === 'wet' || car.tyre === 'treaded' ? car.tyre : 'dry';
  g *= wetGrip(tyreKind, w.water, e.c.wetHandling, n01(e.d.wet));
  if (car.puncture) g *= 0.55;
  return g;
}

function paramsFor(st: RaceState, c: Cache, k: number, quali = false): ProfileParams {
  const car = st.cars[k];
  const e = c.setup.entrants[car.i];
  const lay = c.setup.layout;
  const rubber = 1 + 0.02 * st.w.rubber;
  const mu = e.c.mechGrip * lay.grip * rubber * tyreGrip(car, e, st.w) * driverCornerFactor(e, car, st, quali) * (1 - car.dmgSusp * 0.08);
  const pushF = 0.985 + 0.015 * car.push;
  return {
    powerKW: e.c.powerKW * (1 - car.limp) * (1 - 0.02 * car.engWear),
    mass: e.c.massKg + 75 + car.fuel,
    cdA: e.c.cdA * (1 + car.dmgAero * 0.05),
    clA: e.c.clA * (1 - car.dmgAero * 0.35),
    mu: mu * pushF,
    brakeG: e.c.brakeG * (1 + 0.02 * n01(e.d.racecraft) + 0.015 * n01(e.d.pace)),
    traction: clamp(0.5 + 0.14 * e.c.drivability + 0.02 * n01(e.d.mechSympathy), 0.35, 0.8),
  };
}

function refreshProfile(st: RaceState, c: Cache, k: number, force = false) {
  const p = paramsFor(st, c, k);
  c.pp[k] = p;
  // rebuild the speed profile only when grip/power/mass moved by more than ~1%
  const key = p.mu * 100 + (p.powerKW / 1000) * 30 + (p.mass / 1000) * 20;
  if (!force && (Math.abs(key - c.key[k]) < 1 || st.t - c.lastBuild[k] < 5)) return;
  c.lastBuild[k] = st.t;
  computeProfile(c.tr, p, c.prof[k]);
  c.key[k] = key;
  c.lapEst[k] = lapTimeOf(c.tr, c.prof[k]);
}

// ---------------------------------------------------------------------------- events
function pushEvent(st: RaceState, ev: FeedItem & { a?: number; b?: number }) {
  st.feed.push(ev);
  const c = caches.get(st);
  const rec: RaceEventRec = { t: +ev.t.toFixed(1), lap: ev.lap, kind: ev.kind, sig: ev.sig };
  if (ev.a !== undefined && c) rec.a = c.setup.entrants[st.cars[ev.a].i].driverId;
  if (ev.b !== undefined && c) rec.b = c.setup.entrants[st.cars[ev.b].i].driverId;
  if (ev.pos !== undefined) rec.pos = ev.pos;
  if (ev.where) rec.where = ev.where;
  if (ev.detail) rec.detail = ev.detail;
  if (ev.value !== undefined) rec.value = +ev.value.toFixed(3);
  st.events.push(rec);
}
function lapOf(st: RaceState) { return st.lapNow; }
function computeLap(st: RaceState) { let m = 0; for (const c of st.cars) if (c.lap + 1 > m && !c.ret) m = c.lap + 1; st.lapNow = Math.min(Math.max(1, m), st.laps); }

// ---------------------------------------------------------------------------- main step
export function stepRace(st: RaceState): void {
  const c = caches.get(st)!;
  const tr = c.tr, setup = c.setup, rng = c.rng;
  st.t += DT; st.step++;

  // weather
  st.wAcc += DT;
  if (st.wAcc >= WEATHER_TICK) {
    st.wAcc -= WEATHER_TICK;
    const running = st.cars.filter((x) => x.mode === 'run').length;
    const lapT = c.lapEst[0] || 100;
    c.carsPerMin = (running * 60) / lapT;
    const prevRain = st.w.rain, prevWater = st.w.water;
    stepWeather(st.w, c.wrng, WEATHER_TICK, st.phase === 'run' || st.phase === 'sc' ? c.carsPerMin : 0);
    st.maxRain = Math.max(st.maxRain, st.w.rain);
    if (prevRain < 0.3 && st.w.rain >= 0.3 && st.phase !== 'grid') { st.changeable = true; pushEvent(st, { t: st.t, lap: lapOf(st), kind: 'rain', detail: st.w.rain > 2 ? 'Rain is falling across the circuit' : 'Light rain has begun', sig: SIG.weather }); }
    if (prevRain >= 0.3 && st.w.rain < 0.3) pushEvent(st, { t: st.t, lap: lapOf(st), kind: 'rainstop', detail: 'The rain has eased', sig: 0.4 });
    if (prevWater > 0.2 && st.w.water <= 0.2) pushEvent(st, { t: st.t, lap: lapOf(st), kind: 'drying', detail: 'A dry line is appearing', sig: 0.45 });
    // periodic parameter refresh (grip changes with water, rubber, tyre temperature); profiles rebuilt only on real change
    for (let k = 0; k < st.cars.length; k++) if (st.cars[k].mode === 'run' || st.cars[k].mode === 'pit') refreshProfile(st, c, k);
    // conditions too dangerous -> red flag (or delay)
    const unsafe = isUnsafe(st.w);
    if (unsafe && (st.phase === 'run' || st.phase === 'sc')) redFlag(st, c, `conditions (${unsafe})`);
  }

  switch (st.phase) {
    case 'delay': {
      if (st.t >= st.delayUntil) {
        if (!isUnsafe(st.w)) { st.phase = 'grid'; st.lightsT = st.t + 60; pushEvent(st, { t: st.t, lap: 0, kind: 'resume', detail: 'Conditions have improved; the start is on', sig: 0.6 }); }
        else if (st.t > 7200) { st.phase = 'postponed'; st.endNote = `postponed: ${isUnsafe(st.w)}`; pushEvent(st, { t: st.t, lap: 0, kind: 'postponed', detail: st.endNote, sig: 1 }); }
        else st.delayUntil = st.t + 900;
      }
      return;
    }
    case 'grid': {
      if (st.kind === 'quali' && st.t >= st.lightsT) { st.phase = 'run'; pushEvent(st, { t: st.t, lap: 0, kind: 'qstart', detail: st.q!.format, sig: 0.5 }); return; }
      if (st.t >= st.lightsT) {
        st.phase = 'run';
        for (const car of st.cars) { if (car.mode === 'grid') { car.mode = 'run'; car.startT = st.lightsT + car.react; } }
        st.startLap = 0;
        pushEvent(st, { t: st.t, lap: 1, kind: 'start', detail: st.w.water > 0.3 ? 'wet start' : '', sig: SIG.start });
        st.cars.forEach((car, k) => { if (car.jump) { car.jump = false; penalise(st, c, k, 'jump start', 0.8); } });
      }
      return;
    }
    case 'red': {
      const r = st.red!;
      for (const car of st.cars) { if (!car.ret && car.mode !== 'fin') { car.v = 0; } }
      if (st.t >= r.resumeAt) {
        const unsafe = isUnsafe(st.w);
        const leader = st.cars[st.order[0]];
        const done = (leader.lap + 1) / st.laps;
        if (unsafe && st.t - r.since < 3600 * 1.5) { r.resumeAt = st.t + 600; return; }
        if (unsafe || done >= 0.75 || !setup.rules.redFlagRestart) { endRace(st, c, unsafe ? `abandoned after red flag (${unsafe})` : 'not restarted after red flag'); return; }
        restartFromRed(st, c);
      }
      return;
    }
    case 'done': case 'abandoned': case 'postponed': return;
  }

  // ------------------------------------------------ running phases: run / sc / fin
  if (st.phase === 'sc') stepSafetyCar(st, c);
  if (st.yellows.length && st.yellows.some((y) => y.until <= st.t)) st.yellows = st.yellows.filter((y) => y.until > st.t);
  if (st.step % 10 === 0) computeLap(st);

  // sort running order by race distance (insertion sort: order changes little per step)
  const cars = st.cars, ord = st.order;
  const keys = c.keys;
  for (let k = 0; k < cars.length; k++) keys[k] = rankKey(cars[k]);
  for (let a = 1; a < ord.length; a++) {
    const x = ord[a], dx = keys[x];
    let b = a - 1;
    while (b >= 0 && keys[ord[b]] < dx) { noteSwap(st, c, x, ord[b]); ord[b + 1] = ord[b]; b--; }
    ord[b + 1] = x;
  }

  for (let oi = 0; oi < ord.length; oi++) {
    const k = ord[oi];
    const car = cars[k];
    if (car.mode === 'out' || (car.mode === 'fin' && car.v < 0.5)) continue;
    stepCar(st, c, k, oi);
  }
  // hazards once per second
  st.hazardClock += DT;
  if (st.hazardClock >= 1) { st.hazardClock -= 1; for (const k of ord) hazards(st, c, k); }

  if (st.kind === 'quali') { stepQualiLogic(st, c); return; }
  // positions, gaps, lead changes
  updateTiming(st, c);
  confirmSwaps(st, c);
  checkFinish(st, c);
}

function rankKey(car: CarState): number {
  if (car.mode === 'fin') return 1e9 - (car.finT ?? 0); // finished cars ranked by finish order (laps equal at finish)
  if (car.ret) return car.dist - 1e7; // retired below running cars
  return car.dist;
}

// ---------------------------------------------------------------------------- per-car motion
function stepCar(st: RaceState, c: Cache, k: number, oi: number) {
  const tr = c.tr, setup = c.setup, rng = c.rng;
  const car = st.cars[k];
  const e = setup.entrants[car.i];
  const L = tr.length;
  const i = tr.idx(car.s);
  const prof = c.prof[k];
  const dims = carDims(e);

  // start reaction (also after a red-flag restart)
  if (st.t < car.startT) return;
  // recovered retired cars leave the circuit
  if (car.ret) { if (car.outAt === 0) car.outAt = st.t + 45 + (tr.w[i] < 7.5 ? 60 : 20) + c.rng.range(0, 60); else if (st.t > car.outAt) { car.mode = 'out'; car.v = 0; return; } }
  // stationary in the pit box
  if (car.mode === 'pit' && car.pitPhase === 2) { car.v = 0; pitLogic(st, c, k, car.s); return; }
  const P = c.pp[k];

  // ---- target speed
  const look = car.v * DT * 1.5 + 2;
  const iA = tr.idx(car.s + look);
  let vT = prof[iA] < prof[i] ? prof[iA] : prof[i];
  vT *= car.paceMult;
  const inCorner = tr.inCorner[i] === 1;
  // off-line penalty in corners (defending / attacking lines)
  if (inCorner) { const off = Math.abs(car.lat - tr.rl[i]); vT *= 1 - clamp(off / Math.max(3, tr.w[i]), 0, 1) * 0.06; }
  // strategy pace (conservation) on straights barely matters; mostly in corners via push
  if (car.mode === 'fin') vT *= 0.55;
  if (st.kind === 'quali' && (car.lap < 0 || st.q!.flying[k] <= 0)) vT *= 0.86;
  // flags
  for (const y of st.yellows) if (inSpan(tr, car.s, y.s0, y.s1)) { vT *= 0.9; break; }
  if (car.blueT > st.t) vT *= tr.straightness[i] > 0.6 ? 0.93 : 0.97;
  if (car.yieldT > st.t) vT *= 0.9;
  if (car.inc) {
    const inc = car.inc;
    if (st.t > inc.t + inc.dur) car.inc = null;
    else vT = Math.min(vT, inc.vCap);
  }
  if (car.ret) { vT = 0; }
  // pit lane
  const pitLimit = (setup.rules.pitKph ?? 70) / 3.6;
  if (car.mode === 'pit') vT = Math.min(vT, pitLimit);
  else if (car.pitReq && !car.ret) {
    let dIn = tr.pitEntry - car.s; if (dIn < 0) dIn += L;
    if (dIn < 140) { const vb = dsqrt(pitLimit * pitLimit + 2 * 14 * dIn); if (vb < vT) vT = vb; }
  }
  // safety car queueing
  if (st.phase === 'sc' && car.mode !== 'pit') vT = Math.min(vT, scTargetSpeed(st, c, car, oi));

  // ---- interaction with the car ahead
  let vFollow = Infinity;
  let dragMult = 1;
  let blocker = -1, blockerGap = Infinity;
  let leadCar = -1, leadGap = Infinity;
  if (car.mode === 'run' || car.mode === 'fin') {
    for (let j = oi - 1, n = 0; j >= 0 && n < 4; j--, n++) {
      const ok = st.order[j];
      const o = st.cars[ok];
      if (o.mode === 'out' || o.mode === 'pit' || o.mode === 'fin' || (o.ret && o.v < 3)) continue;
      let gap = o.s - car.s; if (gap < -L / 2) gap += L; if (gap > L / 2) gap -= L;
      gap -= dims.len;
      if (gap > 160) break;
      if (gap < -dims.len * 1.8) continue;
      if (gap < leadGap && gap > -dims.len) { leadGap = gap; leadCar = ok; }
      const latSep = Math.abs(o.lat - car.lat);
      if (latSep < dims.w + 0.35 && gap > -dims.len * 0.6 && gap < blockerGap) { blocker = ok; blockerGap = gap; }
    }
    // slipstream on straights
    if (leadCar >= 0 && leadGap < 45 && tr.straightness[i] > 0.7 && Math.abs(st.cars[leadCar].lat - car.lat) < dims.w * 1.2) dragMult = 1 - (0.1 + 0.16 * clamp((e.c.cdA - 0.6) / 0.8, 0, 1)) * (1 - leadGap / 45);
    // dirty air in corners
    if (leadCar >= 0 && leadGap < 28 && inCorner && e.c.clA > 0.5) vT *= 1 - e.c.aeroWindow * clamp(e.c.clA / 4.5, 0, 1) * 0.05 * (1 - leadGap / 28);
    if (blocker >= 0 && st.kind === 'quali') {
      const o = st.cars[blocker];
      if (q_flying(st, k) && !q_flying(st, blocker)) o.blueT = st.t + 5;
      blocker = -1;
    }
    if (blocker >= 0) {
      const o = st.cars[blocker];
      const oe = setup.entrants[o.i];
      // overtaking decision & defence
      if (st.phase === 'run' && car.mode === 'run') considerAttack(st, c, k, blocker, blockerGap, i);
      if (car.atk !== blocker) {
        // car-following (IDM-like) behind a car in the same lane
        const a = Math.max(2, accelAt(P, car.v, tr.k[i], tr.grade[i], dragMult));
        const b = 12;
        const s0 = 1.2 + (st.phase === 'sc' ? 8 : 0);
        const dv = car.v - o.v;
        const sStar = s0 + car.v * (st.phase === 'sc' ? 0.5 : 0.18) + (car.v * dv) / (2 * dsqrt(a * b));
        const gapPos = Math.max(0.1, blockerGap);
        const ratio = sStar / gapPos;
        const acc = a * (1 - ratio * ratio);
        vFollow = Math.max(0, car.v + clamp(acc, -brakeAt(P, car.v, tr.k[i], tr.grade[i]) * 1.1, a) * DT);
        void oe;
      }
    } else if (car.atk >= 0) { car.atk = -1; }
  }

  // ---- speed integration
  let v = car.v;
  if (car.mode === 'grid') return;
  // side by side into a single-file section: the car behind gives way
  if (car.mode === 'run' && (st.phase === 'sc' || !tr.passable[tr.idx(car.s + 20 + car.v * 0.6)]) && car.atk < 0) {
    for (let j = Math.max(0, oi - 2); j < oi; j++) {
      const o = st.cars[st.order[j]];
      if (o.mode !== 'run' || o.ret) continue;
      const dd = o.dist - car.dist;
      if (dd > 0 && dd < dims.len + 0.5 && Math.abs(o.lat - car.lat) >= dims.w + 0.2) { car.yieldT = st.t + 0.5; vT = Math.min(vT, o.v * 0.97); }
    }
  }
  if (v < vT) {
    let a = accelAt(P, v, tr.k[i], tr.grade[i], dragMult);
    if (st.t - car.startT < 4) a *= car.launch;
    v = Math.min(vT, v + a * DT);
  } else {
    const b = brakeAt(P, v, tr.k[i], tr.grade[i]);
    v = Math.max(vT, v - b * DT);
  }
  if (vFollow < v) v = vFollow;
  if (v < 0) v = 0;
  car.v = v;

  // ---- lateral
  lateral(st, c, k, oi, i, blocker);

  // ---- advance
  const ds = v * DT;
  const prevS = car.s;
  car.s += ds; car.dist += ds;
  // hard no-overlap guard in the same lane
  if (blocker >= 0 && car.atk !== blocker) {
    const o = st.cars[blocker];
    if (Math.abs(o.lat - car.lat) < dims.w + 0.25 && o.dist - car.dist < dims.len + 0.4 && o.dist - car.dist > -dims.len * 0.5) {
      const back = Math.min(ds, car.dist - (o.dist - dims.len - 0.4));
      car.s -= back; car.dist -= back; car.v = Math.min(car.v, o.v);
    }
  }
  if (car.s >= L) { car.s -= L; crossLine(st, c, k); }
  else if (car.s < 0) car.s += L;
  // sector timing
  const sec = tr.sectorOf(car.s);
  if (sec !== car.sec && car.lap >= 0) {
    const tSec = st.t - car.secStart;
    if (car.sec >= 0 && car.sec < 3 && tSec > 5) car.secBest[car.sec] = Math.min(car.secBest[car.sec], tSec);
    car.sec = sec; car.secStart = st.t;
  }
  // corner entry: consistency draw and mistakes
  const ci = tr.cornerAt[tr.idx(car.s)];
  if (ci >= 0 && ci !== car.lastCornerI && car.mode === 'run' && !car.ret) {
    const cd = tr.corners[ci];
    let dToApex = cd.sApex - car.s; if (dToApex < 0) dToApex += L;
    if (dToApex < 90) { car.lastCornerI = ci; cornerEntry(st, c, k, ci); }
  }
  // tyres, fuel, wear
  consume(st, c, k, ds, i);
  // pit lane transitions
  pitLogic(st, c, k, prevS);
  void rng;
}

function q_flying(st: RaceState, k: number) { const car = st.cars[k]; return car.lap >= 0 && car.mode === 'run' && st.q!.flying[k] > 0; }
function inSpan(tr: Track, s: number, s0: number, s1: number) { return s0 <= s1 ? s >= s0 && s <= s1 : s >= s0 || s <= s1; }

function lateral(st: RaceState, c: Cache, k: number, oi: number, i: number, blocker: number) {
  const tr = c.tr, car = st.cars[k];
  const e = c.setup.entrants[car.i];
  const dims = carDims(e);
  const half = tr.w[i] / 2 - dims.w / 2 - 0.25;
  let target = tr.rl[tr.idx(car.s + 25)];
  if (car.mode === 'pit') target = tr.pitSide * (tr.w[i] / 2 + 3);
  else if (car.ret || (car.inc && car.inc.kind !== 'yield')) target = car.inc ? car.inc.latTo : Math.sign(car.lat || 1) * (tr.w[i] / 2 - dims.w / 2);
  else if (car.atk >= 0) { const o = st.cars[car.atk]; target = o.lat + car.atkSide * (dims.w + 0.8); }
  else if (car.blueT > st.t) target = Math.sign(tr.rl[i] || 1) * -half * 0.9;
  else if (car.defLap === car.lap && car.defUsed && car.latT !== 0) target = car.latT;
  if (st.phase === 'sc' && car.mode === 'run') target = tr.rl[i];
  // pit exit blend
  if (car.mode === 'run' && car.lap >= 0) {
    let dOut = car.s - c.tr.pitExit; if (dOut < 0) dOut += tr.length;
    if (car.pitPhase === 4 && dOut < 80) target = target + (tr.pitSide * (tr.w[i] / 2) - target) * (1 - dOut / 80);
  }
  if (car.mode !== 'pit') target = clamp(target, -half, half);
  // avoid cars alongside
  const L = tr.length;
  for (let j = Math.max(0, oi - 3); j < Math.min(st.order.length, oi + 4); j++) {
    const ok = st.order[j]; if (ok === k) continue;
    const o = st.cars[ok]; if (o.mode === 'pit' || o.mode === 'out') continue;
    let ds = o.s - car.s; if (ds < -L / 2) ds += L; if (ds > L / 2) ds -= L;
    if (Math.abs(ds) > dims.len + 0.5) continue;
    const need = dims.w + 0.3;
    const d = car.lat - o.lat;
    if (Math.abs(d) < need + 0.6) {
      // keep to our side of the other car
      const side = d === 0 ? (k < ok ? -1 : 1) : Math.sign(d);
      const bound = o.lat + side * need;
      if (side > 0 && target < bound) target = bound;
      if (side < 0 && target > bound) target = bound;
    }
  }
  if (car.mode !== 'pit') target = clamp(target, -tr.w[i] / 2 + dims.w / 2 - 0.2, tr.w[i] / 2 - dims.w / 2 + 0.2);
  const rate = (car.mode === 'pit' ? 3 : 2.2 + car.v * 0.02) * DT;
  car.lat += clamp(target - car.lat, -rate, rate);
  void blocker;
}

// ---------------------------------------------------------------------------- overtaking
function passableAhead(tr: Track, s: number, _dist: number): number { return tr.passAhead[tr.idx(s)]; }
function nextBrakingZone(tr: Track, s: number, maxD: number): number { const d = tr.toCorner[tr.idx(s)]; return d <= maxD ? d : Infinity; }

function considerAttack(st: RaceState, c: Cache, k: number, j: number, gap: number, i: number) {
  const tr = c.tr, rng = c.rng, setup = c.setup;
  const A = st.cars[k], B = st.cars[j];
  const ea = setup.entrants[A.i], eb = setup.entrants[B.i];
  const dims = carDims(ea);
  if (A.atk === j) {
    resolveBattle(st, c, k, j, gap, i);
    return;
  }
  if (A.ret || B.ret || A.inc || A.mode !== 'run') return;
  for (const y of st.yellows) if (inSpan(tr, A.s, y.s0, y.s1 + 100)) return;
  if (gap > 30 + A.v * 0.25) return;
  // lapping traffic
  const lapped = A.dist - B.dist > tr.length * 0.5;
  if (lapped && setup.rules.blueFlags) { B.blueT = st.t + 6; }
  // team orders
  if (!lapped && setup.rules.teamOrders && ea.teammate === B.i && ea.orders === 'second' && eb.orders === 'lead') return;
  const zone = passableAhead(tr, A.s, 120);
  const bz = nextBrakingZone(tr, A.s, 260);
  const straightNow = tr.straightness[i] > 0.6;
  if (zone < 0.5 && !(bz < 60 && tr.w[i] > 6.5)) return;
  // evidence of a real speed advantage
  const closing = A.v - B.v;
  const paceAdv = c.lapEst[j] - c.lapEst[k]; // s per lap (positive = A quicker on current tyres/fuel)
  const tyreAdv = tyreGrip(A, ea, st.w) - tyreGrip(B, eb, st.w);
  const troubled = !!B.inc || B.blueT > st.t || B.limp > 0 || B.puncture;
  const key = k * 64 + j;
  if (!troubled && !lapped && st.tried[key] !== undefined && st.tried[key] >= A.lap) return; // one go per lap
  if (!troubled && !lapped && A.passedBy === j && st.t - A.passedT < 45 && paceAdv < 1) return; // no instant counter-attack
  let want = 0;
  want += clamp(closing, -3, 6) * 0.18 + clamp(paceAdv, -2, 3) * 0.45 + tyreAdv * 6;
  if (straightNow && gap < 25 && closing > 0.5) want += 0.2; // in the tow
  if (bz < 180 && bz > 40 && gap < 12) want += 0.15; // a braking zone to dive into
  if (troubled) want += 1.5;
  if (lapped) want += 2;
  // personality and situation
  const aggr = ea.d.aggression / 100, craft = ea.d.racecraft / 100;
  want += (aggr - 0.5) * 0.35 + (craft - 0.5) * 0.2;
  const riv = ea.rivals.find((r) => r[0] === B.i);
  if (riv) want += 0.2 * riv[1];
  if (ea.contender && ea.champPos === 1 && !lapped) want -= 0.15 * (1 - aggr);
  if (A.push < 0.95) want -= 0.3;
  if (want < 0.6) return;
  if (!rng.chance(clamp((want - 0.6) * 0.3, 0, 0.5))) return;
  if (!lapped) st.tried[key] = A.lap;
  // pull out: inside of the next corner, else the side away from the car ahead
  let side: number;
  if (bz < 220) { const cd = tr.corners[tr.cornerAt[tr.idx(A.s + bz)]]; side = cd && cd.dir === 'L' ? -1 : 1; }
  else side = B.lat > tr.rl[i] ? -1 : 1;
  const half = tr.w[tr.idx(A.s + 30)] / 2 - dims.w / 2 - 0.25;
  if (Math.abs(B.lat + side * (dims.w + 0.8)) > half) side = -side;
  if (Math.abs(B.lat + side * (dims.w + 0.8)) > half + 0.4) return; // no room either side
  A.atk = j; A.atkT = st.t; A.atkSide = side;
  // defender reaction: one defensive move per lap towards the attacked side
  const def = eb.d.defence / 100, bAggr = eb.d.aggression / 100;
  if (!lapped && !B.defUsed && bz < 250 && rng.chance(0.25 + 0.5 * def * (0.6 + bAggr * 0.6))) {
    B.defUsed = true; B.defLap = B.lap;
    B.latT = clamp(B.lat + side * (dims.w + 0.4), -half, half);
  }
}

function resolveBattle(st: RaceState, c: Cache, k: number, j: number, gap: number, i: number) {
  const tr = c.tr, rng = c.rng, setup = c.setup;
  const A = st.cars[k], B = st.cars[j];
  const ea = setup.entrants[A.i], eb = setup.entrants[B.i];
  const dims = carDims(ea);
  const latSep = Math.abs(A.lat - B.lat);
  const rel = A.dist - B.dist; // < 0 while A is behind
  const overlap = (rel + dims.len) / dims.len; // 0 nose-to-tail .. 1 level .. 2 clear ahead
  if (overlap >= 1.9) { finishPass(st, c, k, j, 'drag'); return; }
  // too long without progress or fell back: abort
  if (st.t - A.atkT > 9 || gap > 40) { A.atk = -1; return; }
  // single-file corner approaching: somebody must yield
  const bz = nextBrakingZone(tr, Math.max(A.s, B.s), 40);
  const narrow = !tr.passable[tr.idx(A.s + 25)];
  if ((bz < 30 || narrow) && latSep > dims.w * 0.6) {
    if (overlap < 0.35) { A.atk = -1; A.yieldT = st.t + 0.8; return; }
    // late-braking contest
    const brA = n01(ea.d.racecraft) * 0.6 + n01(ea.d.pace) * 0.3 + (ea.d.aggression - 50) / 60;
    const brB = n01(eb.d.defence) * 0.6 + n01(eb.d.pace) * 0.3 + (eb.d.aggression - 50) / 80;
    const tyre = (tyreGrip(A, ea, st.w) - tyreGrip(B, eb, st.w)) * 10;
    const lapped = A.dist - B.dist > tr.length * 0.5;
    const pWin = lapped ? 0.97 : 1 / (1 + dexp(-(3.2 * (overlap - 0.7) + 0.9 * (brA - brB) + tyre)));
    const win = rng.chance(pWin);
    // contact risk grows with aggression, narrowness, wet and rivalry; friendship calms it
    const riv = (ea.rivals.find((r) => r[0] === B.i)?.[1] ?? 0) + (eb.rivals.find((r) => r[0] === A.i)?.[1] ?? 0);
    const fr = (ea.friends.find((r) => r[0] === B.i)?.[1] ?? 0);
    let pC = 0.012 + 0.04 * ((ea.d.aggression + eb.d.aggression) / 200 - 0.45) + 0.05 * clamp(st.w.water, 0, 1) + (narrow ? 0.02 : 0) + 0.02 * riv - 0.015 * fr;
    pC *= lapped ? 0.3 : 1;
    pC *= 1.25 - (ea.d.discipline + eb.d.discipline) / 400;
    if (rng.chance(clamp(pC, 0.002, 0.18))) { contact(st, c, k, j, win ? 'b-closed-door' : 'a-dive'); A.atk = -1; return; }
    if (win) finishPass(st, c, k, j, reasonFor(st, c, k, j, true));
    else { A.atk = -1; A.yieldT = st.t + 0.7; }
    return;
  }
  // side by side on a straight: nothing to resolve yet (speeds decide)
  if (overlap >= 1.25 && latSep > dims.w) finishPass(st, c, k, j, reasonFor(st, c, k, j, false));
}

function reasonFor(st: RaceState, c: Cache, k: number, j: number, braking: boolean): string {
  const A = st.cars[k], B = st.cars[j];
  const ea = c.setup.entrants[A.i], eb = c.setup.entrants[B.i];
  if (A.dist - B.dist > c.tr.length * 0.5) return 'lapping';
  if (B.inc) return 'mistake';
  if (B.limp > 0 || B.dmgAero > 0.3 || B.puncture) return 'problem';
  const tg = tyreGrip(A, ea, st.w) - tyreGrip(B, eb, st.w);
  if (st.w.water > 0.15 && A.tyre !== B.tyre) return 'tyre choice in the wet';
  if (tg > 0.025) return 'fresher tyres';
  if (braking) return 'braking';
  return 'slipstream';
}

function finishPass(st: RaceState, c: Cache, k: number, j: number, reason: string) {
  const A = st.cars[k], B = st.cars[j];
  A.atk = -1;
  B.yieldT = Math.max(B.yieldT, st.t + 0.4);
  // the reason is attached when the running order actually changes (see confirmSwaps)
  st.pending.push({ a: k, b: j, t: st.t, reason, lap: lapOf(st), where: c.tr.cornerName(A.s) });
}

/** Position changes between running cars, confirmed after they persist for 2 s. */
function noteSwap(st: RaceState, c: Cache, x: number, y: number) {
  const A = st.cars[x], B = st.cars[y];
  if (A.ret || B.ret || A.mode === 'out' || B.mode === 'out' || A.mode === 'fin' || B.mode === 'fin') return;
  if (st.phase !== 'run' && st.phase !== 'sc' && st.phase !== 'fin') return;
  const key = x < y ? `${x}-${y}` : `${y}-${x}`;
  st.swapT[key] = st.t;
  // remove a contrary pending swap (they swapped back)
  const idx = st.pending.findIndex((p) => p.a === y && p.b === x && p.reason.startsWith('~'));
  if (idx >= 0) { st.pending.splice(idx, 1); return; }
  const pre = st.pending.find((p) => p.a === x && p.b === y && !p.reason.startsWith('~'));
  let reason = pre ? pre.reason : '';
  if (pre) st.pending.splice(st.pending.indexOf(pre), 1);
  if (!reason) {
    if (B.mode === 'pit' || B.pitPhase === 2) reason = 'pit stop';
    else if (A.mode === 'pit') reason = 'pit sequence';
    else if (A.dist - B.dist > c.tr.length * 0.5) reason = 'lapping';
    else if (B.inc) reason = B.inc.kind === 'spin' ? 'spin' : 'mistake';
    else if (B.limp > 0 || B.puncture || B.dmgAero > 0.3) reason = 'problem';
    else if (A.lap <= 0) reason = 'start';
    else reason = reasonFor(st, c, x, y, !!c.tr.inCorner[c.tr.idx(A.s)]);
  }
  st.pending.push({ a: x, b: y, t: st.t, reason: '~' + reason, lap: lapOf(st), where: c.tr.cornerName(A.s) });
}
function confirmSwaps(st: RaceState, c: Cache) {
  for (let q = st.pending.length - 1; q >= 0; q--) {
    const p = st.pending[q];
    if (!p.reason.startsWith('~')) { if (st.t - p.t > 6) st.pending.splice(q, 1); continue; }
    if (st.t - p.t < 2) continue;
    st.pending.splice(q, 1);
    const A = st.cars[p.a], B = st.cars[p.b];
    if (!(rankKey(A) > rankKey(B))) continue;
    const reason = p.reason.slice(1);
    if (reason === 'lapping' || reason === 'pit stop' || reason === 'pit sequence') {
      if (reason !== 'lapping' && A.pos <= 3) pushEvent(st, { t: p.t, lap: p.lap, kind: 'posChange', a: p.a, b: p.b, pos: A.pos, where: p.where, detail: reason, sig: 0.4 });
      continue;
    }
    if (reason === 'start') { continue; }
    A.overtakes++;
    st.overtakeCount++;
    B.passedBy = p.a; B.passedT = st.t;
    const sig = A.pos <= 1 ? 0.9 : A.pos <= 3 ? 0.75 : A.pos <= 8 ? 0.55 : 0.35;
    pushEvent(st, { t: p.t, lap: p.lap, kind: 'overtake', a: p.a, b: p.b, pos: A.pos, where: p.where, detail: reason, sig });
  }
}

// ---------------------------------------------------------------------------- incidents
function cornerEntry(st: RaceState, c: Cache, k: number, ci: number) {
  const tr = c.tr, rng = c.rng, setup = c.setup;
  const car = st.cars[k], e = setup.entrants[car.i];
  const cd = tr.corners[ci];
  const d = e.d;
  // per-corner execution quality (consistency)
  const sd = 0.012 * (1.35 - d.consistency / 100) + 0.006 * clamp(st.w.water, 0, 1) * (1.2 - d.wet / 100);
  car.paceMult = clamp(0.996 + rng.gauss(0, sd) + 0.002 * (car.push - 1), 0.93, 1.02);
  if (car.mode !== 'run' || car.lap < 0) return;
  // mistake probability for this corner
  const sev = clamp(30 / Math.max(8, cd.radius), 0.2, 2.5);
  const pressure = (car.pos <= 3 ? 0.3 : 0) + (car.atk >= 0 ? 0.3 : 0) + (setup.titleContext === 'decider' && e.contender ? 0.4 : 0);
  let p = 0.0009 * sev;
  p *= 1 + 1.8 * (1 - d.consistency / 100);
  p *= 1 + 3.2 * clamp(st.w.water, 0, 1.1) * (1.3 - d.wet / 100);
  p *= 1 + pressure * (1 - d.pressure / 100) * 1.5;
  p *= 1 + (d.aggression / 100 - 0.5) * 0.8 + (car.push - 1) * 8;
  p *= 1 + car.wear * car.wear * 1.5 + car.fatigue * 2;
  p *= 1 + (1 - d.confidence) * 0.4;
  p *= tr.w[tr.idx(cd.sApex)] < 7 ? 1.25 : 1;
  if (st.w.vis < 1500) p *= 1.5;
  if (st.phase === 'sc') p *= 0.15;
  if (!rng.chance(p)) return;
  // what kind of mistake
  const phase = rng.weighted(['brake', 'apex', 'exit'], [1 + d.aggression / 60, 1, 0.8 + (1 - e.c.drivability)]);
  const hard = rng.next();
  const barrierHit = hard < 0.08 + 0.1 * (1 - setup.layout.safety) + 0.05 * clamp(st.w.water, 0, 1);
  car.mistakes++; car.clean = false;
  const where = cd.name;
  if (barrierHit) {
    const impact = car.v;
    const outcome = rng.next();
    const dmgChance = setup.layout.barrier === 'bales' ? 0.55 : setup.layout.barrier === 'energy' ? 0.7 : 0.75;
    if (outcome < dmgChance * clamp(impact / 35, 0.3, 1.2)) {
      crash(st, c, k, where, phase === 'brake' ? 'went straight on under braking' : phase === 'exit' ? 'lost the rear on exit' : 'clipped the barrier', impact, 'driver');
      return;
    }
    car.dmgAero = Math.min(1, car.dmgAero + rng.range(0.2, 0.7));
    car.inc = { kind: 'slow', t: st.t, dur: 3, vCap: car.v * 0.4, latTo: Math.sign(car.lat || 1) * (tr.w[tr.idx(car.s)] / 2 - 1) };
    pushEvent(st, { t: st.t, lap: lapOf(st), kind: 'mistake', a: k, where, detail: 'hit the barrier but continues with damage', sig: SIG.mistake + 0.1 });
    refreshProfile(st, c, k, true);
    return;
  }
  if (phase === 'exit' && rng.chance(0.45 + 0.3 * clamp(st.w.water, 0, 1))) {
    const stopT = rng.range(2, 8);
    car.inc = { kind: 'spin', t: st.t, dur: stopT + 3, vCap: 0, latTo: Math.sign(car.lat || rng.next() - 0.5) * (tr.w[tr.idx(car.s)] / 2 - 1) };
    car.wear = Math.min(1, car.wear + 0.04);
    pushEvent(st, { t: st.t, lap: lapOf(st), kind: 'spin', a: k, where, detail: 'spun', value: stopT + 6, sig: car.pos <= 5 ? 0.7 : 0.45 });
    if (tr.w[tr.idx(car.s)] < 7.5) st.yellows.push({ s0: tr.wrap(car.s - 150), s1: tr.wrap(car.s + 60), until: st.t + stopT + 10, cause: 'spun car' });
    // following car may collect it
    return;
  }
  const loss = phase === 'brake' ? rng.range(0.5, 2.5) : rng.range(0.4, 1.8);
  car.inc = { kind: phase === 'brake' ? 'lockup' : 'wide', t: st.t, dur: 1.2 + loss, vCap: car.v * (phase === 'brake' ? 0.55 : 0.7), latTo: Math.sign(tr.k[tr.idx(car.s + 30)] || 1) * -(tr.w[tr.idx(car.s)] / 2 - 1) };
  if (phase === 'brake') car.wear = Math.min(1, car.wear + 0.02);
  pushEvent(st, { t: st.t, lap: lapOf(st), kind: 'mistake', a: k, where, detail: phase === 'brake' ? 'locked up' : 'ran wide', value: loss, sig: car.pos <= 3 ? 0.55 : 0.3 });
}

function contact(st: RaceState, c: Cache, k: number, j: number, how: string) {
  const tr = c.tr, rng = c.rng, setup = c.setup;
  const A = st.cars[k], B = st.cars[j];
  const where = tr.cornerName(A.s);
  A.contacts++; B.contacts++; A.clean = false; B.clean = false;
  const speed = (A.v + B.v) / 2;
  const sevA = rng.next() * clamp(speed / 30, 0.3, 1.3) * (1.1 - setup.entrants[A.i].c.durability * 0.4);
  const sevB = rng.next() * clamp(speed / 30, 0.3, 1.3) * (1.1 - setup.entrants[B.i].c.durability * 0.4);
  const outcome = (car: CarState, kk: number, sev: number) => {
    if (sev > 0.85) { crash(st, c, kk, where, 'eliminated in a collision', car.v, 'contact'); return 'out'; }
    if (sev > 0.6) { car.puncture = rng.chance(0.5); car.dmgAero = Math.min(1, car.dmgAero + 0.5); car.dmgSusp = Math.min(1, car.dmgSusp + rng.range(0, 0.4)); car.inc = { kind: 'spin', t: st.t, dur: 5, vCap: 0, latTo: car.lat }; refreshProfile(st, c, kk, true); return 'damage'; }
    if (sev > 0.3) { car.dmgAero = Math.min(1, car.dmgAero + rng.range(0.1, 0.4)); refreshProfile(st, c, kk, true); car.inc = { kind: 'slow', t: st.t, dur: 1.5, vCap: car.v * 0.7, latTo: car.lat }; return 'damage'; }
    car.inc = { kind: 'slow', t: st.t, dur: 1, vCap: car.v * 0.8, latTo: car.lat };
    return 'minor';
  };
  const oa = outcome(A, k, sevA), ob = outcome(B, j, sevB);
  pushEvent(st, { t: st.t, lap: lapOf(st), kind: 'contact', a: k, b: j, where, detail: `${how}|${oa}|${ob}`, sig: SIG.contact });
  // stewards: the attacker is usually blamed for a dive; the defender for closing the door late
  const blameA = how === 'a-dive' ? 0.7 : 0.35;
  const guilty = rng.chance(blameA) ? k : j;
  const sevMax = Math.max(sevA, sevB);
  const reason = `causing a collision with ${setup.entrants[(guilty === k ? B : A).i].name}`;
  if (setup.rules.penalties !== 'fines' && sevMax > 0.3 && rng.chance(0.55)) penalise(st, c, guilty, reason, sevMax, guilty === k ? j : k);
  else if (setup.rules.penalties === 'fines' && sevMax > 0.5 && rng.chance(0.3)) penalise(st, c, guilty, reason, sevMax, guilty === k ? j : k);
}

/** Stewards' decision under the era's penalty regime: fines only, time penalties, or the full range. */
function penalise(st: RaceState, c: Cache, k: number, reason: string, sev: number, other?: number) {
  const setup = c.setup; const g = st.cars[k];
  if (g.ret) return;
  if (setup.rules.penalties === 'fines') {
    g.pen.push({ kind: 'fine', seconds: 0, reason, served: true });
    pushEvent(st, { t: st.t + 20, lap: lapOf(st), kind: 'reprimand', a: k, b: other, detail: `fined by the stewards for ${reason}`, sig: 0.35 });
    return;
  }
  const kind = setup.rules.penalties === 'full' && sev > 0.7 ? 'drive-through' : 'time';
  const secs = kind === 'time' ? (sev > 0.6 ? 10 : 5) : 0;
  g.pen.push({ kind, seconds: secs, reason, served: false });
  if (kind === 'drive-through') g.pitReq = g.pitReq ?? 'drive-through';
  pushEvent(st, { t: st.t + 20, lap: lapOf(st), kind: 'penalty', a: k, b: other, detail: `${kind === 'time' ? `${secs}-second time penalty` : 'drive-through penalty'} for ${reason}`, value: secs, sig: SIG.penalty });
}

function crash(st: RaceState, c: Cache, k: number, where: string, how: string, impact: number, cat: 'driver' | 'contact') {
  const tr = c.tr, rng = c.rng, setup = c.setup;
  const car = st.cars[k];
  const e = setup.entrants[car.i];
  retire(st, c, k, how, cat, where);
  car.inc = { kind: 'slow', t: st.t, dur: 9999, vCap: 0, latTo: Math.sign(car.lat || 1) * (tr.w[tr.idx(car.s)] / 2 - 0.9) };
  // injury risk proportionate to impact speed and the safety standards of the day
  const safety = (setup.rules.crashStructures + setup.rules.cockpitProtection + setup.layout.safety + setup.rules.medical) / 4;
  const pInj = clamp((impact / 45) * (1 - safety) * 0.35, 0, 0.5);
  if (rng.chance(pInj)) {
    const sev = clamp(rng.next() * (impact / 40) * (1.2 - safety), 0.05, 1);
    const fatal = setup.rules.fatalities && sev > 0.97 && rng.chance(0.25 * (1 - safety));
    pushEvent(st, { t: st.t + 30, lap: lapOf(st), kind: fatal ? 'fatal' : 'injury', a: k, where, value: fatal ? 1 : sev, detail: fatal ? 'fatal' : sev > 0.6 ? 'serious injuries' : sev > 0.3 ? 'injured' : 'minor injuries', sig: 0.9 });
  }
  // flags: stopped in a dangerous place, debris, barrier damage
  const narrow = tr.w[tr.idx(car.s)] < 8;
  const dangerous = narrow || impact > 30 || rng.chance(0.3);
  if (impact > 42 && rng.chance(0.1 * (setup.layout.barrier === 'bales' ? 1.4 : 1))) { redFlag(st, c, `barrier repairs at ${where}`); return; }
  if (dangerous && setup.rules.safetyCar && st.phase === 'run') deploySC(st, c, `stricken car at ${where}`);
  else st.yellows.push({ s0: tr.wrap(car.s - 200), s1: tr.wrap(car.s + 50), until: st.t + rng.range(60, 180), cause: `crash at ${where}` });
  void e;
}

function retire(st: RaceState, c: Cache, k: number, reason: string, cat: 'mechanical' | 'driver' | 'contact' | 'other', where: string) {
  const car = st.cars[k];
  if (car.ret) return;
  car.ret = { t: st.t, lap: car.lap + 1, reason, cat, where, s: car.s };
  car.atk = -1;
  pushEvent(st, { t: st.t, lap: lapOf(st), kind: 'retire', a: k, where, detail: `${cat}|${reason}`, pos: car.pos, sig: car.pos <= 5 ? 0.85 : SIG.retire });
}

// ---------------------------------------------------------------------------- mechanical hazards (once per second)
const FAILURES: [string, number, boolean][] = [
  ['engine failure', 3, true], ['gearbox failure', 2, true], ['suspension failure', 1.2, true], ['brake failure', 0.8, true], ['electrical fault', 1.2, true],
  ['fuel pressure', 0.8, true], ['overheating', 1, true], ['loss of power', 1.5, false], ['gearbox selection problem', 1, false], ['puncture', 1, false],
];
function hazards(st: RaceState, c: Cache, k: number) {
  const car = st.cars[k];
  if (car.ret || car.mode === 'fin' || car.mode === 'grid' || car.mode === 'out') return;
  if (st.phase === 'red' || st.phase === 'grid' || st.phase === 'delay') return;
  if (st.kind === 'quali' && car.mode !== 'run') return;
  const rng = c.rng, setup = c.setup, e = setup.entrants[car.i];
  // base hazard per hour of racing: early machinery far less reliable
  const era = setup.rules.year;
  const eraHaz = era < 1935 ? 0.3 : era < 1955 ? 0.26 : era < 1975 ? 0.2 : era < 1995 ? 0.14 : era < 2010 ? 0.08 : 0.05;
  const stress = 1 + (car.push - 1) * 6 + car.engWear * 1.5 + (st.w.air > 26 ? (st.w.air - 26) * 0.06 * (1 - e.c.cooling) : 0);
  const sympathy = 1.25 - e.d.mechSympathy / 200;
  const hazPerSec = (eraHaz * e.c.reliability * stress * sympathy) / 3600;
  car.engWear = Math.min(1, car.engWear + (0.00012 * stress) / (0.5 + e.c.durability));
  if (!rng.chance(hazPerSec)) return;
  const [what, , terminal0] = rng.weighted(FAILURES, FAILURES.map((f) => f[1]));
  const where = c.tr.cornerName(car.s);
  if (what === 'puncture') { car.puncture = true; car.pitReq = 'puncture'; refreshProfile(st, c, k, true); pushEvent(st, { t: st.t, lap: lapOf(st), kind: 'puncture', a: k, where, sig: car.pos <= 5 ? 0.7 : 0.45 }); return; }
  const terminal = terminal0 && rng.chance(0.85);
  if (!terminal) {
    car.limp = Math.min(0.35, car.limp + rng.range(0.04, 0.15));
    refreshProfile(st, c, k, true);
    pushEvent(st, { t: st.t, lap: lapOf(st), kind: 'problem', a: k, where, detail: what, sig: car.pos <= 5 ? 0.6 : 0.35 });
    return;
  }
  retire(st, c, k, what, 'mechanical', where);
  car.inc = { kind: 'slow', t: st.t, dur: 9999, vCap: 0, latTo: Math.sign(car.lat || 1) * (c.tr.w[c.tr.idx(car.s)] / 2 - 0.9) };
  const narrow = c.tr.w[c.tr.idx(car.s)] < 7.5;
  if (setup.rules.safetyCar && narrow && rng.chance(0.4) && st.phase === 'run') deploySC(st, c, `stopped car at ${where}`);
  else st.yellows.push({ s0: c.tr.wrap(car.s - 180), s1: c.tr.wrap(car.s + 40), until: st.t + rng.range(40, 120), cause: `stopped car at ${where}` });
}

// ---------------------------------------------------------------------------- consumables
function consume(st: RaceState, c: Cache, k: number, ds: number, i: number) {
  const car = st.cars[k], e = c.setup.entrants[car.i], tr = c.tr;
  if (car.mode === 'grid' || ds <= 0) return;
  const T = TYRES[car.tyre] ?? TYRES.medium;
  const latUse = clamp((car.v * car.v * Math.abs(tr.k[i])) / (e.c.mechGrip * G * 1.6), 0, 1.2);
  const onDry = car.tyre === 'wet' || car.tyre === 'inter' ? clamp(1 - st.w.water * 2.2, 0, 1) : 0;
  const hot = car.ttemp > T.opt + 25 ? 1 + (car.ttemp - T.opt - 25) * 0.03 : 1;
  const wetRelief = car.tyre === 'wet' || car.tyre === 'inter' ? 0.35 + onDry * 0.65 : 1;
  const wearRate = (0.012 / 1000) * T.wear * wetRelief * e.c.tyreWear * (0.55 + 0.9 * latUse) * car.push * car.push * (1.25 - e.d.mechSympathy / 200) * hot * (1 + onDry * 2.5) * (st.phase === 'sc' ? 0.3 : 1);
  car.wear = Math.min(1.1, car.wear + wearRate * ds);
  const target = st.w.trackTemp + (st.phase === 'sc' ? 18 : 48 * (0.45 + 0.55 * latUse) * car.push) - st.w.water * 30 + onDry * 30;
  car.ttemp += (target - car.ttemp) * clamp(DT / 15, 0, 1);
  car.fuel = Math.max(0, car.fuel - (e.c.fuelPerKm / 1000) * ds * (0.75 + 0.25 * car.push) * (st.phase === 'sc' ? 0.5 : 1));
  if (car.fuel <= 0 && !car.ret && car.mode === 'run') { retire(st, c, k, 'ran out of fuel', 'other', tr.cornerName(car.s)); car.inc = { kind: 'slow', t: st.t, dur: 9999, vCap: 0, latTo: Math.sign(car.lat || 1) * (tr.w[i] / 2 - 0.9) }; }
  if (car.wear > 1.02 && !car.puncture && c.rng.chance(0.002)) { car.puncture = true; car.pitReq = 'puncture'; refreshProfile(st, c, k, true); pushEvent(st, { t: st.t, lap: lapOf(st), kind: 'puncture', a: k, where: tr.cornerName(car.s), detail: 'worn tyre failed', sig: 0.5 }); }
}

// ---------------------------------------------------------------------------- pit stops
function pitLogic(st: RaceState, c: Cache, k: number, prevS: number) {
  const car = st.cars[k], tr = c.tr, setup = c.setup, e = setup.entrants[car.i];
  const L = tr.length;
  const crossed = (a: number, b: number, x: number) => (a <= b ? a < x && b >= x : a < x || b >= x);
  if (st.kind === 'quali' && car.mode === 'run' && car.pitReq === 'end' && crossed(prevS, car.s, tr.pitEntry)) { car.mode = 'out'; car.v = 0; car.pitReq = null; return; }
  if (st.kind === 'quali' && car.mode === 'pit' && car.pitPhase === 3) { if (!tr.inPitSpan(car.s) || tr.pitFraction(car.s) > 0.98) { car.mode = 'run'; car.pitPhase = 4; } return; }
  if (car.mode === 'run' && car.pitReq && !car.ret && crossed(prevS, car.s, tr.pitEntry)) {
    if (st.phase === 'red') return;
    car.mode = 'pit'; car.pitPhase = 1; car.pitIn = st.t; car.atk = -1;
    // what work will be done
    const w = car.pitWork; w.tyre = null; w.fuel = 0; w.repair = false; w.dt = false;
    if (car.pitReq === 'drive-through') { w.dt = true; }
    else {
      w.tyre = chooseTyre(st, c, k);
      if (setup.rules.refuel) w.fuel = Math.max(0, fuelToEnd(st, c, k) - car.fuel);
      w.repair = car.dmgAero > 0.15 || car.dmgSusp > 0.2;
    }
    return;
  }
  if (car.mode !== 'pit') return;
  const frac = tr.pitFraction(car.s);
  if (car.pitPhase === 1 && frac >= 0.5 && !car.pitWork.dt) {
    // stationary service
    car.pitPhase = 2; car.v = 0;
    const r = setup.rules;
    let t = 0;
    const w = car.pitWork;
    if (w.tyre) t = Math.max(t, r.pitServiceBase * (1.25 - e.crew * 0.5));
    if (w.fuel > 0) t = Math.max(t, w.fuel / r.refuelRate);
    if (w.repair) t += r.pitServiceBase * (car.dmgSusp > 0.3 ? 4 : 1.6);
    const unserved = car.pen.filter((p) => !p.served && p.kind === 'time' && r.penalties === 'full');
    for (const p of unserved) { t += p.seconds; p.served = true; }
    if (c.rng.chance(0.05 * (1.3 - e.crew))) { const extra = c.rng.range(2, 12) * (r.pitServiceBase / 6 + 0.4); t += extra; pushEvent(st, { t: st.t, lap: lapOf(st), kind: 'slowstop', a: k, value: extra, detail: 'problem at the stop', sig: 0.45 }); }
    car.pitT = st.t + Math.max(2, t);
    return;
  }
  if (car.pitPhase === 2) {
    car.v = 0;
    if (car.s > 0 && tr.pitFraction(car.s) > 0.52) car.s = tr.wrap(tr.pitEntry + tr.pitSpan * 0.5);
    if (st.t >= car.pitT) {
      const w = car.pitWork;
      const oldWear = car.wear, oldTyre = car.tyre;
      if (w.tyre) { car.wearBias = c.rng.gauss(0, 0.3 * (1 - c.setup.rules.telemetry) + 0.03); car.tyre = w.tyre; car.wear = 0; car.ttemp = st.w.trackTemp + 25; car.tyreLaps = 0; car.puncture = false; if (!car.used.includes(w.tyre)) car.used.push(w.tyre); }
      car.fuel += w.fuel;
      if (w.repair) { car.dmgAero = 0; car.dmgSusp = Math.max(0, car.dmgSusp - 0.3); }
      car.pits++;
      car.pitPhase = 3;
      refreshProfile(st, c, k, true);
      pushEvent(st, { t: st.t, lap: lapOf(st), kind: 'pit', a: k, value: st.t - car.pitIn, detail: `${car.pitReq}|${w.tyre ?? ''}|${w.fuel > 0 ? 'fuel' : ''}|${w.repair ? 'repair' : ''}|${oldWear.toFixed(2)}|${oldTyre}`, pos: car.pos, sig: car.pos <= 3 ? 0.6 : SIG.pit });
      car.pitReq = null;
    }
    return;
  }
  if (car.pitWork.dt && car.pitPhase === 1 && frac > 0.5) { car.pitPhase = 3; car.pits++; for (const p of car.pen) if (p.kind === 'drive-through') p.served = true; car.pitReq = null; pushEvent(st, { t: st.t, lap: lapOf(st), kind: 'drivethrough', a: k, sig: 0.5 }); }
  if (car.pitPhase === 3 && !tr.inPitSpan(car.s)) { car.mode = 'run'; car.pitPhase = 4; }
  void L;
}

export function fuelToEnd(st: RaceState, c: Cache, k: number): number {
  const car = st.cars[k], e = c.setup.entrants[car.i];
  const lapsLeft = st.laps - (car.lap + 1) + 1;
  return (lapsLeft * c.tr.length / 1000) * e.c.fuelPerKm * 1.04;
}

function chooseTyreKind(st: RaceState, c: Cache, k: number): string {
  const r = c.setup.rules;
  if (r.compounds.length === 1) return r.compounds[0];
  return r.compounds.includes('medium') ? 'medium' : r.compounds[0];
}
function chooseTyre(st: RaceState, c: Cache, k: number): string {
  const car = st.cars[k], setup = c.setup, e = setup.entrants[car.i];
  const r = setup.rules;
  const fc = forecastRain(st.w, 20, e.forecastSkill, c.rng);
  const W = st.w.water;
  if (r.wetTyres.length) {
    if (W > 0.7 && r.wetTyres.includes('wet')) return 'wet';
    if (W > 0.2 || (fc > 0.75 && W > 0.12)) return r.wetTyres.includes('inter') ? 'inter' : r.wetTyres[0];
  }
  const dry = r.compounds;
  if (dry.length === 1) return dry[0];
  const lapsLeft = st.laps - car.lap - 1;
  const lapKm = c.tr.length / 1000;
  const kmLeft = lapsLeft * lapKm;
  // a softer compound when it can last; honour a two-compound rule
  let pick = kmLeft < 45 && dry.includes('soft') ? 'soft' : kmLeft < 90 && dry.includes('medium') ? 'medium' : dry.includes('hard') ? 'hard' : dry[0];
  if (r.mandatoryTwo && car.used.length === 1 && car.used[0] === pick) pick = dry.find((x) => x !== pick) ?? pick;
  return pick;
}

// ---------------------------------------------------------------------------- strategy (per lap at the decision point)
function strategy(st: RaceState, c: Cache, k: number) {
  const car = st.cars[k], setup = c.setup, e = setup.entrants[car.i], r = setup.rules, tr = c.tr;
  if (car.ret || car.mode !== 'run' || car.pitReq) return;
  const lapsLeft = st.laps - (car.lap + 1);
  if (lapsLeft <= 0) return;
  const rng = c.rng;
  // information quality: early teams read tyre state from lap times; telemetry sharpens it
  // teams read tyre state imperfectly (lap times, inspection, later telemetry); the error persists through a stint
  const wearEst = clamp(car.wear * (1 + car.wearBias), 0, 1.2);
  // pushing level: conserve when fuel is marginal or tyres must last
  const fuelNeed = (lapsLeft * tr.length / 1000) * e.c.fuelPerKm;
  if (!r.refuel && car.fuel < fuelNeed * 1.01) car.push = 0.92;
  else if (e.strategyRisk > 0.6 && lapsLeft < 6) car.push = 1.02;
  else car.push = 1;
  // mandatory drive-through
  if (car.pen.some((p) => p.kind === 'drive-through' && !p.served)) { car.pitReq = 'drive-through'; return; }
  // weather crossover
  const W = st.w.water;
  const fc = forecastRain(st.w, 15, e.forecastSkill, rng);
  const onWet = car.tyre === 'inter' || car.tyre === 'wet';
  if (r.wetTyres.length) {
    const settled = car.tyreLaps >= 2;
    if (!onWet && car.tyre !== 'treaded' && (W > 0.3 || (W > 0.2 && fc > 0.7 && settled))) { car.pitReq = 'weather'; return; }
    if (car.tyre === 'inter' && W > 0.8 && r.wetTyres.includes('wet') && settled) { car.pitReq = 'weather'; return; }
    if (car.tyre === 'wet' && W < 0.45 && settled) { car.pitReq = 'weather'; return; }
    if (onWet && W < 0.1 && fc < 0.4 && lapsLeft > 3 && settled) { car.pitReq = 'weather'; return; }
  }
  // damage
  if (car.dmgAero > 0.35 && lapsLeft > 3) { car.pitReq = 'repair'; return; }
  // fuel (refuelling eras)
  if (r.refuel && car.fuel < (2.2 * tr.length / 1000) * e.c.fuelPerKm) { car.pitReq = 'fuel'; return; }
  // tyres: project time lost to wear over the remaining laps, staying out vs fresh tyres now
  const lapT = c.lapEst[k] || 90;
  // wear rate: engineering prior for this compound/car/track blended with what has been observed this stint
  const prior = 0.012e-3 * (TYRES[car.tyre]?.wear ?? 1) * e.c.tyreWear * 0.95 * tr.length * (car.tyre === 'wet' || car.tyre === 'inter' ? 0.5 : 1);
  const ratePerLap = clamp((wearEst + prior * 3) / (car.tyreLaps + 3), 0.002, 0.3);
  const gw = (w: number) => 1 - 0.07 * w - (w > 0.72 ? (w - 0.72) * 1.1 : 0);
  const lossAt = (w: number) => lapT * (1 - dsqrt(clamp(gw(w), 0.3, 1)));
  let stay = 0, fresh = 0;
  const horizon = Math.min(lapsLeft, 40);
  const newRate = ratePerLap * (TYRES[chooseTyreKind(st, c, k)]?.wear ?? 1) / (TYRES[car.tyre]?.wear ?? 1);
  for (let q = 1; q <= horizon; q++) { stay += lossAt(wearEst + ratePerLap * q); fresh += lossAt(newRate * q); }
  const pitLoss = (tr.pitSpan / ((r.pitKph ?? 70) / 3.6)) - tr.pitSpan / (tr.length / lapT) + r.pitServiceBase * (1.25 - e.crew * 0.5);
  const scDiscount = st.phase === 'sc' ? 0.5 : 1;
  // a compulsory second compound makes the stop's cost sunk: take it when fresh tyres pay back soonest
  if (r.mandatoryTwo && car.used.length < 2 && !onWet) {
    const frac = lapsLeft / st.laps;
    if (lapsLeft <= 2 || (frac < 0.6 && (stay - fresh > pitLoss * 0.25 || frac < 0.35))) { car.pitReq = 'tyres'; return; }
  }
  const cliff = wearEst + ratePerLap * 1.5 > 0.9 && lapsLeft > 1 && car.tyreLaps >= 2;
  const gain = stay - fresh;
  const willNotLast = wearEst + ratePerLap * lapsLeft > 0.88;
  const freshLasts = newRate * lapsLeft < 0.85;
  const worthIt = gain > pitLoss * scDiscount * (1.3 - e.strategyRisk * 0.35) && lapsLeft > 2;
  if (cliff || (willNotLast && freshLasts && worthIt) || (willNotLast && !freshLasts && wearEst > 0.62) || (st.phase === 'sc' && willNotLast && worthIt)) {
    car.pitReq = st.phase === 'sc' ? 'safety car stop' : 'tyres';
    return;
  }
  // undercut attempt
  if (car.gapAhead > 0 && car.gapAhead < 2.2 && lapsLeft > 6 && gain > pitLoss * 0.7 && e.strategyRisk > 0.45 && r.pitServiceBase < 12) {
    const ahead = st.cars.find((x) => x.pos === car.pos - 1);
    if (ahead && !ahead.pitReq && ahead.wear >= car.wear - 0.05 && rng.chance(0.5)) car.pitReq = 'undercut';
  }
}

// ---------------------------------------------------------------------------- line crossings, timing
function crossLine(st: RaceState, c: Cache, k: number) {
  const car = st.cars[k];
  if (st.kind === 'quali') { qualiCross(st, c, k); return; }
  car.lap++;
  if (car.lap === 0) { car.lapStart = st.t; car.secStart = st.t; car.sec = 0; return; }
  const lt = st.t - car.lapStart;
  if (car.pos === 1) car.led++;
  const valid = car.lapValid && lt > (c.lapEst[k] || 60) * 0.6;
  car.lapValid = true;
  car.lastLap = lt; car.lapTimes.push(valid ? +lt.toFixed(3) : -1);
  car.lapStart = st.t; car.secStart = st.t; car.sec = 0;
  car.tyreLaps++;
  car.defUsed = false;
  const inPitLap = car.pitPhase === 3 || car.pitPhase === 4 || car.mode === 'pit';
  if (valid && car.clean && !inPitLap && st.phase === 'run' && car.lap > 1) car.cleanTimes.push(lt);
  car.clean = true;
  if (car.pitPhase === 4) car.pitPhase = 0;
  if (valid && lt < car.best && car.lap >= 1) { car.best = lt; car.bestLapNo = car.lap; }
  if (valid && (st.phase === 'run' || st.phase === 'fin')) {
    if (!st.fastest || lt < st.fastest.t) {
      const late = car.lap > st.laps * 0.5;
      st.fastest = { t: lt, i: k, lap: car.lap };
      if (late) pushEvent(st, { t: st.t, lap: car.lap, kind: 'fastest', a: k, value: lt, sig: SIG.fastest });
    }
  }
  if (st.w.water > 0.25 && car.pos === 1) st.wetLaps++;
  // fatigue across a long race for less fit drivers
  const e = c.setup.entrants[car.i];
  car.fatigue = clamp(car.fatigue + (0.012 * (1.2 - e.d.fitness / 100)) * (c.tr.length / 3000) * (c.setup.rules.year < 1960 ? 1.4 : 1), 0, 0.5);
  refreshProfile(st, c, k);
  // chequered flag
  const racing = (car.mode === 'run' || car.mode === 'pit') && !car.ret;
  if (st.leaderDone && racing) { car.mode = 'fin'; car.finT = st.t; car.pitPhase = 0; car.pitReq = null; return; }
  if (!st.leaderDone && racing && (car.lap >= st.laps || (st.t > st.maxT && car.pos === 1))) {
    st.leaderDone = true; car.mode = 'fin'; car.finT = st.t; st.phase = st.phase === 'sc' ? 'fin' : 'fin';
    if (car.lap < st.laps) { st.status = 'shortened'; st.endNote = 'time limit reached'; }
    pushEvent(st, { t: st.t, lap: car.lap, kind: 'finish', a: k, sig: SIG.finish });
    return;
  }
  // SC queue lap counting
  if (st.phase === 'sc' && car.pos === 1) { st.sc.laps++; }
  strategy(st, c, k);
}

function qualiCross(st: RaceState, c: Cache, k: number) {
  const car = st.cars[k], q = st.q!;
  car.lap++;
  const lt = st.t - car.lapStart;
  const was = car.lap - 1;
  car.lapStart = st.t;
  if (was >= 0 && q.flying[k] > 0) {
    q.flying[k]--;
    const valid = car.clean && lt > (c.lapEst[k] || 60) * 0.6;
    car.lapTimes.push(valid ? +lt.toFixed(3) : -1);
    if (valid) {
      const segI = q.seg - 1;
      if (lt < q.segBest[segI][k]) q.segBest[segI][k] = lt;
      if (lt < q.best[k]) {
        const prevPole = Math.min(...q.best);
        q.best[k] = lt;
        if (lt < prevPole) pushEvent(st, { t: st.t, lap: 0, kind: 'qfastest', a: k, value: lt, sig: 0.55 });
      }
      if (lt < car.best) car.best = lt;
    }
  }
  car.clean = true;
  if (q.flying[k] <= 0 || car.fuel < (c.setup.entrants[car.i].c.fuelPerKm * c.tr.length / 1000) * 1.2) car.pitReq = 'end';
  // quali: push on flying laps
  car.push = q.flying[k] > 0 ? 1.01 : 0.9;
  refreshProfile(st, c, k, true);
}

function updateTiming(st: RaceState, c: Cache) {
  const ord = st.order;
  let pos = 1;
  const leader = st.cars[ord[0]];
  for (const k of ord) {
    const car = st.cars[k];
    const prev = car.pos;
    car.pos = pos++;
    if (!car.ret && car.mode !== 'out' && prev !== car.pos && prev < car.pos) car.lostPos++;
  }
  const L = c.tr.length;
  for (let oi = 0; oi < ord.length; oi++) {
    const car = st.cars[ord[oi]];
    if (car.ret) { car.gapAhead = 0; continue; }
    const avgV = L / Math.max(30, c.lapEst[ord[oi]]);
    car.gapLeader = oi === 0 ? 0 : (leader.dist - car.dist) / avgV;
    car.gapAhead = oi === 0 ? 0 : (st.cars[ord[oi - 1]].dist - car.dist) / avgV;
  }
  const lk = ord[0];
  if (lk !== st.leadCand) { st.leadCand = lk; st.leadCandT = st.t; }
  if (st.phase === 'run' || st.phase === 'sc' || st.phase === 'fin') {
    if (lk !== st.lastLeader && !st.cars[lk].ret && st.cars[lk].lap >= 0 && st.cars[lk].mode !== 'fin' && (st.lastLeader < 0 || (st.leadCand === lk && st.t - st.leadCandT >= 2) || st.cars[st.lastLeader].ret || st.cars[st.lastLeader].mode === 'pit')) {
      if (st.lastLeader >= 0) {
        const old = st.cars[st.lastLeader];
        const why = old.ret ? 'retirement' : old.mode === 'pit' ? 'pit stop' : old.inc ? 'mistake' : 'on track';
        st.leadChanges++; pushEvent(st, { t: st.t, lap: lapOf(st), kind: 'lead', a: lk, b: st.lastLeader, where: c.tr.cornerName(st.cars[lk].s), detail: why, sig: SIG.lead });
      }
      st.lastLeader = lk;
    }
    if (st.cars[lk].lap >= 0 && st.step % 10 === 0) st.cars[lk].led += 0; // led laps counted at line
  }
}

function checkFinish(st: RaceState, c: Cache) {
  // led laps: whoever leads when the leader crosses
  let running = 0;
  for (const x of st.cars) if (!x.ret && x.mode !== 'fin' && x.mode !== 'out') running++;
  if (st.leaderDone) {
    // wait for all running cars to cross or stop (max 4 minutes after the winner)
    const winner = st.cars.find((x) => x.finT !== null && x.pos === 1) ?? st.cars.find((x) => x.finT !== null);
    if (running === 0 || st.t - (winner?.finT ?? st.t) > 240) { endRace(st, c, st.endNote); }
    return;
  }
  if (running === 0 && st.phase !== 'grid') { st.status = 'abandoned'; endRace(st, c, 'no cars left running'); }
}

export function endRace(st: RaceState, c: Cache, note: string) {
  if (st.phase === 'done' || st.phase === 'abandoned') return;
  const leader = st.cars[st.order[0]];
  const completed = Math.max(...st.cars.map((x) => x.lap));
  if (!st.status) st.status = completed >= st.laps ? 'finished' : completed >= 2 ? 'shortened' : 'abandoned';
  if (completed < 2) st.status = 'abandoned';
  st.endNote = note || st.endNote;
  st.phase = st.status === 'abandoned' ? 'abandoned' : 'done';
  pushEvent(st, { t: st.t, lap: completed, kind: 'end', detail: `${st.status}${st.endNote ? ': ' + st.endNote : ''}`, sig: 0.5 });
  void leader;
}

// ---------------------------------------------------------------------------- safety car / red flag
function deploySC(st: RaceState, c: Cache, reason: string) {
  if (st.kind === 'quali') return;
  if (st.phase !== 'run' || st.sc.on) return;
  const leader = st.cars[st.order[0]];
  if (leader.lap >= st.laps - 1) { return; }
  st.phase = 'sc'; st.sc.on = true; st.sc.dist = leader.dist + 80; st.sc.v = 20; st.sc.laps = 0; st.sc.deployT = st.t;
  st.sc.clearT = st.t + c.rng.range(90, 240); st.sc.reason = reason; st.sc.count++; st.scCount++;
  for (const car of st.cars) car.atk = -1;
  pushEvent(st, { t: st.t, lap: lapOf(st), kind: 'sc', detail: reason, sig: SIG.sc });
  // teams consider cheap stops
  for (let k = 0; k < st.cars.length; k++) strategy(st, c, k);
}
function scTargetSpeed(st: RaceState, c: Cache, car: CarState, oi: number): number {
  // cars far back catch up quickly; the queue follows the safety car at a controlled pace
  if (oi === 0 || st.cars[st.order[0]] === car) {
    const d = st.sc.dist - car.dist;
    return d > 60 ? 60 : Math.max(10, st.sc.v + (d - 25) * 0.3);
  }
  return car.v + 30;
}
function stepSafetyCar(st: RaceState, c: Cache) {
  const tr = c.tr;
  const i = tr.idx(st.sc.dist);
  const vRef = c.baseProf[i] * 0.62;
  st.sc.v = clamp(vRef, 12, 32);
  st.sc.dist += st.sc.v * DT;
  if (st.t > st.sc.clearT && st.sc.laps >= 2 && !st.sc.inNext) { st.sc.inNext = true; pushEvent(st, { t: st.t, lap: lapOf(st), kind: 'scin', detail: 'safety car in this lap', sig: 0.6 }); }
  const leader = st.cars[st.order[0]];
  const scS = tr.wrap(st.sc.dist);
  if (st.sc.inNext && tr.inPitSpan(scS) && tr.pitFraction(scS) < 0.1) {
    st.sc.on = false; st.sc.inNext = false; st.phase = 'run';
    pushEvent(st, { t: st.t, lap: lapOf(st), kind: 'restart', detail: 'racing resumes', sig: 0.75 });
  }
  if (leader.lap >= st.laps - 1 && st.sc.on) { st.sc.on = false; st.phase = 'run'; pushEvent(st, { t: st.t, lap: lapOf(st), kind: 'restart', detail: 'safety car withdrawn for the final lap', sig: 0.7 }); }
}
function redFlag(st: RaceState, c: Cache, reason: string) {
  if (st.kind === 'quali') return;
  if (st.phase === 'red' || st.phase === 'done' || st.phase === 'fin') return;
  st.phase = 'red'; st.redCount++;
  st.sc.on = false;
  st.red = { since: st.t, resumeAt: st.t + c.rng.range(900, 1800), reason, count: (st.red?.count ?? 0) + 1 };
  st.redOrder = st.order.slice();
  const leaderLap = st.cars[st.order[0]].lap;
  if (leaderLap >= st.laps * 0.9) { st.red.resumeAt = st.t; }
  for (const car of st.cars) { car.atk = -1; if (car.mode === 'pit') { car.mode = 'run'; car.pitPhase = 0; } }
  // classification order frozen: running order at the moment of suspension
  pushEvent(st, { t: st.t, lap: lapOf(st), kind: 'red', detail: reason, sig: SIG.red });
}
function restartFromRed(st: RaceState, c: Cache) {
  const tr = c.tr, L = tr.length;
  const order = st.redOrder ?? st.order;
  const running = order.filter((k) => !st.cars[k].ret && st.cars[k].mode !== 'fin' && st.cars[k].mode !== 'out');
  running.forEach((k, p) => {
    const car = st.cars[k];
    const back = 12 + p * 7.5;
    // cars keep their completed laps; they line up behind the line in the frozen order
    car.s = L - back; car.dist = car.lap * L + car.s;
    car.v = 0; car.mode = 'run'; car.pitPhase = 0; car.pitReq = null; car.inc = null; car.atk = -1; car.yieldT = 0; car.blueT = 0;
    car.lat = (p % 2 === 0 ? -1 : 1) * Math.min(2.2, tr.w[tr.idx(car.s)] / 2 - 1.1);
    car.lapValid = false; car.clean = false; car.lapStart = st.t;
    car.react = clamp(0.3 + c.rng.gauss(0, 0.07), 0.15, 0.8);
    // teams may change tyres under the red flag
    car.tyre = chooseTyre(st, c, k); car.wear = 0; car.puncture = false; car.dmgAero = 0;
    if (!car.used.includes(car.tyre)) car.used.push(car.tyre);
    refreshProfile(st, c, k, true);
  });
  st.phase = 'grid'; st.lightsT = st.t + 60; st.red = null; st.redOrder = null;
  for (const k of running) st.cars[k].startT = st.lightsT + st.cars[k].react;
  pushEvent(st, { t: st.t, lap: lapOf(st), kind: 'restart', detail: 'standing restart after the red flag', sig: 0.8 });
}

// ---------------------------------------------------------------------------- utilities for viewers
export function runToEnd(st: RaceState, maxSteps = 5_000_000) {
  let n = 0;
  while (st.phase !== 'done' && st.phase !== 'abandoned' && st.phase !== 'postponed' && n < maxSteps) { stepRace(st); n++; }
  return n;
}
export function isOver(st: RaceState) { return st.phase === 'done' || st.phase === 'abandoned' || st.phase === 'postponed'; }
