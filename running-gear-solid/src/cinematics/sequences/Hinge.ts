import * as THREE from 'three';
import { Sequence, cam } from '../Sequence';
import type { FX } from '../../renderer/Renderer';
import type { UI } from '../../hud/UI';
import { COL } from '../../hud/UI';
import { applyLighting, glow, particles, setPointLight } from '../../shaders/ps1';
import { arch, barrier, block, crowd, ground, lampPost, skyDome } from '../../environments/props';
import { pathRibbon } from '../../environments/sets';
import { TEX } from '../../renderer/textures';
import { Runner, stridePhase } from '../../runner/Runner';
import { HingeBoss } from '../../bosses/Hinge';
import { HINGE } from '../../data/activities';
import { raceAt, kmTimeline, lifeAt } from '../race';
import { drawBossTitle, drawResults, drawRunHUD, drawRadar } from '../../hud/screens';
import { clamp, easeInCubic, easeOutCubic, fmtTime, lerp, ramp, rng, smooth } from '../../core/util';

const FIGHT0 = 5.5;
const FIGHT1 = 18;

export class HingeSeq extends Sequence {
  boss = new HingeBoss();
  runner = new Runner('club');
  lamps: THREE.Vector3[] = [];
  mist = particles({ count: 300, box: [120, 6, 30], vel: [1.2, 0.1, 0], size: 0.9, life: 8, color: 0x8a7a68, opacity: 0.18, swirl: 0.6, seed: 12 });
  kmAt = kmTimeline([[FIGHT0, 0], [8.5, 4.5], [11, 9.6], [13.5, 14.2], [15.5, 17.1], [17, 20.2], [FIGHT1, HINGE.distanceKm]]);
  radarPts: [number, number][] = [];

  build() {
    this.clearColor.setHex(0x2e2018);
    const G = this.group;
    G.add(skyDome(0x0c0c14, 0x3a2818, 0x2e2018));
    G.add(ground(900, 200, TEX.asphalt(), [120, 25], 0x404048, 24));
    const road = pathRibbon(new THREE.LineCurve3(new THREE.Vector3(-150, 0, 0), new THREE.Vector3(450, 0, 0)), 9, TEX.road(), 0x6a6a74, 200);
    G.add(road);
    for (const z of [-6.2, 6.2]) {
      const pave = block(600, 0.15, 3.2, TEX.concrete(), 0x8a8480, 3);
      pave.position.set(150, 0, z);
      G.add(pave);
    }
    const r = rng(2205);
    // railway viaduct (north side)
    for (let x = -150; x < 450; x += 14) {
      const a = arch(14, 11, 8, TEX.brick());
      a.position.set(x, 0, -12);
      G.add(a);
    }
    const deck = block(600, 1.2, 8.6, TEX.concrete(), 0x6a6460, 3);
    deck.position.set(150, 11, -12);
    G.add(deck);
    const rail = block(600, 0.3, 0.3, null, 0x2a2a2a);
    rail.position.set(150, 12.5, -8.2);
    G.add(rail);
    // terraces (south side)
    for (let x = -150; x < 450; x += 8.2) {
      const h = 8 + r() * 2;
      const b = block(8, h, 8, TEX.terrace(), 0xc8c0b8, 8);
      b.position.set(x, 0, 13);
      G.add(b);
    }
    // sodium lamps
    for (let x = -140; x < 440; x += 18) {
      const l = lampPost(6, 0xffa040, 1.4, true);
      l.position.set(x, 0, 7.4);
      l.rotation.y = Math.PI;
      G.add(l);
      this.lamps.push(new THREE.Vector3(x - 1.4, 5.6, 7.4));
      const puddle = new THREE.Mesh(new THREE.CircleGeometry(1.6 + r(), 8), glow(0xffa040, 0.12));
      puddle.rotation.x = -Math.PI / 2;
      puddle.position.set(x - 1.4 + (r() - 0.5) * 3, 0.06, 3.6 - r() * 5);
      G.add(puddle);
    }
    // crowd behind barriers, both sides ("great atmosphere")
    for (let x = -60; x < 200; x += 7.5) {
      for (const z of [-5.2, 5.2]) {
        if (r() < 0.25) continue;
        const b = barrier(7);
        b.position.set(x, 0, z);
        G.add(b);
        const c = crowd(7, 7, 1.2, Math.floor(x * 3 + z));
        c.position.set(x, 0, z + Math.sign(z) * 1.3);
        G.add(c);
      }
    }
    G.add(this.boss.root);
    this.boss.root.scale.setScalar(0.7);
    G.add(this.runner.root);
    this.mist.position.set(40, 2, 0);
    G.add(this.mist);
    // tactical radar polyline: straight Hackney-ish loop (not GPS, 2022 route not used)
    for (let i = 0; i <= 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      this.radarPts.push([Math.cos(a) * 0.8 + Math.sin(a * 2) * 0.15, Math.sin(a) * 0.55]);
    }

    // ---------------- camera ----------------
    // 1 extreme wide establishing shot, quiet
    this.shot(0, 1.9, cam(-34, 7, 14, 20, 7, -6, 50), cam(-31, 6.6, 13, 22, 7, -6, 50), 'none');
    // 2 detail: the knee drum, lamps dark, steam
    this.shot(1.9, 1.4, cam(0, 0, 0, 0, 0, 0, 34), cam(0, 0, 0, 0, 0, 0, 30), 'sine.inOut', (t, c) => {
      const k = this.kneeWorld();
      const f = (t - 1.9) / 1.4;
      c.x = k.x + 5 - f * 1.2;
      c.y = k.y + 0.6;
      c.z = k.z + 3.5;
      c.tx = k.x;
      c.ty = k.y;
      c.tz = k.z;
    });
    // 3 reveal: low angle from the road as the leg unfolds
    this.shot(3.3, 2.2, cam(-3, 0.8, 4, 12, 9, -8, 56), cam(-6, 0.5, 5, 12, 11, -8, 60), 'power2.out');
    // fight 1: front tracking, runner coming at us, the leg stomping behind him
    this.shot(FIGHT0, 3.0, cam(8, 1.0, 1.2, -3, 4.2, -2.5, 60), cam(7, 0.8, 1.6, -3, 5.2, -2.5, 64), 'sine.inOut', (t, c) => this.followX(t, c));
    // fight 2: wide side tracking from the far pavement - runner, leg, viaduct
    this.shot(8.5, 2.5, cam(1, 2.4, 13, -1.5, 5.5, -5, 62), cam(3, 2.6, 12.5, -0.5, 6, -5, 62), 'none', (t, c) => this.followX(t, c));
    // fight 3: worm's-eye from the road ahead - runner passes, the leg towers behind
    this.shot(11, 2.5, cam(4.5, 0.25, 2.6, -5, 7, -3, 72), cam(3.5, 0.2, 2.8, -5, 8, -3, 74), 'sine.inOut', (t, c) => this.followX(t, c));
    // fight 4: overhead tactical
    this.shot(13.5, 2.0, cam(-4, 30, 10, 0, 0, -3, 50), cam(2, 33, 10, 2, 0, -3, 50), 'none', (t, c) => this.followX(t, c));
    // fight 5: close on the knee (the real one), shaky
    this.shot(15.5, 1.5, cam(1.3, 0.75, 1.1, 0, 0.5, 0, 46, 0, 0.03), cam(1.1, 0.7, 0.9, 0, 0.5, 0, 44, 0, 0.03), 'none', (t, c) => this.followX(t, c));
    // fight 6: final wide as he reaches the line
    this.shot(17, 1.0, cam(12, 2.5, 5, -2, 5, -3, 60), cam(11, 2.2, 5.5, -2, 5.5, -3, 60), 'none', (t, c) => this.followX(t, c));
    // result: the hinge locks straight, lamps go green
    this.shot(FIGHT1, 4.0, cam(-15, 1.6, 8.5, 0, 6.5, -7, 62), cam(-17, 1.4, 9, 0, 7, -7, 58), 'sine.out', (t, c) => {
      const bx = this.bossX(t);
      c.x += bx;
      c.tx += bx;
    });
  }

  runnerX(t: number) {
    if (t < FIGHT0) return 0;
    return (Math.min(t, FIGHT1 + 1) - FIGHT0) * 5.2;
  }
  bossX(t: number) {
    if (t < FIGHT0) return 10;
    return this.runnerX(Math.min(t, FIGHT1)) - 4.5;
  }
  kneeWorld() {
    const v = new THREE.Vector3();
    this.boss.root.updateMatrixWorld(true);
    return this.boss.knee.getWorldPosition(v);
  }
  followX(t: number, c: { x: number; tx: number }) {
    const x = this.runnerX(t);
    c.x += x;
    c.tx += x;
  }

  /** foot target (world, relative to boss x) for the stomp choreography */
  footTarget(t: number) {
    const tucked = new THREE.Vector3(0, 10.5, -6.5);
    const raised = new THREE.Vector3(0, 7.5, -1.8);
    const ground = new THREE.Vector3(0, 0.05, 0.2);
    if (t < 3.3) return { p: tucked, mood: 0 as const, strain: t > 1.9 ? 0.3 : 0.1 };
    if (t < FIGHT0) return { p: tucked.clone().lerp(raised, smooth((t - 3.5) / 1.6)), mood: 1 as const, strain: 0.5 };
    if (t >= FIGHT1) {
      const k = easeOutCubic((t - FIGHT1) / 0.6);
      return { p: raised.clone().lerp(new THREE.Vector3(0, 0.05, -1.2), k), mood: (t > FIGHT1 + 0.5 ? 2 : 1) as 1 | 2, strain: t < FIGHT1 + 1.3 ? 1 : 0.2 };
    }
    const c = ((t - FIGHT0) / 2.4) % 1;
    let p: THREE.Vector3;
    if (c < 0.45) p = ground.clone().lerp(raised, smooth(c / 0.45));
    else if (c < 0.72) p = raised.clone().add(new THREE.Vector3(0, Math.sin(((c - 0.45) / 0.27) * Math.PI) * 1.2, 0.4));
    else if (c < 0.8) p = raised.clone().lerp(ground, easeInCubic((c - 0.72) / 0.08));
    else p = ground.clone();
    const km = this.kmAt(t);
    return { p, mood: 1 as const, strain: 0.3 + clamp((km - 5) / 12) * 0.7 };
  }

  legPose(t: number) {
    const f = this.footTarget(t);
    const bx = this.bossX(t);
    const w = f.p.clone().add(new THREE.Vector3(bx, 0, 0));
    const ik = this.boss.reach(w);
    return { hip: ik.hip, knee: ik.knee, mood: f.mood, strain: f.strain };
  }

  update(t: number, fx: FX) {
    applyLighting({ fog: 0x2e2018, fogNear: 14, fogFar: 110, lightDir: [0.3, -1, 0.5], light: 0x8a8aa8, lightI: 0.55, sky: 0x3a3a50, ground: 0x3a2818, ambient: 0x1c1816 });
    const rx = this.runnerX(t);
    // four nearest sodium lamps light the scene
    const near = [...this.lamps].sort((a, b) => Math.abs(a.x - rx) - Math.abs(b.x - rx)).slice(0, 3);
    near.forEach((p, i) => setPointLight(i, p, 0xffa040, 26, 1.6));
    this.boss.root.position.set(this.bossX(t), 12.6, -9.5);
    const leg = this.legPose(t);
    this.boss.pose(leg.hip, leg.knee, leg.mood, t, leg.strain);
    setPointLight(3, this.kneeWorld(), leg.mood === 2 ? 0x30ff50 : 0xff2010, 20, leg.mood === 0 ? 0.35 : 1.5);

    this.runner.root.position.set(rx, 0, 0);
    this.runner.root.rotation.y = Math.PI / 2;
    if (t < FIGHT0) {
      this.runner.root.rotation.y = Math.PI / 2 - 0.4;
      this.runner.pose({ mode: 'idle', phase: 0, speed: 0, fatigue: 0, limp: 0, breath: t });
    } else {
      const km = this.kmAt(t);
      const s = raceAt(HINGE, km);
      const fatigue = clamp((km - 12) / 9) * 0.7;
      const limp = clamp((km - 8) / 10) * 0.45;
      this.runner.pose({ mode: 'run', phase: stridePhase(rx, 2.5), speed: 0.8 - fatigue * 0.3, fatigue, limp, breath: t });
      void s;
    }
    (this.mist.material as THREE.ShaderMaterial).uniforms.uTime.value = t;

    // stomp impact shake + flash
    if (t >= FIGHT0 && t < FIGHT1) {
      const c = ((t - FIGHT0) / 2.4) % 1;
      if (c > 0.7 && c < 0.8) fx.flash = (0.8 - c) * 1.5 * 0.25;
    }
    fx.tint = [1.05, 0.95, 0.88];
    fx.contrast = 1.1;
    fx.fade = t < 0.3 ? 1 - t / 0.3 : t > 21.6 ? (t - 21.6) / 0.4 : 0;
    fx.red = t >= 15.5 && t < 17 ? 0.25 + 0.2 * Math.sin(t * 20) : 0;
  }

  drawUI(ui: UI, t: number) {
    if (t < FIGHT0) ui.letterbox(1);
    drawBossTitle(ui, {
      name: HINGE.bossName,
      subtitle: HINGE.bossSubtitle,
      info: [`HACKNEY HALF MARATHON  //  ${HINGE.date}`, `STRAVA: "${HINGE.stravaTitle.toUpperCase()}"  //  ${HINGE.distanceKm} KM`],
    }, t - 3.4, 2.1);
    if (t >= FIGHT0 && t < FIGHT1) {
      const km = this.kmAt(t);
      const s = raceAt(HINGE, km);
      const phase = HINGE.phases.find((p) => km >= p.fromKm && km < p.toKm) ?? HINGE.phases[HINGE.phases.length - 1];
      const alerts: string[] = [];
      if (km > 5) alerts.push('! KNEE: LOAD WARNING');
      if (km > 14) alerts.push('! JOINT INTEGRITY LOW');
      drawRunHUD(ui, {
        life: lifeAt(HINGE, km, 0.25),
        pace: s.pace,
        hr: s.hr,
        hrZoneMax: 186,
        clock: s.clock,
        km,
        totalKm: HINGE.distanceKm,
        boss: { name: 'HINGE', hp: 1 - km / HINGE.distanceKm },
        phase: phase.name,
        delta: { label: 'SPLIT', value: `KM ${Math.min(21, Math.floor(km) + 1)}  ${fmtTime(s.pace)}`, color: COL.white },
        alerts,
      }, t);
      drawRadar(ui, 86, 400, 60, this.radarPts, km / HINGE.distanceKm, t, 0.9);
      if (t > 13.5 && t < 15.5) ui.text('TACTICAL VIEW', 480, 150, { scale: 2, color: COL.green, align: 'center' });
    }
    if (t >= FIGHT1) {
      if (t < FIGHT1 + 1.4) {
        ui.letterbox(1);
        ui.text('JOINT HELD', 480, 200, { scale: 6, color: COL.green, align: 'center', alpha: ramp(t, FIGHT1 + 0.4, FIGHT1 + 0.6), outline: '#000' });
      } else {
        drawResults(ui, 'MISSION COMPLETE', [
          ['TIME', HINGE.timeLabel],
          ['AVERAGE PACE', `${fmtTime(HINGE.timeSec / 21.0975)} /KM`],
          ['AVERAGE HR', `${HINGE.hrAvg} BPM`],
          ['MAX HR', `${HINGE.hrMax} BPM`, COL.red],
          ['RELATIVE EFFORT', String(HINGE.relativeEffort)],
        ], t - FIGHT1 - 1.4, `"${HINGE.stravaDescription!.toUpperCase()}"`);
      }
    }
  }
}
