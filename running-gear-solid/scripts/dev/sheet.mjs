// Contact sheet: node scripts/dev/sheet.mjs <only-prefix> [per-scene=3] [name]
// Renders frames at evenly spaced points of each scene and tiles them (with labels) into
// output/review/sheet_<name>.jpg via Python/Pillow.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { startServer, openFilm, ROOT } from '../lib/browser.mjs';
const [only = '', perArg = '3', nameArg] = process.argv.slice(2);
const per = Number(perArg);
const name = nameArg ?? (only || 'all');
const { server, url } = await startServer();
const film = await openFilm(url + 'remaster.html' + (only ? `?only=${only}&x=` : ''));
const chapters = await film.page.evaluate(() => window.RGS.chapters());
const dir = path.join(ROOT, 'output', 'review', 'sheet_' + name);
fs.mkdirSync(dir, { recursive: true });
const items = [];
for (const c of chapters) {
  for (let k = 0; k < per; k++) {
    const T = c.start + c.dur * ((k + 0.5) / per);
    const a = Date.now();
    const png = await film.page.evaluate(async (t) => {
      await window.RGS.renderFrame(t);
      return document.getElementById('film').toDataURL('image/jpeg', 0.85);
    }, T);
    const f = path.join(dir, `${String(items.length).padStart(3, '0')}.jpg`);
    fs.writeFileSync(f, Buffer.from(png.split(',')[1], 'base64'));
    items.push({ f, label: `${c.id} @${(T - c.start).toFixed(1)}s (T=${T.toFixed(1)})`, ms: Date.now() - a });
  }
}
const errs = film.errors.filter((e) => !/404/.test(e));
if (errs.length) console.log('ERRORS:\n' + errs.slice(0, 10).join('\n'));
await film.browser.close();
await server.close();
fs.writeFileSync(path.join(dir, 'items.json'), JSON.stringify(items));
const py = `
import json,sys
from PIL import Image, ImageDraw
items=json.load(open('${dir}/items.json'))
cols=3; W=640; H=360
rows=(len(items)+cols-1)//cols
s=Image.new('RGB',(cols*W,rows*(H+18)),(20,20,20)); d=ImageDraw.Draw(s)
for i,it in enumerate(items):
    im=Image.open(it['f']).convert('RGB').resize((W,H)); x=(i%cols)*W; y=(i//cols)*(H+18)
    s.paste(im,(x,y)); d.text((x+4,y+H+3),it['label']+'  '+str(it['ms'])+'ms',fill=(255,255,0))
s.save('${path.join(ROOT, 'output', 'review', 'sheet_' + name + '.jpg')}',quality=82)
`;
spawnSync('python3', ['-c', py], { stdio: 'inherit' });
console.log(chapters.map((c) => `${c.id} ${c.start}+${c.dur}`).join('\n'));
console.log('sheet: output/review/sheet_' + name + '.jpg');
