// Render test-bench frames: node scripts/dev/shot.mjs <name> "<page?query>" [t ...]
// Writes output/review/<name>_<t>.png (1920x1080) and prints timing + page info.
import fs from 'node:fs';
import path from 'node:path';
import { startServer, openFilm, ROOT } from '../lib/browser.mjs';
const [name, q, ...ts] = process.argv.slice(2);
const times = ts.length ? ts.map(Number) : [0.5];
const { server, url } = await startServer();
const t0 = Date.now();
let film;
try {
  film = await openFilm(url + q + (q.includes('?') ? '&x=' : '?x='), { width: 960, height: 540 });
} catch (e) {
  console.error(String(e).slice(0, 4000));
  await server.close();
  process.exit(1);
}
const { browser, page, errors } = film;
console.log('loaded in', Date.now() - t0, 'ms', JSON.stringify(await page.evaluate(() => window.RGS.info ?? {})));
if (process.env.DUMP) console.log(JSON.stringify(await page.evaluate((k) => window[k], process.env.DUMP)));
fs.mkdirSync(path.join(ROOT, 'output', 'review'), { recursive: true });
for (const t of times) {
  const a = Date.now();
  const ret = await page.evaluate(async (tt) => {
    const r = await window.RGS.renderFrame(tt);
    const gl = document.getElementById('film').getContext('webgl2');
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    return r;
  }, t);
  if (process.env.RET) console.log(ret);
  const ms = Date.now() - a;
  if (process.env.NOSAVE) { console.log(`t=${t} ${ms} ms`); continue; }
  const png = await page.$eval('#film', (c) => c.toDataURL('image/png'));
  const f = path.join(ROOT, 'output', 'review', `${name}_${t}.png`);
  fs.writeFileSync(f, Buffer.from(png.split(',')[1], 'base64'));
  console.log(`t=${t} ${ms} ms -> ${path.relative(ROOT, f)}`);
}
if (process.env.DUMP) console.log("DUMP", JSON.stringify(await page.evaluate((k) => window[k], process.env.DUMP)));
const real = errors.filter((e) => !/404/.test(e));
if (real.length) console.log('ERRORS:\n' + real.slice(0, 20).join('\n'));
await browser.close();
await server.close();
