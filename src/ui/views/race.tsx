import type { Controller } from '../../app/controller';
import { RaceResult } from '../results';
import { raceReport } from '../../sim/world/news';
import { getTrack } from '../../sim/track';
import { RouteMap } from './route';
import { yearOf } from '../../sim/dates';

export function RaceView({ c, id }: { c: Controller; id: string }) {
  const u = c.u!;
  const r = u.races[id]; if (!r) return <p>Unknown race.</p>;
  const rep = raceReport(u, r);
  const regs = u.regs.sets[r.regSetId];
  const lv = u.layouts[r.layoutVersionId];
  const tr = getTrack(r.geometryId);
  const canReplay = !!u.setups[id];
  return <>
    <div class="section card"><h3 style={{ marginBottom: 4 }}>{rep.headline}</h3><p style={{ margin: 0 }}>{rep.body.join(' ')}</p></div>
    <div class="pill-row section">
      <button class="btn primary" disabled={!canReplay} onClick={() => c.replay(id)} title={canReplay ? 'Re-simulate this race from its stored setup and check it reproduces the record' : 'Replay needs the stored setup and the original engine version'}>▶ Watch replay</button>
      <button class="btn" onClick={() => c.open({ kind: 'layout', id: r.geometryId })}>Circuit: {tr.g.name}</button>
      <button class="btn" onClick={() => c.open({ kind: 'season', year: r.year })}>{r.year} season</button>
    </div>
    <RaceResult c={c} rec={r} />
    <div class="section" style={{ marginTop: 16 }}><h3>Conditions and rules</h3>
      <div class="grid2"><div class="card small"><RouteMap id={r.geometryId} height={120} /><div>{tr.g.name}: {(tr.length / 1000).toFixed(2)} km · layout version from {yearOf(lv.from)} ({lv.reason}) · {lv.surface} surface, {lv.barrier} barriers.</div></div>
        <div class="card small"><div>Weather at the start: {r.weather.start}; air {r.weather.airTemp}°C, track {r.weather.trackTemp}°C{r.weather.maxRain ? `; heaviest rain ${r.weather.maxRain} mm/h` : ''}.</div><div style={{ marginTop: 6 }}>Rules ({regs.id}{regs.emergency ? ', emergency amendment' : ''}): points {regs.points.table.join('-')}{regs.points.fastestLap ? ` +${regs.points.fastestLap} fastest lap` : ''}; qualifying: {regs.qualifying}; {regs.safetyCar ? 'safety car' : 'no safety car'}; {regs.refuelling ? 'refuelling allowed' : 'no refuelling'}; tyres {regs.compounds.join('/')}{regs.wetTyres.length ? ` + ${regs.wetTyres.join('/')}` : ''}.</div></div></div>
    </div>
  </>;
}
