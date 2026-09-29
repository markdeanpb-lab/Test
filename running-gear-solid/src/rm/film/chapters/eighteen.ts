// BOSS: EIGHTEEN (Striders Festive 5K, 16.12.2025, 18:19). Retro arcade: a neon festive track in a
// synthwave night (a ~420 m loop, 12 laps). A pacing drone locked on 18:00. Arcade rules: TIME
// counts down from 18:00 and every checkpoint (the real 850 m splits) shows the time gained or lost
// against it: EXTEND! while he is ahead (to 2.5 km), then the red. TIME UP hits with him still short;
// he finishes 18:19 anyway, a PB: NEW RECORD on the high-score table. EIGHTEEN: NOT YET.
import * as THREE from 'three';
import { SetScene, SetShot } from '../SetScene';
import { Runner, STRIDE_KIT } from '../../char/Runner';
import { Particles, haloTex } from '../bosses/kit';
import { Drone } from '../bosses/Drone';
import { COL, env, smooth, clamp01, fmt, pace } from '../../hud/Hud';
import { popup } from '../../hud/game';
import fest from '../../../data/gps/striders-festive-5k.json';
import type { Hud } from '../../hud/Hud';
import type { Cue } from '../core';

type V3 = [number, number, number];
const PINK = '#ff3ea5', CYAN = '#3ef3ff', YEL = '#ffe23e';
const PD = fest.profile.d, PT = fest.profile.t;
const DIST = PD[PD.length - 1], FIN = PT[PT.length - 1];
const TARGET = 1080; // 18:00
/** real race distance at race time T */
const dAt = (T: number) => {
  if (T <= 0) return 0;
  for (let i = 1; i < PT.length; i++) if (T <= PT[i]) return PD[i - 1] + ((T - PT[i - 1]) / (PT[i] - PT[i - 1])) * (PD[i] - PD[i - 1]);
  return DIST;
};
/** seconds ahead (+) of 18:00 pace at race time T */
const aheadAt = (T: number) => (dAt(T) * TARGET) / 5000 - T;

// the loop: two 100 m straights and two bends of radius 35 m (~420 m)
const STR = 100, RAD = 35, LAP = 2 * STR + 2 * Math.PI * RAD;
function track(d: number, lane = 0) {
  let u = ((d % LAP) + LAP) % LAP;
  const r = RAD + lane;
  if (u < STR) return { x: r, z: STR / 2 - u, hdg: Math.PI };
  u -= STR;
  if (u < Math.PI * RAD) {
    const a = u / RAD;
    return { x: r * Math.cos(a), z: -STR / 2 - r * Math.sin(a), hdg: Math.PI + a };
  }
  u -= Math.PI * RAD;
  if (u < STR) return { x: -r, z: -STR / 2 + u, hdg: 0 };
  u -= STR;
  const a = u / RAD;
  return { x: -r * Math.cos(a), z: STR / 2 + r * Math.sin(a), hdg: a };
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** arcade text: chunky mono with a hard coloured shadow */
function arc(h: Hud, s: string, x: number, y: number, size: number, col: string, a = 1, align: CanvasTextAlign = 'center') {
  if (a <= 0) return;
  h.text(s, x + size * 0.06, y + size * 0.06, { font: 'mono', size, color: '#2a0030', align, alpha: a, tracking: size * 0.08 });
  h.text(s, x, y, { font: 'mono', size, color: col, align, alpha: a, tracking: size * 0.08, glow: 12 });
}

export function eighteenBoss() {
  const T = { attract: 0, ready: 5.5, go: 8, cp: [12.1, 16.2, 20.3, 24.4, 28.5], last: 28.5, fin: 33.5, gone: 36, score: 38, end: 47 };
  // film time -> race time: fast through the checkpoints, slowing into the last 100 m
  const KEYS: [number, number][] = [[T.go, 0], [T.cp[0], PT[1]], [T.cp[1], PT[2]], [T.cp[2], PT[3]], [T.cp[3], PT[4]], [T.cp[4], PT[5]], [31, 1066], [T.fin, FIN]];
  const raceT = (t: number) => {
    if (t <= KEYS[0][0]) return 0;
    for (let i = 1; i < KEYS.length; i++) if (t <= KEYS[i][0]) return KEYS[i - 1][1] + ((t - KEYS[i - 1][0]) / (KEYS[i][0] - KEYS[i - 1][0])) * (KEYS[i][1] - KEYS[i - 1][1]);
    return FIN;
  };
  // the film time at which TIME reaches 0:00 (race time 18:00)
  let TU = 31;
  while (raceT(TU) < TARGET) TU += 0.01;
  // on screen he runs at a readable speed; each shot starts at his real place on the loop
  const V = 5.2;
  const shotStart = (t: number) => {
    const b = [T.go, ...T.cp, T.fin];
    let s0 = T.go;
    for (const x of b) if (t >= x) s0 = x;
    return s0;
  };
  const visD = (t: number) => {
    if (t < T.go) return 0;
    if (t >= T.fin) return DIST + (t - T.fin) * V * 0.4;
    const s0 = shotStart(t);
    if (t > 31) return DIST - (T.fin - t) * V * 0.9;
    return dAt(raceT(s0)) + (t - s0) * V;
  };

  let stride: Runner, drone: Drone, snow: Particles, sunMat: THREE.ShaderMaterial, gridTex: THREE.Texture;
  let gateText: THREE.Mesh;
  const shots: SetShot[] = ([['attract', T.ready], ['ready', T.go], ['c0', T.cp[0]], ['c1', T.cp[1]], ['c2', T.cp[2]], ['c3', T.cp[3]], ['c4', T.cp[4]], ['last', T.fin], ['fin', T.score], ['score', T.end]] as [string, number][]).map(([tag, t1], i, a) => ({ dur: t1 - (i ? a[i - 1][1] : 0), p0: [0, 0, 0] as V3, l0: [0, 0, -1] as V3, tag }));

  const cues: Cue[] = [
    { t: 0, kind: 'music', id: 'arcade', dur: T.fin + 2 },
    { t: T.ready + 0.5, kind: 'beep3' },
    { t: T.go, kind: 'gun' },
    ...T.cp.map((t) => ({ t, kind: 'checkpoint' })),
    { t: TU, kind: 'timeup' },
    { t: T.fin, kind: 'crowd-roar' },
    { t: T.gone, kind: 'drone-low', dur: 3 },
    { t: T.score, kind: 'hiscore' },
  ];

  return new SetScene({
    id: 'c6-eighteen',
    sky: { hdri: 'moonless_golf', env: 0.2, sun: 0, bgIntensity: 0 },
    shots,
    build: async (st) => {
      const s = st.scene;
      s.background = new THREE.Color(0x0a0018);
      s.fog = new THREE.FogExp2(0x1a0030, 0.006);
      // synthwave grid ground
      gridTex = canvasTex(128, 128, (g) => {
        g.fillStyle = '#07000f';
        g.fillRect(0, 0, 128, 128);
        g.strokeStyle = '#b02cff';
        g.lineWidth = 3;
        g.strokeRect(0, 0, 128, 128);
      });
      gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping;
      gridTex.repeat.set(120, 120);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: gridTex }));
      ground.position.y = -0.02;
      s.add(ground);
      // the track: a dark ribbon with neon edges
      const ribbon = (lane0: number, lane1: number, mat: THREE.Material, y: number) => {
        const pos: number[] = [], idx: number[] = [];
        const n = 240;
        for (let k = 0; k <= n; k++) {
          const a = track((k / n) * LAP, lane0), b = track((k / n) * LAP, lane1);
          pos.push(a.x, y, a.z, b.x, y, b.z);
          if (k) idx.push(2 * k - 2, 2 * k - 1, 2 * k, 2 * k - 1, 2 * k + 1, 2 * k);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setIndex(idx);
        const m = new THREE.Mesh(g, mat);
        s.add(m);
      };
      ribbon(-3, 3, new THREE.MeshBasicMaterial({ color: 0x120018, side: THREE.DoubleSide }), 0.01);
      ribbon(-3.15, -2.95, new THREE.MeshBasicMaterial({ color: 0xff3ea5, side: THREE.DoubleSide }), 0.02);
      ribbon(2.95, 3.15, new THREE.MeshBasicMaterial({ color: 0x3ef3ff, side: THREE.DoubleSide }), 0.02);
      for (const l of [-1, 1]) ribbon(l - 0.04, l + 0.04, new THREE.MeshBasicMaterial({ color: 0x5a2a80, side: THREE.DoubleSide }), 0.02);
      // the retro sun
      sunMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        fog: false,
        uniforms: { uT: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `varying vec2 vUv; uniform float uT;
          void main(){
            vec2 p = vUv - 0.5; float r = length(p);
            if (r > 0.5) discard;
            vec3 c = mix(vec3(1.0,0.2,0.6), vec3(1.0,0.85,0.2), vUv.y);
            float band = step(0.5, fract(vUv.y * 14.0 - uT * 0.4));
            float cut = vUv.y < 0.45 ? band : 1.0;
            gl_FragColor = vec4(c * 1.4, cut);
          }`,
      });
      const sun = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), sunMat);
      sun.position.set(0, 90, -520);
      s.add(sun);
      // wireframe mountains
      const mg = new THREE.PlaneGeometry(1200, 140, 60, 8);
      const mp = mg.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < mp.count; i++) {
        const x = mp.getX(i), y = mp.getY(i);
        const hgt = (Math.abs(Math.sin(x * 0.011) * 60 + Math.sin(x * 0.037) * 25) + 10) * clamp01((y + 70) / 140);
        mp.setY(i, hgt);
      }
      const mtn = new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ color: 0xb02cff, wireframe: true, transparent: true, opacity: 0.6, fog: false }));
      mtn.position.set(0, 0, -420);
      s.add(mtn);
      // neon christmas trees around the infield and outside the bends
      const treeG = new THREE.ConeGeometry(2.4, 7, 8, 3);
      const treeM = new THREE.MeshBasicMaterial({ color: 0x3eff7a, wireframe: true });
      const lightsM = new THREE.MeshBasicMaterial({ color: 0xffe23e });
      for (let k = 0; k < 22; k++) {
        const p = track((k / 22) * LAP, k % 2 ? 10 : -10);
        const tr = new THREE.Mesh(treeG, treeM);
        tr.position.set(p.x, 3.5, p.z);
        s.add(tr);
        const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), lightsM);
        star.position.set(p.x, 7.3, p.z);
        s.add(star);
      }
      // start / checkpoint gantry
      const gate = new THREE.Group();
      const neon = (col: number) => new THREE.MeshBasicMaterial({ color: col });
      for (const x of [-3.8, 3.8]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6, 0.3), neon(0xff3ea5));
        post.position.set(x, 3, 0);
        gate.add(post);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(8, 0.3, 0.3), neon(0xff3ea5));
      beam.position.y = 6;
      gate.add(beam);
      const gtex = canvasTex(512, 96, (g) => {
        g.fillStyle = '#12001a';
        g.fillRect(0, 0, 512, 96);
        g.fillStyle = '#ffe23e';
        g.font = '700 64px monospace';
        g.textAlign = 'center';
        g.fillText('CHECKPOINT', 256, 72);
      });
      gateText = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.3), new THREE.MeshBasicMaterial({ map: gtex, side: THREE.DoubleSide }));
      gateText.position.y = 5.1;
      gate.add(gateText);
      const g0 = track(0);
      gate.position.set(g0.x, 0, g0.z);
      gate.rotation.y = 0;
      s.add(gate);
      snow = new Particles({ n: 600, box: [60, 20, 60], vel: [0.3, -1.4, 0.2], life: 12, size: 0.16, color: 0xffffff, opacity: 0.9, swirl: 0.8, seed: 12 });
      s.add(snow.points);
      s.add(new THREE.HemisphereLight(0xb07cff, 0x301040, 1.4));
      const key = new THREE.DirectionalLight(0xff9ad0, 1.2);
      key.position.set(0, 30, -60);
      s.add(key);
      drone = await Drone.create();
      drone.root.scale.setScalar(1.6);
      // an arcade enemy glows
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: 0xff3ea5, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.scale.setScalar(3.2);
      drone.root.add(halo);
      const under = new THREE.PointLight(0xff3ea5, 20, 12, 1.5);
      under.position.y = -0.6;
      drone.root.add(under);
      s.add(drone.root);
      stride = await Runner.create(STRIDE_KIT);
      s.add(stride.root);
    },
    frame: (t, ctx, info) => {
      const h = ctx.hud, g = ctx.r.grade;
      h.time = t;
      const cam = ctx.r.camera as THREE.PerspectiveCamera;
      const tg = info.tag!, u = info.shotT / shots[info.shot].dur;
      const RT = raceT(t), ah = aheadAt(RT), d = visD(t);
      const done = t >= T.fin;
      const p = track(d, 0.9);
      stride.root.position.set(p.x, 0, p.z);
      stride.root.rotation.y = p.hdg;
      const sp = done ? Math.max(1.3, V * (1 - smooth(T.fin, T.fin + 2, t))) : V;
      if (t < T.go) stride.pose({ phase: 0, speed: 1, locoWeight: 0, other: { Idle_Loop: [1, t] } });
      else stride.pose({ phase: d / stride.strideAt(sp), speed: sp, fatigue: 0.2 + 0.6 * smooth(20, T.fin, t) });
      // the drone: 18:00 pace, placed by the real gap (clamped so it stays in the picture)
      const gapM = done ? 40 + (t - T.fin) * 12 : Math.max(-14, Math.min(16, -ah * 4.6));
      const dp = track(t < T.go ? 14 : d + Math.max(6, gapM), -0.9);
      drone.pose({ x: dp.x, y: 0, z: dp.z, dx: Math.sin(dp.hdg), dz: Math.cos(dp.hdg) }, t, t >= T.gone ? 3.2 + (t - T.gone) * 6 : 3.2);
      drone.root.visible = t < T.score;
      if (t >= T.go && !done && ah > 0) {
        // while he is ahead of 18:00 pace it hangs level with him, off his shoulder
        const bp = track(d + 2, -2.6);
        drone.pose({ x: bp.x, y: 0, z: bp.z, dx: Math.sin(bp.hdg), dz: Math.cos(bp.hdg) }, t, 2.8);
      }
      snow.points.position.set(cam.position.x, 8, cam.position.z);
      snow.update(t, 1);
      sunMat.uniforms.uT.value = t;
      gridTex.offset.set(0, 0);

      // cameras
      const hx = Math.sin(p.hdg), hz = Math.cos(p.hdg);
      const set = (pp: V3, l: V3, fov: number) => {
        cam.position.set(...pp);
        cam.lookAt(...l);
        cam.fov = fov;
      };
      const e = (a: number, b: number) => a + (b - a) * (u * u * (3 - 2 * u));
      switch (tg) {
        case 'attract': {
          const a = t * 0.18 + 0.6;
          set([Math.sin(a) * 110, e(60, 34), Math.cos(a) * 110], [0, 0, 0], 40);
          break;
        }
        case 'ready':
          set([p.x - hx * 5 + hz * 1.2, 2.2, p.z - hz * 5 - hx * 1.2], [p.x + hx * 10, 1.4, p.z + hz * 10], 50);
          break;
        case 'c0':
        case 'c2':
        case 'last':
          // OutRun: low behind, the track and the drone ahead
          set([p.x - hx * 4.8, 2.3, p.z - hz * 4.8], [p.x + hx * 12, 1.8, p.z + hz * 12], 56);
          break;
        case 'c1':
        case 'c3':
          set([p.x + hz * 4.5 + hx * 2, 1.4, p.z - hx * 4.5 + hz * 2], [p.x, 1.2, p.z], 44);
          break;
        case 'c4':
          set([p.x + hx * 7, 1.6, p.z + hz * 7], [p.x, 1.4, p.z], 40);
          break;
        case 'fin':
        case 'score': {
          // behind him as he slows: the drone climbs away over the track
          const dr = drone.root.position;
          set([p.x - hx * 5 + hz * 1.5, 1.7, p.z - hz * 5 - hx * 1.5], [dr.x * 0.5 + p.x * 0.5, 2.5 + (dr.y - 2.5) * 0.6, dr.z * 0.5 + p.z * 0.5], 50);
          break;
        }
      }
      cam.updateProjectionMatrix();

      g.saturation = 1.25;
      g.contrast = 1.1;
      g.bloom = 0.6;
      g.vignette = 0.4;
      g.scan = 0.25;
      g.grain = 0.04;
      g.ca = 0.003;
      g.fade = t < 0.6 ? 1 - smooth(0, 0.6, t) : t > T.end - 0.8 ? smooth(T.end - 0.8, T.end, t) : 0;

      // --- arcade HUD
      if (tg === 'attract') {
        const a = smooth(0.4, 1, t);
        arc(h, 'EIGHTEEN', 960, 380, 150, PINK, a);
        arc(h, 'STRIDERS FESTIVE 5K  -  16.12.2025', 960, 470, 34, CYAN, a);
        arc(h, '12 LAPS  -  BEAT 18:00', 960, 530, 34, YEL, a * smooth(1.6, 2, t));
        if (Math.floor(t * 2) % 2) arc(h, 'PRESS START', 960, 760, 54, '#ffffff', a);
        arc(h, 'CREDIT 01', 1780, 1030, 30, '#ffffff', a, 'right');
      }
      if (tg === 'ready') {
        const k = Math.floor((t - T.ready) / 0.8);
        arc(h, ['READY?', '3', '2', '1'][Math.min(3, k)], 960, 520, 150, YEL, 1);
      }
      if (t > T.go && t < T.go + 0.8) arc(h, 'GO!', 960, 520, 170, '#3eff7a', 1 - smooth(T.go + 0.4, T.go + 0.8, t));
      const hudA = t > T.ready ? smooth(T.ready, T.ready + 0.3, t) * (1 - smooth(T.score - 0.4, T.score, t)) : 0;
      if (hudA > 0) {
        // TIME: what is left of 18:00
        const left = Math.max(0, TARGET - RT);
        arc(h, 'TIME', 960, 70, 34, YEL, hudA);
        const blink = left < 20 && Math.floor(t * 4) % 2 === 0;
        arc(h, fmt(left), 960, 150, 84, left < 20 ? '#ff3030' : '#ffffff', hudA * (blink ? 0.3 : 1));
        arc(h, `LAP ${Math.min(12, Math.floor(dAt(RT) / (DIST / 12)) + 1)}/12`, 120, 90, 44, CYAN, hudA, 'left');
        arc(h, `${(dAt(RT) / 1000).toFixed(2)} KM`, 120, 150, 36, '#ffffff', hudA, 'left');
        arc(h, 'ELAPSED', 1800, 70, 30, YEL, hudA, 'right');
        arc(h, fmt(Math.min(RT, FIN)), 1800, 130, 52, '#ffffff', hudA, 'right');
        // the pacer's gap as a bar: left of centre = behind
        const gx = 960, gy = 1000;
        h.rect(gx - 400, gy - 14, 800, 28, 'rgba(20,0,40,0.8)', hudA);
        h.rect(gx - 2, gy - 22, 4, 44, '#ffffff', hudA);
        const w = Math.max(-400, Math.min(400, ah * 20));
        h.rect(w < 0 ? gx + w : gx, gy - 12, Math.abs(w), 24, ah >= 0 ? '#3eff7a' : '#ff3030', hudA);
        arc(h, `18:00 PACER   ${ah >= 0 ? '+' : '-'}${Math.abs(ah).toFixed(1)} S`, gx, gy - 34, 30, ah >= 0 ? '#3eff7a' : '#ff5050', hudA);
      }
      // checkpoints: the real 850 m splits against 18:00 pace
      T.cp.forEach((tc, k) => {
        const since = t - tc;
        if (since < 0 || since > 2.6) return;
        const seg = PT[k + 1] - PT[k], should = ((PD[k + 1] - PD[k]) * TARGET) / 5000, delta = should - seg;
        const a = env(since, 0, 2.6, 0.05, 0.4);
        arc(h, 'CHECKPOINT!', 960, 290, 96, YEL, a);
        arc(h, `${pace((seg / (PD[k + 1] - PD[k])) * 1000)} /KM`, 960, 360, 44, '#ffffff', a);
        if (delta >= 0) arc(h, `EXTEND!  +${delta.toFixed(1)} S`, 960, 440, 60, '#3eff7a', a);
        else arc(h, `${delta.toFixed(1)} S`, 960, 440, 60, '#ff3030', a);
      });
      if (t > 31.1 && t < TU) arc(h, 'HURRY UP!', 960, 420, 96, '#ff3030', Math.floor(t * 5) % 2 ? 1 : 0.4);
      if (t > TU && t < T.fin + 0.3) arc(h, 'TIME UP', 960, 440, 120, '#ff3030', 1);
      if (t > TU && t < T.fin) popup(h, `${Math.round(DIST - dAt(RT))} M TO GO`, 960, 560, (t - TU) % 1.2, '#ffffff', 48);
      if (t > T.fin && t < T.score) {
        arc(h, 'FINISH  18:19', 960, 380, 110, '#ffffff', smooth(T.fin, T.fin + 0.3, t));
        arc(h, 'EIGHTEEN: NOT YET', 960, 520, 70, PINK, smooth(T.gone, T.gone + 0.4, t));
      }
      if (tg === 'score') {
        const a = smooth(T.score, T.score + 0.4, t);
        h.rect(0, 0, 1920, 1080, 'rgba(8,0,20,0.85)', a);
        arc(h, 'HIGH SCORES  -  5K', 960, 190, 70, YEL, a);
        const rows: [string, string, string, string, boolean][] = [
          ['1ST', '18:19', 'STR', '16.12.25', true],
          ['2ND', '18:28', 'STR', '29.03.25', false],
          ['3RD', '18:42', 'STR', '05.10.24', false],
        ];
        rows.forEach(([r, tm, nm, dt, isNew], i) => {
          const y = 340 + i * 110, ra = a * smooth(T.score + 0.6 + i * 0.4, T.score + 0.9 + i * 0.4, t);
          const col = isNew ? (Math.floor(t * 3) % 2 ? PINK : YEL) : '#ffffff';
          arc(h, r, 520, y, 60, col, ra, 'left');
          arc(h, tm, 780, y, 60, col, ra, 'left');
          arc(h, nm, 1060, y, 60, col, ra, 'left');
          arc(h, dt, 1260, y, 48, col, ra, 'left');
        });
        arc(h, 'NEW RECORD!', 960, 740, 80, '#3eff7a', a * smooth(T.score + 2, T.score + 2.4, t));
        arc(h, 'NEXT TARGET  17:59', 960, 860, 54, CYAN, a * smooth(T.score + 3.4, T.score + 3.8, t));
      }
    },
    cues,
  });
}
