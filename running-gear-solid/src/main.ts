import { Film } from './cinematics/Film';
import { DURATION, FPS } from './cinematics/schedule';
import { fmtTime } from './core/util';

declare global {
  interface Window {
    RGS: {
      ready: boolean;
      duration: number;
      fps: number;
      renderFrame: (t: number) => string;
      error?: string;
    };
  }
}

const canvas = document.getElementById('film') as HTMLCanvasElement;
const params = new URLSearchParams(location.search);
const renderMode = params.has('render');
if (renderMode) document.body.classList.add('render');

window.RGS = { ready: false, duration: DURATION, fps: FPS, renderFrame: () => '' };

function fit() {
  if (renderMode) {
    canvas.style.width = '960px';
    canvas.style.height = '540px';
    return;
  }
  const s = Math.max(1, Math.floor(Math.min(innerWidth / 960, (innerHeight - 40) / 540)));
  const scale = Math.min(innerWidth / 960, (innerHeight - 40) / 540) >= 1 ? s : Math.min(innerWidth / 960, (innerHeight - 40) / 540);
  canvas.style.width = `${960 * scale}px`;
  canvas.style.height = `${540 * scale}px`;
}
addEventListener('resize', fit);
fit();

try {
  const film = new Film(canvas);
  window.RGS.renderFrame = (t: number) => film.renderFrame(t);
  window.RGS.ready = true;

  if (!renderMode) {
    const play = document.getElementById('play') as HTMLButtonElement;
    const scrub = document.getElementById('scrub') as HTMLInputElement;
    const timeEl = document.getElementById('time')!;
    const seqEl = document.getElementById('seq')!;
    const audio = new Audio('/audio.wav');
    audio.preload = 'auto';
    let playing = false;
    let t = Number(params.get('t') ?? 0);
    let last = 0;
    const draw = () => {
      const id = film.renderFrame(t);
      timeEl.textContent = `${fmtTime(t)}.${String(Math.floor((t % 1) * 100)).padStart(2, '0')} / ${fmtTime(DURATION)}`;
      seqEl.textContent = id;
      scrub.value = String(Math.round((t / DURATION) * 1000));
    };
    const loop = (now: number) => {
      if (playing) {
        if (!audio.paused && audio.readyState >= 2) t = audio.currentTime;
        else t += (now - last) / 1000;
        if (t >= DURATION) {
          t = DURATION;
          playing = false;
          audio.pause();
          play.textContent = 'PLAY';
        }
      }
      last = now;
      draw();
      requestAnimationFrame(loop);
    };
    play.onclick = () => {
      playing = !playing;
      play.textContent = playing ? 'PAUSE' : 'PLAY';
      if (playing) {
        audio.currentTime = t;
        audio.play().catch(() => undefined);
      } else audio.pause();
    };
    scrub.oninput = () => {
      t = (Number(scrub.value) / 1000) * DURATION;
      audio.currentTime = t;
    };
    addEventListener('keydown', (e) => {
      if (e.code === 'Space') play.click();
      if (e.code === 'ArrowRight') t = Math.min(DURATION, t + (e.shiftKey ? 10 : 1));
      if (e.code === 'ArrowLeft') t = Math.max(0, t - (e.shiftKey ? 10 : 1));
      if (!audio.paused) audio.currentTime = t;
    });
    requestAnimationFrame(loop);
  }
} catch (e) {
  window.RGS.error = String((e as Error)?.stack ?? e);
  console.error(e);
}
