// Headless race harness with a synthetic field: npx tsx scripts/race-harness.ts <geometryId> <year> [seed] [n]
import { getTrack } from '../src/sim/track';
import { createRace, stepRace, isOver, cacheOf } from '../src/sim/race/engine';
import { classify } from '../src/sim/race/results';
import { Rng } from '../src/sim/rng';
import type { WeekendSetup, EntrantSetup } from '../src/sim/race/setup';

export function syntheticSetup(geo: string, year: number, seed: string, n = 20): WeekendSetup {
  const r = new Rng(seed + 'field');
  const era = year < 1950 ? 0 : year < 1970 ? 1 : year < 1990 ? 2 : 3;
  const base = [
    { powerKW: 110, massKg: 760, cdA: 0.95, clA: 0, mechGrip: 0.82, brakeG: 0.75, tyreWear: 1.2, fuelPerKm: 0.45, reliability: 1, cooling: 0.4, durability: 0.5, wetHandling: 1, aeroWindow: 0.1, balance: 0, drivability: 0.4, energyMJ: 0 },
    { powerKW: 210, massKg: 620, cdA: 0.75, clA: 0.2, mechGrip: 1.0, brakeG: 1.0, tyreWear: 1, fuelPerKm: 0.4, reliability: 1, cooling: 0.5, durability: 0.5, wetHandling: 1, aeroWindow: 0.1, balance: 0, drivability: 0.5, energyMJ: 0 },
    { powerKW: 420, massKg: 590, cdA: 1.0, clA: 2.5, mechGrip: 1.4, brakeG: 1.5, tyreWear: 1, fuelPerKm: 0.55, reliability: 1, cooling: 0.6, durability: 0.6, wetHandling: 1, aeroWindow: 0.5, balance: 0, drivability: 0.6, energyMJ: 0 },
    { powerKW: 720, massKg: 800, cdA: 1.3, clA: 4.2, mechGrip: 1.6, brakeG: 1.9, tyreWear: 1, fuelPerKm: 0.33, reliability: 1, cooling: 0.7, durability: 0.7, wetHandling: 1, aeroWindow: 0.7, balance: 0, drivability: 0.75, energyMJ: 0 },
  ][era];
  const entrants: EntrantSetup[] = [];
  for (let k = 0; k < n; k++) {
    const team = Math.floor(k / 2);
    const tq = 1 - team / (n / 2);
    const c = { ...base, powerKW: base.powerKW * (0.93 + 0.08 * tq + r.gauss(0, 0.01)), mechGrip: base.mechGrip * (0.97 + 0.04 * tq), clA: base.clA * (0.9 + 0.15 * tq), reliability: 0.7 + r.range(0, 0.8) };
    const a = () => Math.round(r.gaussClamp(70, 10, 40, 97));
    entrants.push({
      no: k + 1, driverId: 'D' + k, teamId: 'T' + team, carId: 'C' + team, name: 'Driver' + k, full: 'Driver ' + k, code: 'D' + String(k).padStart(2, '0'), team: 'Team ' + team, teamCode: 'T' + team,
      colour: '#' + ((team * 2654435761) >>> 8 & 0xffffff).toString(16).padStart(6, '0'), colour2: '#fff', accent: '#000', pattern: 'plain',
      d: { pace: a(), quali: a(), racecraft: a(), defence: a(), consistency: a(), aggression: a(), wet: a(), mechSympathy: a(), adaptability: a(), pressure: a(), fitness: a(), form: 0, confidence: 0.5, health: 1, starts: 30, trackExp: 3, age: 28, rookie: false, discipline: 60, temperament: 50, balancePref: 0 },
      c, vis: { era: 'modern' as any, wheelScale: 1, wing: 1, cockpit: 'open', noseHeight: 0.3, sidepods: 1, length: era === 0 ? 4 : era === 3 ? 5.5 : 4.4, width: era === 3 ? 2 : 1.7, enclosedWheels: false },
      crew: r.range(0.3, 0.9), engineering: r.range(0.3, 0.9), strategyRisk: r.next(), forecastSkill: era / 3, fit: r.gauss(0, 0.5), teammate: k % 2 ? k - 1 : k + 1, rivals: [], friends: [], champPos: k + 1, champGap: k * 5, contender: k < 3, orders: 'none',
    });
  }
  return {
    v: 'test', meetingId: 'TEST', seed, year, month: 6, name: 'Test', layout: { geometryId: geo, grip: 1, barrier: era < 2 ? 'bales' : 'armco', safety: era / 3, pitQuality: 0.5, surface: 'tarmac' },
    rules: { year, laps: Math.round(100000 / getTrack(geo).length), maxSeconds: 7200, safetyCar: era >= 2, pitKph: era >= 2 ? 80 : null, refuel: era === 0 || era === 3 ? false : true, compounds: era === 0 ? ['treaded'] : era === 3 ? ['hard', 'medium', 'soft'] : ['hard', 'soft'], wetTyres: era === 0 ? [] : ['inter', 'wet'], mandatoryTwo: era === 3, penalties: era === 0 ? 'fines' : 'full', blueFlags: era > 0, classifiedPct: 0.9, redFlagRestart: era > 0, fuelLimitKg: null, teamOrders: false, crashStructures: era / 3, cockpitProtection: era / 3, medical: era / 3, fatalities: false, qualiFormat: 'practice', pitServiceBase: [40, 25, 10, 3][era], refuelRate: [1, 2, 8, 12][era], radio: era >= 2, telemetry: era / 3 },
    entrants, significance: 1, titleContext: '',
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const geo = process.argv[2] ?? 'abbey-v1', year = +(process.argv[3] ?? 2020), seed = process.argv[4] ?? 's1', N = +(process.argv[5] ?? 1);
  const tr = getTrack(geo);
  let totOv = 0, totT = 0;
  for (let q = 0; q < N; q++) {
    const setup = syntheticSetup(geo, year, seed + q);
    const grid = setup.entrants.map((_, k) => k);
    const t0 = performance.now();
    const st = createRace(setup, tr, grid);
    let steps = 0;
    while (!isOver(st) && steps < 3e6) { stepRace(st); steps++; }
    const ms = performance.now() - t0; totT += ms;
    const res = classify(st, setup, tr);
    totOv += st.overtakeCount;
    const kinds: Record<string, number> = {};
    for (const e of st.events) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
    console.log(`${geo} ${year} laps=${st.laps} status=${res.status} simT=${(st.t / 60).toFixed(1)}min steps=${steps} ${ms.toFixed(0)}ms overtakes=${st.overtakeCount} leadCh=${st.leadChanges} sc=${st.scCount} red=${st.redCount} weather=${st.startWeather} maxRain=${st.maxRain.toFixed(1)}`);
    console.log('  events', JSON.stringify(kinds));
    if (N === 1) {
      for (const r of res.rows) { const e = setup.entrants[st.cars[r.i].i]; console.log(`  ${String(r.pos ?? '-').padStart(2)} ${e.name.padEnd(9)} g${String(r.grid).padStart(2)} laps ${r.laps} ${r.status.padEnd(8)} ${r.time?.toFixed(1) ?? ''} best ${r.bestLap?.toFixed(2)} pits ${r.pits} ov ${r.overtakes} pace ${r.paceIndex} ${r.reason ?? ''} ${r.where ?? ''} pace=${e.d.pace} team=${e.teamId}`); }
      for (const e of st.events.filter((e) => e.sig >= 0.5).slice(0, 60)) console.log(`   t=${e.t.toFixed(0)} L${e.lap} ${e.kind} ${e.a ?? ''} ${e.b ?? ''} ${e.where ?? ''} ${e.detail ?? ''} ${e.value ?? ''}`);
    }
  }
  console.log(`avg overtakes ${(totOv / N).toFixed(1)} avg ms ${(totT / N).toFixed(0)}`);
}
