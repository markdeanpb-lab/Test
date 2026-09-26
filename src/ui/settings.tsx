import type { Controller } from '../app/controller';

export function Settings({ c, onClose, onExport }: { c: Controller; onClose: () => void; onExport: () => void }) {
  const p = c.prefs;
  const set = (patch: Partial<typeof p>) => { Object.assign(c.prefs, patch); c.savePrefs(); };
  return (
    <div class="sheet" role="dialog" aria-label="Settings" style={{ width: 'min(420px, 100vw)' }}>
      <div class="sheet-head"><h2>Settings</h2><button class="btn" onClick={onClose}>Close</button></div>
      <div class="sheet-body">
        <div class="section"><h3>Graphics</h3>
          <div class="pill-row" role="group" aria-label="Quality">{(['low', 'medium', 'high'] as const).map((q) => <button class="btn" aria-pressed={p.quality === q} onClick={() => set({ quality: q })}>{q[0].toUpperCase() + q.slice(1)}</button>)}</div>
          <p class="small muted">Quality changes take effect when the next circuit loads. Low is recommended for phones.</p>
          <label><input type="checkbox" checked={p.reducedMotion} onChange={(e) => set({ reducedMotion: (e.target as HTMLInputElement).checked })} /> Reduce motion (slower camera, no crowd or flag animation)</label>
        </div>
        <div class="section"><h3>Commentary</h3>
          <div class="pill-row" role="group" aria-label="Commentary density">{(['low', 'normal', 'high'] as const).map((d) => <button class="btn" aria-pressed={p.density === d} onClick={() => set({ density: d })}>{d === 'low' ? 'Only big moments' : d === 'normal' ? 'Normal' : 'Detailed'}</button>)}</div>
        </div>
        <div class="section"><h3>Spoilers</h3>
          <label><input type="checkbox" checked={p.spoilers} onChange={(e) => set({ spoilers: (e.target as HTMLInputElement).checked })} /> Hide future outcomes when exploring history</label>
        </div>
        <div class="section"><h3>Behaviour</h3>
          <label><input type="checkbox" checked={p.pauseInPanels} onChange={(e) => set({ pauseInPanels: (e.target as HTMLInputElement).checked })} /> Pause the race while browsing Season, People, History or Stories</label>
        </div>
        <div class="section"><h3>Sound</h3>
          <label><input type="checkbox" checked={!p.muted} onChange={(e) => set({ muted: !(e.target as HTMLInputElement).checked })} /> Sound on</label>
          <div><label>Volume <input type="range" min="0" max="1" step="0.05" value={p.volume} onInput={(e) => set({ volume: +(e.target as HTMLInputElement).value })} /></label></div>
        </div>
        <div class="section"><h3>Universe</h3>
          <div class="small muted" style={{ marginBottom: 8 }}>Seed <code>{c.u?.meta.seed}</code> · engine {c.u?.meta.engineVersion}</div>
          <div class="pill-row"><button class="btn" onClick={onExport}>Export universe (.json)</button><button class="btn" onClick={() => location.reload()}>Back to title screen</button></div>
          <p class="small muted">The universe autosaves after every race. Exports can be imported on another device from the title screen.</p>
        </div>
        <div class="section"><h3>Keyboard</h3><div class="small"><span class="kbd">Space</span> play/pause · <span class="kbd">1–4</span> speed · <span class="kbd">N</span> next moment · <span class="kbd">A</span> auto camera · <span class="kbd">O</span> overview · <span class="kbd">Esc</span> back to live</div></div>
      </div>
    </div>
  );
}
