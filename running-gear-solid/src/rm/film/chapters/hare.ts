// BOSS (recurring): THE HARE - impatience. A white hare with a pocket watch in a Wonderland park
// of playing-card hedges and giant clocks. Chase it and the stamina gauge floods red; the field
// passes; it laughs and drops down its hole. (23.04.2022: first 200 m in 41 s, first km 3:49,
// then 4:20s; 21:48, "Went off too fast".)
import * as THREE from 'three';
import { SetScene } from '../SetScene';
import { Runner, STRIDE_KIT } from '../../char/Runner';
import { randomKit } from '../../char/Crowd';
import { metal, box, cyl, Particles, Lamp, clamp01 } from '../bosses/kit';
import { pbr } from '../../engine/assets';
import { COL, env, smooth, pace } from '../../hud/Hud';
import { lifeHud, equip, bossHp, prompt, banner, popup, alertMark } from '../../hud/game';
import { toScreen } from './door';
import runs from '../../../data/gps/runs.json';

const R = runs['hare-2148'];
/** real split pace (s/km) around race distance d (m) */
function paceAt(d: number) {
  for (let i = 1; i < R.d.length; i++) if (R.d[i] >= d) return ((R.t[i] - R.t[i - 1]) / (R.d[i] - R.d[i - 1])) * 1000;
  return 264;
}

/** a white hare with a pocket watch on a chain (upright-galloping, ~1 m tall) */
function makeHare() {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0xf2eee6, roughness: 0.95 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xe8a0a8, roughness: 0.8 });
  const coat = new THREE.MeshStandardMaterial({ color: 0x7a1c24, roughness: 0.6 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9b24a, metalness: 1, roughness: 0.25 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 16), fur);
  body.scale.set(1, 1.35, 0.9);
  body.position.y = 0.7;
  const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.42, 20), coat);
  waist.position.y = 0.78;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 16), fur);
  head.position.set(0, 1.28, 0.05);
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), fur);
  snout.position.set(0, 1.23, 0.22);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), pink);
  nose.position.set(0, 1.26, 0.31);
  g.add(body, waist, head, snout, nose);
  for (const x of [-0.08, 0.08]) {
    const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.42, 4, 10), fur);
    ear.position.set(x, 1.66, -0.02);
    ear.rotation.z = x * 1.2;
    const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.34, 4, 8), pink);
    inner.position.set(x, 1.66, 0.03);
    inner.rotation.z = x * 1.2;
    g.add(ear, inner);
    const eye = new Lamp(0.028, 0xff2010);
    eye.group.position.set(x * 1.1, 1.33, 0.2);
    eye.level = 1;
    g.add(eye.group);
  }
  const legs: THREE.Mesh[] = [];
  for (const x of [-0.13, 0.13]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.44, 4, 10), fur);
    leg.position.set(x, 0.28, 0);
    g.add(leg);
    legs.push(leg);
  }
  const watch = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 24), gold);
  watch.rotation.x = Math.PI / 2;
  watch.position.set(0.32, 0.95, 0.22);
  g.add(watch);
  g.traverse((m) => ((m as THREE.Mesh).isMesh ? ((m.castShadow = true), (m.receiveShadow = true)) : 0));
  g.scale.setScalar(1.25);
  return { g, legs, watch };
}

export function hareBoss() {
  let stride: Runner, hare: ReturnType<typeof makeHare>, others: Runner[] = [];
  let petals: Particles, hole: THREE.Mesh;
  const DUR = 34;
  // timeline
  const T = { go: 2, spot: 3.5, chase: 6, red: 14, blow: 19, pass: 20, hole: 25, tip: 28.5 };
  // STRIDE's speed (m/s): a hard chase, then the blow-up
  const speed = (t: number) => (t < T.go ? 0 : t < T.chase ? 4.4 : t < T.blow ? 5.6 : t < T.blow + 2 ? 5.6 - 2.4 * smooth(T.blow, T.blow + 2, t) : 3.1);
  const N = 2000, dt = DUR / N, S = new Float64Array(N + 1);
  for (let k = 1; k <= N; k++) S[k] = S[k - 1] + speed(k * dt) * dt;
  const dist = (t: number) => {
    const f = Math.min(N, Math.max(0, t / dt)), k = Math.min(N - 1, Math.floor(f));
    return S[k] + (S[k + 1] - S[k]) * (f - k);
  };
  const hareD = (t: number) => (t < T.go ? 9 : 9 + dist(t) + (t - T.go) * 0.4 + Math.max(0, t - T.blow) * 2.5);
  const otherD = (k: number, t: number) => { const base = dist(Math.min(t, T.blow)) - 14 - k * 3 + (t - T.go) * 0.2; return t < T.blow ? base : base + (t - T.blow) * (4.2 + k * 0.4 - 3.1) + (dist(t) - dist(T.blow)); };
  const course = (d: number) => new THREE.Vector3(Math.sin(d / 70) * 6, 0, -d);
  const heading = (d: number) => {
    const a = course(d), b = course(d + 1);
    return Math.atan2(b.x - a.x, b.z - a.z);
  };
  return new SetScene({
    id: 'c2-hare',
    sky: { hdri: 'qwantani_sunrise_puresky', sun: 2.2, sunColor: 0xffc8e0, env: 0.9, fog: 0.0045, fogColor: 0xd8b0d0, bgIntensity: 0.8, shadowSize: 30 },
    shots: [{ dur: DUR, p0: [0, 0, 0], l0: [0, 0, 0] }],
    build: async (st) => {
      const s = st.scene;
      // checkerboard path through lawn
      const grass = await pbr('leafy_grass');
      for (const k of ['map', 'normalMap', 'roughnessMap'] as const) {
        grass[k] = grass[k].clone();
        grass[k].repeat.set(80, 80);
        grass[k].needsUpdate = true;
      }
      const lawn = new THREE.Mesh(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ ...grass, color: 0x9ad07a }));
      lawn.position.z = -250;
      lawn.receiveShadow = true;
      s.add(lawn);
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const cg = c.getContext('2d')!;
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
        cg.fillStyle = (x + y) % 2 ? '#f2eee8' : '#1c1a20';
        cg.fillRect(x * 64, y * 64, 64, 64);
      }
      const ct = new THREE.CanvasTexture(c);
      ct.wrapS = ct.wrapT = THREE.RepeatWrapping;
      ct.colorSpace = THREE.SRGBColorSpace;
      ct.magFilter = THREE.NearestFilter;
      // path as a ribbon following the course
      const pos: number[] = [], uv: number[] = [], idx: number[] = [];
      for (let k = 0; k <= 400; k++) {
        const d = k * 1.5 - 20, p = course(d), hdg = heading(d);
        const rx = Math.cos(hdg) * 2.4, rz = -Math.sin(hdg) * 2.4;
        pos.push(p.x - rx, 0.02, p.z - rz, p.x + rx, 0.02, p.z + rz);
        uv.push(0, d / 1.2, 4, d / 1.2);
        if (k) idx.push(2 * k - 2, 2 * k - 1, 2 * k, 2 * k - 1, 2 * k + 1, 2 * k);
      }
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      pg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      pg.setIndex(idx);
      pg.computeVertexNormals();
      const path = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ map: ct, roughness: 0.4, side: THREE.DoubleSide }));
      path.receiveShadow = true;
      s.add(path);
      // playing-card hedges, giant clocks and mushrooms along the way
      const suits = ['#c8102e', '#111'];
      const hedge = new THREE.MeshStandardMaterial({ color: 0x2f6a2c, roughness: 0.9 });
      const [plate] = await Promise.all([metal('plate', { tint: 0xd9b24a, metalness: 1, rough: 0.35 })]);
      for (let k = 0; k < 70; k++) {
        const d = k * 8 - 10, p = course(d), hdg = heading(d), side = k % 2 ? 1 : -1;
        const rx = Math.cos(hdg) * side, rz = -Math.sin(hdg) * side;
        if (k % 3 === 0) {
          // a playing card standing in the lawn
          const cc = document.createElement('canvas');
          cc.width = 256;
          cc.height = 360;
          const g2 = cc.getContext('2d')!;
          g2.fillStyle = '#fbf8f0';
          g2.fillRect(0, 0, 256, 360);
          g2.strokeStyle = '#333';
          g2.lineWidth = 6;
          g2.strokeRect(10, 10, 236, 340);
          g2.fillStyle = suits[k % 2];
          g2.font = '700 150px serif';
          g2.textAlign = 'center';
          g2.fillText(['♥', '♠', '♦', '♣'][k % 4], 128, 230);
          g2.font = '700 60px serif';
          g2.fillText(['A', 'K', 'Q', 'J', '7', '10'][k % 6], 50, 70);
          const tex = new THREE.CanvasTexture(cc);
          tex.colorSpace = THREE.SRGBColorSpace;
          const card = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.7, 0.08), [plate, plate, plate, plate, new THREE.MeshStandardMaterial({ map: tex }), new THREE.MeshStandardMaterial({ map: tex })]);
          card.position.set(p.x + rx * 5, 1.85, p.z + rz * 5);
          card.rotation.set(0, hdg + side * 0.9, side * 0.08);
          card.castShadow = true;
          s.add(card);
        } else if (k % 3 === 1) {
          const hb = box(3.2, 2.2, 3.2, hedge, 2, 0.3);
          hb.position.set(p.x + rx * 5.5, 1.1, p.z + rz * 5.5);
          s.add(hb);
        } else {
          // a giant pocket watch half sunk in the lawn
          const w = cyl(2.4, 2.4, 0.5, plate, 40);
          w.rotation.set(Math.PI / 2 - 0.2, 0, side * 0.4);
          w.position.set(p.x + rx * 9, 1.8, p.z + rz * 9);
          s.add(w);
          const faceC = document.createElement('canvas');
          faceC.width = faceC.height = 256;
          const fg = faceC.getContext('2d')!;
          fg.fillStyle = '#f6f0e0';
          fg.beginPath();
          fg.arc(128, 128, 120, 0, Math.PI * 2);
          fg.fill();
          fg.fillStyle = '#222';
          fg.font = '700 26px serif';
          fg.textAlign = 'center';
          for (let n = 1; n <= 12; n++) fg.fillText(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][n - 1], 128 + Math.sin((n / 12) * Math.PI * 2) * 95, 136 - Math.cos((n / 12) * Math.PI * 2) * 95);
          fg.lineWidth = 7;
          fg.strokeStyle = '#222';
          fg.beginPath();
          fg.moveTo(128, 128);
          fg.lineTo(128 + 60 * Math.sin(k), 128 - 60 * Math.cos(k));
          fg.stroke();
          const ft = new THREE.CanvasTexture(faceC);
          ft.colorSpace = THREE.SRGBColorSpace;
          const face = new THREE.Mesh(new THREE.CircleGeometry(2.2, 40), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.3 }));
          face.position.set(0, 0.26, 0);
          face.rotation.x = -Math.PI / 2;
          w.add(face);
        }
      }
      // mushrooms
      const capM = new THREE.MeshStandardMaterial({ color: 0xc8303a, roughness: 0.5 });
      const stemM = new THREE.MeshStandardMaterial({ color: 0xf0e6d6, roughness: 0.8 });
      for (let k = 0; k < 24; k++) {
        const d = k * 23 + 6, p = course(d), hdg = heading(d), side = k % 2 ? -1 : 1;
        const rx = Math.cos(hdg) * side, rz = -Math.sin(hdg) * side;
        const sc = 1 + (k % 3) * 0.8;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * sc, 0.3 * sc, 1.2 * sc, 12), stemM);
        stem.position.set(p.x + rx * (4 + sc), 0.6 * sc, p.z + rz * (4 + sc));
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.8 * sc, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), capM);
        cap.position.set(stem.position.x, 1.15 * sc, stem.position.z);
        s.add(stem, cap);
      }
      hare = makeHare();
      s.add(hare.g);
      hole = new THREE.Mesh(new THREE.CircleGeometry(1.1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x050303 }));
      s.add(hole);
      petals = new Particles({ n: 300, box: [20, 8, 60], vel: [1, -0.6, 2], life: 6, size: 0.18, color: 0xffc0d8, opacity: 0.8, swirl: 2, seed: 11 });
      s.add(petals.points);
      stride = await Runner.create(STRIDE_KIT);
      s.add(stride.root);
      for (let k = 0; k < 4; k++) {
        const rk = randomKit(k * 7 + 3);
        const r = await Runner.create({ singlet: rk.top, shorts: rk.shorts, socks: 0xeeeeea, shoes: rk.shoes, hair: rk.hair, skin: rk.skin }, k % 2 ? 'runner_f.glb' : 'runner_m2.glb');
        others.push(r);
        s.add(r.root);
      }
    },
    frame: (t, ctx) => {
      const h = ctx.hud, g = ctx.r.grade;
      h.time = t;
      const d = dist(t), p = course(d), sp = speed(t);
      stride.root.position.copy(p);
      stride.root.rotation.y = heading(d);
      const blown = smooth(T.blow, T.blow + 1.5, t);
      if (sp < 0.1) stride.pose({ phase: 0, speed: 1, locoWeight: 0, other: { Idle_Loop: [1, t] } });
      else stride.pose({ phase: d / stride.strideAt(sp), speed: sp, lean: 0.1 * (1 - blown), fatigue: blown * 1.1 });
      // the field
      others.forEach((r, k) => {
        const od = otherD(k, t), op = course(od);
        r.root.position.copy(op).add(new THREE.Vector3((k % 2 ? 1.3 : -1.3), 0, 0));
        r.root.rotation.y = heading(od);
        r.pose({ phase: od / r.strideAt(3.9), speed: t < T.go ? 0.1 : 3.9, locoWeight: t < T.go ? 0 : 1, other: t < T.go ? { Idle_Loop: [1, t + k] } : {} });
      });
      // the hare: bounds ahead, looks back, laughs, drops into its hole
      const hd = hareD(t), hp = course(hd);
      const holeD = hareD(T.hole);
      const hp2 = course(holeD);
      hole.position.set(hp2.x, 0.03, hp2.z);
      hole.visible = t > T.hole - 2;
      const down = smooth(T.hole, T.hole + 0.6, t);
      hare.g.position.set(t < T.hole ? hp.x : hp2.x, Math.abs(Math.sin(t * 9)) * 0.5 * (1 - down) - down * 2.5, t < T.hole ? hp.z : hp2.z);
      hare.g.rotation.y = heading(hd) + (t > T.pass && t < T.hole ? Math.PI * 0.9 : 0);
      hare.legs.forEach((l, k) => (l.rotation.x = Math.sin(t * 18 + k * Math.PI) * 0.9));
      hare.g.visible = t > T.go - 0.5 && down < 1;
      petals.points.position.set(p.x, 3, p.z - 20);
      petals.update(t, 1, 0.7);
      // camera: chase cam behind, pulling low and wide during the chase, pushed in during the blow-up
      const cam = ctx.r.camera as THREE.PerspectiveCamera;
      const back = t < T.spot ? 7 : t < T.blow ? 5.2 : 3.6;
      const hdg = heading(d);
      const bx = -Math.sin(hdg), bz = -Math.cos(hdg);
      if (t > T.pass && t < T.hole + 1.5) {
        // the field passing him: from ahead, looking back at him as they stream by
        cam.position.set(p.x - bx * 5.5 + Math.cos(hdg) * 1.2, 1.5, p.z - bz * 5.5);
        cam.lookAt(p.x, 1.2, p.z);
        cam.fov = 44;
      } else if (t > T.spot && t < T.spot + 2) {
        // alert: over his shoulder to the hare
        cam.position.set(p.x + bx * 2.5 + Math.cos(hdg) * 0.7, 1.75, p.z + bz * 2.5);
        cam.lookAt(hp.x, 1.2, hp.z);
        cam.fov = 38;
      } else {
        cam.position.set(p.x + bx * back, 1.9, p.z + bz * back);
        cam.lookAt(p.x - bx * 6, 1.2, p.z - bz * 6);
        cam.fov = 50 + (t > T.chase && t < T.blow ? 8 * smooth(T.chase, T.chase + 2, t) : 0);
      }
      cam.updateProjectionMatrix();
      // stamina floods red; the blow-up
      const stam = t < T.chase ? 1 : t < T.blow ? 1 - smooth(T.chase, T.blow, t) * 0.97 : 0.03 + 0.1 * smooth(T.blow + 2, T.hole + 4, t);
      g.saturation = 1.1 - 0.7 * blown;
      g.vignette = 0.25 + 0.6 * smooth(T.red, T.blow, t) * (1 - smooth(T.hole + 1, T.tip, t) * 0.5);
      g.gain = [1 + 0.08 * blown, 1 - 0.18 * blown, 1 - 0.2 * blown];
      g.exposure = 1 - 0.35 * blown;
      g.contrast = 1 + 0.2 * blown;
      g.ca = 0.004 * blown;
      g.fade = t < 1 ? 1 - smooth(0, 1, t) : t > DUR - 1 ? smooth(DUR - 1, DUR, t) : 0;
      // HUD
      const hudA = smooth(T.go, T.go + 0.5, t) * (1 - smooth(T.hole + 1.5, T.hole + 2.5, t));
      const raceD = Math.min(4999, Math.max(0, (d - dist(T.go)) * 1.0 * (1 + Math.max(0, t - T.chase) * 0.35)));
      lifeHud(h, { life: 1 - 0.3 * blown, stamina: stam, alpha: hudA, hurt: t > T.blow && t < T.blow + 0.7 ? 1 : 0 });
      equip(h, { item: 'NONE', weapon: 'PATIENCE', weaponSub: 'UNUSED', alpha: hudA });
      bossHp(h, { name: 'THE HARE', hp: 1, sub: 'IMPATIENCE', alpha: hudA * smooth(T.spot + 0.5, T.spot + 1, t) });
      const pc = t < T.go ? 0 : paceAt(Math.min(4999, raceD));
      if (hudA > 0 && t > T.go) {
        h.text('PACE', 1824, 60, { font: 'mono', size: 30, color: COL.uiDim, align: 'right', alpha: hudA, tracking: 4 });
        h.text(pace(pc) + ' /KM', 1824, 118, { font: 'mono', size: 64, color: t > T.chase && t < T.blow ? COL.red : COL.white, align: 'right', alpha: hudA, glow: 8, shadow: true });
      }
      if (t > T.spot && t < T.spot + 1.6) {
        const [sx, sy] = toScreen(new THREE.Vector3(hp.x, 2.8, hp.z), cam);
        alertMark(h, sx, sy, t - T.spot);
      }
      if (t > T.spot + 1 && t < T.chase + 0.5) h.text('TEMPO: Let it go, Stride.', 960, 1000, { font: 'body', size: 50, weight: 600, color: COL.white, align: 'center', alpha: env(t, T.spot + 1, T.chase + 0.5, 0.2, 0.2), shadow: true });
      if (t > T.chase - 0.4 && t < T.red) prompt(h, { b: 'X', text: 'CHASE', t: t - T.chase + 0.4, mash: true, y: 800 });
      if (t > T.red && t < T.blow) h.text('STAMINA CRITICAL', 960, 300, { font: 'head', size: 70, weight: 700, color: COL.red, align: 'center', alpha: 0.5 + 0.5 * Math.sin(t * 12), tracking: 12, glow: 10, shadow: true });
      if (t > T.blow) banner(h, 'BLOW UP', t - T.blow, { col: COL.red, sub: 'YOU WENT OFF TOO FAST', dur: 2.6 });
      if (t > T.pass && t < T.hole) {
        for (let k = 0; k < 3; k++) {
          const ttt = t - T.pass - k * 1.2;
          if (ttt > 0) popup(h, 'OVERTAKEN', 640 + k * 320, 420, ttt, COL.amber, 54);
        }
      }
      if (t > T.hole - 1.8 && t < T.hole + 0.8) {
        const [sx, sy] = toScreen(new THREE.Vector3(hp2.x, 2.6, hp2.z), cam);
        h.text('HA  HA  HA', sx, sy, { font: 'head', size: 64, weight: 700, color: COL.white, align: 'center', alpha: env(t, T.hole - 1.8, T.hole + 0.8, 0.2, 0.3), glow: 10, shadow: true, tracking: 8 });
      }
      if (t > T.hole + 1) {
        const a = env(t, T.hole + 1, DUR - 0.6, 0.3, 0.5);
        h.rect(0, 0, 1920, 1080, 'rgba(0,0,0,0.7)', a);
        h.text('MISSION FAILED', 960, 400, { font: 'head', size: 96, weight: 700, color: COL.red, align: 'center', alpha: a, tracking: 14, glow: 12 });
        h.text('FINSBURY PARK  23.04.2022    21:48    PB 21:04', 960, 490, { font: 'mono', size: 38, color: COL.white, align: 'center', alpha: a, tracking: 3 });
        h.text('LOG: "WENT OFF TOO FAST"', 960, 560, { font: 'mono', size: 38, color: COL.amber, align: 'center', alpha: a, tracking: 3 });
        const ta = a * smooth(T.tip, T.tip + 0.4, t);
        h.panel(460, 690, 1000, 150, { alpha: ta, col: COL.cyan });
        h.text('TIP', 500, 740, { font: 'mono', size: 30, color: COL.cyan, alpha: ta, tracking: 6 });
        h.text('The Hare cannot be caught. Ignore it.', 500, 800, { font: 'body', size: 48, weight: 600, color: COL.white, alpha: ta });
      }
      void clamp01;
    },
    cues: [
      { t: 0, kind: 'amb-park', dur: DUR },
      { t: T.spot, kind: 'alert' },
      { t: T.spot + 0.5, kind: 'music', id: 'hare', dur: T.blow - T.spot },
      { t: T.chase, kind: 'mash', dur: T.red - T.chase },
      { t: T.red, kind: 'heartbeat', dur: T.hole - T.red },
      { t: T.blow, kind: 'fail-big' },
      { t: T.hole - 1.6, kind: 'hare-laugh' },
      { t: T.hole + 1, kind: 'gameover' },
      { t: T.tip, kind: 'select' },
    ],
  });
}
