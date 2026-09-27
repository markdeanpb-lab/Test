import * as THREE from 'three';
import { cam } from '../Sequence';
import { RaceSequence } from '../RaceSequence';
import type { FX } from '../../renderer/Renderer';
import type { UI } from '../../hud/UI';
import { COL } from '../../hud/UI';
import { applyLighting, ps1 } from '../../shaders/ps1';
import { corridor } from '../../environments/sets';
import { skyDome, ground, block } from '../../environments/props';
import { TEX, signTexture } from '../../renderer/textures';
import { Runner } from '../../runner/Runner';
import { Wall } from '../../bosses/Wall';
import { MANCHESTER as M, clockAt } from '../../data/activities';
import { raceAt, kmTimeline, lifeAt } from '../race';
import { drawBossTitle, drawResults, drawRunHUD, drawRadar, drawCaption } from '../../hud/screens';
import { blink, clamp, fmtTime, lerp, ramp, smooth, window01 } from '../../core/util';

// FINAL ENCOUNTER: THE WALL - Manchester Marathon, 19.04.2026, 09:10.
// Objective sub 3:00:00. Projected finish = elapsed + remaining distance at the
// average pace so far (watch splits): it first goes over 3:00 at km 28
// (3:00:31). Finish 3:20:03, a 35:08 marathon PB. "The Wall Won ... But now I know."

const TITLE = 3.6, MACHINE = 6.8, FRICTION = 14.5, WALL = 20, RISE = 20.2, PRESS = 23, SURVIVAL = 30.5, FIN = 33, STOP = 34.6, RESULTS = 35.6, QUOTE = 39.4;
const SUB3 = 3 * 3600;
const MARATHON = 42.195;

/** projected finish from the average pace so far */
function projection(km: number) {
  const k = Math.max(km, 0.5);
  const c = clockAt(M.splits, k);
  return c + (MARATHON - k) * (c / k);
}

export class WallSeq extends RaceSequence {
  enc = M;
  runner = new Runner('marathon');
  wall = new Wall();
  kmAt = kmTimeline([[MACHINE, 0.4], [FRICTION, 21.1], [WALL, 27], [SURVIVAL, 35], [STOP, M.distanceKm]]);
  sFinish = 0;

  build() {
    this.initRoute(2000, 0.012);
    this.clearColor.setHex(0xb0b4b8);
    this.sFinish = this.route.total - 2;
    const kmOf = (s: number) => (s / this.route.total) * this.enc.distanceKm;
    this.anchor(0, 0.02, 0);
    this.anchor(2.2, 0.02, 2.6);
    this.anchor(MACHINE, 3, 4.6);
    this.anchor(9.5, 10, 4.6);
    this.anchor(12, 17, 4.6);
    this.anchor(FRICTION, 22, 4.3);
    this.anchor(17.2, 25.5, 4.1);
    this.anchor(WALL, 27.3, 3.5);
    this.anchor(PRESS, 29.5, 3.0);
    this.anchor(26.5, 32.5, 2.9);
    this.anchor(SURVIVAL, 36, 3.0);
    this.anchor(FIN, kmOf(this.sFinish - 3.0 * (STOP - FIN)), 3.0);
    this.anchor(STOP, kmOf(this.sFinish), 0);

    this.group.add(skyDome(0x8898a8, 0xc8ccd0, 0xa0a4a8));
    const gr = ground(12000, 12000, TEX.asphalt(), [1200, 1200], 0x7a7a7c, 40);
    gr.position.y = -0.3;
    this.group.add(gr);
    this.group.add(corridor(this.route, { style: 'city', centers: this.anchorCentres(110), crowd: true, seed: 1904, radius: 170 }));
    this.group.add(this.runner.root, this.wall.root);

    // start and finish gantries
    for (const [s, label] of [[this.sAtKm(0.02) + 6, 'START'], [this.sFinish, 'FINISH']] as const) {
      const f = this.frameAt(s);
      const g = new THREE.Group();
      for (const sx of [-1, 1]) {
        const post = block(0.9, 7, 0.9, TEX.metal(), 0x2a2a60, 2);
        post.position.x = sx * 6.2;
        g.add(post);
      }
      const bar = block(13.4, 1.6, 0.8, null, 0x1a1a50);
      bar.position.y = 6.2;
      g.add(bar);
      for (const back of [false, true]) {
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.3), ps1({ map: signTexture(label, '#ffffff', '#1a1a60', 64, 9, 1), unlit: true }));
        sign.position.set(0, 7.0, back ? -0.42 : 0.42);
        if (back) sign.rotation.y = Math.PI;
        g.add(sign);
      }
      g.position.copy(f.pos);
      g.rotation.y = f.yaw;
      this.group.add(g);
    }

    // --- shots
    this.shot(0, TITLE, cam(-4, 2.4, 9, 0, 1.6, 0, 50), cam(-3.4, 2.2, 7.5, 0, 1.6, 0, 46), 'sine.inOut', (t, c) => this.followRunner(t, c));
    this.shot(TITLE, MACHINE - TITLE, cam(0, 1.2, 14, 0, 3, -60, 50), cam(0, 1.3, 12, 0, 3, -60, 50), 'none', (t, c) => this.followRunner(t, c));
    // THE MACHINE
    this.shot(MACHINE, 9.5 - MACHINE, cam(5.2, 1.3, 0.5, 0, 1.2, 1.2, 42), cam(5.2, 1.3, 1.5, 0, 1.2, 2.2, 42), 'none', (t, c) => this.followRunner(t, c));
    this.shot(9.5, 12 - 9.5, cam(0.9, 0.45, 4.2, 0, 1.2, 0, 46), cam(0.7, 0.5, 3.6, 0, 1.2, 0, 44), 'none', (t, c) => this.followRunner(t, c));
    this.shot(12, FRICTION - 12, cam(-6, 42, -8, 0, 0, 8, 50), cam(-4, 46, -6, 0, 0, 10, 50), 'none', (t, c) => this.followRunner(t, c));
    // FRICTION: long lens down the road, the ghost at the far end
    this.shot(FRICTION, 17.2 - FRICTION, cam(0.6, 1.7, -5, 0, 3, 120, 30), cam(0.5, 1.7, -4.5, 0, 3.5, 120, 28), 'none', (t, c) => this.followRunner(t, c));
    this.shot(17.2, WALL - 17.2, cam(2.2, 1.6, 0.9, 0, 1.55, 0.3, 36), cam(1.8, 1.6, 0.6, 0, 1.55, 0.3, 32), 'none', (t, c) => this.followRunner(t, c));
    // THE WALL rises, then presses
    this.shot(WALL, PRESS - WALL, cam(-1.6, 0.6, -6, 0, 5, 30, 62, 0, 0.02), cam(-1.2, 0.5, -4.5, 0, 7, 30, 66, 0, 0.03), 'none', (t, c) => this.followRunner(t, c));
    this.shot(PRESS, 26.5 - PRESS, cam(4.2, 1.3, -3.4, -0.5, 2.6, 2.2, 50, 0, 0.012), cam(3.6, 1.2, -2.8, -0.5, 3.0, 2.2, 52, 0, 0.012), 'none', (t, c) => this.followRunner(t, c));
    this.shot(26.5, SURVIVAL - 26.5, cam(-9, 20, -16, 0, 3, 4, 50), cam(-7, 17, -13, 0, 3, 4, 52), 'sine.inOut', (t, c) => this.followRunner(t, c));
    // SURVIVAL
    this.shot(SURVIVAL, FIN - SURVIVAL, cam(-1.2, 1.3, -4.2, 0, 1.4, 4, 50), cam(-1.0, 1.3, -3.8, 0, 1.4, 4, 50), 'none', (t, c) => this.followRunner(t, c));
    const ff = this.frameAt(this.sFinish);
    this.shot(FIN, 42 - FIN, cam(-6, 1.8, -12, 0, 2.2, 1, 46), cam(-5, 2.0, -10, 0, 3.0, 1, 44), 'sine.out', (t, c) => this.followFrame(ff, c));
  }

  /** distance (m) from runner to the wall, or null when there is no wall */
  gap(t: number): number | null {
    if (t < FRICTION) return null;
    if (t < WALL) return lerp(110, 70, (t - FRICTION) / (WALL - FRICTION));
    if (t < PRESS) return 36;
    return lerp(36, 1.4, smooth(ramp(t, PRESS - 0.15, PRESS + 0.5)));
  }

  update(t: number, fx: FX) {
    const km = t < MACHINE ? 0 : this.kmAt(t);
    const hit = clamp((km - 27) / 8);
    const fog = new THREE.Color(0xb0b4b8).lerp(new THREE.Color(0x807a74), hit);
    applyLighting({ fog: fog.getHex(), fogNear: 20, fogFar: lerp(320, 170, hit), lightDir: [-0.4, -1, 0.35], light: 0xf0f0e8, lightI: 0.95, sky: 0x9aaabb, ground: 0x505050, ambient: 0x141414 });
    this.clearColor.copy(fog);

    const stopped = t >= STOP + 0.2;
    const fatigue = km < 21 ? 0.05 : km < 27 ? lerp(0.1, 0.45, (km - 21) / 6) : lerp(0.7, 1, clamp((km - 27) / 15));
    const mode = t < 2.2 ? 'idle' : stopped ? 'handsOnKnees' : 'run';
    this.placeRunner(this.runner, t, mode, km > 27 ? 0.65 : 1, fatigue, km > 0 && km < 42 ? 0.12 : 0);

    // the wall
    const g = this.gap(t);
    this.wall.root.visible = g !== null;
    if (g !== null) {
      const s = Math.min(this.route.total - 1, (stopped ? this.sFinish : this.runnerS(t)) + g + 0.8);
      const f = this.frameAt(s);
      this.wall.root.position.copy(f.pos);
      this.wall.root.rotation.y = f.yaw;
      const ghost = t < RISE ? 1 : 0;
      const rise = t < RISE ? 0 : clamp((t - RISE) / 2.4);
      const shake = t >= RISE ? (t < PRESS + 0.6 ? 1 : 0.35) : 0;
      this.wall.update(t, ghost, rise, shake);
    }
    // shake from the rise and each heavy stride against it
    if (t >= RISE && t < RISE + 2.6) fx.glitch = 0.1;
    fx.sat = lerp(1.0, 0.55, hit);
    fx.contrast = 1 + 0.15 * hit;
    fx.heat = t >= FRICTION && t < WALL ? 0.35 : 0;
    fx.vignette = 0.35 + 0.4 * hit;
    fx.flash = t >= RISE && t < RISE + 0.15 ? 0.6 : 0;
    fx.flashColor = [1, 0.9, 0.8];
    if (t >= STOP && t < STOP + 0.2) fx.flash = 0.8;
    fx.sceneMix = t >= QUOTE ? clamp(1 - (t - QUOTE) / 0.4) : 1;
  }

  drawUI(ui: UI, t: number) {
    if (t < TITLE) {
      ui.letterbox(1);
      ui.text('19.04.2026 // 09:10 // MANCHESTER MARATHON', 28, 14, { scale: 2, color: COL.grey, alpha: window01(t, 0.2, TITLE) });
      drawCaption(ui, ['MAJOR TEMPO: SUB THREE. 4:16 A KILOMETRE. FOR 42 KILOMETRES.'], t - 0.9, TITLE - 1.0);
      return;
    }
    if (t < MACHINE) {
      ui.letterbox(1);
      drawBossTitle(ui, { name: 'THE WALL', label: 'FINAL ENCOUNTER', subtitle: M.bossSubtitle, info: ['NAMED BY THE ATHLETE'] }, t - TITLE - 0.2, MACHINE - TITLE - 0.2);
      return;
    }
    if (t < STOP + 0.3) {
      const km = this.kmAt(t);
      const s = raceAt(M, km);
      const proj = projection(km);
      const failing = proj > SUB3;
      const phase = km < 21.1 ? 'THE MACHINE' : km < 27 ? 'FRICTION' : km < 35 ? 'THE WALL' : 'SURVIVAL';
      const alerts: string[] = [];
      if (blink(t, 0.9) || km > 27) alerts.push('! ACHILLES');
      if (phase === 'FRICTION') alerts.push('! PACE DRIFT');
      if (failing) alerts.push('! SUB 3 PROJECTION LOST');
      if (phase === 'SURVIVAL') alerts.push('KEEP MOVING');
      const extra = km < 27 ? 0 : 0.3 + (km - 27) * 0.02;
      drawRunHUD(ui, {
        life: Math.max(0.04, lifeAt(M, km, extra)),
        pace: s.pace,
        hr: s.hr,
        clock: s.clock,
        km,
        totalKm: M.distanceKm,
        boss: { name: 'THE WALL', hp: 1 - km / M.distanceKm },
        phase,
        delta: { label: 'PROJECTED FINISH', value: fmtTime(proj), color: failing ? COL.red : proj > SUB3 - 90 ? COL.amber : COL.green },
        alerts,
      }, t);
      if (t < 30.5 || t >= SURVIVAL) drawRadar(ui, 86, 400, 60, this.mapRoute.radar, km / M.distanceKm, t, 0.9);
      if (t > FRICTION - 1 && t < FRICTION) ui.text('HALFWAY 1:29:39', 480, 150, { scale: 3, color: COL.green, align: 'center', outline: '#000' });
      if (km >= 28 && t < PRESS + 1.2) {
        const a = clamp((km - 28) * 3);
        ui.rect(250, 150, 460, 58, '#200000', 0.75 * a);
        ui.text('SUB 3:00:00 PROJECTION', 480, 158, { scale: 2, color: COL.red, align: 'center', alpha: a });
        ui.text('3:00:31 AT KM 28', 480, 180, { scale: 3, color: COL.white, align: 'center', alpha: a });
      }
      return;
    }
    if (t < RESULTS) {
      ui.letterbox(1);
      return;
    }
    if (t < QUOTE) {
      drawResults(ui, 'MISSION REPORT', [
        ['TIME', `${M.timeLabel}  NEW RECORD`, COL.green],
        ['MARATHON PB', '-35:08'],
        ['HALFWAY', '1:29:39'],
        ['SECOND HALF', '1:50:24', COL.red],
        ['OBJECTIVE SUB 3:00:00', 'FAILED', COL.red],
      ], t - RESULTS);
      return;
    }
    // the athlete's own words
    const q1 = '"THE WALL WON."';
    const q2 = '"BUT NOW I KNOW."';
    const c1 = Math.floor((t - QUOTE - 0.3) * 18);
    const c2 = Math.floor((t - QUOTE - 1.6) * 18);
    ui.text(q1.slice(0, Math.max(0, c1)), 480, 220, { scale: 4, color: COL.red, align: 'center' });
    ui.text(q2.slice(0, Math.max(0, c2)), 480, 280, { scale: 4, color: COL.white, align: 'center' });
    ui.text('STRAVA // 19.04.2026', 480, 350, { scale: 1, color: COL.dim, align: 'center', alpha: ramp(t, QUOTE + 2.2, QUOTE + 2.5) });
  }
}
