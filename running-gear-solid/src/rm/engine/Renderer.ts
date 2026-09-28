// Remaster renderer: PBR scene at an internal resolution (default 1440x810), post stack
// (GTAO, bloom, tone map, FXAA), then a final pass at 1920x1080 that grades, adds grain,
// vignette and letterbox, and composites the HUD canvas at full resolution.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from './SSAOPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';

export const OUT_W = 1920, OUT_H = 1080;

/** Per-shot look. Every value has a neutral default so shots only set what they change. */
export interface Grade {
  exposure: number;
  saturation: number;
  contrast: number;
  lift: [number, number, number];
  gain: [number, number, number];
  vignette: number;
  grain: number;
  bloom: number;
  letterbox: number; // 0..1 (1 = 2.39:1 bars)
  fade: number; // 0 = picture, 1 = black
  flash: number; // additive white
  ca: number; // chromatic aberration strength
  scan: number; // codec/monitor scanlines on the picture (0..1)
  dof: number; // 0 = off, else aperture
  focus: number; // focus distance (m)
}
export const defaultGrade = (): Grade => ({
  exposure: 1,
  saturation: 0.9,
  contrast: 1.06,
  lift: [0.0, 0.004, 0.012],
  gain: [1.0, 0.99, 0.97],
  vignette: 0.35,
  grain: 0.035,
  bloom: 0.18,
  letterbox: 0,
  fade: 0,
  flash: 0,
  ca: 0.0006,
  scan: 0,
  dof: 0,
  focus: 5,
});

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tHud: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uSat: { value: 1 },
    uContrast: { value: 1 },
    uLift: { value: new THREE.Vector3() },
    uGain: { value: new THREE.Vector3(1, 1, 1) },
    uVignette: { value: 0.3 },
    uGrain: { value: 0.03 },
    uLetterbox: { value: 0 },
    uFade: { value: 0 },
    uFlash: { value: 0 },
    uCA: { value: 0 },
    uScan: { value: 0 },
    uAspect: { value: OUT_W / OUT_H },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform sampler2D tHud;
    uniform float uTime, uSat, uContrast, uVignette, uGrain, uLetterbox, uFade, uFlash, uCA, uScan, uAspect;
    uniform vec3 uLift, uGain;
    varying vec2 vUv;
    float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
    void main() {
      vec2 d = vUv - 0.5;
      vec3 c;
      c.r = texture2D(tDiffuse, vUv - d * uCA * 2.0).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv + d * uCA * 2.0).b;
      // grade (display space)
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c = (c - 0.5) * uContrast + 0.5;
      c = c * uGain + uLift * (1.0 - c);
      // vignette
      float v = dot(d * vec2(uAspect, 1.0), d * vec2(uAspect, 1.0));
      c *= 1.0 - uVignette * smoothstep(0.08, 0.9, v);
      // monitor scanlines
      if (uScan > 0.0) c *= 1.0 - uScan * 0.35 * step(0.5, fract(vUv.y * 270.0));
      // film grain (luma weighted, animated deterministically by uTime)
      float g = hash(vUv * vec2(1920.0, 1080.0) + fract(uTime * 7.31) * 131.0) - 0.5;
      c += g * uGrain * (0.6 + 0.8 * (1.0 - l));
      c = clamp(c, 0.0, 1.0);
      c = mix(c, vec3(0.0), uFade);
      c += uFlash;
      // letterbox (2.39:1 bars at 1)
      float bar = uLetterbox * (1.0 - (16.0 / 9.0) / 2.39) * 0.5;
      if (vUv.y < bar || vUv.y > 1.0 - bar) c = vec3(0.0);
      // HUD on top (premultiplied canvas)
      vec4 h = texture2D(tHud, vUv);
      c = c * (1.0 - h.a) + h.rgb;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly gl: THREE.WebGLRenderer;
  readonly composer: EffectComposer;
  readonly renderPass: RenderPass;
  readonly ssao: SSAOPass;
  readonly bloom: UnrealBloomPass;
  readonly bokeh: BokehPass;
  readonly final: ShaderPass;
  readonly hudCanvas: HTMLCanvasElement;
  readonly hud: CanvasRenderingContext2D;
  readonly hudTex: THREE.CanvasTexture;
  readonly iw: number;
  readonly ih: number;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, OUT_W / OUT_H, 0.1, 3000);
  grade = defaultGrade();

  constructor(canvas: HTMLCanvasElement, scale = 0.75, opts: { ao?: boolean } = {}) {
    this.canvas = canvas;
    this.iw = Math.round(OUT_W * scale);
    this.ih = Math.round(OUT_H * scale);
    const gl = (this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' }));
    gl.setPixelRatio(1);
    gl.setSize(OUT_W, OUT_H, false);
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFShadowMap;
    gl.shadowMap.autoUpdate = true;

    this.hudCanvas = document.createElement('canvas');
    this.hudCanvas.width = OUT_W;
    this.hudCanvas.height = OUT_H;
    this.hud = this.hudCanvas.getContext('2d')!;
    this.hudTex = new THREE.CanvasTexture(this.hudCanvas);
    this.hudTex.colorSpace = THREE.NoColorSpace;
    this.hudTex.premultiplyAlpha = true;
    this.hudTex.minFilter = THREE.LinearFilter;
    this.hudTex.generateMipmaps = false;

    // scene targets carry a depth texture so GTAO can reuse the main depth (normals are
    // reconstructed from depth) instead of re-rendering the whole scene into a G-buffer
    const mkDepth = () => {
      const d = new THREE.DepthTexture(this.iw, this.ih);
      d.type = THREE.UnsignedIntType;
      return d;
    };
    const target = new THREE.WebGLRenderTarget(this.iw, this.ih, { type: THREE.HalfFloatType, depthTexture: mkDepth() });
    const composer = (this.composer = new EffectComposer(gl, target));
    composer.setPixelRatio(1);
    composer.renderTarget2.depthTexture = mkDepth();
    composer.setSize(this.iw, this.ih);
    this.renderPass = new RenderPass(this.scene, this.camera);
    composer.addPass(this.renderPass);
    this.ssao = new SSAOPass(this.camera, this.iw, this.ih);
    this.ssao.enabled = opts.ao !== false;
    composer.addPass(this.ssao);
    this.bokeh = new BokehPass(this.scene, this.camera, { focus: 5, aperture: 0.002, maxblur: 0.008 });
    this.bokeh.enabled = false;
    composer.addPass(this.bokeh);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(this.iw, this.ih), 0.18, 0.5, 0.92);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    const fxaa = new ShaderPass(FXAAShader);
    fxaa.material.uniforms.resolution.value.set(1 / this.iw, 1 / this.ih);
    composer.addPass(fxaa);
    this.final = new ShaderPass(FinalShader);
    this.final.material.uniforms.tHud.value = this.hudTex;
    composer.addPass(this.final);
    // the last pass draws to the 1920x1080 canvas; ensure the viewport is the full canvas
    this.final.renderToScreen = true;
  }

  setScene(scene: THREE.Scene) {
    this.scene = scene;
    this.renderPass.scene = scene;
    (this.bokeh as unknown as { scene: THREE.Scene }).scene = scene;
  }

  render(time: number) {
    const g = this.grade;
    const u = this.final.material.uniforms;
    this.gl.toneMappingExposure = g.exposure;
    u.uTime.value = time;
    u.uSat.value = g.saturation;
    u.uContrast.value = g.contrast;
    u.uLift.value.set(...g.lift);
    u.uGain.value.set(...g.gain);
    u.uVignette.value = g.vignette;
    u.uGrain.value = g.grain;
    u.uLetterbox.value = g.letterbox;
    u.uFade.value = g.fade;
    u.uFlash.value = g.flash;
    u.uCA.value = g.ca;
    u.uScan.value = g.scan;
    this.bloom.strength = g.bloom;
    this.bloom.enabled = g.bloom > 0.001;
    this.bokeh.enabled = g.dof > 0;
    if (g.dof > 0) {
      const bu = (this.bokeh as unknown as { uniforms: Record<string, THREE.IUniform> }).uniforms;
      bu.focus.value = g.focus;
      bu.aperture.value = g.dof;
      bu.maxblur.value = 0.01;
    }
    this.ssao.camera = this.camera;
    this.renderPass.camera = this.camera;
    (this.bokeh as unknown as { camera: THREE.Camera }).camera = this.camera;
    this.hudTex.needsUpdate = true;
    if (g.fade >= 0.999 && g.flash <= 0) {
      // fully black: skip the 3D work, still composite the HUD
      this.gl.setRenderTarget(this.composer.readBuffer);
      this.gl.setClearColor(0x000000, 1);
      this.gl.clear();
      this.final.render(this.gl, null as unknown as THREE.WebGLRenderTarget, this.composer.readBuffer, 0, false);
      return;
    }
    this.composer.render();
  }

  /** Time each pass (ms) for profiling; forces GPU sync between passes. */
  profile(time: number) {
    const ctx = this.gl.getContext();
    const px = new Uint8Array(4);
    const hb = new Uint16Array(4);
    void px;
    const sync = () => {
      for (const rt of [this.composer.readBuffer, this.composer.writeBuffer]) this.gl.readRenderTargetPixels(rt, 0, 0, 1, 1, hb);
      ctx.finish();
    };
    const out: Record<string, number> = {};
    const wrap = this.composer.passes.map((p) => {
      const orig = p.render.bind(p);
      const name = p.constructor.name;
      p.render = (...a: Parameters<typeof p.render>) => {
        sync();
        const t0 = performance.now();
        orig(...a);
        sync();
        out[name] = (out[name] ?? 0) + Math.round(performance.now() - t0);
      };
      return () => (p.render = orig);
    });
    this.gl.info.autoReset = false;
    this.gl.info.reset();
    const t0 = performance.now();
    this.render(time);
    sync();
    out.total = Math.round(performance.now() - t0);
    const i = this.gl.info.render;
    out.calls = i.calls;
    out.tris = i.triangles;
    // same frame without the shadow-map update: the difference is the shadow pass
    const au = this.gl.shadowMap.autoUpdate;
    this.gl.shadowMap.autoUpdate = false;
    const t1 = performance.now();
    this.render(time);
    sync();
    out.noShadow = Math.round(performance.now() - t1);
    this.gl.shadowMap.autoUpdate = au;
    this.gl.info.autoReset = true;
    wrap.forEach((f) => f());
    return out;
  }

  /** RGB bytes (bottom-up rows) of the canvas, base64. */
  private rgba?: Uint8Array;
  private rgb?: Uint8Array;
  pixels(): string {
    const ctx = this.gl.getContext() as WebGL2RenderingContext;
    const n = OUT_W * OUT_H;
    this.rgba ??= new Uint8Array(n * 4);
    this.rgb ??= new Uint8Array(n * 3);
    ctx.bindFramebuffer(ctx.FRAMEBUFFER, null);
    ctx.readPixels(0, 0, OUT_W, OUT_H, ctx.RGBA, ctx.UNSIGNED_BYTE, this.rgba);
    const a = this.rgba, b = this.rgb;
    for (let i = 0, j = 0; i < a.length; i += 4, j += 3) {
      b[j] = a[i];
      b[j + 1] = a[i + 1];
      b[j + 2] = a[i + 2];
    }
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000) as unknown as number[]);
    return btoa(s);
  }
}
