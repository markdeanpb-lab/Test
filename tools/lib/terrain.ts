// Terrarium-encoded elevation tiles (AWS Terrain Tiles). height = R*256 + G + B/256 - 32768 (metres).
import fs from 'node:fs';
import { PNG } from 'pngjs';
const Z = 15, N = 2 ** Z;
const tiles = new Map<string, Float32Array>();
function tile(x: number, y: number): Float32Array | null {
  const key = `${x}_${y}`;
  if (tiles.has(key)) return tiles.get(key)!;
  const f = `data-raw/terrain/${Z}_${x}_${y}.png`;
  if (!fs.existsSync(f)) { tiles.set(key, null as any); return null; }
  const png = PNG.sync.read(fs.readFileSync(f));
  const h = new Float32Array(256 * 256);
  for (let i = 0; i < 256 * 256; i++) h[i] = png.data[i * 4] * 256 + png.data[i * 4 + 1] + png.data[i * 4 + 2] / 256 - 32768;
  tiles.set(key, h);
  return h;
}
function px(lat: number, lon: number) {
  const fx = ((lon + 180) / 360) * N * 256;
  const fy = ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * N * 256;
  return [fx, fy];
}
function sample(ix: number, iy: number) {
  const t = tile(Math.floor(ix / 256), Math.floor(iy / 256));
  if (!t) return NaN;
  return t[(iy & 255) * 256 + (ix & 255)];
}
/** Bilinear raw elevation (SRTM-derived surface model; includes some building/tree noise). */
export function elevationRaw(lat: number, lon: number): number {
  const [fx, fy] = px(lat, lon);
  const x0 = Math.floor(fx - 0.5), y0 = Math.floor(fy - 0.5);
  const tx = fx - 0.5 - x0, ty = fy - 0.5 - y0;
  const a = sample(x0, y0), b = sample(x0 + 1, y0), c = sample(x0, y0 + 1), d = sample(x0 + 1, y0 + 1);
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}
