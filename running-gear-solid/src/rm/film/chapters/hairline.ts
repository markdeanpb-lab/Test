// BOSS: HAIRLINE (October - December 2024). Body horror, and the boss you cannot fight. An X-ray
// void: STRIDE runs as a radiograph (glowing bones, one lower leg with a red hairline in it) towards
// a colossal cracked bone. Every attack fails - CANNOT ATTACK - and pushing on only makes the crack
// grow. He stops. An MGS3-style CURE screen: RUN THROUGH IT is not an option; REST (01.11 to
// 17.12.2024, the next logged run) and WEIGHTS are.
import * as THREE from 'three';
import { SetScene, SetShot } from '../SetScene';
import { Particles, haloTex } from '../bosses/kit';
import { Ghost } from '../fx';
import { COL, env, smooth, clamp01 } from '../../hud/Hud';
import { lifeHud, equip, bossHp, prompt, popup } from '../../hud/game';
import { eventTag } from '../../hud/widgets';
import type { Hud } from '../../hud/Hud';
import type { Cue } from '../core';

type V3 = [number, number, number];
const XRAY = 0x9fd8ff;

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** the MGS3-style CURE screen: a body diagram, the injury, and the treatment list */
function cureScreen(h: Hud, t: number, a: number) {
  if (a <= 0) return;
  const g = h.g;
  h.rect(0, 0, 1920, 1080, 'rgba(2,10,6,0.86)', a);
  h.text('CURE', 120, 150, { font: 'head', size: 80, weight: 700, color: COL.green, alpha: a, tracking: 16, glow: 10 });
  h.text('MEDICAL  -  STRIDE', 124, 200, { font: 'mono', size: 30, color: COL.uiDim, alpha: a, tracking: 6 });
  // body diagram
  g.save();
  g.globalAlpha = a;
  g.strokeStyle = COL.green;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.shadowColor = COL.green;
  g.shadowBlur = 10;
  const cx = 560, top = 270;
  g.lineWidth = 5;
  g.beginPath();
  g.arc(cx, top + 50, 45, 0, Math.PI * 2);
  g.stroke();
  const limb = (pts: [number, number][], w: number) => {
    g.lineWidth = w;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(cx + x, top + y) : g.moveTo(cx + x, top + y)));
    g.stroke();
  };
  g.globalAlpha = a * 0.35;
  limb([[0, 110], [0, 380]], 110);
  limb([[-70, 130], [-120, 300], [-135, 440]], 34);
  limb([[70, 130], [120, 300], [135, 440]], 34);
  limb([[-38, 390], [-50, 560], [-55, 720]], 44);
  limb([[38, 390], [50, 560], [55, 720]], 44);
  g.globalAlpha = a;
  g.lineWidth = 3;
  g.strokeRect(cx - 60, top + 110, 120, 270);
  // the injury: lower leg (the ankles had been sore since 15.10)
  const heal = smooth(9.2, 10.2, t);
  const pulse = 0.55 + 0.45 * Math.sin(t * 6);
  g.shadowColor = heal > 0.5 ? COL.amber : COL.red;
  g.strokeStyle = heal > 0.5 ? COL.amber : COL.red;
  g.globalAlpha = a * (heal > 0.5 ? 1 : pulse);
  g.lineWidth = 5;
  g.beginPath();
  g.arc(cx - 54, top + 650, 46, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(cx - 54, top + 604);
  g.lineTo(cx - 250, top + 560);
  g.stroke();
  g.restore();
  h.text(heal > 0.5 ? 'HEALING' : 'STRESS REACTION', 110, top + 540, { font: 'head', size: 36, weight: 700, color: heal > 0.5 ? COL.amber : COL.red, alpha: a * (heal > 0.5 ? 1 : pulse), tracking: 4 });
  // treatment list
  const X = 1000;
  h.text('TREATMENT', X, 330, { font: 'mono', size: 34, color: COL.uiDim, alpha: a, tracking: 8 });
  const items: { name: string; sub: string; at: number; ok: boolean }[] = [
    { name: 'RUN THROUGH IT', sub: 'NOT AVAILABLE', at: 1.2, ok: false },
    { name: 'REST', sub: '01.11  -  17.12.2024', at: 4.2, ok: true },
    { name: 'WEIGHTS', sub: 'LOG: "ABSOLUTE SNOOZE FEST"', at: 6.6, ok: true },
  ];
  const cur = t < 3.6 ? 0 : t < 6 ? 1 : 2;
  items.forEach((it, i) => {
    const y = 430 + i * 130;
    const sel = cur === i;
    if (sel) h.rect(X - 30, y - 56, 820, 100, 'rgba(90,255,140,0.12)', a);
    h.text(sel ? '>' : ' ', X - 20, y, { font: 'mono', size: 44, color: COL.green, alpha: a * (Math.floor(t * 3) % 2 ? 1 : 0.4) });
    const used = t > it.at;
    h.text(it.name, X + 30, y, { font: 'head', size: 50, weight: 700, color: !it.ok && used ? COL.uiDim : COL.white, alpha: a, tracking: 4 });
    if (used) h.text(it.ok ? 'APPLIED' : 'X', X + 770, y, { font: 'mono', size: 36, color: it.ok ? COL.green : COL.red, align: 'right', alpha: a * smooth(it.at, it.at + 0.2, t), tracking: 4 });
    if (used) h.text(it.sub, X + 30, y + 40, { font: 'mono', size: 30, color: it.ok ? COL.ui : COL.red, alpha: a * smooth(it.at, it.at + 0.3, t), tracking: 3 });
    if (!it.ok && used) h.rect(X + 30, y - 16, 460 * smooth(it.at, it.at + 0.3, t), 5, COL.red, a);
  });
  h.text('THE ONLY CURE IS TIME.', 960, 960, { font: 'head', size: 48, weight: 700, color: COL.green, align: 'center', alpha: a * smooth(9.4, 10, t), tracking: 10, glow: 8 });
}

export function hairlineBoss() {
  const T = { run: 0, crack: 5.5, name: 7.4, atk: 11.2, sprint: 13.8, push: 16.4, slow: 18.6, stop: 21.4, kneel: 22, cure: 27, end: 39 };
  const DUR = T.end;
  // on-screen speed: running, then slowing to a limp, then stopped
  const v = (t: number) => (t < T.push ? 4.4 : t < T.slow ? 4.8 : t < T.stop ? 4.8 - 3.6 * smooth(T.slow, T.stop - 0.4, t) : 0);
  const N = 2000, dt = DUR / N, SS = new Float64Array(N + 1);
  for (let i = 1; i <= N; i++) SS[i] = SS[i - 1] + v(i * dt) * dt;
  const S = (t: number) => {
    const f = Math.min(N, Math.max(0, t / dt)), i = Math.min(N - 1, Math.floor(f));
    return SS[i] + (SS[i + 1] - SS[i]) * (f - i);
  };
  /** how far the crack has run (0..1): it spreads when he fights it */
  const crackU = (t: number) => 0.15 * smooth(T.crack, T.crack + 1.5, t) + 0.2 * smooth(T.atk + 0.6, T.atk + 1.4, t) + 0.25 * smooth(T.sprint + 0.6, T.sprint + 1.6, t) + 0.35 * smooth(T.push + 0.5, T.slow + 1, t);
  const hurt = (t: number) => Math.max(env(t, T.sprint + 0.7, T.sprint + 1.6, 0.05, 0.6), env(t, T.push + 1.2, T.slow + 1.4, 0.2, 0.8), env(t, T.atk + 0.6, T.atk + 1.3, 0.05, 0.5) * 0.5);

  let ghost: Ghost, floorTex: THREE.Texture, bone: THREE.Group, crackSegs: THREE.Mesh[] = [], crackGlow: THREE.Sprite, legCrack: THREE.Mesh, legGlow: THREE.Sprite, dust: Particles;
  const shots: SetShot[] = ([['run', T.crack], ['reveal', T.atk], ['fight', T.stop - 0.8], ['leg', T.cure], ['cure', T.end]] as [string, number][]).map(([tag, t1], i, a) => ({ dur: t1 - (i ? a[i - 1][1] : 0), p0: [0, 0, 0] as V3, l0: [0, 0, -1] as V3, tag }));
  const BONE_Z = -60;

  const cues: Cue[] = [
    { t: 0, kind: 'drone-low', dur: DUR },
    { t: 0, kind: 'breath', dur: T.stop },
    { t: T.crack, kind: 'crack', dur: 2 },
    { t: T.name, kind: 'boss-intro' },
    { t: T.atk + 0.6, kind: 'denied' },
    { t: T.atk + 0.7, kind: 'crack', dur: 0.8 },
    { t: T.sprint + 0.7, kind: 'hit-dmg' },
    { t: T.sprint + 0.8, kind: 'denied' },
    { t: T.push + 1.2, kind: 'crack', dur: 2.4 },
    { t: T.push + 1.4, kind: 'heartbeat', dur: T.cure - T.push - 1 },
    { t: T.cure, kind: 'codec-open' },
    { t: T.cure + 1.2, kind: 'denied' },
    { t: T.cure + 4.2, kind: 'select' },
    { t: T.cure + 6.6, kind: 'select' },
    { t: T.cure + 9.4, kind: 'music', id: 'quiet', dur: DUR - T.cure - 9.4 },
  ];

  return new SetScene({
    id: 'c5-hairline',
    chapter: 'HAIRLINE',
    sky: { hdri: 'moonless_golf', env: 0.1, sun: 0, bgIntensity: 0 },
    shots,
    build: async (st) => {
      const s = st.scene;
      s.background = new THREE.Color(0x020508);
      // a light-box floor: a scrolling blue grid
      floorTex = canvasTex(256, 256, (g) => {
        g.fillStyle = '#000';
        g.fillRect(0, 0, 256, 256);
        g.strokeStyle = 'rgba(120,200,255,0.55)';
        g.lineWidth = 2;
        g.strokeRect(0, 0, 256, 256);
        g.strokeStyle = 'rgba(120,200,255,0.18)';
        g.lineWidth = 1;
        for (let k = 1; k < 4; k++) {
          g.beginPath();
          g.moveTo(k * 64, 0);
          g.lineTo(k * 64, 256);
          g.moveTo(0, k * 64);
          g.lineTo(256, k * 64);
          g.stroke();
        }
      });
      floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
      floorTex.repeat.set(60, 60);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 240).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: floorTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      floor.position.z = -60;
      s.add(floor);
      // STRIDE as a radiograph: a translucent body with glowing bones
      ghost = await Ghost.create(XRAY, false, 0.16);
      s.add(ghost.runner.root);
      const r = ghost.runner;
      r.root.updateMatrixWorld(true);
      const boneM = new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
      const PAIRS = [['pelvis', 'spine_01'], ['spine_01', 'spine_02'], ['spine_02', 'spine_03'], ['spine_03', 'neck_01'], ['neck_01', 'Head'], ['thigh_l', 'calf_l'], ['calf_l', 'foot_l'], ['foot_l', 'ball_l'], ['thigh_r', 'calf_r'], ['calf_r', 'foot_r'], ['foot_r', 'ball_r'], ['upperarm_l', 'lowerarm_l'], ['lowerarm_l', 'hand_l'], ['upperarm_r', 'lowerarm_r'], ['lowerarm_r', 'hand_r'], ['clavicle_l', 'upperarm_l'], ['clavicle_r', 'upperarm_r']];
      const ws = new THREE.Vector3();
      for (const [a, b] of PAIRS) {
        const A = r.bone(a), B = r.bone(b);
        if (!A || !B) continue;
        A.getWorldScale(ws);
        const d = B.position.clone(), len = d.length();
        const rad = (a.startsWith('spine') || a === 'pelvis' ? 0.03 : a.startsWith('thigh') || a.startsWith('calf') ? 0.028 : 0.018) / ws.x;
        const m = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.8, rad, len, 8), boneM);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
        m.position.copy(d).multiplyScalar(0.5);
        A.add(m);
        if (a === 'calf_l') {
          // the hairline, low on the shin
          legCrack = new THREE.Mesh(new THREE.BoxGeometry(rad * 3.2, rad * 0.35, rad * 3.2), new THREE.MeshBasicMaterial({ color: 0xff2a20, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
          legCrack.quaternion.copy(m.quaternion);
          legCrack.position.copy(d).multiplyScalar(0.72);
          legCrack.rotateZ(0.35);
          A.add(legCrack);
          legGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: 0xff3020, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
          legGlow.position.copy(legCrack.position);
          legGlow.scale.setScalar(0.35 / ws.x);
          A.add(legGlow);
        }
      }
      // HAIRLINE: a colossal bone standing in the void, a red crack climbing it
      bone = new THREE.Group();
      const bm = new THREE.MeshBasicMaterial({ color: XRAY, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
      const bw = new THREE.MeshBasicMaterial({ color: XRAY, wireframe: true, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false });
      // the shaft: a lathe with a waist, flaring to the joints
      const prof: THREE.Vector2[] = [];
      for (let k = 0; k <= 24; k++) {
        const y = (k / 24) * 34, q = (y - 17) / 17;
        prof.push(new THREE.Vector2(1.9 + 1.5 * q ** 4, y));
      }
      const parts: THREE.BufferGeometry[] = [new THREE.LatheGeometry(prof, 28)];
      for (const [x, y, r0] of [[-2.4, 35, 4.2], [2.4, 35, 4], [-1.8, 0.5, 3.6], [1.8, 0.5, 3.4]] as V3[]) parts.push(new THREE.SphereGeometry(r0, 20, 14).translate(x, y, 0));
      for (const p of parts) {
        bone.add(new THREE.Mesh(p, bm));
        bone.add(new THREE.Mesh(p, bw));
      }
      // the crack: a zig-zag of thin red slivers up the front of the shaft
      const cm = new THREE.MeshBasicMaterial({ color: 0xff3a24, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      let cx = 0.2, cy = 1.5;
      for (let k = 0; k < 44; k++) {
        const nx = cx + Math.sin(k * 2.7) * 0.9 + Math.cos(k * 1.3) * 0.4, ny = cy + 0.8;
        const len = Math.hypot(nx - cx, ny - cy);
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.16, len, 0.1), cm);
        seg.position.set((cx + nx) / 2, (cy + ny) / 2, 3.1);
        seg.rotation.z = -Math.atan2(nx - cx, ny - cy);
        bone.add(seg);
        crackSegs.push(seg);
        cx = nx;
        cy = ny;
      }
      crackGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: 0xff3020, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      crackGlow.scale.setScalar(9);
      bone.add(crackGlow);
      bone.position.set(0, 0, BONE_Z);
      bone.rotation.z = 0.08;
      s.add(bone);
      dust = new Particles({ n: 260, box: [40, 20, 80], vel: [0, 0.3, 0.6], life: 8, size: 0.12, color: 0xbfe6ff, opacity: 0.6, additive: true, swirl: 0.6, seed: 5 });
      dust.points.position.set(0, 6, -30);
      s.add(dust.points);
    },
    frame: (t, ctx, info) => {
      const h = ctx.hud, g = ctx.r.grade;
      h.time = t;
      const cam = ctx.r.camera as THREE.PerspectiveCamera;
      const tg = info.tag!, u = info.shotT / shots[info.shot].dur;
      const s = S(t), sp = v(t);
      // the treadmill: he stays at the origin, the floor slides under him
      floorTex.offset.set(0, s / 4);
      const r = ghost.runner;
      r.root.position.set(0, 0, 0);
      r.root.rotation.y = Math.PI;
      const other: Record<string, [number, number]> = {};
      let locoW = 1;
      if (t > T.atk && t < T.atk + 1.4) {
        // he swings at it
        const w = env(t, T.atk, T.atk + 1.4, 0.15, 0.4);
        other.Punch_Jab = [w, (t - T.atk) * 1.2];
        locoW = 1 - w;
      }
      if (t > T.sprint + 0.6 && t < T.sprint + 1.6) {
        const w = env(t, T.sprint + 0.6, T.sprint + 1.6, 0.08, 0.5);
        other.Hit_Chest = [w, t - T.sprint - 0.6];
        locoW = Math.min(locoW, 1 - w * 0.7);
      }
      if (t > T.stop - 0.3) {
        const w = smooth(T.stop - 0.3, T.stop + 0.3, t);
        other.Idle_Loop = [w * (1 - smooth(T.kneel, T.kneel + 0.6, t)), t];
        other.Fixing_Kneeling = [smooth(T.kneel, T.kneel + 0.6, t), (t - T.kneel) * 0.6];
        locoW = 1 - w;
      }
      r.pose({ phase: s / r.strideAt(Math.max(1.2, sp)), speed: Math.max(1.2, sp), locoWeight: locoW, other, fatigue: 0.3 + 0.7 * smooth(T.push, T.stop, t) });
      ghost.opacity = 0.16;
      // the injury glows when it hurts
      const hu = hurt(t);
      (legCrack.material as THREE.MeshBasicMaterial).opacity = clamp01(0.25 + 0.75 * Math.max(hu, smooth(T.push, T.stop, t) * (0.6 + 0.4 * Math.sin(t * 7))));
      (legGlow.material as THREE.SpriteMaterial).opacity = 0.2 + 0.8 * Math.max(hu, 0.6 * smooth(T.push, T.stop, t));
      // the boss: rises out of the floor, the crack climbs it as he fights
      const up = smooth(T.crack, T.name + 1, t);
      bone.position.y = -36 * (1 - up);
      bone.position.z = BONE_Z + Math.min(20, s * 0.08);
      bone.rotation.y = t * 0.08;
      const cu = crackU(t), n = Math.floor(cu * crackSegs.length);
      crackSegs.forEach((c, i) => (c.visible = i < n));
      const tip = crackSegs[Math.max(0, n - 1)].position;
      crackGlow.position.set(tip.x, tip.y, 3.4);
      (crackGlow.material as THREE.SpriteMaterial).opacity = cu > 0 ? 0.6 + 0.4 * Math.sin(t * 9) : 0;
      dust.update(t, 1);

      // cameras
      const set = (p: V3, l: V3, fov: number) => {
        cam.position.set(...p);
        cam.lookAt(...l);
        cam.fov = fov;
      };
      const e = (a: number, b: number) => a + (b - a) * (u * u * (3 - 2 * u));
      const bz = bone.position.z;
      switch (tg) {
        case 'run':
          set([e(3.6, 2.6), 1.2, e(-1.5, -0.8)], [0, 1.0, 0.3], 36);
          break;
        case 'reveal':
          set([e(1.2, 1.8), e(0.6, 0.9), e(4.5, 5.5)], [0, e(6, 17), bz], e(40, 50));
          break;
        case 'fight':
          set([0.9 + Math.sin(t) * 0.2, 2.1, 5.2], [-0.3, 12, bz], 50);
          break;
        case 'leg':
          set([e(-3.2, -2.6), e(1.0, 0.8), e(-2.4, -1.9)], [0, 0.5, 0], 40);
          break;
        case 'cure':
          set([2.2, 1.1, -2.2], [0, 0.6, 0], 36);
          break;
      }
      if (hu > 0) cam.position.x += Math.sin(t * 60) * 0.03 * hu;
      cam.updateProjectionMatrix();

      // grade: cold radiograph, red flares with the pain
      g.exposure = 1.1;
      g.saturation = 0.55;
      g.contrast = 1.15;
      g.gain = [0.85 + 0.4 * hu, 1, 1.12 - 0.2 * hu];
      g.lift = [0, 0.01, 0.03];
      g.bloom = 0.45;
      g.vignette = 0.55 + 0.3 * hu;
      g.ca = 0.004 + 0.012 * hu;
      g.grain = 0.08;
      g.scan = 0.15;
      g.letterbox = t > T.crack && t < T.atk ? 1 : 0;
      g.fade = t < 1 ? 1 - smooth(0, 1, t) : t > DUR - 1.2 ? smooth(DUR - 1.2, DUR, t) : 0;

      // HUD
      if (t < T.crack) eventTag(h, { name: 'VALENCIA MARATHON BUILD', date: 'OCTOBER 2024', t });
      if (t > T.name && t < T.atk) {
        const a = env(t, T.name, T.atk - 0.1, 0.3, 0.4);
        h.text('STRESS REACTION', 1780, 640, { font: 'mono', size: 34, color: COL.red, align: 'right', alpha: a, tracking: 10 });
        h.text('HAIRLINE', 1780, 760, { font: 'head', size: 140 * (1 + 0.15 * (1 - smooth(T.name, T.name + 0.3, t))), weight: 700, color: COL.white, align: 'right', alpha: a, tracking: 14, glow: 20 });
        h.text('The boss you cannot fight.', 1780, 840, { font: 'body', size: 44, weight: 500, color: COL.ui, align: 'right', alpha: a * smooth(T.name + 0.8, T.name + 1.3, t) });
      }
      const hud = (t < T.crack ? smooth(3.9, 4.4, t) : t > T.atk ? smooth(T.atk, T.atk + 0.4, t) : 0) * (1 - smooth(T.stop + 0.2, T.stop + 0.8, t));
      if (hud > 0) {
        const life = 1 - 0.25 * smooth(T.sprint + 0.7, T.sprint + 1.2, t) - 0.45 * smooth(T.push + 1, T.stop, t);
        lifeHud(h, { life, stamina: 0.9 - 0.3 * smooth(T.push, T.stop, t), alpha: hud, hurt: hu });
        equip(h, { item: 'NONE', weapon: 'LEGS', weaponSub: t > T.sprint + 0.7 ? 'DAMAGED' : '', alpha: hud });
        if (t > T.atk) bossHp(h, { name: 'HAIRLINE', hp: 0.2 + 0.8 * cu, sub: 'IT GROWS WHEN YOU FIGHT IT', alpha: hud, col: COL.red });
      }
      if (t > T.atk - 0.3 && t < T.atk + 0.7) prompt(h, { b: 'X', text: 'ATTACK', t: t - T.atk + 0.3, ok: t > T.atk + 0.2, y: 780 });
      if (t > T.atk + 0.6) popup(h, 'CANNOT ATTACK', 960, 480, t - T.atk - 0.6, COL.red, 72);
      if (t > T.sprint - 0.3 && t < T.sprint + 0.7) prompt(h, { b: 'T', text: 'SPRINT', t: t - T.sprint + 0.3, ok: t > T.sprint + 0.2, y: 780 });
      if (t > T.sprint + 0.7) popup(h, 'NO', 960, 480, t - T.sprint - 0.7, COL.red, 90);
      if (t > T.push - 0.3 && t < T.slow + 0.6) prompt(h, { b: 'R1', text: 'PUSH THROUGH', t: t - T.push + 0.3, hold: clamp01((t - T.push) / (T.slow - T.push)), y: 780 });
      if (t > T.push + 1.2 && t < T.stop) h.text('IT IS GETTING WORSE', 960, 300, { font: 'head', size: 60, weight: 700, color: COL.red, align: 'center', alpha: 0.6 + 0.4 * Math.sin(t * 8), tracking: 14, glow: 10, shadow: true });
      if (t > T.stop && t < T.cure) {
        h.text('LACTATE:  Stop, Stride. There is nothing here to fight.', 960, 1000, { font: 'body', size: 48, weight: 600, color: COL.white, align: 'center', alpha: env(t, T.stop + 0.8, T.cure - 0.3, 0.3, 0.3), shadow: true });
      }
      cureScreen(h, t - T.cure, t > T.cure ? smooth(T.cure, T.cure + 0.5, t) * (1 - smooth(DUR - 1.2, DUR, t)) : 0);
    },
    cues,
  });
}
