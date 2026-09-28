// A real place rebuilt from data: terrain, land use, roads, buildings, trees and water.
import * as THREE from 'three';
import { ArenaData, Polyline } from './ArenaData';
import { Ground } from './Ground';
import { Buildings } from './Buildings';
import { Trees, TreeOpts } from './Trees';
import { Water } from './Water';
import { Barriers } from './Barriers';

export interface ArenaOpts {
  trees?: TreeOpts;
  noBuildings?: boolean;
}

const cache = new Map<string, Promise<Arena>>();

export class Arena {
  readonly group = new THREE.Group();
  readonly data: ArenaData;
  readonly ground: Ground;
  readonly buildings: Buildings | null;
  readonly trees: Trees;
  readonly water: Water;
  readonly barriers: Barriers;
  readonly courses: Polyline[];

  private constructor(data: ArenaData, ground: Ground, buildings: Buildings | null, trees: Trees, barriers: Barriers) {
    this.data = data;
    this.ground = ground;
    this.buildings = buildings;
    this.trees = trees;
    this.water = new Water(data);
    this.barriers = barriers;
    this.courses = data.j.courses.map((c) => new Polyline(c.p));
    this.group.add(ground.group, trees.mesh, this.water.mesh, barriers.group);
    if (buildings) this.group.add(buildings.group);
  }

  static load(name: string, opts: ArenaOpts = {}): Promise<Arena> {
    let p = cache.get(name);
    if (!p) {
      p = (async () => {
        const data = await ArenaData.load(name);
        const [ground, buildings, trees, barriers] = await Promise.all([
          Ground.create(data),
          opts.noBuildings ? Promise.resolve(null) : Buildings.create(data),
          Trees.create(data, opts.trees),
          Barriers.create(data),
        ]);
        return new Arena(data, ground, buildings, trees, barriers);
      })();
      cache.set(name, p);
    }
    return p;
  }

  heightAt(x: number, z: number) {
    return this.data.heightAt(x, z);
  }

  /** per-frame: terrain LOD for the camera, fine splat window around the focus */
  update(cam: THREE.Vector3, focus: THREE.Vector3, time: number) {
    this.ground.update(cam);
    this.ground.focus(focus.x, focus.z);
    this.water.uniforms.uTime.value = time;
  }

  set wet(v: number) {
    this.ground.uniforms.uWet.value = v;
    if (this.buildings) this.buildings.uniforms.uWet.value = v;
  }
  set night(v: number) {
    if (this.buildings) this.buildings.uniforms.uNight.value = v;
  }
}
