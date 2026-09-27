// Offline renderer: steps the film at exact timestamps in headless Chromium and
// encodes output/running-gear-solid.mp4 (1920x1080, 60 fps, H.264 + AAC).
//
//   node scripts/render.mjs [--workers N] [--from S] [--to S] [--frames] [--out file.mp4]
//
// Default ("pipe" mode): each worker renders a contiguous slice of frames and
// streams raw 960x540 RGB straight into its own FFmpeg, which upscales x2 with
// nearest-neighbour (keeps the PS1 pixels crisp) into an H.264 segment; the
// segments are then joined losslessly and muxed with output/audio.wav.
// --frames: save every frame as output/frames/f_XXXXXX.png first, then encode
// from the image sequence (slower, needs ~6 GB of disk for the full film).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { ROOT, startServer, openFilm, grab } from './lib/browser.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
};
const flag = (name) => args.includes('--' + name);

const OUT_DIR = path.join(ROOT, 'output');
const outFile = path.resolve(ROOT, opt('out', path.join('output', 'running-gear-solid.mp4')));
const workers = Math.max(1, Number(opt('workers', Math.max(1, os.cpus().length - 1))));
const W = 960, H = 540;
fs.mkdirSync(OUT_DIR, { recursive: true });

function run(bin, argv, { stdin = false } = {}) {
  const p = spawn(bin, argv, { stdio: [stdin ? 'pipe' : 'ignore', 'ignore', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => (err = (err + d).slice(-4000)));
  const done = new Promise((res, rej) => p.on('close', (code) => (code === 0 ? res() : rej(new Error(`${path.basename(bin)} exited ${code}\n${err}`)))));
  return { p, done };
}

const write = (stream, buf) => new Promise((res) => (stream.write(buf) ? res() : stream.once('drain', res)));

const { server, url } = await startServer();
const probe = await openFilm(url);
const FPS = probe.info.fps;
const DURATION = probe.info.duration;
await probe.browser.close();

const from = Number(opt('from', 0));
const to = Math.min(DURATION, Number(opt('to', DURATION)));
const f0 = Math.round(from * FPS);
const f1 = Math.round(to * FPS);
const total = f1 - f0;
console.log(`RUNNING GEAR SOLID: frames ${f0}..${f1 - 1} (${total}) @ ${FPS} fps, ${workers} worker(s), mode ${flag('frames') ? 'frames' : 'pipe'}`);

const started = Date.now();
let rendered = 0;
const progress = () => {
  rendered++;
  if (rendered % 120 === 0 || rendered === total) {
    const el = (Date.now() - started) / 1000;
    const eta = (el / rendered) * (total - rendered);
    console.log(`  ${rendered}/${total}  ${(rendered / el).toFixed(1)} fps  eta ${Math.round(eta / 60)} min`);
  }
};

const slices = [];
const per = Math.ceil(total / workers);
for (let w = 0; w < workers; w++) {
  const a = f0 + w * per, b = Math.min(f1, a + per);
  if (b > a) slices.push({ w, a, b });
}

const X264 = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-tune', 'animation'];

async function worker({ w, a, b }) {
  const film = await openFilm(url);
  const { page, canvas, errors } = film;
  if (flag('frames')) {
    const dir = path.join(OUT_DIR, 'frames');
    fs.mkdirSync(dir, { recursive: true });
    for (let f = a; f < b; f++) {
      const png = await grab(page, canvas, f / FPS);
      fs.writeFileSync(path.join(dir, `f_${String(f).padStart(6, '0')}.png`), png);
      progress();
    }
  } else {
    const seg = path.join(OUT_DIR, `segment_${w}.mp4`);
    const enc = run(ffmpegPath, ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-framerate', String(FPS), '-i', '-', '-vf', 'vflip,scale=1920:1080:flags=neighbor', ...X264, '-r', String(FPS), seg], { stdin: true });
    for (let f = a; f < b; f++) {
      const b64 = await page.evaluate((t) => {
        window.RGS.renderFrame(t);
        return window.RGS.pixels();
      }, f / FPS);
      await write(enc.p.stdin, Buffer.from(b64, 'base64'));
      progress();
    }
    enc.p.stdin.end();
    await enc.done;
  }
  const real = errors.filter((e) => !/404/.test(e));
  if (real.length) console.warn(`worker ${w} page errors:\n` + real.join('\n'));
  await film.browser.close();
}

await Promise.all(slices.map(worker));
await server.close();

const audio = path.join(OUT_DIR, 'audio.wav');
const hasAudio = fs.existsSync(audio);
const audioArgs = hasAudio ? ['-ss', String(from), '-t', String(total / FPS), '-i', audio] : [];
const AAC = hasAudio ? ['-c:a', 'aac', '-b:a', '192k', '-shortest'] : [];

if (flag('frames')) {
  const seq = path.join(OUT_DIR, 'frames', 'f_%06d.png');
  await run(ffmpegPath, ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-start_number', String(f0), '-i', seq, ...audioArgs, '-vf', 'scale=1920:1080:flags=neighbor', ...X264, ...AAC, '-movflags', '+faststart', outFile]).done;
} else {
  const list = path.join(OUT_DIR, 'segments.txt');
  fs.writeFileSync(list, slices.map(({ w }) => `file 'segment_${w}.mp4'`).join('\n') + '\n');
  await run(ffmpegPath, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, ...audioArgs, '-map', '0:v', ...(hasAudio ? ['-map', '1:a'] : []), '-c:v', 'copy', ...AAC, '-movflags', '+faststart', outFile]).done;
  for (const { w } of slices) fs.rmSync(path.join(OUT_DIR, `segment_${w}.mp4`), { force: true });
  fs.rmSync(list, { force: true });
}
const mins = ((Date.now() - started) / 60000).toFixed(1);
console.log(`wrote ${path.relative(ROOT, outFile)} in ${mins} min${hasAudio ? '' : ' (no audio.wav found - run npm run audio)'}`);
