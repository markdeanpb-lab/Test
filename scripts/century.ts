// Headless long-run check: npx tsx scripts/century.ts [seed] [years]
// Runs the same engine as the game, then prints integrity and long-term behaviour checks.
import { createUniverse } from '../src/sim/universe';
import { nextTask, runTask } from '../src/sim/world/season';
import { rebuildCareers } from '../src/sim/world/stats';
import { ageYears } from '../src/sim/dates';
import fs from 'node:fs';

const seed = process.argv[2] ?? 'century-1', years = +(process.argv[3] ?? 100);
const out = process.argv[4];
const t0 = performance.now();
const u = createUniverse(seed);
const end = u.meta.settings.startYear + years;
const perYear: { year: number; s: number }[] = [];
let lastYearT = t0;
for (;;) {
  const t = nextTask(u);
  if (t.year >= end && t.kind === 'newyear') break;
  runTask(u, t);
  if (t.kind === 'seasonEnd') { const now = performance.now(); perYear.push({ year: t.year, s: (now - lastYearT) / 1000 }); lastYearT = now; if (t.year % 10 === 5) console.error(`${t.year} … ${((now - t0) / 1000).toFixed(0)}s`); }
}
const secs = (performance.now() - t0) / 1000;
const json = JSON.stringify(u);
const checks: [string, boolean, string][] = [];
const seasons = Object.values(u.seasons);
// continuity of calendar years
const ys = seasons.map((s) => s.year).sort((a, b) => a - b);
checks.push(['Every calendar year present', ys.length === years && ys.every((y, i) => i === 0 || y === ys[i - 1] + 1), `${ys[0]}–${ys[ys.length - 1]} (${ys.length})`]);
// points reconcile with standings
let bad = 0;
for (const s of seasons) { for (const row of s.driverStandings) { const pts = Object.values(u.races).filter((r) => r.year === s.year).flatMap((r) => r.results).filter((x) => x.driverId === row.id).reduce((a, x) => a + x.points, 0); if (Math.abs(pts - row.points) > 1e-6) bad++; } }
checks.push(['Standings equal the sum of race points', bad === 0, `${bad} mismatches`]);
// careers cache equals rebuild from history
const rb = rebuildCareers(u);
let cm = 0; for (const [id, c] of Object.entries(u.careers)) { const r = rb.careers[id]; if (!r || r.wins !== (c as any).wins || r.starts !== (c as any).starts || r.titles !== (c as any).titles) cm++; }
checks.push(['Career cache matches a rebuild from race records', cm === 0, `${cm} differences`]);
// lap counts & classification
let clsBad = 0; for (const r of Object.values(u.races)) { const pos = r.results.filter((x) => x.pos !== null).map((x) => x.pos!); if (pos.some((p, i) => p !== i + 1)) clsBad++; }
checks.push(['Classified positions are contiguous from 1', clsBad === 0, `${clsBad} races`]);
// finite numbers
let nonFinite = 0; JSON.parse(json, (k, v) => { if (typeof v === 'number' && !Number.isFinite(v)) nonFinite++; return v; });
checks.push(['No non-finite numbers in saved state', nonFinite === 0, `${nonFinite}`]);
// population replacement and team participation
const activeByDecade: string[] = [];
for (let y = u.meta.settings.startYear; y < end; y += 10) { const s = u.seasons[y]; activeByDecade.push(`${y}:${s?.entries.length ?? 0}t/${s?.driverStandings.length ?? 0}d`); }
const lastSeason = u.seasons[end - 1];
const founders = new Set(u.seasons[u.meta.settings.startYear].entries.flatMap((e) => e.drivers));
const foundersStill = lastSeason.entries.flatMap((e) => e.drivers).filter((d) => founders.has(d)).length;
checks.push(['Original field replaced by later generations', foundersStill === 0, `${foundersStill} founders still racing in ${end - 1}`]);
checks.push(['Healthy team participation throughout', seasons.every((s) => s.status === 'cancelled' || s.entries.length >= 8), activeByDecade.join(' ')]);
// family chronology
let famBad = 0, famLinks = 0;
for (const p of Object.values(u.people)) for (const par of p.family.parents) { famLinks++; const q = u.people[par]; const gap = ageYears(q.dob, p.dob); if (gap < 18 || gap > 50) famBad++; }
checks.push(['Family links have plausible parent ages', famBad === 0, `${famLinks} links, ${famBad} implausible`]);
// finances bounded
const cash = Object.values(u.teams).map((t) => t.cash);
checks.push(['Team finances stay bounded', Math.max(...cash) < 1e5 && Math.min(...cash) >= 0, `max cash ${Math.max(...cash).toFixed(1)}`]);
// calendar variety
let consec = 0, unexplained = 0; for (const s of seasons) for (let i = 2; i < s.meetings.length; i++) if (s.meetings[i].venueId === s.meetings[i - 1].venueId && s.meetings[i].venueId === s.meetings[i - 2].venueId) { consec++; if (!s.meetings[i].calendarReason) unexplained++; }
checks.push(['No unexplained runs of three meetings on one layout', unexplained === 0, `${consec} runs, ${unexplained} unexplained`]);
const layoutsPerSeason = seasons.filter((s) => s.meetings.length).map((s) => new Set(s.meetings.map((m) => m.geometryId)).size);
checks.push(['Seasons use several layouts', layoutsPerSeason.every((n) => n >= 3), `min ${Math.min(...layoutsPerSeason)} max ${Math.max(...layoutsPerSeason)}`]);
// records never awarded twice for one occasion (one race, or one season for season-level records)
let dup = 0; for (const r of Object.values(u.records)) { const keys = r.history.map((h) => `${h.year}|${h.meetingId ?? 'season'}|${h.newHolders.join()}|${h.kind}`); dup += keys.length - new Set(keys).size; }
checks.push(['Record history has no duplicate awards', dup === 0, `${dup}`]);
// events causality references valid
const evIds = new Set(u.events.map((e) => e.id)); let badCause = 0; for (const e of u.events) for (const c of e.causes) if (!evIds.has(c)) badCause++;
checks.push(['Every event cause refers to a recorded event', badCause === 0, `${badCause}`]);
// champions & dominance summary
const champs = seasons.filter((s) => s.championId).map((s) => s.championId!);
const champTeams = seasons.filter((s) => s.teamChampionId).map((s) => u.teams[s.teamChampionId!].lineageId);
const regsChanges = Object.values(u.regs.sets).filter((r) => r.label !== 'Unchanged').map((r) => `${r.year}: ${r.label}`);
const techFirsts = Object.values(u.tech).filter((t) => t.firstDay).map((t) => `${t.id}@${Math.floor(1900 + t.firstDay! / 365.25)}`);
const report = {
  seed, years, seconds: +secs.toFixed(1), secondsPerYear: +(secs / years).toFixed(2), sizeMB: +(json.length / 1e6).toFixed(1),
  setupsMB: +(JSON.stringify(u.setups).length / 1e6).toFixed(1), racesMB: +(JSON.stringify(u.races).length / 1e6).toFixed(1), eventsMB: +(JSON.stringify(u.events).length / 1e6).toFixed(1),
  races: Object.keys(u.races).length, people: Object.keys(u.people).length, events: u.events.length, distinctChampions: new Set(champs).size, championships: champs.length, distinctTeamLineagesWithTitles: new Set(champTeams).size,
  seasonsByStatus: seasons.reduce((a: any, s) => ((a[s.status] = (a[s.status] ?? 0) + 1), a), {}),
  regulationChanges: regsChanges.length, techFirsts, industryEnd: u.world.industry, media: u.world.media,
  checks: checks.map(([n, ok, d]) => `${ok ? 'PASS' : 'FAIL'}  ${n} — ${d}`),
  slowestYears: perYear.sort((a, b) => b.s - a.s).slice(0, 3),
};
console.log(JSON.stringify(report, null, 1));
if (out) { fs.writeFileSync(out, JSON.stringify(report, null, 1)); }
