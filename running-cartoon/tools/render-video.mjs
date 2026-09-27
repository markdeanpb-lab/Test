// Renders the film to an MP4 (1080p, 30 fps, with the score) by stepping the page frame by frame in
// headless Chromium and piping the raw pixels to ffmpeg.
//
//   node tools/render-video.mjs                       -> output/the-long-run.mp4
//   node tools/render-video.mjs --out my.mp4 --fps 30 --scale 4 --crf 24 --abr 192k
//   node tools/render-video.mjs --sheet 3,20,41 --out sheet.png   (contact sheet of stills at those seconds)
//   node tools/render-video.mjs --sheet shots:10-21 --at 0.6      (one still per shot, 60% of the way in)
//
// Needs Playwright (playwright or playwright-core) with Chromium, and an ffmpeg with libx264 + aac:
// set FFMPEG=/path/to/ffmpeg if it is not on PATH (`pip install imageio-ffmpeg` ships one).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; };
const fps = Number(arg('fps', 30));
const scale = Number(arg('scale', 4));
const crf = String(arg('crf', 24));
const abr = String(arg('abr', '192k'));
const sheet = arg('sheet', null);
const out = path.resolve(arg('out', path.join(root, sheet ? 'output/sheet.png' : 'output/the-long-run.mp4')));

const require = createRequire(import.meta.url);
let pw = null;
const globalRoot = (() => { try { return execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } })();
for (const m of ['playwright-core', 'playwright', path.join(globalRoot, 'playwright'), path.join(globalRoot, 'playwright-core')]) {
  try { pw = require(m); break; } catch { /* try the next one */ }
}
if (!pw) throw new Error('Playwright not found: npm i -D playwright-core (or install playwright globally).');
const ffmpeg = process.env.FFMPEG || 'ffmpeg';

const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await pw.chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// the page's web fonts are not needed for rendering the canvas
await page.route(/^https?:/, (r) => r.abort());
await page.goto(pathToFileURL(path.join(root, 'index.html')).href + '?render=1');
await page.waitForFunction(() => window.RENDER, null, { timeout: 30000 });
if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
const { duration, W, H } = await page.evaluate(() => ({ duration: RENDER.duration, W: RENDER.W, H: RENDER.H }));

function run(args, input) {
  const p = spawn(ffmpeg, args, { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => p.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))));
  return { p, done, input };
}
const write = (stream, buf) => new Promise((res) => { if (stream.write(buf)) res(); else stream.once('drain', res); });

if (sheet) {
  let times = sheet.split(',').map(Number);
  const m = /^shots:(\d+)-(\d+)$/.exec(sheet);
  if (m) {
    const at = Number(arg('at', 0.6));
    const shots = await page.evaluate(() => RENDER.shots);
    times = shots.slice(Number(m[1]), Number(m[2]) + 1).map(([start, d]) => start + d * at);
  }
  const cols = Math.min(3, times.length), rows = Math.ceil(times.length / cols);
  const job = run(['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', '1', '-i', 'pipe:0',
    '-vf', `tile=${cols}x${rows}:padding=4:color=white`, '-frames:v', '1', out]);
  for (const t of times) {
    const b64 = await page.evaluate(([t]) => RENDER.frames(t * 1000, 1, 1000), [t]);
    await write(job.p.stdin, Buffer.from(b64, 'base64'));
  }
  for (let k = times.length; k < cols * rows; k++) await write(job.p.stdin, Buffer.alloc(W * H * 4, 255));
  job.p.stdin.end();
  await job.done;
  console.log(`wrote ${out}`);
  await browser.close();
  process.exit(0);
}

// audio first (OfflineAudioContext inside the page)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'longrun-'));
const wav = path.join(tmp, 'audio.wav');
const info = await page.evaluate(() => RENDER.renderAudio(44100));
const CH = 4 * 1024 * 1024;
const fd = fs.openSync(wav, 'w');
for (let i = 0; i * CH < info.bytes; i++) fs.writeSync(fd, Buffer.from(await page.evaluate(([i, s]) => RENDER.audioChunk(i, s), [i, CH]), 'base64'));
fs.closeSync(fd);
console.log(`audio: ${(info.bytes / 1e6).toFixed(1)} MB, peak ${info.peak.toFixed(2)}`);

const total = Math.ceil(duration * fps);
fs.mkdirSync(path.dirname(out), { recursive: true });
const job = run(['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps), '-i', 'pipe:0', '-i', wav,
  '-vf', `scale=${W * scale}:${H * scale}:flags=neighbor`, '-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-tune', 'animation',
  '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', abr, '-movflags', '+faststart', '-shortest', out]);
const batch = 30;
const t0 = Date.now();
for (let f = 0; f < total; f += batch) {
  const n = Math.min(batch, total - f);
  const b64 = await page.evaluate(([f, n, fps]) => RENDER.frames(f, n, fps), [f, n, fps]);
  await write(job.p.stdin, Buffer.from(b64, 'base64'));
  if ((f / batch) % 20 === 0) process.stdout.write(`\rframes ${f}/${total} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
job.p.stdin.end();
await job.done;
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\nwrote ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB, ${duration.toFixed(1)} s, ${total} frames)`);
