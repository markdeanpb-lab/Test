// Dump the film's cue list + chapter timing to output/cues.json (for the audio synth).
import fs from 'node:fs';
import path from 'node:path';
import { startServer, openFilm, ROOT } from '../lib/browser.mjs';
const { server, url } = await startServer();
const film = await openFilm(url + 'remaster.html');
const meta = await film.page.evaluate(() => ({ duration: window.RGS.duration, fps: window.RGS.fps, cues: window.RGS.cues(), chapters: window.RGS.chapters() }));
fs.writeFileSync(path.join(ROOT, 'output', 'cues.json'), JSON.stringify(meta, null, 1));
let last = '';
for (const c of meta.chapters) if (c.chapter && c.chapter !== last) { console.log(`${(c.start / 60).toFixed(2)} min  ${c.chapter}`); last = c.chapter; }
console.log('duration', meta.duration.toFixed(1), 's =', (meta.duration / 60).toFixed(2), 'min;', meta.chapters.length, 'scenes;', meta.cues.length, 'cues');
await film.browser.close();
await server.close();
