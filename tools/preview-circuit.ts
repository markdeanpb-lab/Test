// Renders a circuit variant over mapped buildings for visual inspection: tsx tools/preview-circuit.ts <layoutId> [out.png]
import fs from 'node:fs';
import { renderHtmlToPng } from './lib/shot';
const id = process.argv[2];
const C = JSON.parse(fs.readFileSync('src/data/circuits.json', 'utf8')).layouts.find((l: any) => l.id === id);
const city = JSON.parse(fs.readFileSync('public/data/stalbans-city.json', 'utf8'));
const pad = 120;
const x0 = Math.min(...C.x) - pad, x1 = Math.max(...C.x) + pad, z0 = Math.min(...C.z) - pad, z1 = Math.max(...C.z) + pad;
const W = 1400, H = Math.round((W * (z1 - z0)) / (x1 - x0));
const sx = (x: number) => (((x - x0) / (x1 - x0)) * W).toFixed(1), sz = (z: number) => (((z - z0) / (z1 - z0)) * H).toFixed(1);
let svg = '';
for (const b of city.buildings) { const pts = []; for (let i = 3; i < b.length; i += 2) pts.push(sx(b[i] / 10) + ',' + sz(b[i + 1] / 10)); svg += `<polygon points="${pts.join(' ')}" fill="#bbb"/>`; }
for (const r of city.roads) { if (r[0] > 7) continue; const pts = []; for (let i = 4; i < r.length; i += 2) pts.push(sx(r[i] / 10) + ',' + sz(r[i + 1] / 10)); svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="#fff" stroke-width="${(r[1] / 10) * (W / (x1 - x0))}" stroke-opacity="0.8"/>`; }
const tr = C.x.map((x: number, i: number) => sx(x) + ',' + sz(C.z[i])).join(' ');
svg += `<polygon points="${tr}" fill="none" stroke="#e33" stroke-width="2"/>`;
const rl = C.x.map((x: number, i: number) => { const a = (i - 1 + C.x.length) % C.x.length, b = (i + 1) % C.x.length; const dx = C.x[b] - C.x[a], dz = C.z[b] - C.z[a], L = Math.hypot(dx, dz); return sx(x + (-dz / L) * C.rl[i]) + ',' + sz(C.z[i] + (dx / L) * C.rl[i]); }).join(' ');
svg += `<polygon points="${rl}" fill="none" stroke="#06c" stroke-width="1.2" stroke-dasharray="4 3"/>`;
svg += `<polyline points="${C.pit.path.map((p: number[]) => sx(p[0]) + ',' + sz(p[1])).join(' ')}" fill="none" stroke="#f90" stroke-width="3"/>`;
svg += `<circle cx="${sx(C.x[0])}" cy="${sz(C.z[0])}" r="6" fill="#000"/>`;
for (const c of C.corners) { const i = Math.round(c.sApex / C.spacing) % C.x.length; svg += `<text x="${sx(C.x[i])}" y="${sz(C.z[i])}" font-size="13" fill="#003" font-family="sans-serif">${c.name}</text>`; }
for (const l of city.landmarks) svg += `<text x="${sx(l.x)}" y="${sz(l.z)}" font-size="11" fill="#909" font-family="sans-serif">★${l.name}</text>`;
await renderHtmlToPng(`<html><body style="margin:0;background:#eee"><svg width="${W}" height="${H}">${svg}</svg></body></html>`, process.argv[3] ?? `data-raw/circuit-${id}.png`, W, H);
console.log('ok');
