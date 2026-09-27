import * as THREE from 'three';
import { Sequence, cam } from '../Sequence';
import type { FX } from '../../renderer/Renderer';
import type { UI } from '../../hud/UI';
import { COL } from '../../hud/UI';
import { applyLighting, setPointLight } from '../../shaders/ps1';
import { ground, skyDome, lampPost } from '../../environments/props';
import { TEX } from '../../renderer/textures';
import { Runner } from '../../runner/Runner';
import { Wall } from '../../bosses/Wall';
import { CAREER } from '../../data/career';
import { drawCodec, drawDataPanel, type CodecSpec } from '../../hud/screens';
import { blink, clamp, ramp } from '../../core/util';

// NEXT OBJECTIVE. The sub-3 marathon is unfinished business; no race is on
// record yet. Last contact: the most recent activity in the history.

const SCENE = 5.6, OBJ = 7.0, END = 11.2;

export class Next extends Sequence {
  wall = new Wall();
  runner = new Runner('marathon');
  codec: CodecSpec = {
    caller: 'tempo',
    open: 0.5,
    close: 5.3,
    lines: [
      { who: 'tempo', text: 'STRIDE. THE WALL IS STILL STANDING.', at: 0.8 },
      { who: 'stride', text: 'SO AM I.', at: 3.2 },
    ],
  };

  build() {
    this.clearColor.setHex(0x0c0e14);
    this.group.add(skyDome(0x05060a, 0x1c2030, 0x0c0e14));
    const g = ground(400, 400, TEX.asphalt(), [60, 60], 0x505058, 10);
    this.group.add(g);
    const road = ground(9, 400, TEX.road(), [1, 40], 0xa0a0a8, 4);
    road.position.y = 0.02;
    this.group.add(road);
    this.wall.root.position.set(0, 0, 30);
    this.wall.root.rotation.y = Math.PI;
    this.group.add(this.wall.root);
    for (const x of [-6, 6]) {
      const l = lampPost(6, 0xffc080, 1.4, true);
      l.position.set(x, 0, 22);
      l.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
      this.group.add(l);
    }
    this.runner.root.position.set(0, 0, 0);
    this.group.add(this.runner.root);
    this.shot(0, SCENE, cam(0, 3, -10, 0, 3, 30, 50));
    this.shotKeys(SCENE, cam(1.6, 0.9, -3.2, 0, 3.5, 30, 50), [{ dur: 13 - SCENE, to: { x: 0.4, y: 1.4, z: -9, ty: 5, fov: 56 }, ease: 'sine.inOut' }]);
  }

  update(t: number, fx: FX) {
    applyLighting({ fog: 0x0c0e14, fogNear: 12, fogFar: 70, lightDir: [0.3, -1, 0.6], light: 0x6a78a0, lightI: 0.5, sky: 0x283048, ground: 0x0a0a0a, ambient: 0x0c0c12 });
    setPointLight(0, new THREE.Vector3(-6, 6, 22), 0xffc080, 20, 1.3);
    setPointLight(1, new THREE.Vector3(6, 6, 22), 0xffc080, 20, 1.3);
    this.wall.update(t, 0, 1, 0);
    this.runner.pose({ mode: 'idle', phase: 0, speed: 0, fatigue: 0, limp: 0, breath: t });
    fx.sceneMix = t < SCENE ? 0 : 1;
    fx.static = t < 0.5 ? 0.5 : t >= SCENE - 0.2 && t < SCENE + 0.1 ? 0.6 : 0;
    fx.scan = t < SCENE ? 0.12 : 0;
    fx.vignette = 0.6;
    fx.fade = t > 12.4 ? (t - 12.4) / 0.6 : 0;
  }

  drawUI(ui: UI, t: number) {
    if (t < SCENE) {
      drawCodec(ui, this.codec, t);
      return;
    }
    ui.letterbox(1);
    if (t >= OBJ && t < END + 0.4) {
      drawDataPanel(ui, 250, 120, 'NEXT OBJECTIVE', [
        ['PRIMARY', 'SUB 3:00:00 MARATHON'],
        ['BEST SO FAR', '3:20:03'],
        ['STATUS', 'UNSCHEDULED'],
        ['SECONDARY', 'SUB 18:00 5K (PB 18:19)'],
        ['LAST CONTACT', `${CAREER.lastRun.date} - ${CAREER.lastRun.km} KM`],
      ], t - OBJ, { w: 460, color: COL.red });
    }
    if (t >= END) {
      const a = clamp((t - END) / 0.4);
      ui.text('TO BE CONTINUED', 480, 430, { scale: 5, color: COL.white, align: 'center', alpha: a * (blink(t, 0.5) || t > END + 0.8 ? 1 : 0.5), shadow: COL.redDim });
    }
    ui.text('RUNNING GEAR SOLID', 936, 14, { scale: 1, color: COL.dim, align: 'right', alpha: ramp(t, SCENE + 0.3, SCENE + 0.8) });
  }
}
