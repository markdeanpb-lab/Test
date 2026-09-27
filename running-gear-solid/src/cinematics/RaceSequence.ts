import * as THREE from 'three';
import { Sequence, type Cam } from './Sequence';
import { Route } from '../routes/Route';
import type { BossEncounter } from '../data/activities';
import { Runner, stridePhase, type Mode } from '../runner/Runner';

/**
 * Base for fights that happen on a real course. The GPS route is rebuilt at
 * 1:1 scale; every shot is "anchored" at a race kilometre so the runner is
 * standing on the actual piece of road that kilometre was run on. Between
 * cuts the runner moves at a believable screen speed.
 */
export abstract class RaceSequence extends Sequence {
  abstract enc: BossEncounter;
  route!: Route;
  mapRoute!: Route;
  anchors: { t0: number; km: number; speed: number }[] = [];
  private tmpP = new THREE.Vector3();
  private tmpD = new THREE.Vector3();

  initRoute(samples = 1200, mapScale = 0.012) {
    this.route = new Route(this.enc.route!, { scale: 1, altScale: 1, samples });
    this.mapRoute = new Route(this.enc.route!, { scale: mapScale, altScale: 0, samples: 400 });
  }

  anchor(t0: number, km: number, speed = 5) {
    this.anchors.push({ t0, km, speed });
    this.anchors.sort((a, b) => a.t0 - b.t0);
  }

  /** arc length (m) of the runner along the 1:1 route at local time t */
  runnerS(t: number) {
    let a = this.anchors[0];
    for (const x of this.anchors) if (t >= x.t0) a = x;
    const s0 = (a.km / this.enc.distanceKm) * this.route.total;
    return Math.min(this.route.total - 1, s0 + a.speed * Math.max(0, t - a.t0));
  }

  /** arc-length positions the cameras will visit (for set dressing) */
  /** arc length at race kilometre km */
  sAtKm(km: number) {
    return (km / this.enc.distanceKm) * this.route.total;
  }

  anchorCentres(span = 60) {
    return this.anchors.map((a) => (a.km / this.enc.distanceKm) * this.route.total + span / 2);
  }

  frameAt(s: number) {
    const { pos, dir } = this.route.at(s / this.route.total, this.tmpP, this.tmpD);
    const yaw = Math.atan2(dir.x, dir.z);
    return { pos: pos.clone(), dir: dir.clone(), yaw };
  }

  /** transform a camera expressed in the runner's local frame into world space */
  followRunner(t: number, c: Cam, lateral = 0, absTarget = false) {
    this.followFrame(this.frameAt(this.runnerS(t)), c, lateral, absTarget);
  }

  /** same as followRunner, but relative to a fixed point on the course */
  followFrame(f: { pos: THREE.Vector3; yaw: number }, c: Cam, lateral = 0, absTarget = false) {
    const cs = Math.cos(f.yaw), sn = Math.sin(f.yaw);
    const rot = (x: number, z: number): [number, number] => [x * cs + z * sn, -x * sn + z * cs];
    const [cx, cz] = rot(c.x + lateral, c.z);
    c.x = f.pos.x + cx;
    c.z = f.pos.z + cz;
    c.y += f.pos.y;
    if (!absTarget) {
      const [tx, tz] = rot(c.tx + lateral, c.tz);
      c.tx = f.pos.x + tx;
      c.tz = f.pos.z + tz;
      c.ty += f.pos.y;
    }
  }

  placeRunner(r: Runner, t: number, mode: Mode, speed: number, fatigue: number, limp = 0, lateral = 0, sOffset = 0) {
    const s = this.runnerS(t) + sOffset;
    const f = this.frameAt(s);
    const side = new THREE.Vector3(f.dir.z, 0, -f.dir.x).normalize();
    r.root.position.copy(f.pos).addScaledVector(side, lateral);
    r.root.rotation.y = f.yaw;
    r.pose({ mode, phase: stridePhase(s, 2.7), speed, fatigue, limp, breath: t });
    return f;
  }
}
