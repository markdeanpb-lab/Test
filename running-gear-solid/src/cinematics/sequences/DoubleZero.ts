import * as THREE from 'three';
import { Sequence, cam } from '../Sequence';
import type { FX } from '../../renderer/Renderer';
import type { UI } from '../../hud/UI';
import { COL } from '../../hud/UI';
import { applyLighting, ps1, setPointLight } from '../../shaders/ps1';
import { block, crane, ground, skyDome, skyline, containerStack } from '../../environments/props';
import { parkSet } from '../../environments/sets';
import { TEX } from '../../renderer/textures';
import { Runner, stridePhase } from '../../runner/Runner';
import { ClockSentinel } from '../../bosses/ClockSentinel';
import { DOUBLE_ZERO_R1, DOUBLE_ZERO_R2, clockAt } from '../../data/activities';
import { LOG_2023, SUB20_CHAIN } from '../../data/career';
import { raceAt, kmTimeline, lifeAt } from '../race';
import { drawBossTitle, drawLogCard, drawRunHUD, drawStamp, drawRadar } from '../../hud/screens';
import { clamp, easeOutCubic, fmtTime, ramp, rng, smooth, window01 } from '../../core/util';
import { Route } from '../../routes/Route';

const R1A = 8, R1B = 14.5; // round 1 fight window
const R2A = 18, R2B = 24.0; // round 2 fight window

export class DoubleZero extends Sequence {
  dock = new THREE.Group();
  park = parkSet(77);
  boss = new ClockSentinel();
  runner = new Runner('racer');
  flags: THREE.Mesh[] = [];
  water!: THREE.Mesh;
  km1 = kmTimeline([[R1A, 0], [R1B, DOUBLE_ZERO_R1.distanceKm]]);
  km2 = kmTimeline([[R2A, 0], [R2B, DOUBLE_ZERO_R2.distanceKm]]);
  dockRoute = new Route(DOUBLE_ZERO_R1.route!, { scale: 0.05 });

  build() {
    this.clearColor.setHex(0xa0a8b4);
    const D = this.dock;
    this.group.add(D, this.park.group);
    D.add(skyDome(0x6a7888, 0xb0b8c4, 0x8890a0));
    this.water = ground(1400, 900, TEX.water(), [70, 45], 0x8aa0b8, 30, { wave: 0.25 });
    this.water.position.set(100, -1.6, -440);
    D.add(this.water);
    const quay = block(700, 1.6, 40, TEX.concrete(), 0x9a9690, 4);
    quay.position.set(100, -1.6, 20);
    D.add(quay);
    const edge = block(700, 0.3, 0.6, null, 0xe8d040);
    edge.position.set(100, 0, 0.3);
    D.add(edge);
    for (let x = -120; x < 320; x += 9) {
      const b = block(0.5, 0.7, 0.5, null, 0x1a1a1a);
      b.position.set(x, 0, 1.2);
      D.add(b);
    }
    // the long exhibition hall across the quay
    const hall = block(320, 18, 34, TEX.windows(), 0xb8bcc4, 6);
    hall.position.set(110, 0, 58);
    D.add(hall);
    // historic dockside cranes
    for (let x = -80; x < 300; x += 46) {
      const c = crane(22, 18, 0x2a2e34);
      c.position.set(x, 0, 12);
      c.rotation.y = Math.PI / 2 + (x % 3) * 0.2;
      c.scale.setScalar(0.8);
      D.add(c);
    }
    const cs = containerStack(4, 3, 5, 3);
    cs.position.set(-40, 0, 26);
    D.add(cs);
    // city across the water
    const sky = skyline(24, 260, 80, 13, 30, 140, TEX.windows());
    sky.position.set(100, -1.6, -120);
    D.add(sky);
    // flags whipping in the wind
    for (let x = -30; x < 200; x += 16) {
      const pole = block(0.12, 7, 0.12, null, 0xd0d0d0);
      pole.position.set(x, 0, 4.5);
      D.add(pole);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.3, 4, 1), ps1({ color: x % 32 === 0 ? 0xd02020 : 0x2040c0, side: THREE.DoubleSide }));
      f.geometry.translate(1.2, 0, 0);
      f.position.set(x, 6.2, 4.5);
      D.add(f);
      this.flags.push(f);
    }
    this.group.add(this.boss.root, this.runner.root);

    // ---------------- camera ----------------
    this.shot(0, 3, cam(0, 30, 30, 0, 0, 0, 50)); // under briefing UI
    // establishing: over the water toward the cranes
    this.shot(3, 1.6, cam(-40, 6, -40, 40, 6, 20, 48), cam(-34, 7, -44, 44, 7, 20, 48), 'none');
    // detail: a flag cracking in the wind
    this.shot(4.6, 1.0, cam(-27.5, 6.7, 8.8, -31.2, 6.2, 4.5, 30), cam(-27.8, 6.6, 8.3, -31.2, 6.2, 4.5, 28), 'none');
    // boss rises from the dock
    this.shot(5.6, 2.4, cam(-12, 1.2, 5, 10, 14, -26, 58), cam(-14, 0.9, 6, 10, 18, -26, 62), 'power2.out');
    // R1: chase along the quay, boss ahead in the water
    this.shot(R1A, 2.2, cam(-6, 2.2, 3.4, 12, 3, -4, 58), cam(-5, 2.0, 3.0, 12, 3.5, -4, 60), 'sine.inOut', (t, c) => this.follow1(t, c));
    // side tracking, runner leaning into the wind
    this.shot(R1A + 2.2, 2.0, cam(0.5, 1.3, 7, 0.5, 1.3, 0, 44), cam(1.5, 1.3, 7, 1.5, 1.4, 0, 44), 'none', (t, c) => this.follow1(t, c));
    // front, low: the clock looming behind
    this.shot(R1A + 4.2, 2.3, cam(7, 0.6, 1.5, -4, 8, -8, 64), cam(5.5, 0.5, 1.8, -4, 9, -8, 66), 'sine.inOut', (t, c) => this.follow1(t, c));
    // freeze on the clock
    this.shot(R1B, 3.5, cam(0, 12, 12, 0, 18.5, -26, 44), cam(0, 13, 10, 0, 19, -26, 38), 'power2.out', (t, c) => {
      const bx = this.bossX1(R1B);
      c.x += bx;
      c.tx += bx;
    });
    this.shot(17.5, 0.5, cam(0, 12, 10, 0, 19, -26, 38), null, 'none', (t, c) => {
      const bx = this.bossX1(R1B);
      c.x += bx;
      c.tx += bx;
    });
    // R2: Finsbury Park, the boss waits on the hill
    this.shot(R2A, 2.0, cam(0, 1.4, -4, 0, 4, 12, 60), cam(0, 1.6, -3.4, 0, 5, 12, 62), 'sine.inOut', (t, c) => this.follow2(t, c));
    this.shot(R2A + 2.0, 2.2, cam(6, 1.0, 2, 0, 1.4, 0, 46), cam(5, 1.2, 3, 0, 1.4, 0, 46), 'none', (t, c) => this.follow2(t, c));
    this.shot(R2A + 4.2, 2.3, cam(-8, 3, -6, 0, 8, -60, 52), cam(-6, 2.5, -5, 0, 9, -60, 54), 'sine.inOut', (t, c) => this.follow2(t, c, true));
    // shatter
    this.shot(R2B, 3.0, cam(18, 8, -30, 0, 18, -60, 50), cam(22, 9, -24, 0, 17, -60, 54), 'power2.out');
  }

  runnerX1(t: number) {
    return (clamp(t, R1A, R1B + 0.6) - R1A) * 4.3;
  }
  bossX1(t: number) {
    return this.runnerX1(t) + 18;
  }
  follow1(t: number, c: { x: number; tx: number }) {
    const x = this.runnerX1(t);
    c.x += x;
    c.tx += x;
  }
  loopU2(t: number) {
    return (0.58 + (clamp(t, R2A, R2B) - R2A) * 0.006) % 1;
  }
  follow2(t: number, c: { x: number; y: number; z: number; tx: number; ty: number; tz: number }, absTarget = false) {
    const u = this.loopU2(t);
    const p = this.park.curve.getPointAt(u);
    const d = this.park.curve.getTangentAt(u);
    const yaw = Math.atan2(d.x, d.z);
    const rot = (x: number, z: number) => [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];
    const [cx, cz] = rot(c.x, c.z);
    c.x = p.x + cx;
    c.z = p.z + cz;
    c.y += p.y;
    if (!absTarget) {
      const [tx, tz] = rot(c.tx, c.tz);
      c.tx = p.x + tx;
      c.tz = p.z + tz;
      c.ty += p.y;
    }
  }

  /** clock shown on the boss / HUD: GPS clock scaled so the finish reads the official time */
  clock1(km: number) {
    const e = DOUBLE_ZERO_R1;
    return clockAt(e.splits, km) * (e.timeSec / clockAt(e.splits, e.distanceKm));
  }
  clock2(km: number) {
    const e = DOUBLE_ZERO_R2;
    return clockAt(e.splits, km) * (e.timeSec / clockAt(e.splits, e.distanceKm));
  }

  update(t: number, fx: FX) {
    const inPark = t >= 17.5;
    this.dock.visible = !inPark;
    this.park.group.visible = inPark;
    if (!inPark) {
      applyLighting({ fog: 0xa0a8b4, fogNear: 30, fogFar: 240, lightDir: [-0.2, -1, 0.6], light: 0xe8ecf0, lightI: 0.7, sky: 0x8a98a8, ground: 0x505860, ambient: 0x141618 });
      this.clearColor.setHex(0xa0a8b4);
    } else {
      applyLighting({ fog: 0xb8c0c8, fogNear: 40, fogFar: 260, lightDir: [-0.6, -0.8, -0.3], light: 0xfff0d8, lightI: 0.85, sky: 0x90a8c0, ground: 0x506040, ambient: 0x141414 });
      this.clearColor.setHex(0xb8c0c8);
    }
    // water & flags
    (this.water.material as THREE.ShaderMaterial).uniforms.uUvOffset.value.set(-t * 0.02, t * 0.01);
    this.flags.forEach((f, i) => {
      f.rotation.y = Math.PI + Math.sin(t * 9 + i) * 0.35;
      f.scale.y = 1 + Math.sin(t * 13 + i * 2) * 0.12;
    });

    // boss placement + clock
    let shatter = 0;
    let wind = 0;
    if (!inPark) {
      const rise = t < 5.6 ? 0 : easeOutCubic((t - 5.8) / 1.8);
      this.boss.root.position.set(t < R1A ? 18 : this.bossX1(t), -26 + rise * 26, -26);
      this.boss.root.rotation.y = -0.25;
      this.boss.root.scale.setScalar(1);
      wind = t < 3 ? 0 : t < R1A ? 0.6 : t < R1B ? 1 : 0.4;
      if (t < R1A) this.boss.show(t > 6.4 ? '20:00' : '    ', true);
      else if (t < R1B) {
        const km = this.km1(t);
        this.boss.show(fmtTime(Math.min(this.clock1(km), 1200)), Math.floor(t * 2) % 2 === 0);
      } else this.boss.show(Math.floor(t * 4) % 2 === 0 ? '20:00' : '    ', true);
    } else {
      this.boss.root.position.set(0, 10.5, -60);
      this.boss.root.rotation.y = 0.3;
      this.boss.root.scale.setScalar(0.9);
      wind = 0.2;
      const km = this.km2(t);
      if (t < R2A) this.boss.show('20:07', true);
      else this.boss.show(fmtTime(this.clock2(km)), true);
      shatter = t > R2B + 0.3 ? easeOutCubic(clamp((t - R2B - 0.3) / 1.6)) : 0;
    }
    this.boss.update(t, wind, shatter);
    setPointLight(0, this.boss.head.getWorldPosition(new THREE.Vector3()), 0xff3a20, 30, 0.9);

    // runner
    if (!inPark) {
      const x = this.runnerX1(t);
      this.runner.root.position.set(x, 0, 3.2);
      this.runner.root.rotation.y = Math.PI / 2;
      const km = this.km1(t);
      if (t < R1A) this.runner.pose({ mode: 'idle', phase: 0, speed: 0, fatigue: 0, limp: 0, breath: t });
      else if (t < R1B + 0.6) this.runner.pose({ mode: 'run', phase: stridePhase(x, 2.9), speed: 1.1, fatigue: 0.15 + clamp((km - 2) / 3) * 0.45, limp: 0, breath: t });
      else this.runner.pose({ mode: 'handsOnKnees', phase: 0, speed: 0, fatigue: 1, limp: 0, breath: t });
    } else {
      const u = this.loopU2(t);
      const p = this.park.curve.getPointAt(u);
      const d = this.park.curve.getTangentAt(u);
      this.runner.root.position.copy(p);
      this.runner.root.rotation.y = Math.atan2(d.x, d.z);
      if (t < R2B + 0.3) this.runner.pose({ mode: 'run', phase: stridePhase(t * 5.2, 2.9), speed: 1.2, fatigue: 0.15, limp: 0, breath: t });
      else this.runner.pose({ mode: 'victory', phase: 0, speed: 0, fatigue: 0, limp: 0, breath: t });
    }
    fx.sceneMix = t < 3 ? 0 : 1;
    fx.fade = t >= 3 && t < 3.3 ? 1 - (t - 3) / 0.3 : t > 17.2 && t < 17.5 ? (t - 17.2) / 0.3 : t > 17.5 && t < 18 ? 1 - (t - 17.5) / 0.5 : 0;
    if (t > R2B + 0.3 && t < R2B + 0.6) fx.flash = 1 - (t - R2B - 0.3) / 0.3;
    if (t >= R2B) fx.fade = t > 26.6 ? (t - 26.6) / 0.4 : 0;
  }

  drawUI(ui: UI, t: number) {
    if (t < 3) {
      ui.rect(0, 0, ui.W, ui.H, '#020a04');
      ui.text('OBJECTIVE', 480, 110, { scale: 2, color: COL.amber, align: 'center' });
      ui.text('SUB-20 5K', 480, 132, { scale: 6, align: 'center' });
      SUB20_CHAIN.slice(0, 7).forEach((c, i) => {
        const a = ramp(t, 0.4 + i * 0.25, 0.6 + i * 0.25);
        ui.text(c.date, 380, 220 + i * 26, { scale: 2, color: COL.grey, alpha: a });
        ui.text(c.time, 600, 220 + i * 26, { scale: 2, color: c.time.startsWith('20') ? COL.amber : COL.white, alpha: a, align: 'right' });
      });
      ui.text('STATUS: 20:XX. EVERY TIME.', 480, 420, { scale: 2, color: COL.red, align: 'center', alpha: ramp(t, 2.2, 2.4) });
      return;
    }
    if (t < R1A) ui.letterbox(1);
    drawBossTitle(ui, {
      name: 'DOUBLE ZERO',
      subtitle: DOUBLE_ZERO_R1.bossSubtitle,
      info: [`ROYAL VICTORIA DOCK PARKRUN  //  ${DOUBLE_ZERO_R1.date}`, `STRAVA: "${DOUBLE_ZERO_R1.stravaTitle.toUpperCase()}"`],
    }, t - 5.9, 2.1);
    if (t >= R1A && t < R1B) {
      const e = DOUBLE_ZERO_R1;
      const km = this.km1(t);
      const s = raceAt(e, km);
      drawRunHUD(ui, {
        life: lifeAt(e, km),
        pace: s.pace,
        hr: s.hr,
        clock: this.clock1(km),
        km,
        totalKm: e.distanceKm,
        boss: { name: 'DOUBLE ZERO', hp: 1 - km / e.distanceKm },
        phase: km < 2 ? 'OPENING' : 'HEADWIND',
        delta: { label: 'SUB-20 NEEDS', value: '4:00 /KM', color: s.pace <= 240 ? COL.green : COL.red },
        alerts: km > 2 ? ['! HEADWIND'] : [],
      }, t);
      drawRadar(ui, 86, 400, 60, this.dockRoute.radar, km / e.distanceKm, t, 0.9);
    }
    if (t >= R1B && t < 17.5) {
      ui.letterbox(1);
      drawStamp(ui, '20:00', t - R1B - 0.2, 3.1, COL.red, 170, 10, 'NOT UNDER. EXACTLY.');
      const sub = (who: string, s: string, a: number, b: number, color = COL.green) => {
        if (t < a || t > b) return;
        ui.text(who, 480, 420, { scale: 2, color, align: 'center' });
        ui.text(s.slice(0, Math.floor((t - a) * 40)), 480, 442, { scale: 2, align: 'center' });
      };
      sub('MAJOR TEMPO', 'TWENTY MINUTES. THE CLOCK IS MOCKING YOU.', 15.3, 16.4);
      sub('STRIDE', '"AFFECTED MASSIVELY BY THE WIND."', 16.45, 17.5, COL.cyan);
    }
    if (t >= 17.5 && t < R2A) {
      ui.rect(0, 0, ui.W, ui.H, '#000', 0.6);
      ui.text('11.03.2023  //  FINSBURY PARK', 480, 240, { scale: 2, color: COL.grey, align: 'center' });
      ui.text('20:07', 480, 270, { scale: 5, color: COL.amber, align: 'center' });
    }
    if (t >= R2A && t < R2B) {
      const e = DOUBLE_ZERO_R2;
      const km = this.km2(t);
      const s = raceAt(e, km);
      const clk = this.clock2(km);
      drawRunHUD(ui, {
        life: lifeAt(e, km) * 0.95 + 0.05,
        pace: s.pace,
        hr: s.hr,
        clock: clk,
        km,
        totalKm: e.distanceKm,
        boss: { name: 'DOUBLE ZERO', hp: 1 - km / e.distanceKm },
        phase: 'REMATCH',
        delta: { label: 'PROJECTED', value: km < 1 ? '--:--' : fmtTime((clk / km) * 4.98), color: COL.green },
      }, t);
      if (t < R2A + 1.4) ui.text('18.03.2023  //  FINSBURY PARK', 480, 150, { scale: 2, align: 'center', alpha: window01(t, R2A, R2A + 1.4, 0.2) });
    }
    if (t >= R2B && t < R2B + 2.0) {
      drawStamp(ui, '19:25', t - R2B - 0.3, 1.7, COL.green, 200, 10, 'SUB-20 ACHIEVED');
    }
    if (t >= R2B + 1.6) drawLogCard(ui, LOG_2023[0], t - R2B - 1.6, 1.5, 40, 330, 520);
    void smooth;
    void rng;
  }
}
