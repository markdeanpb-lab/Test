// BOSS: THE CLAW (Highgate hills, 26.11.2023, 22.3 km, +445 m). The hand erupts from the hill;
// STRIDE runs UP each of its five fingers (the five climbs, with this run's segment efforts) while
// the finger curls to throw him off; each beaten finger goes green and retracts.
import * as THREE from 'three';
import { SetScene } from '../SetScene';
import { Runner, STRIDE_KIT } from '../../char/Runner';
import { Hand, PALM_Y } from '../bosses/Hand';
import { Particles, clamp01 } from '../bosses/kit';
import { pbr } from '../../engine/assets';
import { COL, env, smooth } from '../../hud/Hud';
import { lifeHud, equip, bossHp, prompt, banner, popup, results } from '../../hud/game';
import { SKY } from '../common';
import { CLAW } from '../../../data/activities';

const CLIMBS = [
  { name: 'HIGHGATE WEST HILL', bearing: 188, seg: '621 M  +37 M  3:51' },
  { name: "SWAIN'S LANE", bearing: 167, seg: '856 M  +60 M  5:33' },
  { name: 'DARTMOUTH PARK HILL', bearing: 133, seg: '474 M  +35 M  3:11' },
  { name: 'HIGHGATE HILL', bearing: 117, seg: '920 M  +64 M  5:57' },
  { name: 'HORNSEY LANE', bearing: 71, seg: '1105 M  +34 M  6:36' },
];

const INTRO = 7;
const RUN = [7.5, 7.5, 5.5, 7.5, 6]; // seconds on each finger
const CLEAR = 1.6; // finger-cleared beat before the cut
const starts: number[] = [];
{
  let t = INTRO;
  for (const r of RUN) {
    starts.push(t);
    t += r + CLEAR;
  }
}
const END = starts[4] + RUN[4] + CLEAR;
const OUTRO = 10;

export function clawBoss() {
  let hand: Hand, stride: Runner, dust: Particles;
  const shots = [
    { dur: INTRO, p0: [70, 16, 70] as [number, number, number], p1: [62, 22, 62] as [number, number, number], l0: [0, 6, 0] as [number, number, number], fov: 42, tag: 'intro' },
    ...RUN.map((r, i) => ({ dur: r + CLEAR, p0: [0, 0, 0] as [number, number, number], l0: [0, 0, 0] as [number, number, number], fov: 44, tag: 'f' + i })),
    { dur: OUTRO, p0: [55, 40, 55] as [number, number, number], p1: [75, 60, 75] as [number, number, number], l0: [0, 8, 0] as [number, number, number], fov: 40, tag: 'outro' },
  ];
  return new SetScene({
    id: 'c3-claw',
    sky: { ...SKY.winter, fog: 0.004 },
    shots,
    build: async (st) => {
      const s = st.scene;
      const g = await pbr('sparse_grass');
      for (const k of ['map', 'normalMap', 'roughnessMap'] as const) {
        g[k] = g[k].clone();
        g[k].repeat.set(90, 90);
        g[k].needsUpdate = true;
      }
      const ground = new THREE.Mesh(new THREE.CircleGeometry(900, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ ...g, color: 0x8a9a7a, roughness: 1 }));
      ground.receiveShadow = true;
      s.add(ground);
      // Highgate village crowning the hill beyond the hand: a ring of house silhouettes
      const houseMat = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.9 });
      for (let k = 0; k < 60; k++) {
        const a = (k / 60) * Math.PI * 2, r = 190 + ((k * 37) % 60);
        const hgt = 7 + ((k * 13) % 9);
        const m = new THREE.Mesh(new THREE.BoxGeometry(8 + (k % 4) * 2, hgt, 9), houseMat);
        m.position.set(Math.sin(a) * r, hgt / 2, Math.cos(a) * r);
        m.rotation.y = a;
        s.add(m);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(7, 4, 4), houseMat);
        roof.position.set(m.position.x, hgt + 2, m.position.z);
        roof.rotation.y = a + Math.PI / 4;
        s.add(roof);
      }
      hand = await Hand.create(CLIMBS.map((c) => c.bearing));
      s.add(hand.root);
      dust = new Particles({ n: 500, box: [70, 4, 70], vel: [0, 7, 0], life: 3, size: 4, color: 0x8a7e70, opacity: 0.35, grow: 2.5, swirl: 4, seed: 3 });
      dust.points.position.y = 2;
      s.add(dust.points);
      stride = await Runner.create(STRIDE_KIT);
      s.add(stride.root);
      st.atmos.sun.shadow.camera.far = 900;
    },
    frame: (t, ctx, i) => {
      const h = ctx.hud, g = ctx.r.grade;
      h.time = t;
      // the hand rises out of the hill
      hand.rise = smooth(1.5, 5.5, t);
      dust.update(t, t > 1.5 && t < 7 ? 1 : 0, 0.35);
      const cur = i.tag?.startsWith('f') ? Number(i.tag.slice(1)) : i.tag === 'outro' ? 5 : -1;
      hand.fingers.forEach((f, k) => {
        const s0 = starts[k], run = RUN[k];
        const done = t > s0 + run;
        // the finger curls while he climbs it; once cleared it slams flat and sinks
        f.curl = k === cur && !done ? 0.26 * smooth(s0 + run * 0.7, s0 + run, t) + 0.04 * Math.sin(t * 9) * smooth(s0 + run * 0.7, s0 + run * 0.8, t) : done ? -0.1 * smooth(s0 + run, s0 + run + 0.4, t) : 0;
        f.sink = done ? smooth(s0 + run + 0.6, s0 + run + 3.5, t) : 0;
        f.lampsTo(done ? 'done' : t > INTRO - 2 ? 'wake' : 'off', t);
        f.sparks.update(t, k === cur && !done ? 0.6 : done && t < s0 + run + 1.5 ? 1 : 0);
      });
      if (t > END) for (const f of hand.fingers) f.sink = 1;
      hand.update(t, smooth(3, 6, t) * (1 - smooth(END, END + 3, t)));
      if (t > END) hand.rise = 1 - smooth(END + 1, END + 6, t);
      // STRIDE: running up the current finger
      const cam = ctx.r.camera as THREE.PerspectiveCamera;
      if (cur >= 0 && cur < 5) {
        const f = hand.fingers[cur];
        const u = clamp01((t - starts[cur]) / RUN[cur]);
        const uu = u * u * (3 - 2 * u) * 0.35 + u * 0.65;
        const p = f.surface(uu * 0.97);
        const ahead = f.surface(Math.min(1, uu * 0.97 + 0.03));
        // knuckles stand proud of the running surface: he has to jump them
        const jumpU = [0.4, 0.6].map((k) => k / 0.97);
        let jh = 0, jumping = -1;
        jumpU.forEach((k, n) => {
          const x = (uu - k + 0.06) / 0.12;
          if (x > 0 && x < 1) {
            jh = Math.sin(x * Math.PI) * 1.7;
            jumping = n;
          }
        });
        stride.root.position.copy(p).add(new THREE.Vector3(0, jh, 0));
        stride.root.rotation.y = Math.atan2(ahead.x - p.x, ahead.z - p.z);
        const speed = u < 1 ? 5 : 0;
        const dist = uu * 30;
        const tired = cur === 3 || cur === 1 ? 0.35 : 0.15;
        if (u >= 1) stride.pose({ phase: 0, speed: 1, locoWeight: 0, other: { Idle_Loop: [1, t] }, fatigue: 0.5 });
        else if (jumping >= 0) stride.pose({ phase: 0, speed, locoWeight: 0, other: { Jump_Loop: [1, 0.4] } });
        else stride.pose({ phase: dist / stride.strideAt(speed), speed, lean: 0.12, fatigue: tired });
        (stride as unknown as { _jumpU: number[] })._jumpU = jumpU;
        // tracking camera, side-on and a little below: the finger rises across the frame
        const dir = new THREE.Vector3(ahead.x - p.x, 0, ahead.z - p.z).normalize();
        const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(cur % 2 ? -1 : 1);
        const back = u < 1 ? 5 : 8;
        cam.position.copy(p).addScaledVector(side, 6.5).addScaledVector(dir, -back * 0.6).add(new THREE.Vector3(0, 0.6, 0));
        cam.lookAt(p.x + dir.x * 3, p.y + 1.5, p.z + dir.z * 3);
        cam.fov = 50;
        cam.updateProjectionMatrix();
      } else {
        stride.root.position.set(0, -50, 0);
        stride.pose({ phase: 0, speed: 1, locoWeight: 0, other: { Idle_Loop: [1, t] } });
      }
      if (i.tag === 'outro') {
        stride.root.position.set(0, 0.02, 0);
        stride.root.rotation.y = 0.6;
        stride.pose({ phase: 0, speed: 1, locoWeight: 0, other: { Idle_Loop: [1, t] }, fatigue: 0.6 });
      }
      g.saturation = 0.85;
      g.contrast = 1.08;
      if (t < 1) g.fade = 1 - smooth(0, 1, t);
      // HUD
      const fightA = cur >= 0 && cur < 5 ? 1 : 0;
      const cleared = hand.fingers.filter((_, k) => t > starts[k] + RUN[k]).length;
      if (i.tag === 'intro') {
        const u = i.shotT;
        h.text('THE CLAW', 1760, 820, { font: 'head', size: 170, weight: 700, color: COL.white, align: 'right', alpha: smooth(3, 3.5, u) * (1 - smooth(6.3, 7, u)), tracking: 22, glow: 16, shadow: true });
        h.text('FIVE FINGERS OF HIGHGATE', 1760, 900, { font: 'mono', size: 44, color: COL.amber, align: 'right', alpha: smooth(3.6, 4, u) * (1 - smooth(6.3, 7, u)), tracking: 10, shadow: true });
        h.caption(['26.11.2023', 'HIGHGATE, LONDON', '22.3 KM  +445 M'], u, 0.5, env(u, 0.3, 3, 0.3, 0.3));
      }
      if (fightA) {
        const u = clamp01((t - starts[cur]) / RUN[cur]);
        const km = CLAW.phases[cur + 1];
        lifeHud(h, { life: 1, stamina: 1 - 0.8 * u });
        equip(h, { item: 'NONE', weapon: 'LEGS' });
        bossHp(h, { name: 'THE CLAW', hp: 1 - cleared / 5, phase: `FINGER ${cur + 1} / 5`, col: COL.amber, hit: t > starts[cur] + RUN[cur] && t < starts[cur] + RUN[cur] + 0.5 ? 1 : 0 });
        h.text(CLIMBS[cur].name, 960, 300, { font: 'head', size: 64, weight: 700, color: COL.amber, align: 'center', tracking: 8, shadow: true, glow: 6, alpha: 1 - smooth(RUN[cur], RUN[cur] + 0.3, t - starts[cur]) });
        h.text(CLIMBS[cur].seg, 960, 352, { font: 'mono', size: 38, color: COL.white, align: 'center', tracking: 4, shadow: true, alpha: 1 - smooth(RUN[cur], RUN[cur] + 0.3, t - starts[cur]) });
        void km;
        // knuckles: jump!
        const uNow = clamp01((t - starts[cur]) / RUN[cur]);
        const uuNow = uNow * uNow * (3 - 2 * uNow) * 0.35 + uNow * 0.65;
        for (const k of [0.4, 0.6].map((x) => x / 0.97)) {
          const lead = k - 0.06 - uuNow;
          if (lead > -0.02 && lead < 0.12) prompt(h, { b: 'X', text: 'JUMP', t: 0.12 - lead, y: 820, ok: lead < 0 });
        }
        // the finger closes on him near the top: hold on
        if (uNow > 0.72 && uNow < 0.95) prompt(h, { b: 'R1', text: 'HOLD ON', t: (uNow - 0.72) * RUN[cur], hold: (uNow - 0.72) / 0.23, y: 820 });
        if (t > starts[cur] + RUN[cur]) {
          const c = t - starts[cur] - RUN[cur];
          popup(h, 'FINGER CLEARED', 960, 520, c, COL.green, 80);
        }
      }
      if (t > END && t < END + OUTRO) {
        banner(h, 'CLAW RETRACTED', t - END - 0.8, { col: COL.green, sub: 'ALL FIVE CLIMBS', dur: 3.4 });
        results(h, t - END - 4.6, {
          title: 'THE CLAW  -  RESULTS',
          rows: [['DISTANCE', '22.3 KM'], ['CLIMBING', '+445 M'], ['TIME', CLAW.timeLabel], ['LOG', '"Getting it done"']],
          codename: 'MOUNTAIN GOAT',
        });
      }
      if (t > END + OUTRO - 1.2) g.fade = smooth(END + OUTRO - 1.2, END + OUTRO, t);
      void PALM_Y;
    },
    cues: [
      { t: 0, kind: 'amb-city-quiet', dur: END + OUTRO },
      { t: 1.5, kind: 'wall-rise' },
      { t: 1.5, kind: 'drone-low', dur: 5 },
      { t: 3, kind: 'boss-intro' },
      { t: INTRO, kind: 'music', id: 'claw', dur: END - INTRO },
      ...starts.map((s, k) => ({ t: s + RUN[k], kind: 'hit-dmg' })),
      ...starts.map((s, k) => ({ t: s + RUN[k] + 0.6, kind: 'wall-rise' })),
      ...starts.map((s, k) => ({ t: s + RUN[k] * 0.72, kind: 'select' })),
      { t: END + 0.8, kind: 'win' },
      { t: END + 4.6, kind: 'result' },
    ],
  });
}
