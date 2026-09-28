import * as THREE from 'three';
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
    /** dev: heaviest meshes of the current scene (triangles x instances) */
    stats: () => {
      const rows: [string, number, number, boolean, boolean][] = [];
      r.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || !m.visible) return;
        const g = m.geometry;
        const tri = (g.index ? g.index.count : g.attributes.position.count) / 3;
        const n = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1;
        rows.push([m.name || m.parent?.name || m.type, Math.round(tri), n, m.castShadow, m.frustumCulled]);
      });
      return rows.sort((a, b) => b[1] * b[2] - a[1] * a[2]).slice(0, 25);
    },
    /** dev: frame time with each top-level scene child hidden in turn */
    ablate: async (T: number, path: number[] = []) => {
      await renderFrame(T);
      const ctx3 = r.gl.getContext();
      const px = new Uint8Array(4);
      const time = () => {
        const a = performance.now();
        r.render(T);
        ctx3.readPixels(0, 0, 1, 1, ctx3.RGBA, ctx3.UNSIGNED_BYTE, px);
        return Math.round(performance.now() - a);
      };
      const time2 = () => (time(), time());
      const out: Record<string, number> = { all: time2() };
      let root: THREE.Object3D = r.scene;
      for (const k of path) root = root.children.filter((o) => o.visible)[k];
      const kids = root.children.filter((o) => o.visible);
      kids.forEach((o, i) => {
        o.visible = false;
        let tri = 0;
        o.traverse((m) => {
          const g = (m as THREE.Mesh).geometry;
          if ((m as THREE.Mesh).isMesh && g) tri += ((g.index ? g.index.count : g.attributes.position.count) / 3) * ((m as THREE.InstancedMesh).count ?? 1);
        });
        out[`${i}:${o.name || o.type}:${(tri / 1000).toFixed(0)}k`] = time2();
        o.visible = true;
      });
      // variants: no shadows; ground with a plain material
      r.gl.shadowMap.autoUpdate = false;
      out.noShadowUpdate = time2();
      r.gl.shadowMap.autoUpdate = true;
      const plain = new THREE.MeshStandardMaterial({ color: 0x777777 });
      const swapped: [THREE.Mesh, THREE.Material][] = [];
      r.scene.traverse((m) => {
        const mm = m as THREE.Mesh;
        if (mm.isMesh && (mm.material as THREE.Material).onBeforeCompile && mm.receiveShadow && !mm.castShadow && mm.geometry.attributes.normal && !mm.geometry.attributes.uv) {
          swapped.push([mm, mm.material as THREE.Material]);
          mm.material = plain;
        }
      });
      out['plainGround' + swapped.length] = time2();
      swapped.forEach(([m, mat]) => (m.material = mat));
      return out;
    },
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
