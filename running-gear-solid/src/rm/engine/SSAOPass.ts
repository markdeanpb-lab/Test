// Cheap ambient occlusion for the software renderer: quarter-resolution, 10-sample hemisphere
// SSAO on the main depth buffer (normals from depth), depth-aware blur, multiplied into HDR colour.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const AO_FRAG = /* glsl */ `
  #include <packing>
  uniform sampler2D tDepth; uniform mat4 uProj, uInvProj; uniform float uNear, uFar, uRadius; uniform vec2 uRes;
  varying vec2 vUv;
  float viewZ(vec2 uv) { return perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }
  vec3 viewPos(vec2 uv) {
    float z = viewZ(uv);
    vec4 c = uInvProj * vec4(uv * 2.0 - 1.0, 0.0, 1.0);
    vec3 dir = c.xyz / c.w;
    return dir * (z / dir.z);
  }
  void main() {
    float d = texture2D(tDepth, vUv).x;
    if (d >= 1.0) { gl_FragColor = vec4(1.0); return; }
    vec3 P = viewPos(vUv);
    vec2 px = 1.0 / uRes;
    vec3 Px = viewPos(vUv + vec2(px.x, 0.0)) - P, Py = viewPos(vUv + vec2(0.0, px.y)) - P;
    vec3 Px2 = P - viewPos(vUv - vec2(px.x, 0.0)), Py2 = P - viewPos(vUv - vec2(0.0, px.y));
    vec3 N = normalize(cross(abs(Px.z) < abs(Px2.z) ? Px : Px2, abs(Py.z) < abs(Py2.z) ? Py : Py2));
    // interleaved rotation
    vec2 ip = floor(mod(gl_FragCoord.xy, 4.0));
    float rot = (ip.x * 4.0 + ip.y) * 0.3926991;
    vec3 T = normalize(cross(N, abs(N.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 B = cross(N, T);
    float c = cos(rot), s = sin(rot);
    vec3 T2 = T * c + B * s, B2 = -T * s + B * c;
    float r = uRadius * clamp(-P.z / 6.0, 0.35, 4.0);
    float occ = 0.0;
    for (int i = 0; i < 10; i++) {
      float fi = float(i);
      float a = fi * 2.3999632, h = (fi + 0.5) / 10.0;
      float rad = sqrt(1.0 - h * h);
      vec3 k = vec3(cos(a) * rad, sin(a) * rad, h) * mix(0.2, 1.0, fract(fi * 0.618 + 0.31));
      vec3 S = P + (T2 * k.x + B2 * k.y + N * k.z) * r;
      vec4 q = uProj * vec4(S, 1.0);
      vec2 suv = q.xy / q.w * 0.5 + 0.5;
      float sz = viewZ(suv);
      float range = smoothstep(0.0, 1.0, r / max(abs(P.z - sz), 1e-3));
      occ += step(S.z + 0.03 * r, sz) * range;
    }
    float ao = 1.0 - occ / 10.0;
    gl_FragColor = vec4(ao, ao, ao, 1.0);
  }`;

const BLUR_FRAG = /* glsl */ `
  #include <packing>
  uniform sampler2D tAO; uniform sampler2D tDepth; uniform vec2 uDir; uniform float uNear, uFar;
  varying vec2 vUv;
  void main() {
    float z0 = perspectiveDepthToViewZ(texture2D(tDepth, vUv).x, uNear, uFar);
    float sum = 0.0, wsum = 0.0;
    for (int i = -3; i <= 3; i++) {
      vec2 uv = vUv + uDir * float(i);
      float z = perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar);
      float w = exp(-abs(z - z0) / (0.02 * abs(z0) + 0.05)) * (1.0 - abs(float(i)) / 4.5);
      sum += texture2D(tAO, uv).r * w; wsum += w;
    }
    gl_FragColor = vec4(vec3(sum / max(wsum, 1e-4)), 1.0);
  }`;

const COMP_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse; uniform sampler2D tAO; uniform float uStrength;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(tDiffuse, vUv);
    float ao = mix(1.0, texture2D(tAO, vUv).r, uStrength);
    gl_FragColor = vec4(c.rgb * ao, c.a);
  }`;

const VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class SSAOPass extends Pass {
  camera: THREE.PerspectiveCamera;
  depth: THREE.Texture | null = null;
  strength = 0.85;
  radius = 0.6;
  private rtA: THREE.WebGLRenderTarget;
  private rtB: THREE.WebGLRenderTarget;
  private ao: THREE.ShaderMaterial;
  private blur: THREE.ShaderMaterial;
  private comp: THREE.ShaderMaterial;
  private quad = new FullScreenQuad();
  private w: number;
  private h: number;

  constructor(camera: THREE.PerspectiveCamera, w: number, h: number) {
    super();
    this.camera = camera;
    this.w = Math.round(w / 2);
    this.h = Math.round(h / 2);
    const opt = { type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    this.rtA = new THREE.WebGLRenderTarget(this.w, this.h, opt);
    this.rtB = new THREE.WebGLRenderTarget(this.w, this.h, opt);
    this.ao = new THREE.ShaderMaterial({
      uniforms: { tDepth: { value: null }, uProj: { value: new THREE.Matrix4() }, uInvProj: { value: new THREE.Matrix4() }, uNear: { value: 0.1 }, uFar: { value: 1000 }, uRadius: { value: 0.6 }, uRes: { value: new THREE.Vector2(w, h) } },
      vertexShader: VERT,
      fragmentShader: AO_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.blur = new THREE.ShaderMaterial({
      uniforms: { tAO: { value: null }, tDepth: { value: null }, uDir: { value: new THREE.Vector2() }, uNear: { value: 0.1 }, uFar: { value: 1000 } },
      vertexShader: VERT,
      fragmentShader: BLUR_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.comp = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tAO: { value: null }, uStrength: { value: 0.85 } },
      vertexShader: VERT,
      fragmentShader: COMP_FRAG,
      depthTest: false,
      depthWrite: false,
    });
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    const cam = this.camera;
    const depth = this.depth ?? readBuffer.depthTexture;
    const u = this.ao.uniforms;
    u.tDepth.value = depth;
    u.uProj.value.copy(cam.projectionMatrix);
    u.uInvProj.value.copy(cam.projectionMatrixInverse);
    u.uNear.value = cam.near;
    u.uFar.value = cam.far;
    u.uRadius.value = this.radius;
    this.quad.material = this.ao;
    renderer.setRenderTarget(this.rtA);
    this.quad.render(renderer);
    const b = this.blur.uniforms;
    b.tDepth.value = depth;
    b.uNear.value = cam.near;
    b.uFar.value = cam.far;
    this.quad.material = this.blur;
    b.tAO.value = this.rtA.texture;
    b.uDir.value.set(1 / this.w, 0);
    renderer.setRenderTarget(this.rtB);
    this.quad.render(renderer);
    b.tAO.value = this.rtB.texture;
    b.uDir.value.set(0, 1 / this.h);
    renderer.setRenderTarget(this.rtA);
    this.quad.render(renderer);
    this.comp.uniforms.tDiffuse.value = readBuffer.texture;
    this.comp.uniforms.tAO.value = this.rtA.texture;
    this.comp.uniforms.uStrength.value = this.strength;
    this.quad.material = this.comp;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}
