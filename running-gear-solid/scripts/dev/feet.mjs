// Foot-slide check: node scripts/dev/feet.mjs "rm.html?...&v=4"
import { startServer, openFilm } from '../lib/browser.mjs';
const { server, url } = await startServer();
const { browser, page } = await openFilm(url + process.argv[2] + '&x=');
const rows = await page.evaluate(() => { const o = []; for (let i = 0; i < 72; i++) o.push(window.RGS.feet(1 + i / 120)); return o; });
let slide = 0, n = 0;
for (let i = 1; i < rows.length; i++) {
  for (const k of [0, 3]) {
    const a = rows[i - 1], b = rows[i];
    const low = Math.min(a[k + 1], b[k + 1]);
    const ground = Math.min(...rows.map((r) => r[k + 1]));
    if (low < ground + 0.03) { slide += Math.hypot(b[k] - a[k], b[k + 2] - a[k + 2]) * 120; n++; }
  }
}
console.log('stance frames', n, 'mean foot speed in stance (m/s)', (slide / n).toFixed(2), 'ankle min y above root', Math.min(...rows.map((r) => r[1])));
await browser.close(); await server.close();
