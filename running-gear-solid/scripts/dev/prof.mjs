// Per-pass frame timing at film times: node scripts/dev/prof.mjs <t> [t ...]
import { startServer, openFilm } from '../lib/browser.mjs';
const ts = process.argv.slice(2).map(Number);
const { server, url } = await startServer();
const film = await openFilm(url + 'remaster.html' + (process.env.QS ? '?' + process.env.QS + '&x=' : ''));
for (const t of ts) {
  await film.page.evaluate((tt) => window.RGS.profile(tt), t); // warm (scene load)
  const a = Date.now();
  await film.page.evaluate(async (tt) => { await window.RGS.renderFrame(tt + 0.5); return window.RGS.pixels().length; }, t);
  const frame = Date.now() - a;
  const p = await film.page.evaluate((tt) => window.RGS.profile(tt + 1), t);
  if (process.env.STATS) console.log(JSON.stringify(await film.page.evaluate(() => window.RGS.stats())));
  console.log(`t=${t} frame+pixels ${frame} ms`, JSON.stringify(p));
}
await film.browser.close();
await server.close();
