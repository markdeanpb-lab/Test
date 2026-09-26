import { useEffect, useRef, useState } from 'preact/hooks';
import { Controller, type Destination } from '../app/controller';
import { useCtrl } from './common';
import { listSaves, loadUniverse, importUniverse, exportUniverse, deleteSave, type SaveSummary } from '../persist/db';
import { randomSeed } from '../sim/universe';
import { LiveOverlay } from './live';
import { Panels } from './panels';
import { fmtDate } from '../sim/dates';
import { GEOMETRY_ATTRIBUTION } from '../sim/track';
import { Settings } from './settings';

const ctrl = new Controller();
(window as any).__ctrl = ctrl; // for automated end-to-end checks

export function App() {
  const c = useCtrl(ctrl);
  const [ready, setReady] = useState(false);
  useEffect(() => { c.loadPrefs().then(() => setReady(true)); }, []);
  if (!ready) return null;
  if (c.screen === 'start') return <StartScreen c={c} />;
  return <Game c={c} />;
}

function StartScreen({ c }: { c: Controller }) {
  const [seed, setSeed] = useState('');
  const [format, setFormat] = useState<'gp' | 'sprint'>('gp');
  const [fatal, setFatal] = useState(false);
  const [saves, setSaves] = useState<SaveSummary[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { listSaves().then(setSaves); }, []);
  const start = async (mode: 'watch' | 'explore') => {
    setBusy(true);
    const s = seed.trim() || randomSeed();
    c.exploreMode = mode === 'explore';
    await c.newUniverse(s, { raceFormat: format, fatalities: fatal });
    // explore: the century is generated in a worker while the opening race plays here
    if (mode === 'explore') c.generateInBackground({ kind: 'year', year: c.u!.meta.settings.endYear + 1 }, `Generating ${c.u!.meta.settings.startYear}–${c.u!.meta.settings.endYear}`);
  };
  const resume = async (id: string) => { setBusy(true); try { await c.openUniverse(await loadUniverse(id)); } catch (e: any) { setErr(e.message); setBusy(false); } };
  const onImport = async (f: File) => { try { const u = await importUniverse(await f.text()); setSaves(await listSaves()); setErr(null); await c.openUniverse(u); } catch (e: any) { setErr(e.message); } };
  return (
    <main class="start">
      <div class="start-card">
        <h1>100 Years of St Albans Racing</h1>
        <p class="lede">A fictional motorsport century on the real streets of St Albans. You don't drive or manage — you watch, follow people, and discover the history they make.</p>
        <div class="choices">
          <button class="choice" disabled={busy} onClick={() => start('watch')}><div><strong>Watch history unfold</strong><span>Start a new universe in 1926 and watch the first race.</span></div><span aria-hidden="true">→</span></button>
          <button class="choice" disabled={busy} onClick={() => start('explore')}><div><strong>Explore a century</strong><span>Generate 1926–2025 in the background, then follow its strongest stories.</span></div><span aria-hidden="true">→</span></button>
          <button class="choice" disabled={busy || !saves.length} onClick={() => saves[0] && resume(saves[0].id)}><div><strong>Continue</strong><span>{saves[0] ? `${saves[0].name} — ${saves[0].year}${saves[0].champion ? `, last champion ${saves[0].champion}` : ''}` : 'No saved universe yet.'}</span></div><span aria-hidden="true">→</span></button>
        </div>
        <div class="start-options">
          <label>Seed <input type="text" placeholder="random" value={seed} onInput={(e) => setSeed((e.target as HTMLInputElement).value)} aria-label="Universe seed (optional)" /></label>
          <label>Races <select value={format} onChange={(e) => setFormat((e.target as HTMLSelectElement).value as any)} aria-label="Race format"><option value="gp">Grand Prix (~100 km)</option><option value="sprint">Sprint (~50 km)</option></select></label>
          <label title="Off by default. When on, rare fatal accidents can occur in low-safety eras and are handled without graphic detail."><input type="checkbox" checked={fatal} onChange={(e) => setFatal((e.target as HTMLInputElement).checked)} /> Historical realism (rare fatal accidents)</label>
        </div>
        {saves.length > 0 && <section class="saves" aria-label="Saved universes">
          <h2>Saved universes</h2>
          {saves.map((s) => <div class="save-row" key={s.id}><div><b>{s.name}</b><div class="small muted">{s.year} · seed {s.seed} · saved {new Date(s.savedAt).toLocaleString()}</div></div><div class="pill-row"><button class="btn" onClick={() => resume(s.id)}>Open</button>
            {/* two-step delete confirmed in the page itself (browser confirm dialogs are not available everywhere) */}
            {confirmDel === s.id
              ? <><button class="btn danger" onClick={async () => { await deleteSave(s.id); setConfirmDel(null); setSaves(await listSaves()); }} aria-label={`Confirm deleting ${s.name}`}>Delete permanently</button><button class="btn ghost" onClick={() => setConfirmDel(null)}>Keep</button></>
              : <button class="btn ghost" onClick={() => setConfirmDel(s.id)} aria-label={`Delete ${s.name}`}>Delete</button>}</div></div>)}
        </section>}
        <div class="start-options"><button class="btn ghost" onClick={() => fileRef.current?.click()}>Import universe…</button><input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) onImport(f); }} /></div>
        {err && <p role="alert" style={{ color: 'var(--warn)' }}>{err}</p>}
        <p class="attrib">An alternate sporting history: every team, driver and race is fictional. Street geometry: {GEOMETRY_ATTRIBUTION}</p>
      </div>
    </main>
  );
}

const DESTS: [Destination, string][] = [['live', 'Live'], ['season', 'Season'], ['people', 'People'], ['history', 'History'], ['stories', 'Stories']];

function Game({ c }: { c: Controller }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [settings, setSettings] = useState(false);
  useEffect(() => { if (canvasRef.current) { c.attachCanvas(canvasRef.current); if (c.city && c.renderer && !c.renderer.city && c.live) c.refreshScene(); } }, [canvasRef.current]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
      if (e.key === ' ') { e.preventDefault(); c.togglePlay(); }
      else if (e.key === '1') c.setSpeed(1); else if (e.key === '2') c.setSpeed(2); else if (e.key === '3') c.setSpeed(5); else if (e.key === '4') c.setSpeed(20);
      else if (e.key === 'n' || e.key === 'N') c.nextMoment();
      else if (e.key === 'a' || e.key === 'A') c.autoCamera();
      else if (e.key === 'o' || e.key === 'O') c.overview();
      else if (e.key === 'Escape') c.go('live');
      else if (e.key === 'p' || e.key === 'P') { c.showPerf = !c.showPerf; c.notify(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const u = c.u;
  const m = c.live?.meeting;
  // period look: the picture is graded like the medium of its day (newsreel, black-and-white TV, early colour)
  const yr = m?.year ?? u?.clock.year ?? 2000;
  const period = !c.prefs.periodLook ? '' : yr < 1950 ? 'era-newsreel' : yr < 1967 ? 'era-bwtv' : yr < 1990 ? 'era-colourtv' : '';
  return (
    <div class={`game ${period}`}>
      <canvas ref={canvasRef} class="scene" aria-label="Miniature St Albans with the race in progress" />
      <header class="topbar">
        <div class="brand"><span class="brand-mark" aria-hidden="true">SA</span><span class="brand-text">St Albans Racing</span></div>
        <nav class="nav" aria-label="Destinations">{DESTS.map(([d, l]) => <button key={d} aria-current={c.dest === d ? 'page' : undefined} onClick={() => c.go(d)}>{l}</button>)}</nav>
        <div class="spacer" />
        {c.bgProgress && <div class="bgchip" role="status" aria-live="polite" title="Generating history in the background with the same engine"><span class="lbl">History</span><b>{c.bgProgress.year}</b><span class="mini" aria-hidden="true"><i style={{ width: `${Math.min(100, (c.bgProgress.done / Math.max(1, c.bgProgress.total)) * 100)}%` }} /></span><button class="link small" onClick={() => c.cancelSimulation()} aria-label="Stop generating history here">stop</button></div>}
        {u && <div class="datepill">{m ? <><b>{m.name}</b><br />{fmtDate(m.day)} · Round {m.round}</> : <b>{u.clock.year}</b>}</div>}
        <button class="iconbtn" aria-label="Settings" onClick={() => setSettings(true)}>⚙</button>
      </header>
      {c.screen === 'loading' && <div class="progress" role="status"><b>Building the city…</b><div class="small muted">Loading streets, buildings and terrain</div></div>}
      {c.screen === 'game' && u && <LiveOverlay c={c} />}
      {c.screen === 'game' && u && c.dest !== 'live' && <Panels c={c} />}
      {c.progress && <div class="progress" role="status" aria-live="polite">
        <b>{c.progress.label}</b>
        <div class="track" aria-hidden="true"><div class="fill" style={{ width: `${Math.min(100, (c.progress.done / Math.max(1, c.progress.total)) * 100)}%` }} /></div>
        <div class="small muted">Same engine and rules as live racing, without the pictures. {c.progress.cancellable && 'You can stop safely between races.'}</div>
        {c.progress.cancellable && <div style={{ marginTop: 10 }}><button class="btn" onClick={() => c.cancelSimulation()}>Stop after this race</button></div>}
      </div>}
      {c.showPerf && <PerfMeter c={c} />}
      {c.notice && <div class="notice" role="status"><span>{c.notice.text}</span>{c.notice.action && <button class="btn primary" onClick={() => c.notice!.action!.run()}>{c.notice.action.label}</button>}<button class="btn ghost" aria-label="Dismiss" onClick={() => { c.notice = null; c.notify(true); }}>✕</button></div>}
      {c.message && <div class="toast" role="status" onClick={() => { c.message = null; c.notify(true); }}>{c.message}</div>}
      {settings && <Settings c={c} onClose={() => setSettings(false)} onExport={import.meta.env.VITE_ARTIFACT ? undefined : () => { const b = exportUniverse(c.u!); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `st-albans-${c.u!.meta.seed}-${c.u!.clock.year}.json`; a.click(); }} />}
    </div>
  );
}

function PerfMeter({ c }: { c: Controller }) {
  const p = c.perf();
  if (!p) return null;
  return <div class="perfmeter" role="status" aria-label="Performance">{p.fps} fps · p95 frame {p.p95FrameMs} ms · simulation {p.simMsPerFrame} ms/frame · {p.drawCalls} draw calls · {Math.round(p.triangles / 1000)}k triangles{p.heapMB ? ` · ${p.heapMB} MB heap` : ''}</div>;
}
