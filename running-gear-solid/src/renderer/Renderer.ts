import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { COMP_H, COMP_W, SCENE_H, SCENE_W } from '../cinematics/schedule';
import { GLOBAL } from '../shaders/ps1';

// Pipeline:
//   3D scene -> 480x270 render target (EffectComposer: RenderPass + PS1Pass)
//   PS1Pass: heat shimmer, grade, vignette, grain, 4x4 Bayer dither, 15-bit colour
//   Composite (960x540): nearest upscale of the scene + pixel-font UI canvas,
//   fades, flashes, codec static, glitch, faint scanlines.
//   The capture script grabs the 960x540 canvas; ffmpeg upscales 2x nearest.

const PS1_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(SCENE_W, SCENE_H) },
    uLevels: { value: 32 },
    uDither: { value: 1 },
    uHeat: { value: 0 },
    uTime: { value: 0 },
    uSat: { value: 1 },
    uContrast: { value: 1 },
    uBright: { value: 0 },
    uVignette: { value: 0.35 },
    uGrain: { value: 0.03 },
    uRed: { value: 0 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uLift: { value: new THREE.Vector3(0, 0, 0) },
    uGreen: { value: 0 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uLevels; uniform float uDither; uniform float uHeat; uniform float uTime;
uniform float uSat; uniform float uContrast; uniform float uBright; uniform float uVignette; uniform float uGrain; uniform float uRed;
uniform vec3 uTint; uniform vec3 uLift; uniform float uGreen;
varying vec2 vUv;
float B2(vec2 a){ a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float B4(vec2 a){ return B2(0.5 * a) * 0.25 + B2(a); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec2 uv = vUv;
  if (uHeat > 0.0) {
    uv.x += (sin(uv.y * 70.0 + uTime * 7.0) * 0.0022 + sin(uv.y * 23.0 - uTime * 4.0) * 0.0016) * uHeat;
    uv.y += cos(uv.x * 45.0 + uTime * 5.0) * 0.0012 * uHeat;
  }
  vec3 c = texture2D(tDiffuse, uv).rgb;
  c = c * uTint + uLift;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSat);
  c = (c - 0.5) * uContrast + 0.5 + uBright;
  c = mix(c, vec3(l * 0.35, l * 1.15 + 0.03, l * 0.45), uGreen);
  vec2 d = vUv - 0.5;
  c *= 1.0 - dot(d, d) * uVignette * 2.0;
  c = mix(c, c * vec3(1.35, 0.45, 0.4) + vec3(0.07, 0.0, 0.0), uRed);
  vec2 px = floor(vUv * uRes);
  c += (hash(px + fract(uTime) * 91.0) - 0.5) * uGrain;
  float b = B4(px) - 0.5;
  float L = uLevels - 1.0;
  c = floor(clamp(c, 0.0, 1.0) * L + 0.5 + b * uDither) / L;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`,
};

const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tScene; uniform sampler2D tUI;
uniform float uFade; uniform float uFlash; uniform float uStatic; uniform float uGlitch; uniform float uScan;
uniform float uTime; uniform float uSceneMix; uniform vec3 uFlashColor;
varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec2 uv = vUv;
  float frame = floor(uTime * 30.0);
  if (uGlitch > 0.0) {
    float row = floor(uv.y * 45.0);
    float r = h(vec2(row, frame));
    if (r < uGlitch * 0.45) uv.x += (h(vec2(row * 3.1, frame + 1.0)) - 0.5) * 0.14 * uGlitch;
  }
  vec3 sc = texture2D(tScene, uv).rgb;
  if (uGlitch > 0.0) sc.r = texture2D(tScene, uv + vec2(0.006 * uGlitch, 0.0)).r;
  sc *= uSceneMix;
  vec4 ui = texture2D(tUI, vUv);
  vec3 c = mix(sc, ui.rgb, ui.a);
  float n = h(floor(gl_FragCoord.xy / 2.0) + frame * vec2(7.0, 13.0));
  c = mix(c, vec3(n * 0.8), uStatic);
  c = mix(c, vec3(0.0), uFade);
  c = mix(c, uFlashColor, uFlash);
  if (mod(floor(gl_FragCoord.y), 2.0) < 1.0) c *= 1.0 - uScan;
  gl_FragColor = vec4(c, 1.0);
}`;

export interface FX {
  levels: number;
  dither: number;
  heat: number;
  sat: number;
  contrast: number;
  bright: number;
  vignette: number;
  grain: number;
  red: number;
  green: number;
  tint: [number, number, number];
  lift: [number, number, number];
  fade: number;
  flash: number;
  flashColor: [number, number, number];
  static: number;
  glitch: number;
  scan: number;
  sceneMix: number;
}

export const defaultFX = (): FX => ({
  levels: 32,
  dither: 1,
  heat: 0,
  sat: 1,
  contrast: 1,
  bright: 0,
  vignette: 0.35,
  grain: 0.035,
  red: 0,
  green: 0,
  tint: [1, 1, 1],
  lift: [0, 0, 0],
  fade: 0,
  flash: 0,
  flashColor: [1, 1, 1],
  static: 0,
  glitch: 0,
  scan: 0.07,
  sceneMix: 1,
});

export class FilmRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly composer: EffectComposer;
  readonly renderPass: RenderPass;
  readonly ps1Pass: ShaderPass;
  readonly uiCanvas: HTMLCanvasElement;
  readonly ui: CanvasRenderingContext2D;
  private uiTex: THREE.CanvasTexture;
  private compScene = new THREE.Scene();
  private compCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private compMat: THREE.ShaderMaterial;

  constructor(canvas: HTMLCanvasElement) {
    THREE.ColorManagement.enabled = false;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(COMP_W, COMP_H, false);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.autoClear = true;

    const rt = new THREE.WebGLRenderTarget(SCENE_W, SCENE_H, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      type: THREE.UnsignedByteType,
    });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.setPixelRatio(1);
    this.composer.setSize(SCENE_W, SCENE_H);
    this.composer.renderToScreen = false;
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.composer.addPass(this.renderPass);
    this.ps1Pass = new ShaderPass(PS1_SHADER);
    this.composer.addPass(this.ps1Pass);

    this.uiCanvas = document.createElement('canvas');
    this.uiCanvas.width = COMP_W;
    this.uiCanvas.height = COMP_H;
    this.ui = this.uiCanvas.getContext('2d')!;
    this.ui.imageSmoothingEnabled = false;
    this.uiTex = new THREE.CanvasTexture(this.uiCanvas);
    this.uiTex.magFilter = this.uiTex.minFilter = THREE.NearestFilter;
    this.uiTex.generateMipmaps = false;
    this.uiTex.colorSpace = THREE.NoColorSpace;

    this.compMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        tUI: { value: this.uiTex },
        uFade: { value: 0 },
        uFlash: { value: 0 },
        uFlashColor: { value: new THREE.Vector3(1, 1, 1) },
        uStatic: { value: 0 },
        uGlitch: { value: 0 },
        uScan: { value: 0.07 },
        uTime: { value: 0 },
        uSceneMix: { value: 1 },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: COMPOSITE_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    const tri = new THREE.PlaneGeometry(2, 2);
    this.compScene.add(new THREE.Mesh(tri, this.compMat));
  }

  render(scene: THREE.Scene, camera: THREE.Camera, fx: FX, time: number, clearColor: THREE.Color) {
    GLOBAL.uTime.value = time;
    GLOBAL.uSnapRes.value.set(SCENE_W / 2, SCENE_H / 2);
    const u = this.ps1Pass.uniforms as Record<string, THREE.IUniform>;
    u.uLevels.value = fx.levels;
    u.uDither.value = fx.dither;
    u.uHeat.value = fx.heat;
    u.uTime.value = time;
    u.uSat.value = fx.sat;
    u.uContrast.value = fx.contrast;
    u.uBright.value = fx.bright;
    u.uVignette.value = fx.vignette;
    u.uGrain.value = fx.grain;
    u.uRed.value = fx.red;
    u.uGreen.value = fx.green;
    (u.uTint.value as THREE.Vector3).set(...fx.tint);
    (u.uLift.value as THREE.Vector3).set(...fx.lift);

    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.renderer.setClearColor(clearColor, 1);
    if (fx.sceneMix > 0) this.composer.render();

    this.uiTex.needsUpdate = true;
    const c = this.compMat.uniforms;
    c.tScene.value = this.composer.readBuffer.texture;
    c.uFade.value = fx.fade;
    c.uFlash.value = fx.flash;
    (c.uFlashColor.value as THREE.Vector3).set(...fx.flashColor);
    c.uStatic.value = fx.static;
    c.uGlitch.value = fx.glitch;
    c.uScan.value = fx.scan;
    c.uTime.value = time;
    c.uSceneMix.value = fx.sceneMix;
    this.renderer.setRenderTarget(null);
    this.renderer.setViewport(0, 0, COMP_W, COMP_H);
    this.renderer.render(this.compScene, this.compCam);
  }
}
