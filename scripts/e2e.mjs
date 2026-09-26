// End-to-end check in the pre-installed Chromium (software WebGL):
//   npm run build && npx vite preview --port 4173 &  then  node scripts/e2e.mjs [url] [outDir]
// Walks the first-minute flow, fast-forwards the same simulation via a test hook, inspects results,
// opens each destination, and saves screenshots.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? 'test-results';
const vw = +(process.argv[4] ?? 1440), vh = +(process.argv[5] ?? 900);
fs.mkdirSync(out, { recursive: true });
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: vw, height: vh }, hasTouch: vw < 800, isMobile: vw < 800 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const results = {};
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
await page.goto(url);
await page.waitForSelector('text=Watch history unfold');
await shot('01-start');
await page.fill('input[aria-label="Universe seed (optional)"]', 'e2e-seed');
const t0 = Date.now();
await page.click('text=Watch history unfold');
await page.waitForSelector('.tower', { timeout: 120000 });
results.secondsToFirstRace = (Date.now() - t0) / 1000;
await page.waitForTimeout(2500);
await shot('02-first-view');
// advance to the race start and a few laps in (same engine, synchronous test hook)
await page.evaluate(() => { const c = window.__ctrl; if (c.live.stage === 'quali') c.live.skipSession(); });
await page.waitForFunction(() => window.__ctrl.live?.stage === 'race', null, { timeout: 120000 });
await page.evaluate(() => window.__ctrl.advanceSim(60));
await page.waitForTimeout(2500);
await shot('03-race-lap1');
results.afterStart = await page.evaluate(() => { const c = window.__ctrl; const st = c.live.st; return { t: Math.round(st.t), lap: st.lapNow, phase: st.phase, leader: c.live.setup.entrants[st.cars[st.order[0]].i].full, shot: c.lastShot?.why, commentary: c.commentary.lines.slice(-5).map((l) => l.text) }; });
// follow a driver by clicking the timing tower
await page.click('.trow >> nth=2');
await page.evaluate(() => window.__ctrl.advanceSim(20));
await page.waitForTimeout(2500);
await shot('04-follow');
results.follow = await page.evaluate(() => { const c = window.__ctrl; return { follow: c.follow, label: document.querySelector('.carlabel')?.textContent, dir: document.querySelector('.director')?.textContent }; });
// change speed and pause
await page.click('text=20×');
results.speed = await page.evaluate(() => window.__ctrl.live.speed);
await page.keyboard.press('Space');
results.pausedAfterSpace = await page.evaluate(() => !window.__ctrl.live.playing);
await page.keyboard.press('Space');
// open Season while live, then return
await page.click('nav.nav >> text=Season');
await page.waitForSelector('.sheet');
await shot('05-season-panel');
await page.click('text=Return to the live race');
results.returnedToLive = await page.evaluate(() => window.__ctrl.dest === 'live');
// finish the race and inspect the result
await page.evaluate(() => window.__ctrl.advanceSim(99999));
await page.waitForTimeout(2000);
await shot('06-result');
results.result = await page.evaluate(() => { const c = window.__ctrl; const m = c.live.meeting; const r = c.u.races[m.id]; return { status: r.status, laps: r.lapsCompleted, winner: c.u.people[r.results[0].driverId].last, classified: r.results.filter((x) => x.pos !== null).length, dnf: r.results.filter((x) => x.status === 'dnf').length, overtakes: r.overtakes, sumPoints: r.results.reduce((a, x) => a + x.points, 0), standingsLeader: c.u.people[c.u.seasons[m.year].driverStandings[0].id].last }; });
for (const d of ['People', 'History', 'Stories']) { await page.click(`nav.nav >> text=${d}`); await page.waitForTimeout(400); await shot(`07-${d.toLowerCase()}`); }
await page.click('nav.nav >> text=Live');
await page.click('text=Next race →');
await page.waitForTimeout(3000);
await shot('08-next-meeting');
results.nextMeeting = await page.evaluate(() => { const c = window.__ctrl; return { name: c.live?.meeting.name, geometry: c.live?.meeting.geometryId, round: c.live?.meeting.round }; });
results.errors = logs.filter((l) => l.includes('error') && !l.includes('PCFSoftShadowMap'));
console.log(JSON.stringify(results, null, 1));
fs.writeFileSync(`${out}/e2e-results.json`, JSON.stringify(results, null, 1));
fs.writeFileSync(`${out}/console.log`, logs.join('\n'));
await browser.close();
