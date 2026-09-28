// Test bench: any arena / course point / camera preset, for visual verification.
//   rm.html?arena=finsbury&s=1200&cam=chase&hdri=greenwich_park
import * as THREE from 'three';
import { Renderer } from './engine/Renderer';
import { Atmos } from './engine/Atmos';
import { Arena } from './world/Arena';
import { Runner, PhaseTrack } from './char/Runner';

const P = new URLSearchParams(location.search);
const num = (k: string, d: number) => (P.has(k) && P.get(k) !== '' ? Number(P.get(k)) : d);

async function main() {
  const t0 = performance.now();
  const r = new Renderer(document.getElementById('film') as HTMLCanvasElement, num('scale', 0.75), { ao: P.get('ao') !== '0' });
  r.ssao.radius = num('aor', 0.6);
  r.ssao.strength = num('aos', 0.85);
  if (P.has('pcf')) r.gl.shadowMap.type = num('pcf', 1) ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  r.setScene(scene);
  const atmos = new Atmos();
  await atmos.apply(r.gl, scene, { hdri: P.get('hdri') ?? 'kloofendal_48d_partly_cloudy_puresky', rot: num('rot', 0), sun: num('sun', 2.6), fog: num('fog', 0.0022), fogColor: 0xa9b2b8, env: num('env', 1), shadowSize: num('shadow', 45) });
  const arena = await Arena.load(P.get('arena') ?? 'finsbury');
  scene.add(arena.group);
  if (P.get('noenv') === '1') scene.environment = null;
  if (P.has('sm')) atmos.sun.shadow.mapSize.set(num('sm', 4096), num('sm', 4096));
  const off = (P.get('off') ?? '').split(',');
  if (off.includes('ground')) arena.ground.group.visible = false;
  if (off.includes('trees')) arena.trees.mesh.visible = false;
  if (off.includes('bld') && arena.buildings) arena.buildings.group.visible = false;
  if (off.includes('bar')) arena.barriers.group.visible = false;
  if (off.includes('flatground')) arena.ground.group.children.forEach((m) => ((m as THREE.Mesh).material = new THREE.MeshStandardMaterial({ color: 0x556644 })));
  if (off.includes('post')) { r.bloom.enabled = false; r.composer.passes.forEach((p, i) => { if (i > 0 && i < r.composer.passes.length - 1) p.enabled = false; }); }
  const runner = await Runner.create();
  scene.add(runner.root);
  const course = arena.courses[num('c', 0)];
  const speed = num('v', 3.9);
  const s0 = num('s', 100);
  const dist = (t: number) => s0 + speed * t;
  const track = new PhaseTrack(runner, dist, 0, 12);
  const info = { load: Math.round(performance.now() - t0), gait: runner.gaitInfo, course: course.length, trees: arena.trees.positions.length / 2 };
  const cam = r.camera;
  const focus = new THREE.Vector3();
  (window as any).RGS = {
    ready: true,
    duration: 10,
    fps: 30,
    info,
    renderFrame(t: number) {
      const s = dist(t);
      const p = course.at(s);
      const d = course.dir(s, 4);
      const y = arena.heightAt(p.x, p.z);
      runner.root.position.set(p.x, y, p.z);
      runner.root.rotation.y = Math.atan2(d.dx, d.dz);
      runner.pose({ phase: track.at(t), speed, fatigue: num('fat', 0) });
      focus.set(p.x, y + 1, p.z);
      const preset = P.get('cam') ?? 'chase';
      const ang = (num('ca', preset === 'side' ? 90 : preset === 'front' ? 180 : 0) * Math.PI) / 180;
      const cd = num('cd', preset === 'aerial' ? 60 : preset === 'wide' ? 14 : 4.2);
      const ch = num('ch', preset === 'aerial' ? 45 : preset === 'wide' ? 4 : 1.5);
      // behind = -dir
      const bx = -d.dx, bz = -d.dz;
      const cx = bx * Math.cos(ang) - bz * Math.sin(ang), cz = bx * Math.sin(ang) + bz * Math.cos(ang);
      cam.position.set(p.x + cx * cd, y + ch, p.z + cz * cd);
      const gy = arena.heightAt(cam.position.x, cam.position.z) + 0.4;
      if (cam.position.y < gy) cam.position.y = gy;
      cam.fov = num('fov', 40);
      cam.near = 0.1;
      cam.far = 2500;
      cam.updateProjectionMatrix();
      cam.lookAt(p.x, y + num('ty', 1.1), p.z);
      atmos.follow(focus);
      arena.update(cam.position, focus, t);
      arena.trees.uniforms.uLight.value.setScalar(num('tl', 0.85));
      r.grade.dof = num('dof', 0);
      if (off.includes('post')) r.grade.bloom = 0;
      r.grade.focus = cd;
      if (P.has('prof')) return JSON.stringify(r.profile(t));
      r.render(t);
      return 'test';
    },
    pixels: () => r.pixels(),
    feet(t: number) {
      (window as any).RGS.pose(t);
      const v = new THREE.Vector3();
      runner.root.updateMatrixWorld(true);
      runner.bone('foot_l').getWorldPosition(v);
      const l = v.toArray();
      runner.bone('foot_r').getWorldPosition(v);
      return [...l, ...v.toArray()].map((x) => +x.toFixed(3));
    },
    pose(t: number) {
      const s = dist(t);
      const p = course.at(s);
      const d = course.dir(s, 4);
      runner.root.position.set(p.x, arena.heightAt(p.x, p.z), p.z);
      runner.root.rotation.y = Math.atan2(d.dx, d.dz);
      runner.pose({ phase: track.at(t), speed, fatigue: num('fat', 0) });
    },
  };
}
main().catch((e) => {
  (window as any).RGS = { error: String(e?.stack ?? e) };
  console.error(e);
});
