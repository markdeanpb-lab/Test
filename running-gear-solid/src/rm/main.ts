// RUNNING GEAR SOLID: REMASTERED - entry. Exposes window.RGS for the offline renderer.
import { Renderer } from './engine/Renderer';
import { Hud, loadFonts } from './hud/Hud';
import { Film } from './film/core';
import { buildFilm, FPS } from './film/script';

const P = new URLSearchParams(location.search);
const renderMode = P.has('render');
if (renderMode) document.body.classList.add('render');

const W = window as unknown as { RGS: Record<string, unknown> };
W.RGS = { ready: false };

async function main() {
  await loadFonts();
  const r = new Renderer(document.getElementById('film') as HTMLCanvasElement, Number(P.get('scale') ?? 0.75));
  const hud = new Hud(r.hud);
  const film: Film = buildFilm(P.get('only') ?? undefined);
  const ctx = { r, hud };
  let busy: Promise<string> = Promise.resolve('');
  const renderFrame = (T: number) => (busy = busy.then(() => film.renderFrame(T, ctx)));
  W.RGS = {
    ready: true,
    duration: film.duration,
    fps: FPS,
    renderFrame,
    pixels: () => r.pixels(),
    cues: () => film.cues(),
    chapters: () => film.chapters(),
    profile: async (T: number) => {
      await renderFrame(T);
      return r.profile(T);
    },
  };
  if (!renderMode) {
    const play = document.getElementById('play') as HTMLButtonElement;
    const scrub = document.getElementById('scrub') as HTMLInputElement;
    const time = document.getElementById('time')!;
    const seq = document.getElementById('seq')!;
    let t = Number(P.get('t') ?? 0), playing = false, pending = false;
    const draw = async () => {
      if (pending) return;
      pending = true;
      seq.textContent = await renderFrame(t);
      time.textContent = ` ${t.toFixed(2)} / ${film.duration.toFixed(1)} `;
      scrub.value = String(Math.round((t / film.duration) * 1000));
      pending = false;
    };
    play.onclick = () => {
      playing = !playing;
      play.textContent = playing ? 'PAUSE' : 'PLAY';
    };
    scrub.oninput = () => {
      t = (Number(scrub.value) / 1000) * film.duration;
      draw();
    };
    let last = performance.now();
    const loop = (now: number) => {
      if (playing) t = Math.min(film.duration, t + (now - last) / 1000);
      last = now;
      if (playing) draw();
      requestAnimationFrame(loop);
    };
    draw();
    requestAnimationFrame(loop);
  }
}
main().catch((e) => {
  W.RGS = { error: String(e?.stack ?? e) };
  console.error(e);
});
