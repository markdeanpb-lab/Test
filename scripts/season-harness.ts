import { createUniverse, advance, nextTask } from '../src/sim/universe';
import { fmtDate } from '../src/sim/dates';
const seed = process.argv[2] ?? 'test-1', years = +(process.argv[3] ?? 1);
const t0 = performance.now();
const u = createUniverse(seed);
const endYear = u.meta.settings.startYear + years;
advance(u, (t) => t.year >= endYear && t.kind === 'newyear');
const ms = performance.now() - t0;
for (let y = u.meta.settings.startYear; y < endYear; y++) {
  const s = u.seasons[y];
  const champ = s.championId ? u.people[s.championId] : null;
  const top = s.driverStandings.slice(0, 3).map((r) => `${u.people[r.id].last} ${r.points}(${r.wins}w)`).join(', ');
  const tc = s.teamChampionId ? u.teams[s.teamChampionId].name : '-';
  console.log(`${y} [${s.status}] ${s.meetings.filter(m=>m.status==='completed').length}/${s.meetings.length} races  champion: ${champ ? champ.first + ' ' + champ.last : '-'}  | ${top} | teams: ${tc} | regs: ${u.regs.sets[s.regSetId].label}`);
}
if (years <= 2) {
  const y = u.meta.settings.startYear;
  for (const m of u.seasons[y].meetings) { const r = u.races[m.id]; if (!r) { console.log(m.round, m.name, m.status, m.cancelReason ?? ''); continue; } const w = r.results[0]; console.log(`R${m.round} ${fmtDate(m.day)} ${m.name.padEnd(28)} ${m.geometryId.padEnd(12)} laps ${r.lapsCompleted}/${m.laps} winner ${u.people[w.driverId].last.padEnd(12)} (${u.teams[w.teamId].short}) grid ${w.grid} | ${r.weather.start} | ov ${r.overtakes} sc ${r.safetyCars} dnf ${r.results.filter(x=>x.status==='dnf').length} ${r.status}`); }
}
console.log(`events ${u.events.length}, people ${Object.keys(u.people).length}, teams ${Object.values(u.teams).filter(t=>t.status==='active').length} active, time ${(ms/1000).toFixed(1)}s, size ${(JSON.stringify(u).length/1e6).toFixed(2)}MB`);
console.log('next task', JSON.stringify(nextTask(u)));
const cats: Record<string, number> = {}; let starts = 0;
for (const r of Object.values(u.races)) for (const x of r.results) { starts++; if (x.status === 'dnf') cats[(x.category ?? '?') + ':' + (r.year < 1950 ? 'early' : r.year < 1990 ? 'mid' : 'late')] = (cats[(x.category ?? '?') + ':' + (r.year < 1950 ? 'early' : r.year < 1990 ? 'mid' : 'late')] ?? 0) + 1; }
console.log('starts', starts, 'dnf categories', JSON.stringify(cats));
const byType: Record<string, number> = {}; for (const e of u.events) byType[e.type] = (byType[e.type] ?? 0) + 1; console.log(JSON.stringify(byType));
