// Shared helpers: start a Vite server for the project and open the film page
// in headless Chromium (SwiftShader WebGL works without a GPU).
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function findChromium() {
  if (process.env.CHROMIUM_PATH && fs.existsSync(process.env.CHROMIUM_PATH)) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (fs.existsSync(base)) {
    const dirs = fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
    for (const d of dirs) {
      const p = path.join(base, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(p)) return p;
    }
  }
  return undefined; // let playwright resolve its own default
}

export async function startServer() {
  const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
  await server.listen();
  const addr = server.httpServer.address();
  return { server, url: `http://127.0.0.1:${addr.port}/` };
}

export async function openFilm(url, { width = 960, height = 540 } = {}) {
  const browser = await chromium.launch({
    executablePath: findChromium(),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
  });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(url + '?render=1');
  await page.waitForFunction(() => window.RGS && (window.RGS.ready || window.RGS.error), null, { timeout: 180000 });
  const err = await page.evaluate(() => window.RGS.error);
  if (err) throw new Error('Film failed to initialise:\n' + err + '\n' + errors.join('\n'));
  const info = await page.evaluate(() => ({ duration: window.RGS.duration, fps: window.RGS.fps }));
  const canvas = await page.$('#film');
  return { browser, page, canvas, info, errors };
}

/** Render time t and return a PNG buffer of the 960x540 canvas */
export async function grab(page, canvas, t) {
  await page.evaluate((tt) => window.RGS.renderFrame(tt), t);
  return canvas.screenshot({ type: 'png' });
}
