import * as THREE from 'three';

// ---------------------------------------------------------------------------
// PS1-style material: per-vertex (Gouraud) lighting, per-vertex depth fog,
// vertex positions snapped to a coarse screen grid (the famous "wobble") and
// affine (non perspective-correct) texture mapping. All materials share one
// set of global uniforms so a sequence can relight the whole world at once.
// ---------------------------------------------------------------------------

export const GLOBAL = {
  uFogColor: { value: new THREE.Color(0x101418) },
  uFogNear: { value: 20 },
  uFogFar: { value: 120 },
  uLightDir: { value: new THREE.Vector3(-0.4, -1, -0.3).normalize() },
  uLightColor: { value: new THREE.Color(0.9, 0.9, 0.85) },
  uSkyColor: { value: new THREE.Color(0.25, 0.28, 0.32) },
  uGroundColor: { value: new THREE.Color(0.08, 0.08, 0.1) },
  uAmbient: { value: new THREE.Color(0.05, 0.05, 0.06) },
  uPLPos: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
  uPLColor: { value: [new THREE.Color(0, 0, 0), new THREE.Color(0, 0, 0), new THREE.Color(0, 0, 0), new THREE.Color(0, 0, 0)] },
  uPLRange: { value: [1, 1, 1, 1] },
  uSnapRes: { value: new THREE.Vector2(240, 135) },
  uTime: { value: 0 },
};

export interface LightingPreset {
  fog: number;
  fogNear: number;
  fogFar: number;
  lightDir: [number, number, number];
  light: number;
  lightI?: number;
  sky: number;
  ground: number;
  ambient?: number;
}

export function applyLighting(p: LightingPreset) {
  GLOBAL.uFogColor.value.setHex(p.fog);
  GLOBAL.uFogNear.value = p.fogNear;
  GLOBAL.uFogFar.value = p.fogFar;
  GLOBAL.uLightDir.value.set(...p.lightDir).normalize();
  GLOBAL.uLightColor.value.setHex(p.light).multiplyScalar(p.lightI ?? 1);
  GLOBAL.uSkyColor.value.setHex(p.sky);
  GLOBAL.uGroundColor.value.setHex(p.ground);
  GLOBAL.uAmbient.value.setHex(p.ambient ?? 0x000000);
  for (let i = 0; i < 4; i++) setPointLight(i, null);
}

export function setPointLight(i: number, pos: THREE.Vector3 | null, color = 0xffffff, range = 10, intensity = 1) {
  if (!pos) {
    GLOBAL.uPLColor.value[i].setRGB(0, 0, 0);
    GLOBAL.uPLRange.value[i] = 1;
    return;
  }
  GLOBAL.uPLPos.value[i].copy(pos);
  GLOBAL.uPLColor.value[i].setHex(color).multiplyScalar(intensity);
  GLOBAL.uPLRange.value[i] = range;
}

const VERT = /* glsl */ `
uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
uniform vec3 uLightDir; uniform vec3 uLightColor; uniform vec3 uSkyColor; uniform vec3 uGroundColor; uniform vec3 uAmbient;
uniform vec3 uPLPos[4]; uniform vec3 uPLColor[4]; uniform float uPLRange[4];
uniform vec2 uSnapRes; uniform float uAffine; uniform float uUnlit; uniform float uSnap;
uniform vec2 uUvScale; uniform vec2 uUvOffset; uniform float uWave; uniform float uTime;
varying vec3 vLight; varying float vFog; varying vec2 vUv; varying float vW; varying vec3 vCol;
void main(){
  vec3 p = position;
  if (uWave > 0.0) { p.y += sin(p.x*0.35 + uTime*1.3)*uWave + cos(p.z*0.27 + uTime*0.9)*uWave; }
  mat4 mm = modelMatrix;
#ifdef USE_INSTANCING
  mm = modelMatrix * instanceMatrix;
#endif
  vec4 wp = mm * vec4(p, 1.0);
  vec3 n = normalize(mat3(mm) * normal);
  vec4 vp = viewMatrix * wp;
  vec4 clip = projectionMatrix * vp;
  if (uSnap > 0.5 && clip.w > 0.0) {
    vec2 ndc = clip.xy / clip.w;
    ndc = floor(ndc * uSnapRes + 0.5) / uSnapRes;
    clip.xy = ndc * clip.w;
  }
  gl_Position = clip;
  float ndl = max(dot(n, -uLightDir), 0.0);
  vec3 L = uLightColor * ndl + mix(uGroundColor, uSkyColor, n.y * 0.5 + 0.5) + uAmbient;
  for (int i = 0; i < 4; i++) {
    vec3 d = uPLPos[i] - wp.xyz;
    float dist = length(d);
    float att = clamp(1.0 - dist / uPLRange[i], 0.0, 1.0);
    att *= att;
    L += uPLColor[i] * att * (max(dot(n, d / max(dist, 1e-3)), 0.0) * 0.85 + 0.15);
  }
  vLight = mix(L, vec3(1.0), uUnlit);
  vCol = vec3(1.0);
#ifdef USE_COLOR
  vCol *= color;
#endif
#ifdef USE_INSTANCING_COLOR
  vCol *= instanceColor;
#endif
  float depth = -vp.z;
  vFog = clamp((depth - uFogNear) / max(uFogFar - uFogNear, 0.001), 0.0, 1.0);
  vec2 tuv = uv * uUvScale + uUvOffset;
  float w = mix(1.0, clip.w, uAffine);
  vUv = tuv * w; vW = w;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uMap; uniform float uHasMap; uniform vec3 uColor; uniform vec3 uEmissive; uniform float uOpacity;
uniform float uAlphaTest; uniform vec3 uFogColor; uniform float uFogAmount; uniform float uEmissiveMap;
varying vec3 vLight; varying float vFog; varying vec2 vUv; varying float vW; varying vec3 vCol;
void main(){
  vec2 uv = vUv / vW;
  vec4 tex = uHasMap > 0.5 ? texture2D(uMap, uv) : vec4(1.0);
  vec3 base = uColor * tex.rgb * vCol;
  vec3 c = base * vLight + uEmissive * mix(vec3(1.0), tex.rgb, uEmissiveMap);
  c = mix(c, uFogColor, vFog * uFogAmount);
  float a = tex.a * uOpacity;
  if (a < uAlphaTest) discard;
  gl_FragColor = vec4(c, a);
}`;

export interface PS1Options {
  color?: number | THREE.Color;
  map?: THREE.Texture | null;
  emissive?: number | THREE.Color;
  emissiveMap?: boolean;
  unlit?: boolean;
  affine?: boolean;
  snap?: boolean;
  transparent?: boolean;
  opacity?: number;
  alphaTest?: number;
  additive?: boolean;
  side?: THREE.Side;
  vertexColors?: boolean;
  fog?: number;
  uvScale?: [number, number];
  depthWrite?: boolean;
  wave?: number;
}

export type PS1Material = THREE.ShaderMaterial & {
  uniforms: {
    uColor: { value: THREE.Color };
    uEmissive: { value: THREE.Color };
    uOpacity: { value: number };
    uUvOffset: { value: THREE.Vector2 };
    uUvScale: { value: THREE.Vector2 };
    uMap: { value: THREE.Texture | null };
    uHasMap: { value: number };
    uFogAmount: { value: number };
    [k: string]: { value: unknown };
  };
};

export function ps1(o: PS1Options = {}): PS1Material {
  const col = o.color instanceof THREE.Color ? o.color.clone() : new THREE.Color(o.color ?? 0xffffff);
  const em = o.emissive instanceof THREE.Color ? o.emissive.clone() : new THREE.Color(o.emissive ?? 0x000000);
  const m = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      ...GLOBAL,
      uMap: { value: o.map ?? null },
      uHasMap: { value: o.map ? 1 : 0 },
      uColor: { value: col },
      uEmissive: { value: em },
      uEmissiveMap: { value: o.emissiveMap ? 1 : 0 },
      uOpacity: { value: o.opacity ?? 1 },
      uAlphaTest: { value: o.alphaTest ?? 0.02 },
      uAffine: { value: o.affine === false ? 0 : 1 },
      uSnap: { value: o.snap === false ? 0 : 1 },
      uUnlit: { value: o.unlit ? 1 : 0 },
      uUvScale: { value: new THREE.Vector2(...(o.uvScale ?? [1, 1])) },
      uUvOffset: { value: new THREE.Vector2(0, 0) },
      uFogAmount: { value: o.fog ?? 1 },
      uWave: { value: o.wave ?? 0 },
    },
    transparent: !!o.transparent || !!o.additive,
    blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: o.depthWrite ?? !(o.additive || o.transparent),
    side: o.side ?? THREE.FrontSide,
    vertexColors: !!o.vertexColors,
  });
  return m as PS1Material;
}

/** Glowing, unlit, additive (light cones, holograms, sun discs) */
export const glow = (color: number, opacity = 1, map: THREE.Texture | null = null) =>
  ps1({ color, unlit: true, additive: true, opacity, map, side: THREE.DoubleSide, fog: 0.6 });

// ---------------------------------------------------------------------------
// Deterministic GPU particles: position is a pure function of (seed, uTime).
// Used for rain, sparks, embers, dust, wind streaks and debris.
// ---------------------------------------------------------------------------

const PVERT = /* glsl */ `
attribute vec4 seed;
uniform float uTime; uniform vec3 uBox; uniform vec3 uVel; uniform float uSize; uniform float uLife;
uniform float uSpread; uniform vec2 uSnapRes; uniform float uSwirl;
varying float vA;
void main(){
  float life = uLife * (0.6 + 0.4 * seed.w);
  float t = uTime + seed.w * 97.0;
  float age = mod(t, life);
  float cycle = floor(t / life);
  vec3 r = fract(seed.xyz + cycle * vec3(0.137, 0.271, 0.419));
  vec3 p = (r - 0.5) * uBox;
  p += uVel * age * (0.7 + 0.6 * seed.x);
  p.x += sin(age * 3.0 + seed.y * 20.0) * uSwirl;
  p.z += cos(age * 2.3 + seed.z * 20.0) * uSwirl;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vec4 vp = viewMatrix * wp;
  vec4 clip = projectionMatrix * vp;
  vec2 ndc = clip.xy / clip.w; ndc = floor(ndc * uSnapRes + 0.5) / uSnapRes; clip.xy = ndc * clip.w;
  gl_Position = clip;
  gl_PointSize = max(1.0, uSize * 60.0 / max(-vp.z, 0.5));
  vA = smoothstep(0.0, 0.1, age / life) * (1.0 - smoothstep(0.7, 1.0, age / life));
}`;
const PFRAG = /* glsl */ `
uniform vec3 uColor; uniform float uOpacity;
varying float vA;
void main(){ gl_FragColor = vec4(uColor, vA * uOpacity); }`;

export interface ParticleOptions {
  count: number;
  box: [number, number, number];
  vel: [number, number, number];
  size: number;
  life: number;
  color: number;
  opacity?: number;
  swirl?: number;
  additive?: boolean;
  seed?: number;
}

export function particles(o: ParticleOptions) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(o.count * 3);
  const seed = new Float32Array(o.count * 4);
  let s = (o.seed ?? 1) * 9301 + 49297;
  const r = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < o.count; i++) {
    seed[i * 4] = r();
    seed[i * 4 + 1] = r();
    seed[i * 4 + 2] = r();
    seed[i * 4 + 3] = r();
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  const m = new THREE.ShaderMaterial({
    vertexShader: PVERT,
    fragmentShader: PFRAG,
    uniforms: {
      uTime: { value: 0 },
      uBox: { value: new THREE.Vector3(...o.box) },
      uVel: { value: new THREE.Vector3(...o.vel) },
      uSize: { value: o.size },
      uLife: { value: o.life },
      uSpread: { value: 0 },
      uSwirl: { value: o.swirl ?? 0 },
      uColor: { value: new THREE.Color(o.color) },
      uOpacity: { value: o.opacity ?? 1 },
      uSnapRes: GLOBAL.uSnapRes,
    },
    transparent: true,
    depthWrite: false,
    blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  return pts as THREE.Points & { material: THREE.ShaderMaterial };
}
