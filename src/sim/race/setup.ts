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
