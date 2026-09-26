// Technology: feasibility follows the world's industrial capability (not fixed years); teams choose what
// to research with finite money; outcomes are uncertain; techs can spread, be refined, banned, return.
import type { TechDef, Universe, Team, CarSpec, TechWorld } from '../types';
import { Rng } from '../rng';
import { clamp } from '../dmath';

// `from` is an industry-index threshold (0 = 1926 baseline, ~1 = mid-2020s capability, >1 future).
// Effects are fractional changes (e.g. powerKW: 0.2 = +20%) except clA/brakeG/drivability/energyMJ (additive)
// and massKg (additive kg).
export const TECHS: TechDef[] = [
  { id: 'supercharger', name: 'Supercharging', area: 'engine', from: 0.0, prereqs: [], cost: 0.6, years: 1, uncertainty: 0.35, effects: { powerKW: 0.2, fuelPerKm: 0.12, reliability: 0.25 }, risk: 0.4, banRisk: 0.35, window: 'best at high revs; strains the engine', description: 'Forced induction by mechanically driven compressor.' },
  { id: 'hydraulic-brakes', name: 'Hydraulic drum brakes', area: 'chassis', from: 0.02, prereqs: [], cost: 0.4, years: 1, uncertainty: 0.2, effects: { brakeG: 0.12 }, risk: 0.1, banRisk: 0, description: 'Hydraulic actuation gives stronger, more even braking.' },
  { id: 'independent-suspension', name: 'Independent front suspension', area: 'chassis', from: 0.08, prereqs: [], cost: 0.7, years: 1, uncertainty: 0.35, effects: { mechGrip: 0.04, tyreWear: -0.05 }, risk: 0.2, banRisk: 0, description: 'Each front wheel follows the road on its own.' },
  { id: 'streamlining', name: 'Streamlined bodywork', area: 'aero', from: 0.1, prereqs: [], cost: 0.5, years: 1, uncertainty: 0.4, effects: { cdA: -0.12 }, risk: 0.05, banRisk: 0, window: 'helps on long straights', description: 'Enveloping bodywork cuts drag.' },
  { id: 'alcohol-fuel', name: 'Alcohol fuel blends', area: 'engine', from: 0.05, prereqs: [], cost: 0.3, years: 1, uncertainty: 0.25, effects: { powerKW: 0.07, fuelPerKm: 0.45, cooling: 0.1 }, risk: 0.1, banRisk: 0.3, description: 'Methanol-rich fuel: more power, much thirstier.' },
  { id: 'twin-cam', name: 'Twin overhead camshafts', area: 'engine', from: 0.12, prereqs: [], cost: 0.8, years: 2, uncertainty: 0.3, effects: { powerKW: 0.1, reliability: 0.05 }, risk: 0.2, banRisk: 0, description: 'Higher-revving valve gear.' },
  { id: 'disc-brakes', name: 'Disc brakes', area: 'chassis', from: 0.28, prereqs: ['hydraulic-brakes'], cost: 1.0, years: 1, uncertainty: 0.3, effects: { brakeG: 0.22 }, risk: 0.15, banRisk: 0, description: 'Resist fade lap after lap.' },
  { id: 'fuel-injection', name: 'Fuel injection', area: 'engine', from: 0.3, prereqs: ['twin-cam'], cost: 1.1, years: 2, uncertainty: 0.35, effects: { powerKW: 0.06, fuelPerKm: -0.08, drivability: 0.05 }, risk: 0.25, banRisk: 0, description: 'Precise fuel metering for power and economy.' },
  { id: 'rear-engine', name: 'Mid-engine layout', area: 'chassis', from: 0.34, prereqs: ['independent-suspension'], cost: 1.6, years: 2, uncertainty: 0.45, effects: { massKg: -40, mechGrip: 0.04, cdA: -0.1, tyreWear: -0.06 }, risk: 0.3, banRisk: 0, window: 'lighter, more agile; tricky at the limit', description: 'Engine behind the driver: lighter, lower and nimbler.' },
  { id: 'monocoque', name: 'Monocoque chassis', area: 'materials', from: 0.4, prereqs: ['rear-engine'], cost: 1.5, years: 2, uncertainty: 0.35, effects: { massKg: -25, mechGrip: 0.02, durability: 0.12 }, risk: 0.2, banRisk: 0, description: 'Stressed-skin tub replaces the spaceframe.' },
  { id: 'aerofoil-wings', name: 'Aerofoil wings', area: 'aero', from: 0.45, prereqs: [], cost: 1.3, years: 1, uncertainty: 0.55, effects: { clA: 1.5, cdA: 0.18, aeroWindow: 0.2 }, risk: 0.35, banRisk: 0.3, window: 'grip in fast corners; turbulent in traffic', description: 'Inverted wings press the car into the road.' },
  { id: 'slick-tyres', name: 'Slick racing tyres', area: 'tyres', from: 0.46, prereqs: [], cost: 0.9, years: 1, uncertainty: 0.25, effects: { mechGrip: 0.1, tyreWear: 0.1 }, risk: 0.1, banRisk: 0.1, window: 'dry only; hopeless in the wet', description: 'Treadless tyres for maximum dry grip.' },
  { id: 'ground-effect', name: 'Ground-effect underbody', area: 'aero', from: 0.52, prereqs: ['aerofoil-wings', 'monocoque'], cost: 2.4, years: 2, uncertainty: 0.6, effects: { clA: 1.9, cdA: -0.04, aeroWindow: 0.35, durability: -0.05 }, risk: 0.45, banRisk: 0.65, window: 'enormous grip when sealed; vicious when it stalls', description: 'Venturi tunnels suck the car to the road.' },
  { id: 'turbo', name: 'Turbocharging', area: 'engine', from: 0.52, prereqs: ['fuel-injection'], cost: 2.8, years: 2, uncertainty: 0.6, effects: { powerKW: 0.42, fuelPerKm: 0.2, reliability: 0.45, cooling: -0.15 }, risk: 0.6, banRisk: 0.55, window: 'huge power; lag, heat and fragility', description: 'Exhaust-driven compressor multiplies power.' },
  { id: 'carbon-composite', name: 'Carbon-fibre composites', area: 'materials', from: 0.56, prereqs: ['monocoque'], cost: 2.0, years: 2, uncertainty: 0.35, effects: { massKg: -20, durability: 0.22, mechGrip: 0.02 }, risk: 0.15, banRisk: 0, description: 'Stiffer, lighter and far safer chassis.' },
  { id: 'carbon-brakes', name: 'Carbon brakes', area: 'chassis', from: 0.6, prereqs: ['disc-brakes', 'carbon-composite'], cost: 1.2, years: 1, uncertainty: 0.3, effects: { brakeG: 0.3 }, risk: 0.2, banRisk: 0, window: 'need heat to work', description: 'Carbon discs and pads for immense stopping power.' },
  { id: 'telemetry', name: 'Telemetry', area: 'electronics', from: 0.6, prereqs: [], cost: 1.0, years: 1, uncertainty: 0.2, effects: { reliability: -0.12, drivability: 0.03 }, risk: 0.05, banRisk: 0, description: 'Data from the car lets engineers see problems coming.' },
  { id: 'active-suspension', name: 'Active suspension', area: 'electronics', from: 0.66, prereqs: ['telemetry', 'carbon-composite'], cost: 3.0, years: 2, uncertainty: 0.6, effects: { mechGrip: 0.04, clA: 0.5, aeroWindow: -0.2, reliability: 0.2 }, risk: 0.5, banRisk: 0.6, window: 'keeps the aero platform stable', description: 'Computer-controlled ride height.' },
  { id: 'semi-auto', name: 'Semi-automatic gearbox', area: 'electronics', from: 0.66, prereqs: ['telemetry'], cost: 1.8, years: 2, uncertainty: 0.45, effects: { drivability: 0.08, reliability: 0.12, powerKW: 0.01 }, risk: 0.45, banRisk: 0, description: 'Paddle shifts: faster changes, fewer missed gears.' },
  { id: 'traction-control', name: 'Traction control', area: 'electronics', from: 0.7, prereqs: ['semi-auto'], cost: 1.6, years: 1, uncertainty: 0.35, effects: { drivability: 0.14, wetHandling: 0.06 }, risk: 0.2, banRisk: 0.55, description: 'Electronics trim wheelspin.' },
  { id: 'raised-nose', name: 'Raised nose aerodynamics', area: 'aero', from: 0.72, prereqs: ['aerofoil-wings'], cost: 1.4, years: 1, uncertainty: 0.4, effects: { clA: 0.45, aeroWindow: 0.05 }, risk: 0.1, banRisk: 0, description: 'Air fed cleanly under the car.' },
  { id: 'seamless-shift', name: 'Seamless-shift gearbox', area: 'chassis', from: 0.84, prereqs: ['semi-auto'], cost: 1.6, years: 1, uncertainty: 0.35, effects: { drivability: 0.04, powerKW: 0.01, fuelPerKm: -0.02 }, risk: 0.3, banRisk: 0, description: 'Zero interruption in drive between gears.' },
  { id: 'energy-recovery', name: 'Kinetic energy recovery', area: 'energy', from: 0.86, prereqs: ['telemetry'], cost: 2.4, years: 2, uncertainty: 0.5, effects: { energyMJ: 0.4, powerKW: 0.05, massKg: 20, reliability: 0.15 }, risk: 0.4, banRisk: 0.2, description: 'Braking energy stored and redeployed.' },
  { id: 'hybrid-unit', name: 'Hybrid power unit', area: 'energy', from: 0.94, prereqs: ['energy-recovery', 'turbo'], cost: 4.5, years: 3, uncertainty: 0.55, effects: { powerKW: 0.12, fuelPerKm: -0.32, massKg: 35, energyMJ: 2, reliability: 0.25 }, risk: 0.5, banRisk: 0.1, window: 'efficient; complex and heavy', description: 'Turbo engine plus electric motor-generators.' },
  { id: 'cockpit-protection', name: 'Cockpit protection structure', area: 'safety', from: 0.9, prereqs: ['carbon-composite'], cost: 0.8, years: 1, uncertainty: 0.1, effects: { massKg: 7, cdA: 0.01 }, risk: 0.02, banRisk: 0, description: 'A titanium hoop shields the driver\'s head.' },
  { id: 'synthetic-fuel', name: 'Synthetic sustainable fuel', area: 'energy', from: 1.02, prereqs: [], cost: 2.0, years: 2, uncertainty: 0.4, effects: { powerKW: -0.03, fuelPerKm: 0.02 }, risk: 0.2, banRisk: 0, description: 'Carbon-neutral fuel with slightly less punch.' },
  { id: 'active-aero', name: 'Active aerodynamics', area: 'aero', from: 1.04, prereqs: ['raised-nose', 'telemetry'], cost: 3.2, years: 2, uncertainty: 0.5, effects: { cdA: -0.12, clA: 0.3, aeroWindow: -0.1 }, risk: 0.35, banRisk: 0.35, description: 'Moving wings: low drag on straights, grip in corners.' },
  { id: 'battery-electric', name: 'Battery-electric drivetrain', area: 'energy', from: 1.08, prereqs: ['hybrid-unit'], cost: 5.0, years: 3, uncertainty: 0.6, effects: { powerKW: 0.08, fuelPerKm: -0.9, massKg: 80, energyMJ: 6, reliability: 0.1, drivability: 0.08 }, risk: 0.5, banRisk: 0.2, window: 'instant torque; heavy; energy-limited', description: 'Full electric propulsion.' },
  { id: 'solid-state', name: 'Solid-state batteries', area: 'energy', from: 1.18, prereqs: ['battery-electric'], cost: 3.5, years: 2, uncertainty: 0.5, effects: { massKg: -55, energyMJ: 2, reliability: -0.05 }, risk: 0.3, banRisk: 0, description: 'Lighter, denser energy storage.' },
  { id: 'ai-strategy', name: 'Predictive strategy systems', area: 'electronics', from: 1.12, prereqs: ['telemetry'], cost: 1.5, years: 1, uncertainty: 0.3, effects: { reliability: -0.08, tyreWear: -0.04 }, risk: 0.1, banRisk: 0.15, description: 'Models that forecast tyre life and traffic.' },
  { id: 'hydrogen-cell', name: 'Hydrogen fuel cell', area: 'energy', from: 1.22, prereqs: ['battery-electric'], cost: 5.5, years: 3, uncertainty: 0.7, effects: { massKg: 30, energyMJ: 3, reliability: 0.35, fuelPerKm: -0.5 }, risk: 0.6, banRisk: 0.2, window: 'long range; still immature', description: 'An experimental hydrogen powertrain.' },
  { id: 'morphing-body', name: 'Morphing bodywork', area: 'aero', from: 1.3, prereqs: ['active-aero'], cost: 4.0, years: 3, uncertainty: 0.65, effects: { cdA: -0.1, clA: 0.5, aeroWindow: -0.15, reliability: 0.2 }, risk: 0.5, banRisk: 0.5, description: 'Shape-changing surfaces tuned corner by corner.' },
  { id: 'superconducting-motor', name: 'Superconducting motors', area: 'energy', from: 1.4, prereqs: ['solid-state'], cost: 6.0, years: 3, uncertainty: 0.7, effects: { powerKW: 0.12, massKg: -25, reliability: 0.25 }, risk: 0.6, banRisk: 0.1, description: 'Near-lossless electric motors.' },
];
export const TECH_BY_ID: Record<string, TechDef> = Object.fromEntries(TECHS.map((t) => [t.id, t]));

export function initTechWorld(u: Universe, rng: Rng) {
  for (const t of TECHS) {
    // each universe's industrial history shifts when an idea becomes practical
    const w: TechWorld = { id: t.id, feasibleFrom: clamp(t.from + rng.gauss(0, 0.03), 0, 2), status: 'dormant', adopters: [], eventIds: [] };
    u.tech[t.id] = w;
  }
}

export function techFeasible(u: Universe, id: string): boolean {
  const w = u.tech[id];
  return !!w && u.world.industry >= w.feasibleFrom && w.status !== 'banned';
}

export function teamHas(t: Team, id: string) { return t.tech[id]?.status === 'developed'; }

/** Research candidates a team would consider this year, scored by philosophy, others' success and cost. */
export function researchOptions(u: Universe, t: Team): { id: string; score: number }[] {
  const out: { id: string; score: number }[] = [];
  const regs = u.regs.sets[u.regs.current];
  for (const d of TECHS) {
    if (!techFeasible(u, d.id)) continue;
    if (regs.bannedTech.includes(d.id)) continue;
    const prog = t.tech[d.id];
    if (prog && (prog.status === 'developed' || prog.status === 'research')) continue;
    if (prog?.status === 'failed' && u.clock.year - (prog.doneYear ?? 0) < 2) continue;
    if (d.prereqs.some((p) => !teamHas(t, p))) continue;
    if (d.area === 'energy' && (d.id === 'battery-electric' || d.id === 'solid-state' || d.id === 'superconducting-motor' || d.id === 'hydrogen-cell') && !regs.electric && !regs.hybrid) continue;
    if (d.id === 'hybrid-unit' && !regs.hybrid) continue;
    if (d.id === 'synthetic-fuel' && regs.fuel !== 'synthetic') continue;
    const w = u.tech[d.id];
    let score = 1;
    const adopters = w.adopters.length;
    score += adopters * 0.5; // proven elsewhere: copy
    if (adopters === 0) score += t.philosophy.risk * 1.2 - 0.3; // pioneers take risks
    const focusMap: Record<string, string[]> = { power: ['engine', 'energy'], aero: ['aero'], mechanical: ['chassis', 'tyres', 'materials'], reliability: ['materials', 'electronics'], balanced: [] };
    if (focusMap[t.philosophy.focus]?.includes(d.area)) score += 0.8;
    if (d.area === 'safety') score += u.world.safetyAttitude * 1.5;
    score -= d.cost * 0.15;
    out.push({ id: d.id, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Aggregate spec effects of the techs a team has developed and may legally use. */
export function techEffects(u: Universe, t: Team): { mult: Partial<Record<keyof CarSpec, number>>; add: Partial<Record<keyof CarSpec, number>>; list: string[] } {
  const regs = u.regs.sets[u.regs.current];
  const mult: Partial<Record<keyof CarSpec, number>> = {}, add: Partial<Record<keyof CarSpec, number>> = {};
  const list: string[] = [];
  const obsolete = new Set<string>();
  // superseded techs stop contributing (e.g. battery-electric replaces supercharging's role)
  if (teamHas(t, 'battery-electric')) { obsolete.add('supercharger'); obsolete.add('turbo'); obsolete.add('alcohol-fuel'); obsolete.add('fuel-injection'); obsolete.add('hybrid-unit'); }
  if (teamHas(t, 'turbo')) obsolete.add('supercharger');
  for (const [id, prog] of Object.entries(t.tech)) {
    if (prog.status !== 'developed') continue;
    if (regs.bannedTech.includes(id) || obsolete.has(id)) continue;
    const d = TECH_BY_ID[id]; if (!d) continue;
    if (id === 'alcohol-fuel' && regs.fuel !== 'alcohol' && regs.fuel !== 'petrol') continue;
    if ((id === 'aerofoil-wings' || id === 'raised-nose' || id === 'ground-effect' || id === 'active-aero' || id === 'morphing-body') && regs.aeroCap <= 0) continue;
    if (id === 'ground-effect' && !regs.groundEffect) continue;
    list.push(id);
    const q = prog.quality ?? 1;
    for (const [k, v] of Object.entries(d.effects)) {
      const key = k as keyof CarSpec;
      if (key === 'clA' || key === 'brakeG' || key === 'drivability' || key === 'energyMJ' || key === 'massKg' || key === 'durability' || key === 'cooling' || key === 'aeroWindow' || key === 'wetHandling') add[key] = (add[key] ?? 0) + (v as number) * (key === 'massKg' ? 1 : q);
      else mult[key] = (mult[key] ?? 0) + (v as number) * (key === 'reliability' ? (1.4 - q * 0.6) : q);
    }
    // immature technology is fragile; it matures with years of use
    const age = u.clock.year - (prog.doneYear ?? u.clock.year);
    if (age < 3) mult.reliability = (mult.reliability ?? 0) + d.risk * (0.35 - age * 0.1);
  }
  return { mult, add, list };
}
