import { useState } from 'preact/hooks';
import type { Controller } from '../app/controller';
import { Swatch, ord, fmtLap, fmtTime, pname, fmtDate } from './common';
import { TYRES } from '../sim/race/engine';
import { weatherLabel } from '../sim/weather';
import { meetingPreview } from '../narrative/preview';
import { RaceResult } from './results';

export function LiveOverlay({ c }: { c: Controller }) {
  const live = c.live;
  if (!live) return <Paddock c={c} />;
  if (live.stage === 'done') return <><Paddock c={c} /><PlaybackBar c={c} /></>;
  return (
    <>
      {c.dest === 'live' && <TimingTower c={c} />}
      {c.dest === 'live' && <RaceInfo c={c} />}
      {c.dest === 'live' && <Feed c={c} />}
      {c.dest === 'live' && <CarLabel c={c} />}
      {c.dest !== 'live' && <button class="btn primary returnlive" onClick={() => c.go('live')}>← Return to the live {live.stage === 'quali' ? 'session' : 'race'}</button>}
      <PlaybackBar c={c} />
    </>
  );
}

function TimingTower({ c }: { c: Controller }) {
  const live = c.live!;
  const st = live.st;
  const u = c.u!;
  const quali = st.kind === 'quali';
  const q = st.q;
  let order: number[];
  if (quali && q) order = st.cars.map((_, k) => k).sort((a, b) => q.best[a] - q.best[b] || a - b);
  else order = st.order;
  const leaderBest = quali && q ? Math.min(...q.best) : 0;
  const followedCar = c.follow !== null ? live.carOf(c.follow) : c.lastShot?.cars[0] ?? -1;
  const lap = Math.min(st.laps, Math.max(1, (st.cars[st.order[0]]?.lap ?? 0) + 1));
  return (
    <section class="tower" aria-label="Timing">
      <header><b>{quali ? (q?.format === 'knockout' ? `Qualifying Q${q.seg}` : q?.format === 'ballot' ? 'Grid by ballot' : 'Qualifying') : `Lap ${lap}/${st.laps}`}</b><span class="small" style={{ color: 'var(--tower-muted)' }}>{quali ? 'best lap' : 'gap'}</span></header>
      <div class="rows" role="list">
        {order.map((k, i) => {
          const car = st.cars[k]; const e = live.setup.entrants[car.i];
          const fav = u.favourites.people.includes(e.driverId);
          let gap = '';
          if (quali && q) gap = Number.isFinite(q.best[k]) ? (i === 0 ? fmtLap(q.best[k]) : `+${(q.best[k] - leaderBest).toFixed(3)}`) : q.eliminated[k] ? 'out' : car.mode === 'out' ? 'no time' : '';
          else if (car.ret) gap = 'OUT';
          else if (car.mode === 'fin' && i === 0) gap = 'FINISH';
          else if (i === 0) gap = 'Leader';
          else { const lapsDown = Math.floor((st.cars[order[0]].dist - car.dist) / live.tr.length); gap = lapsDown >= 1 ? `+${lapsDown} lap${lapsDown > 1 ? 's' : ''}` : `+${car.gapLeader.toFixed(1)}`; }
          const closing = !quali && i > 0 && car.gapAhead < 1 && !car.ret;
          const tyre = TYRES[car.tyre];
          const pen = car.pen.some((p) => !p.served);
          return (
            <button role="listitem" key={k} class={`trow${followedCar === k ? ' sel' : ''}`} onClick={() => c.followEntrant(c.follow === car.i ? null : car.i)} aria-label={`${ord(i + 1)}: number ${e.no} ${e.full}, ${e.team}. ${gap}`}>
              <span class="pos">{car.ret && !quali ? '–' : i + 1}</span>
              <span class="bar" style={{ background: e.colour }} />
              <span class="code">{e.code}</span>
              <span class="small" style={{ color: 'var(--tower-muted)', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                <span class="num">{e.no}</span>{fav && <span class="fav" aria-label="followed"> ★</span>}
                {car.mode === 'pit' && !quali && <span class="tag pit">PIT</span>}
                {car.ret && !quali && <span class="tag out">OUT</span>}
                {pen && <span class="tag pen">PEN</span>}
                {!quali && tyre && st.w && <span class="tyre" title={tyre.label} style={{ borderColor: tyre.colour }} />}
              </span>
              <span class={`gap${closing ? ' closing' : ''}`}>{gap}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function RaceInfo({ c }: { c: Controller }) {
  const live = c.live!; const st = live.st; const u = c.u!;
  const w = st.w;
  const flagInfo = st.phase === 'red' ? ['#d32f2f', 'Red flag'] : st.phase === 'sc' ? ['#f2c200', 'Safety car'] : st.phase === 'fin' ? ['#eee', 'Chequered flag'] : st.phase === 'delay' ? ['#999', 'Start delayed'] : st.phase === 'grid' ? ['#2e7d32', 'On the grid'] : st.yellows.length ? ['#f2c200', 'Local yellow'] : ['#2e7d32', 'Green'];
  const lv = u.layouts[live.meeting.layoutVersionId];
  const shot = c.lastShot;
  const elapsed = st.t;
  return (
    <section class="raceinfo" aria-label="Race information">
      <div class="title">{live.meeting.name}</div>
      <div class="small muted">{live.tr.g.name} · {(live.tr.length / 1000).toFixed(2)} km · {lv.surface} surface</div>
      <div class="row" style={{ marginTop: 6 }}><span class="flag"><i style={{ background: flagInfo[0] }} />{flagInfo[1]}</span><span class="num">{fmtTime(elapsed)}</span></div>
      <div class="row"><span>{weatherLabel(w)} · {Math.round(w.air)}°C</span><span class="muted">track {w.water > 0.6 ? 'wet' : w.water > 0.2 ? 'damp' : 'dry'}</span></div>
      <div class="director">{c.follow !== null ? `Following ${live.setup.entrants[c.follow].full} (your choice)` : c.camManual === 'free' ? 'Free camera' : shot ? `Director: ${shot.why}` : ''}</div>
    </section>
  );
}

function Feed({ c }: { c: Controller }) {
  const [open, setOpen] = useState(true);
  const lines = c.commentary?.lines ?? [];
  const recent = lines.slice(-40).reverse();
  return (
    <section class="feed" aria-label="Commentary" aria-live="polite">
      <div class="feed-head"><span>Commentary</span><button class="btn ghost small" style={{ minHeight: 28 }} onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Hide' : 'Show'}</button></div>
      {open && recent.map((l, i) => <div key={i + l.t} class={`line${l.sig >= 0.8 ? ' hi' : ''}`}><span class="t">{l.lap ? `L${l.lap}` : ''}</span><span>{l.text}</span></div>)}
      {open && !recent.length && <div class="line"><span /><span class="muted">Quiet so far.</span></div>}
    </section>
  );
}

function CarLabel({ c }: { c: Controller }) {
  const live = c.live!, r = c.renderer;
  if (!r) return null;
  const k = c.follow !== null ? live.carOf(c.follow) : c.lastShot?.mode !== 'overview' ? c.lastShot?.cars[0] ?? -1 : -1;
  if (k < 0) return null;
  const p = r.project(k);
  if (!p.visible) return null;
  const e = live.setup.entrants[live.st.cars[k].i];
  return <div class="carlabel" style={{ left: p.x, top: p.y }}>{e.no} {e.name}</div>;
}

function PlaybackBar({ c }: { c: Controller }) {
  const live = c.live;
  const done = !live || live.stage === 'done';
  const year = c.u!.clock.year;
  const auto = c.follow === null && c.camManual === null;
  return (
    <nav class="playbar" aria-label="Playback">
      {!done && <>
        <button class="btn" onClick={() => c.togglePlay()} aria-label={live!.playing ? 'Pause' : 'Play'} title="Space">{live!.playing ? '❚❚' : '▶'}</button>
        <div class="speed" role="group" aria-label="Speed">{[1, 2, 5, 20].map((s) => <button key={s} class="btn" aria-pressed={live!.speed === s && live!.playing} onClick={() => c.setSpeed(s)}>{s}×</button>)}</div>
        <span class="sep" />
        <button class="btn" onClick={() => c.nextMoment()} title="N: advance the same simulation to the next significant event">Next moment</button>
        {live!.stage === 'quali' && <button class="btn" onClick={() => c.skipSession()}>Skip to race</button>}
        <span class="sep" />
        <button class="btn" aria-pressed={auto} onClick={() => c.autoCamera()} title="A">Auto camera</button>
        <button class="btn" aria-pressed={c.camManual === 'free' && c.renderer?.mode === 'overview'} onClick={() => c.overview()} title="O">Overview</button>
        <button class="btn" aria-pressed={c.renderer?.mode === 'free'} onClick={() => c.freeCamera()}>Free</button>
      </>}
      {done && <>
        <button class="btn primary" onClick={() => c.continueAfterRace()}>Next race →</button>
        <button class="btn" onClick={() => c.simulate({ kind: 'seasonEnd', year }, `Simulating the rest of ${year}`)}>Simulate season</button>
        <button class="btn" onClick={() => c.simulate({ kind: 'year', year: year + 10 }, 'Simulating ten years')}>+10 years</button>
      </>}
      {!done && <>
        <span class="sep" />
        <button class="btn" onClick={() => c.simulate({ kind: 'seasonEnd', year }, `Simulating the rest of ${year}`)}>Simulate season</button>
      </>}
    </nav>
  );
}

function Paddock({ c }: { c: Controller }) {
  const u = c.u!;
  const live = c.live;
  const last = live?.stage === 'done' ? u.races[live.meeting.id] : null;
  const next = c.nextMeeting();
  if (c.dest !== 'live') return null;
  if (last) return <div class="paddock"><RaceResult c={c} rec={last} /></div>;
  if (!next) {
    const y = u.clock.year;
    const s = u.seasons[y];
    return <div class="paddock"><h2>{s?.status === 'cancelled' ? `No championship in ${y}` : `The ${y} season is over`}</h2>
      <p class="muted">{s?.statusReason ?? ''}</p>
      <div class="pill-row"><button class="btn primary" onClick={() => { c.advanceToMeeting(); c.beginNextMeeting(); }}>Continue to next season</button></div></div>;
  }
  const pv = meetingPreview(u, next);
  return <div class="paddock"><h2>{next.name}</h2><div class="muted">{fmtDate(next.day)} · Round {next.round} · {pv.layout}</div><ul class="reasons">{pv.reasons.map((r) => <li>{r}</li>)}</ul></div>;
}

export { pname };
