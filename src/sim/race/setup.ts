// A WeekendSetup is the complete, immutable input to a race weekend (qualifying + race). Together with the
// engine version it determines every sporting outcome, so storing it allows faithful reconstruction.
import type { CarSpec, CarVisual, QualiFormat } from '../types';

export interface DriverSnap {
  pace: number; quali: number; racecraft: number; defence: number; consistency: number; aggression: number;
  wet: number; mechSympathy: number; adaptability: number; pressure: number; fitness: number;
  form: number; confidence: number; health: number; starts: number; trackExp: number; age: number; rookie: boolean;
  discipline: number; temperament: number; balancePref: number;
}

export interface EntrantSetup {
  no: number;
  driverId: string;
  teamId: string;
  carId: string;
  name: string; // display surname
  full: string;
  code: string; // 3-letter driver code
  team: string;
  teamCode: string;
  colour: string;
  colour2: string;
  accent: string;
  pattern: string;
  d: DriverSnap;
  c: CarSpec;
  vis: CarVisual;
  crew: number; // pit crew quality 0..1
  engineering: number; // setup / operations quality 0..1
  strategyRisk: number; // 0..1 team risk appetite
  forecastSkill: number; // 0..1
  fit: number; // car-driver fit (-1..1)
  teammate: number; // entrant index or -1
  rivals: [number, number][]; // [entrant index, intensity]
  friends: [number, number][];
  champPos: number;
  champGap: number; // points behind leader (0 if leading)
  contender: boolean;
  orders: 'none' | 'lead' | 'second';
}

export interface RulesSnap {
  year: number;
  laps: number;
  maxSeconds: number;
  safetyCar: boolean;
  pitKph: number | null;
  refuel: boolean;
  compounds: string[];
  wetTyres: string[];
  mandatoryTwo: boolean;
  penalties: 'fines' | 'time' | 'full';
  blueFlags: boolean;
  classifiedPct: number;
  redFlagRestart: boolean;
  fuelLimitKg: number | null;
  teamOrders: boolean;
  crashStructures: number;
  cockpitProtection: number;
  medical: number;
  fatalities: boolean;
  qualiFormat: QualiFormat;
  pitServiceBase: number; // seconds for a routine tyre change in this era
  refuelRate: number; // kg per second
  radio: boolean; // teams can call drivers in immediately
  telemetry: number; // 0..1 quality of team information about tyres/fuel
}

export interface LayoutSnap { geometryId: string; grip: number; barrier: string; safety: number; pitQuality: number; surface: string }

export interface WeekendSetup {
  v: string;
  meetingId: string;
  seed: string;
  year: number;
  month: number;
  name: string;
  layout: LayoutSnap;
  rules: RulesSnap;
  entrants: EntrantSetup[];
  significance: number;
  titleContext: string; // e.g. 'decider' | 'open' | ''
  test?: string; // named test scenario (never used in ordinary play)
}

/** Round to 4 decimals so a setup serialises exactly. */
export const q4 = (v: number) => Math.round(v * 10000) / 10000;

// ------------------------------------------------------------------ compact storage
// Display strings are not stored: they are restored from stable IDs (people never change name; team
// branding for the season comes from the season entry), which keeps a century of setups small.
const D_KEYS = ['pace', 'quali', 'racecraft', 'defence', 'consistency', 'aggression', 'wet', 'mechSympathy', 'adaptability', 'pressure', 'fitness', 'form', 'confidence', 'health', 'starts', 'trackExp', 'age', 'rookie', 'discipline', 'temperament', 'balancePref'] as const;
const C_KEYS = ['powerKW', 'massKg', 'cdA', 'clA', 'mechGrip', 'brakeG', 'tyreWear', 'fuelPerKm', 'reliability', 'cooling', 'durability', 'wetHandling', 'aeroWindow', 'balance', 'drivability', 'energyMJ'] as const;
const V_KEYS = ['era', 'wheelScale', 'wing', 'cockpit', 'noseHeight', 'sidepods', 'length', 'width', 'enclosedWheels'] as const;

export function packSetup(s: WeekendSetup): string {
  const ents = s.entrants.map((e) => [
    e.no, e.driverId, e.teamId, e.carId, D_KEYS.map((k) => (k === 'rookie' ? (e.d.rookie ? 1 : 0) : (e.d as any)[k])), C_KEYS.map((k) => e.c[k]), V_KEYS.map((k) => (e.vis as any)[k]),
    e.crew, e.engineering, e.strategyRisk, e.forecastSkill, e.fit, e.teammate, e.rivals, e.friends, e.champPos, e.champGap, e.contender ? 1 : 0, e.orders,
  ]);
  return JSON.stringify({ v: s.v, m: s.meetingId, sd: s.seed, y: s.year, mo: s.month, n: s.name, l: s.layout, r: s.rules, e: ents, sig: s.significance, tc: s.titleContext, t: s.test });
}

export function unpackSetup(str: string, names: (e: { driverId: string; teamId: string }) => Partial<EntrantSetup>): WeekendSetup {
  const o = JSON.parse(str);
  if (!Array.isArray(o.e)) return o as WeekendSetup; // legacy/full format
  const entrants: EntrantSetup[] = o.e.map((a: any[]) => {
    const [no, driverId, teamId, carId, d, c, v, crew, engineering, strategyRisk, forecastSkill, fit, teammate, rivals, friends, champPos, champGap, contender, orders] = a;
    const dd: any = {}; D_KEYS.forEach((k, i) => (dd[k] = k === 'rookie' ? !!d[i] : d[i]));
    const cc: any = {}; C_KEYS.forEach((k, i) => (cc[k] = c[i]));
    const vv: any = {}; V_KEYS.forEach((k, i) => (vv[k] = v[i]));
    const base: EntrantSetup = { no, driverId, teamId, carId, name: driverId, full: driverId, code: driverId.slice(-3), team: teamId, teamCode: teamId, colour: '#888', colour2: '#fff', accent: '#000', pattern: 'plain', d: dd, c: cc, vis: vv, crew, engineering, strategyRisk, forecastSkill, fit, teammate, rivals, friends, champPos, champGap, contender: !!contender, orders };
    return { ...base, ...names({ driverId, teamId }) };
  });
  return { v: o.v, meetingId: o.m, seed: o.sd, year: o.y, month: o.mo, name: o.n, layout: o.l, rules: o.r, entrants, significance: o.sig, titleContext: o.tc, test: o.t };
}
