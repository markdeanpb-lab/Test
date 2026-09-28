import fs from 'node:fs';
import { startServer, openFilm } from '../lib/browser.mjs';
const page_ = process.argv[2] || 'proto.html';
const times = process.argv.slice(3).map(Number);
const { server, url } = await startServer();
const { browser, page, errors } = await openFilm(url + page_, { width: 960, height: 540 });
for (const t of times.length ? times : [0.2, 0.5]) {
  const t0 = Date.now();
  await page.evaluate((tt) => { window.RGS.renderFrame(tt); const c = document.getElementById('film'); const gl = c.getContext('webgl2'); const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }, t);
  const ms = Date.now() - t0;
  const png = await page.$eval('#film', (c) => c.toDataURL('image/png'));
  fs.writeFileSync(`/home/user/Test/running-gear-solid/output/review/proto_${t}.png`, Buffer.from(png.split(',')[1], 'base64'));
  console.log('t', t, ms, 'ms');
}
console.log(errors.filter(e=>!/404/.test(e)).join('\n'));
await browser.close(); await server.close();
