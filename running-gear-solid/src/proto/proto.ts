// Remaster tech prototype: CC0 skinned runner + PBR street + HDRI + shadows + AO + bloom + grade.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const W = 1920, H = 1080;
const params = new URLSearchParams(location.search);
const scale = Number(params.get('scale') ?? 1);

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setSize(W * scale, H * scale, false);
renderer.domElement.style.width = W / 2 + 'px';
renderer.domElement.id = 'film';
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.shadowMap.enabled = params.get('shadow') !== '0';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 800);

const composer = new EffectComposer(renderer);
composer.setSize(W * scale, H * scale);
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, W * scale, H * scale);
gtao.output = GTAOPass.OUTPUT.Default;
if (params.get('ao') !== '0') composer.addPass(gtao);
if (params.get('aohalf') === '1') { gtao.setSize(W * scale / 2, H * scale / 2); }
if (params.get('bloom') !== '0') composer.addPass(new UnrealBloomPass(new THREE.Vector2(W * scale, H * scale), 0.25, 0.6, 0.9));
composer.addPass(new OutputPass());

const tex = (url: string, srgb = false, rep = 8) => {
  const t = new THREE.TextureLoader().load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep, rep);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

async function init() {
  const hdr = await new RGBELoader().loadAsync('/assets/hdri/potsdamer_platz_2k.hdr');
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = hdr;
  scene.background = hdr;
  scene.backgroundBlurriness = 0.02;
  scene.fog = new THREE.FogExp2(0x9aa4ad, 0.012);

  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 200),
    new THREE.MeshStandardMaterial({
      map: tex('/assets/tex/asphalt_02_diff_1k.jpg', true, 10),
      normalMap: tex('/assets/tex/asphalt_02_nor_gl_1k.jpg', false, 10),
      roughnessMap: tex('/assets/tex/asphalt_02_rough_1k.jpg', false, 10),
      aoMap: tex('/assets/tex/asphalt_02_ao_1k.jpg', false, 10),
    }),
  );
  (road.material as THREE.MeshStandardMaterial).map!.repeat.set(4, 20);
  road.rotation.x = -Math.PI / 2;
  road.receiveShadow = true;
  scene.add(road);
  for (const x of [-9, 9]) {
    for (let i = 0; i < 12; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(8, 10 + ((i * 7) % 9) * 2, 14), new THREE.MeshStandardMaterial({ color: 0x8a7a70, roughness: 0.85 }));
      b.position.set(x + Math.sign(x) * 4, b.geometry.parameters.height / 2, -80 + i * 15);
      b.castShadow = b.receiveShadow = true;
      scene.add(b);
    }
  }

  const sun = new THREE.DirectionalLight(0xfff0dd, 2.2);
  sun.position.set(-20, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -12;
  sun.shadow.camera.right = sun.shadow.camera.top = 12;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  const loader = new GLTFLoader();
  const [char, ual, hair] = await Promise.all([
    loader.loadAsync('/assets/char/runner.glb'),
    loader.loadAsync('/assets/char/UAL1_Standard.glb'),
    loader.loadAsync('/assets/char/Hair_SimpleParted.gltf'),
  ]);
  const body = char.scene;
  const kit: Record<string, [number, number]> = { Singlet: [0x1d3f6e, 0.75], Shorts: [0x151518, 0.7], Socks: [0xe8e8e4, 0.9], Shoes: [0xff5a1f, 0.45], Watch: [0x111111, 0.3], Hair: [0x2a1d14, 0.6], Brows: [0x2a1d14, 0.8] };
  body.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = m.receiveShadow = true;
      m.frustumCulled = false;
      const k = Object.keys(kit).find((n) => m.name.startsWith(n));
      if (k) {
        const mat = new THREE.MeshStandardMaterial({ color: kit[k][0], roughness: kit[k][1], side: THREE.DoubleSide });
        const old = m.material as THREE.MeshStandardMaterial;
        if ((k === 'Hair' || k === 'Brows') && old.map) { mat.map = old.map; mat.alphaTest = 0.4; mat.transparent = false; }
        m.material = mat;
      }
      console.log('mesh', m.name);
    }
  });
  scene.add(body);
  // attach hair to head bone
  let head: THREE.Object3D | null = null;
  body.traverse((o) => {
    if (o.name === 'Head') head = o;
  });
  const hairMesh = hair.scene;
  hairMesh.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  void hairMesh; void head;

  const mixer = new THREE.AnimationMixer(body);
  const clip = ual.animations.find((a) => a.name === 'Jog_Fwd_Loop')!;
  const act = mixer.clipAction(clip);
  act.play();

  (window as any).RGS = {
    ready: true,
    duration: 10,
    fps: 60,
    info: { anims: ual.animations.map((a) => a.name) },
    renderFrame(t: number) {
      mixer.setTime(t);
      const z = 0;
      const cx = Number(params.get('cx') ?? 2.2), cy = Number(params.get('cy') ?? 1.3), cz = Number(params.get('cz') ?? 3.2), ty = Number(params.get('ty') ?? 1.05);
      camera.fov = Number(params.get('fov') ?? 38); camera.updateProjectionMatrix();
      camera.position.set(cx, cy, z + cz);
      camera.lookAt(0, ty, z);
      composer.render();
      return 'proto';
    },
  };
}
init().catch((e) => ((window as any).RGS = { error: String(e.stack || e) }));
