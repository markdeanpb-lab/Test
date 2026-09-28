// Render the remaster chapter by chapter (so a fix only re-renders one part), then assemble.
//   node scripts/rm-parts.mjs [--workers N] [--only PART_PREFIX] [--force] [--assemble-only]
// Parts: output/parts/NN-<chapter>.mp4 (video only). Final: output/running-gear-solid.mp4
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { ROOT } from './lib/browser.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : d);
const flag = (n) => args.includes('--' + n);
const OUT = path.join(ROOT, 'output');
const PARTS = path.join(OUT, 'parts');
fs.mkdirSync(PARTS, { recursive: true });

// 1. cue list + chapter timing straight from the film
spawnSync('node', [path.join(ROOT, 'scripts', 'dev', 'cues.mjs')], { stdio: 'inherit', cwd: ROOT });
const meta = JSON.parse(fs.readFileSync(path.join(OUT, 'cues.json'), 'utf8'));
const parts = [];
for (const c of meta.chapters) {
  if (c.chapter && (!parts.length || parts[parts.length - 1].name !== c.chapter)) parts.push({ name: c.chapter, start: c.start });
}
parts.forEach((p, i) => {
  p.end = i + 1 < parts.length ? parts[i + 1].start : meta.duration;
  p.file = path.join(PARTS, `${String(i).padStart(2, '0')}-${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.mp4`);
});

// 2. render missing parts
if (!flag('assemble-only')) {
  for (const p of parts) {
    const base = path.basename(p.file);
    if (opt('only', '') && !base.startsWith(opt('only', ''))) continue;
    if (fs.existsSync(p.file) && !flag('force')) {
      console.log('skip', base);
      continue;
    }
    console.log(`\n== ${base}: ${p.start.toFixed(2)} - ${p.end.toFixed(2)} s`);
    const r = spawnSync('node', [path.join(ROOT, 'scripts', 'rm-render.mjs'), '--workers', opt('workers', '2'), '--from', String(p.start), '--to', String(p.end), '--noaudio', '--out', p.file], { stdio: 'inherit', cwd: ROOT });
    if (r.status !== 0) {
      console.error('part failed', base);
      process.exit(1);
    }
  }
}

// 3. audio + assemble
const missing = parts.filter((p) => !fs.existsSync(p.file));
if (missing.length) {
  console.log('not assembling; missing parts:', missing.map((p) => path.basename(p.file)).join(', '));
  process.exit(0);
}
spawnSync('npx', ['tsx', path.join(ROOT, 'scripts', 'rm-audio.ts')], { stdio: 'inherit', cwd: ROOT });
const list = path.join(PARTS, 'list.txt');
fs.writeFileSync(list, parts.map((p) => `file '${path.basename(p.file)}'`).join('\n') + '\n');
const final = path.join(OUT, 'running-gear-solid.mp4');
await new Promise((res, rej) => {
  const p = spawn(ffmpegPath, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-i', path.join(OUT, 'rm-audio.wav'), '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '224k', '-shortest', '-movflags', '+faststart', final], { stdio: 'inherit' });
  p.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg ' + c))));
});
console.log('wrote', path.relative(ROOT, final));
