// Car design. Each season a team's car = industrial baseline x the team's know-how in each area x the
// technologies it has developed (and may legally use) x regulation limits, plus an uncertain design
// concept. Specs feed the race physics directly (power, mass, drag, downforce, grip, brakes, wear...).
import type { Universe, Team, CarSpec, CarVisual, CarModel, CarEra, Day } from '../types';
import { Rng } from '../rng';
import { clamp } from '../dmath';
import { techEffects, teamHas } from './tech';
import { addEvent } from './events';
import { dayOf } from '../dates';

/** Industrial baseline for a car built with "ordinary" know-how at industry index I (no special tech). */
export function baseSpec(I: number): CarSpec {
  const i = clamp(I, 0, 1.6);
  return {
    powerKW: 95 + 330 * i + 60 * Math.max(0, i - 1),
    massKg: 780 - 190 * Math.min(i, 0.9),
    cdA: 0.95 - 0.18 * Math.min(i, 1),
    clA: 0.05 + 0.35 * Math.min(i, 1.2),
    mechGrip: 0.8 + 0.42 * Math.min(i, 1.2),
    brakeG: 0.68 + 0.55 * Math.min(i, 1.2),
    tyreWear: 1.2 - 0.3 * Math.min(i, 1),
    fuelPerKm: 0.52 - 0.14 * Math.min(i, 1.2),
    reliability: 1,
    cooling: 0.35 + 0.45 * Math.min(i, 1),
    durability: 0.35 + 0.4 * Math.min(i, 1),
    wetHandling: 1,
    aeroWindow: 0.1,
    balance: 0,
    drivability: 0.35 + 0.3 * Math.min(i, 1.2),
    energyMJ: 0,
  };
}

const r4 = (v: number) => Math.round(v * 10000) / 10000;

export function designCar(u: Universe, t: Team, rng: Rng, year: number): CarModel {
  const regs = u.regs.sets[u.regs.current];
  const b = baseSpec(u.world.industry);
  const K = t.knowledge;
  const fx = techEffects(u, t);
  const s: CarSpec = { ...b };
  // know-how (0..1 relative to the frontier)
  s.powerKW *= 0.93 + 0.08 * K.engine;
  s.clA *= 0.82 + 0.25 * K.aero;
  s.cdA *= 1.04 - 0.06 * K.aero;
  s.mechGrip *= 0.968 + 0.04 * K.chassis;
  s.massKg += (1 - K.chassis) * 22;
  s.tyreWear *= 1.12 - 0.2 * K.chassis;
  s.fuelPerKm *= 1.12 - 0.2 * K.efficiency;
  s.reliability = 2.1 - 1.55 * K.reliability;
  s.durability = clamp(s.durability + (K.reliability - 0.5) * 0.2, 0.1, 1);
  s.cooling = clamp(s.cooling + (K.reliability - 0.5) * 0.2, 0.1, 1);
  s.drivability = clamp(s.drivability + (K.chassis - 0.5) * 0.1, 0.1, 1);
  // technology
  for (const [k, v] of Object.entries(fx.mult)) (s as any)[k] *= 1 + (v as number);
  for (const [k, v] of Object.entries(fx.add)) (s as any)[k] += v as number;
  // design concept: an emphasis with uncertain execution
  const focus = t.philosophy.focus;
  const gamble = rng.gauss(0, 0.35 + t.philosophy.risk * 0.45);
  const conceptQ = clamp(gamble + (t.engineering - 0.5) * 0.4, -1, 1);
  const conceptName = conceptQ > 0.35 ? 'inspired' : conceptQ < -0.35 ? 'troubled' : 'solid';
  if (focus === 'power') { s.powerKW *= 1.03 + 0.02 * conceptQ; s.clA *= 0.97; s.cooling -= 0.05; }
  else if (focus === 'aero') { s.clA *= 1.06 + 0.05 * conceptQ; s.cdA *= 1.02; s.aeroWindow += 0.1; }
  else if (focus === 'mechanical') { s.mechGrip *= 1.012 + 0.008 * conceptQ; s.tyreWear *= 0.96; }
  else if (focus === 'reliability') { s.reliability *= 0.85 - 0.05 * conceptQ; s.powerKW *= 0.99; }
  s.mechGrip *= 1 + 0.012 * conceptQ;
  s.clA *= 1 + 0.05 * conceptQ;
  s.powerKW *= 1 + 0.012 * conceptQ;
  s.balance = clamp(rng.gauss(0, 0.35), -1, 1);
  // regulations
  if (s.powerKW > regs.powerCapKW) s.powerKW = regs.powerCapKW * (0.985 + 0.015 * K.engine);
  if (s.clA > regs.aeroCap) s.clA = regs.aeroCap;
  if (s.massKg < regs.minMassKg) s.massKg = regs.minMassKg;
  if (regs.fuel === 'unleaded') s.powerKW *= 0.985;
  if (regs.fuel === 'synthetic') s.powerKW *= 0.985;
  if (!regs.refuelling && regs.fuelLimitKg) s.fuelPerKm = Math.min(s.fuelPerKm, (regs.fuelLimitKg / regs.raceKm) * 0.985);
  s.reliability = clamp(s.reliability, 0.25, 3.5);
  s.aeroWindow = clamp(s.aeroWindow, 0, 1);
  s.durability = clamp(s.durability, 0.05, 1);
  s.cooling = clamp(s.cooling, 0.05, 1);
  s.drivability = clamp(s.drivability, 0.05, 1);
  s.wetHandling = clamp(s.wetHandling, 0.8, 1.3);
  for (const k of Object.keys(s) as (keyof CarSpec)[]) s[k] = r4(s[k]);
  const visual = carVisual(u, t, year, s);
  const num = Object.values(u.cars).filter((c) => c.lineageId === t.lineageId).length + 1;
  const model: CarModel = {
    id: `C${year}-${t.id}`, teamId: t.id, lineageId: t.lineageId, year, name: `${t.short} ${carSeries(t, num)}`,
    spec: { ...s }, current: { ...s }, visual, techs: fx.list, concept: `${conceptName} ${focus}-focused design`, upgrades: [], engineerId: t.techDirectorId, launchedDay: dayOf(year, 3, 1),
  };
  u.cars[model.id] = model;
  t.carId = model.id;
  return model;
}

function carSeries(t: Team, n: number) {
  const code = t.short.replace(/[^A-Za-z]/g, '').slice(0, 1).toUpperCase() || 'X';
  return `${code}${n}`;
}

export function carEraOf(u: Universe, t: Team, year: number): CarEra {
  if (teamHas(t, 'battery-electric') || teamHas(t, 'morphing-body') || year >= 2060) return 'future';
  if (teamHas(t, 'hybrid-unit') || teamHas(t, 'cockpit-protection')) return 'hybrid';
  if (teamHas(t, 'raised-nose') && teamHas(t, 'carbon-composite')) return teamHas(t, 'semi-auto') ? 'aero' : 'raisednose';
  if (teamHas(t, 'turbo') && teamHas(t, 'aerofoil-wings')) return 'turbo';
  if (teamHas(t, 'ground-effect')) return 'groundeffect';
  if (teamHas(t, 'aerofoil-wings')) return 'wedge';
  if (teamHas(t, 'rear-engine')) return 'cigar';
  if (teamHas(t, 'streamlining') || teamHas(t, 'independent-suspension')) return u.world.industry > 0.25 ? 'frontengine' : 'streamliner';
  return 'vintage';
}

export function carVisual(u: Universe, t: Team, year: number, s: CarSpec): CarVisual {
  const era = carEraOf(u, t, year);
  const table: Record<CarEra, Omit<CarVisual, 'era'>> = {
    vintage: { wheelScale: 1.25, wing: 0, cockpit: 'open', noseHeight: 0.55, sidepods: 0, length: 3.9, width: 1.55, enclosedWheels: false },
    streamliner: { wheelScale: 1.15, wing: 0, cockpit: 'open', noseHeight: 0.45, sidepods: 0, length: 4.2, width: 1.6, enclosedWheels: false },
    frontengine: { wheelScale: 1.1, wing: 0, cockpit: 'open', noseHeight: 0.45, sidepods: 0, length: 4.1, width: 1.6, enclosedWheels: false },
    cigar: { wheelScale: 0.95, wing: 0, cockpit: 'open', noseHeight: 0.35, sidepods: 0, length: 3.8, width: 1.55, enclosedWheels: false },
    wedge: { wheelScale: 1.05, wing: 0.8, cockpit: 'open', noseHeight: 0.25, sidepods: 0.6, length: 4.2, width: 1.9, enclosedWheels: false },
    groundeffect: { wheelScale: 1.05, wing: 0.6, cockpit: 'open', noseHeight: 0.2, sidepods: 1, length: 4.3, width: 2.0, enclosedWheels: false },
    turbo: { wheelScale: 1.05, wing: 1, cockpit: 'open', noseHeight: 0.22, sidepods: 0.9, length: 4.4, width: 2.0, enclosedWheels: false },
    raisednose: { wheelScale: 1, wing: 0.9, cockpit: 'open', noseHeight: 0.55, sidepods: 0.8, length: 4.5, width: 1.9, enclosedWheels: false },
    aero: { wheelScale: 1, wing: 1.1, cockpit: 'open', noseHeight: 0.5, sidepods: 0.8, length: 4.7, width: 1.8, enclosedWheels: false },
    hybrid: { wheelScale: 1.05, wing: 1.1, cockpit: 'halo', noseHeight: 0.3, sidepods: 0.9, length: 5.5, width: 2.0, enclosedWheels: false },
    future: { wheelScale: 1, wing: 0.6, cockpit: 'canopy', noseHeight: 0.2, sidepods: 1, length: 5.2, width: 2.0, enclosedWheels: true },
  };
  const v = table[era];
  return { era, ...v, wing: v.wing * clamp(s.clA / 3.5, 0.3, 1.4) };
}

/** In-season upgrade: a development step with uncertain outcome, funded from the development budget. */
export function inSeasonUpgrade(u: Universe, t: Team, rng: Rng, day: Day, meetingId: string | undefined) {
  const car = t.carId ? u.cars[t.carId] : undefined; if (!car) return;
  const regs = u.regs.sets[u.regs.current];
  const budget = t.cash;
  const cost = 0.02 * scaleMoney(u);
  if (budget < cost * 2 || (regs.costCap !== null && rng.chance(0.3))) return;
  t.cash -= cost;
  const area = rng.weighted(['aero', 'engine', 'chassis', 'reliability'], [1 + (t.philosophy.focus === 'aero' ? 1 : 0), 1 + (t.philosophy.focus === 'power' ? 1 : 0), 1, 0.6 + (t.philosophy.focus === 'reliability' ? 1 : 0)]);
  const quality = t.engineering * 0.6 + t.facilities * 0.4;
  const success = rng.chance(0.45 + 0.4 * quality);
  const delta = success ? rng.range(0.004, 0.015) * (0.6 + quality) : -rng.range(0, 0.006);
  const c = car.current;
  if (area === 'aero') c.clA = r4(Math.min(regs.aeroCap, c.clA * (1 + delta * 2.5)));
  else if (area === 'engine') c.powerKW = r4(Math.min(regs.powerCapKW, c.powerKW * (1 + delta)));
  else if (area === 'chassis') c.mechGrip = r4(c.mechGrip * (1 + delta * 0.6));
  else c.reliability = r4(clamp(c.reliability * (1 - delta * 6), 0.25, 3.5));
  car.upgrades.push({ day, meetingId, area, delta: +delta.toFixed(4), success });
  if (!success && delta < -0.003) addEvent(u, { day, type: 'failed-upgrade', scope: 'team', title: `${t.name} upgrade backfires`, teams: [t.id], severity: 0.3, facts: { area, delta }, meetingId });
}

/** Money scale in £m (2025 values) for the current era — the sport grows with media and popularity. */
export function scaleMoney(u: Universe): number {
  const mediaMult: Record<string, number> = { press: 1, radio: 1.6, tv: 3, 'colour-tv': 6, digital: 12, immersive: 16 };
  return (mediaMult[u.world.media] ?? 1) * (0.5 + u.world.popularity / 100) * (1 + u.world.economy * 0.25);
}
