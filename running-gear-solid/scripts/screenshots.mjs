// Capture review stills: node scripts/screenshots.mjs 1.5 12 40 ...   (seconds)
// With no args, captures a default set of key moments.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, startServer, openFilm, grab } from './lib/browser.mjs';

const outDir = path.join(ROOT, 'output', 'review');
fs.mkdirSync(outDir, { recursive: true });
let times = process.argv.slice(2).map(Number).filter((n) => !Number.isNaN(n));

const { server, url } = await startServer();
const { browser, page, canvas, info, errors } = await openFilm(url);
if (!times.length) {
  times = [];
  for (let t = 1; t < info.duration; t += 6) times.push(t);
}
for (const t of times) {
  const t0 = Date.now();
  const png = await grab(page, canvas, t);
  const name = `t_${t.toFixed(2).padStart(7, '0')}.png`;
  fs.writeFileSync(path.join(outDir, name), png);
  console.log(`${name}  ${Date.now() - t0}ms`);
}
if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
await browser.close();
await server.close();
