import type { Controller } from '../app/controller';
import type { RaceRecord } from '../sim/types';
import { Swatch, ord, fmtTime, fmtLap, pname, fmtDate } from './common';

export function RaceResult({ c, rec, compact }: { c: Controller; rec: RaceRecord; compact?: boolean }) {
  const u = c.u!;
  const s = u.seasons[rec.year];
  const entry = (tid: string) => s?.entries.find((e) => e.teamId === tid);
  const winner = rec.results.find((r) => r.pos === 1);
  const open = (id: string) => c.open({ kind: 'person', id });
  const key = rec.events.filter((e) => ['lead', 'sc', 'red', 'retire', 'contact', 'penalty', 'rain', 'injury'].includes(e.kind) && e.sig >= 0.6).slice(0, 10);
  return (
    <div>
      <h2>{rec.name} {rec.year}</h2>
      <div class="muted small">{fmtDate(rec.day)} · {rec.lapsCompleted}/{rec.lapsScheduled} laps · {rec.distanceKm} km · {rec.weather.start}{rec.weather.changeable ? ', changeable' : ''}{rec.status !== 'finished' ? ` · ${rec.status}` : ''}{rec.halfPoints ? ' · half points' : ''}</div>
      {winner && <p style={{ margin: '8px 0' }}><b>{pname(u, winner.driverId)}</b> won for {entry(winner.teamId)?.name ?? u.teams[winner.teamId]?.name} from {winner.grid ? ord(winner.grid) : 'the back'} on the grid{rec.pole ? `; pole: ${pname(u, rec.pole.driverId)}` : ''}{rec.fastest ? `; fastest lap: ${pname(u, rec.fastest.driverId)} (${fmtLap(rec.fastest.time)})` : ''}.</p>}
      <div class="small muted" style={{ marginBottom: 8 }}>{rec.overtakes} overtakes · {rec.leadChanges} lead changes · {rec.safetyCars} safety car{rec.safetyCars === 1 ? '' : 's'}{rec.redFlags ? ` · ${rec.redFlags} red flag` : ''}</div>
      <table class="data">
        <thead><tr><th class="num">Pos</th><th>Driver</th>{!compact && <th>Team</th>}<th class="num">Laps</th><th class="num">Time/Gap</th><th class="num">Grid</th><th class="num">Pts</th></tr></thead>
        <tbody>
          {rec.results.map((r) => {
            const e = entry(r.teamId);
            const gap = r.pos === 1 ? fmtTime(r.time) : r.status === 'finished' || r.pos !== null ? (r.laps < (winner?.laps ?? 0) ? `+${(winner?.laps ?? 0) - r.laps} lap${(winner?.laps ?? 0) - r.laps > 1 ? 's' : ''}` : r.time && winner?.time ? `+${(r.time - winner.time).toFixed(1)}s` : '') : '';
            return <tr key={r.driverId}>
              <td class="num">{r.pos ?? (r.status === 'dnf' ? 'DNF' : r.status.toUpperCase())}</td>
              <td><Swatch colour={e?.colours.primary ?? '#888'} colour2={e?.colours.secondary} pattern={e?.pattern} /><button class="link" onClick={() => open(r.driverId)}>{pname(u, r.driverId)}</button> <span class="muted small">#{r.no}</span>{r.fastestLap && <span class="chip" title="Fastest lap">FL</span>}{r.penalties.length > 0 && <span class="chip" title={r.penalties.map((p) => p.reason).join('; ')}>pen</span>}
                {r.status === 'dnf' && <div class="small muted">{r.reason}{r.where ? ` at ${r.where}` : ''} · {r.category === 'mechanical' ? 'mechanical' : r.category === 'driver' ? 'driver error' : r.category}</div>}</td>
              {!compact && <td class="small">{e?.name ?? u.teams[r.teamId]?.name}</td>}
              <td class="num">{r.laps}</td><td class="num">{gap}</td><td class="num">{r.grid ?? '—'}</td><td class="num">{r.points || ''}</td>
            </tr>;
          })}
        </tbody>
      </table>
      {!compact && key.length > 0 && <div class="section" style={{ marginTop: 14 }}><h3>How it unfolded</h3>{key.map((e) => <div class="small" style={{ marginBottom: 4 }}><span class="muted num">Lap {e.lap}</span> — {describeRec(u, e)}</div>)}</div>}
    </div>
  );
}

export function describeRec(u: any, e: { kind: string; a?: string; b?: string; where?: string; detail?: string }) {
  const a = pname(u, e.a), b = pname(u, e.b);
  switch (e.kind) {
    case 'lead': return `${a} took the lead from ${b}${e.where ? ` at ${e.where}` : ''}${e.detail && e.detail !== 'on track' ? ` (${e.detail})` : ''}.`;
    case 'sc': return `Safety car: ${e.detail}.`;
    case 'red': return `Red flag: ${e.detail}.`;
    case 'retire': { const [cat, why] = (e.detail ?? '').split('|'); return `${a} retired (${why}${cat === 'mechanical' ? '' : ''})${e.where ? ` at ${e.where}` : ''}.`; }
    case 'contact': return `${a} and ${b} collided${e.where ? ` at ${e.where}` : ''}.`;
    case 'penalty': return `${a} was given a ${e.detail}.`;
    case 'rain': return `${e.detail}.`;
    case 'injury': return `${a} was hurt in an accident.`;
    default: return e.kind;
  }
}
