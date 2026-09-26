// Pre-race preview built only from observable facts: the layout's measured character, testing and
// results evidence, known technology, forecasts and past results at the venue.
import type { Universe, Meeting } from '../sim/types';
import { getTrack } from '../sim/track';
import { streamFor } from '../sim/rng';
import { initialWeather, forecastRain } from '../sim/weather';
import { monthOf } from '../sim/dates';
import { TECH_BY_ID } from '../sim/world/tech';

export interface Preview { layout: string; reasons: string[]; forecast: string; facts: Record<string, any> }

export function meetingPreview(u: Universe, m: Meeting): Preview {
  const tr = getTrack(m.geometryId);
  const g = tr.g.metrics;
  const s = u.seasons[m.year];
  const reasons: string[] = [];
  const entries = s.entries.map((e) => ({ e, car: u.cars[e.carId], team: u.teams[e.teamId] }));
  // 1) layout character -> which kind of car it suits (public knowledge: testing order and technology)
  const testing = s.testing ?? [];
  const powerTechs = ['supercharger', 'turbo', 'hybrid-unit', 'battery-electric'];
  const powerTeams = entries.filter((x) => x.car.techs.some((t) => powerTechs.includes(t))).map((x) => x.team.short);
  if (g.longestStraightM > 600) reasons.push(`${Math.round(g.longestStraightM)} m of flat-out running rewards engine power${powerTeams.length ? ` — ${listNames(powerTeams)} ${powerTeams.length > 1 ? 'have' : 'has'} ${techNames(entries, powerTechs)}` : ''}.`);
  if (g.slowCorners >= 4 || g.minRadiusM < 9) reasons.push(`${g.slowCorners} slow corners (tightest ≈${g.minRadiusM} m radius) put traction and braking ahead of top speed.`);
  if (g.narrowPct > 30) reasons.push(`${g.narrowPct}% of the lap is too narrow to pass: grid position will matter.`);
  if (g.elevRangeM > 30) reasons.push(`${g.elevRangeM} m of elevation change and gradients up to ${g.maxGradePct}% test brakes and engines.`);
  if (m.geometryId.endsWith('rev')) reasons.push('Run in reverse, familiar corners become unfamiliar ones — experience counts for less.');
  // 2) evidence from the season so far and testing
  const done = s.meetings.filter((x) => x.status === 'completed');
  if (done.length) {
    const wins = new Map<string, number>();
    for (const x of done) { const r = u.races[x.id]; const w = r?.results.find((y) => y.pos === 1); if (w) wins.set(w.teamId, (wins.get(w.teamId) ?? 0) + 1); }
    const top = [...wins.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 2) reasons.push(`${u.teams[top[0]].name} have won ${top[1]} of ${done.length} races so far.`);
  } else if (testing.length) {
    reasons.push(`Pre-season testing suggested ${u.teams[testing[0].teamId].name} and ${u.teams[testing[1]?.teamId]?.name ?? '—'} were quickest — though fuel loads and programmes vary.`);
  }
  // 3) history at the venue (same layout geometry only)
  const past = Object.values(u.races).filter((r) => r.venueId === m.venueId && r.year < m.year).sort((a, b) => b.day - a.day);
  const lastWin = past[0]?.results.find((x) => x.pos === 1);
  if (lastWin) { const p = u.people[lastWin.driverId]; if (p && s.entries.some((e) => e.drivers.includes(p.id))) reasons.push(`${p.first} ${p.last} won here last time out (${past[0].year}).`); }
  // 4) forecast (noisy, never the future)
  const w0 = initialWeather(streamFor(`${u.meta.seed}::meeting:${m.id}`, 'weather-day'), monthOf(m.day));
  const fc = forecastRain(w0, 180, Math.max(0.15, Math.min(1, u.world.industry)), streamFor(`${u.meta.seed}::forecast:${m.id}`, 'fc'));
  const forecast = fc > 0.6 ? 'Rain likely' : fc > 0.3 ? 'Showers possible' : 'Mostly dry expected';
  if (fc > 0.3) reasons.push(`Forecast: ${forecast.toLowerCase()} (${Math.round(fc * 100)}% chance) — wet-weather form could decide it.`);
  return { layout: `${tr.g.name} · ${(tr.length / 1000).toFixed(2)} km · ${m.laps} laps`, reasons: reasons.slice(0, 3), forecast, facts: { ...g } };
}

function listNames(a: string[]) { const u = [...new Set(a)]; return u.length <= 2 ? u.join(' and ') : `${u.slice(0, 2).join(', ')} and others`; }
function techNames(entries: { car: { techs: string[] } }[], ids: string[]) { const found = new Set<string>(); for (const e of entries) for (const t of e.car.techs) if (ids.includes(t)) found.add(TECH_BY_ID[t].name.toLowerCase()); return [...found].join(' and '); }
