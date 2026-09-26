import { loadOsmDir } from './lib/osm';
import { project } from './lib/geo';
import { renderHtmlToPng } from './lib/shot';
const d = await loadOsmDir('data-raw/osm');
const DRIVE = new Set(['trunk','primary','primary_link','secondary','secondary_link','tertiary','tertiary_link','unclassified','residential','living_street']);
const [cx0, cx1, cz0, cz1] = [+(process.argv[2] ?? -1400), +(process.argv[3] ?? 1400), +(process.argv[4] ?? -1300), +(process.argv[5] ?? 1300)];
const W = 1600, H = Math.round(W * (cz1 - cz0) / (cx1 - cx0));
const sx = (x: number) => ((x - cx0) / (cx1 - cx0)) * W, sz = (z: number) => ((z - cz0) / (cz1 - cz0)) * H;
let paths = '', labels = '';
const labelled = new Set<string>();
for (const w of d.ways.values()) {
  const h = w.tags.highway; if (!h) continue;
  const pts = w.nodes.map((id) => d.nodes.get(id)).filter(Boolean).map((n) => project(n!.lat, n!.lon));
  if (pts.length < 2) continue;
  const drive = DRIVE.has(h);
  const col = h === 'primary' || h === 'trunk' ? '#d33' : h.startsWith('secondary') ? '#e80' : h.startsWith('tertiary') ? '#cb0' : drive ? '#444' : h === 'pedestrian' ? '#39f' : '#bbb';
  const sw = h === 'primary' ? 3 : drive ? 1.6 : 0.6;
  paths += `<polyline fill="none" stroke="${col}" stroke-width="${sw}" points="${pts.map(([x, z]) => sx(x).toFixed(1) + ',' + sz(z).toFixed(1)).join(' ')}"/>`;
  if (w.tags.name && (drive || h === 'pedestrian') && !labelled.has(w.tags.name) && pts.length > 1) {
    const m = pts[Math.floor(pts.length / 2)];
    if (sx(m[0]) > 0 && sx(m[0]) < W && sz(m[1]) > 0 && sz(m[1]) < H) { labelled.add(w.tags.name); labels += `<text x="${sx(m[0]).toFixed(0)}" y="${sz(m[1]).toFixed(0)}" font-size="${h==='residential'?9:11}" fill="#003">${w.tags.name}</text>`; }
  }
}
for (const w of d.ways.values()) {
  const t = w.tags; if (!(t.name === 'St Albans Cathedral' || t.name === 'The Clock Tower' || t.natural === 'water')) continue;
  const pts = w.nodes.map((id) => d.nodes.get(id)).filter(Boolean).map((n) => project(n!.lat, n!.lon));
  paths += `<polygon fill="${t.natural ? '#6af' : '#a0a'}" points="${pts.map(([x, z]) => sx(x).toFixed(1) + ',' + sz(z).toFixed(1)).join(' ')}"/>`;
}
const html = `<html><body style="margin:0;background:#fff"><svg width="${W}" height="${H}" font-family="sans-serif">${paths}${labels}</svg></body></html>`;
await renderHtmlToPng(html, process.argv[6] ?? 'data-raw/roads.png', W, H);
console.log('ok', W, H);
