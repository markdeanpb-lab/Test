// Offline renderer for RUNNING GEAR SOLID: REMASTERED.
// Steps the film at exact timestamps in headless Chromium (SwiftShader WebGL2), streams raw
// 1920x1080 RGB into FFmpeg per worker slice, joins the segments, synthesises the score from
// the film's own cue list and muxes output/running-gear-solid.mp4.
//
//   node scripts/rm-render.mjs [--workers N] [--from S] [--to S] [--only sceneprefix] [--out f.mp4] [--noaudio]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { ROOT, startServer, openFilm } from './lib/browser.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes('--' + n) ? args[args.indexOf('--' + n) + 1] : d);
const flag = (n) => args.includes('--' + n);
const OUT = path.join(ROOT, 'output');
fs.mkdirSync(OUT, { recursive: true });
const outFile = path.resolve(ROOT, opt('out', 'output/running-gear-solid.mp4'));
const workers = Math.max(1, Number(opt('workers', Math.max(1, os.cpus().length - 1))));
const only = opt('only', '');
const W = 1920, H = 1080;
const page = 'remaster.html' + (only ? `?only=${only}&x=` : '');

function run(bin, argv, stdin = false) {
  const p = spawn(bin, argv, { stdio: [stdin ? 'pipe' : 'ignore', 'ignore', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => (err = (err + d).slice(-4000)));
  const done = new Promise((res, rej) => p.on('close', (c) => (c === 0 ? res() : rej(new Error(`${path.basename(bin)} exited ${c}\n${err}`)))));
  return { p, done };
}
const write = (s, b) => new Promise((res) => (s.write(b) ? res() : s.once('drain', res)));

const { server, url } = await startServer();
const probe = await openFilm(url + page);
const meta = await probe.page.evaluate(() => ({ duration: window.RGS.duration, fps: window.RGS.fps, cues: window.RGS.cues(), chapters: window.RGS.chapters() }));
await probe.browser.close();
fs.writeFileSync(path.join(OUT, 'cues.json'), JSON.stringify({ duration: meta.duration, fps: meta.fps, cues: meta.cues, chapters: meta.chapters }, null, 1));
const FPS = meta.fps;
const from = Number(opt('from', 0));
const to = Math.min(meta.duration, Number(opt('to', meta.duration)));
const f0 = Math.round(from * FPS), f1 = Math.round(to * FPS), total = f1 - f0;
console.log(`REMASTER: ${meta.duration.toFixed(1)} s film; frames ${f0}..${f1 - 1} (${total}) @ ${FPS} fps, ${workers} worker(s)`);

// Slices are interleaved in blocks so workers share the load of heavy and light scenes,
// but each block is contiguous (scene loads amortise).
const BLOCK = Math.max(24, Math.ceil(total / (workers * 6)));
const blocks = [];
for (let a = f0, k = 0; a < f1; a += BLOCK, k++) blocks.push({ k, a, b: Math.min(f1, a + BLOCK) });
const started = Date.now();
let done = 0;
const X264 = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p'];

async function worker(w) {
  const film = await openFilm(url + page);
  for (;;) {
    const blk = blocks.find((b) => !b.taken);
    if (!blk) break;
    blk.taken = true;
    const seg = path.join(OUT, `rmseg_${String(blk.k).padStart(4, '0')}.mp4`);
    const enc = run(ffmpegPath, ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-framerate', String(FPS), '-i', '-', '-vf', 'vflip', ...X264, '-r', String(FPS), seg], true);
    for (let f = blk.a; f < blk.b; f++) {
      const b64 = await film.page.evaluate(async (t) => {
        await window.RGS.renderFrame(t);
        return window.RGS.pixels();
      }, f / FPS);
      await write(enc.p.stdin, Buffer.from(b64, 'base64'));
      done++;
      if (done % 48 === 0 || done === total) {
        const el = (Date.now() - started) / 1000;
        console.log(`  ${done}/${total}  ${(done / el).toFixed(2)} fps  eta ${Math.round(((el / done) * (total - done)) / 60)} min`);
      }
    }
    enc.p.stdin.end();
    await enc.done;
    blk.seg = seg;
  }
  const errs = film.errors.filter((e) => !/404/.test(e));
  if (errs.length) console.warn(`worker ${w} page errors:\n` + errs.slice(0, 10).join('\n'));
  await film.browser.close();
}
await Promise.all(Array.from({ length: workers }, (_, w) => worker(w)));
await server.close();

// audio
const wav = path.join(OUT, 'rm-audio.wav');
if (!flag('noaudio')) {
  const r = spawnSync('npx', ['tsx', path.join(ROOT, 'scripts', 'rm-audio.ts')], { stdio: 'inherit', cwd: ROOT });
  if (r.status !== 0) console.warn('audio synthesis failed');
}
const list = path.join(OUT, 'rmsegs.txt');
fs.writeFileSync(list, blocks.map((b) => `file '${path.basename(b.seg)}'`).join('\n') + '\n');
const hasAudio = !flag('noaudio') && fs.existsSync(wav);
const aIn = hasAudio ? ['-ss', String(from), '-t', String(total / FPS), '-i', wav] : [];
await run(ffmpegPath, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, ...aIn, '-map', '0:v', ...(hasAudio ? ['-map', '1:a', '-c:a', 'aac', '-b:a', '224k', '-shortest'] : []), '-c:v', 'copy', '-movflags', '+faststart', outFile]).done;
for (const b of blocks) fs.rmSync(b.seg, { force: true });
fs.rmSync(list, { force: true });
console.log(`wrote ${path.relative(ROOT, outFile)} in ${((Date.now() - started) / 60000).toFixed(1)} min`);
