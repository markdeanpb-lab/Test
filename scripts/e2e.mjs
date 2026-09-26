// End-to-end check in the pre-installed Chromium (software WebGL):
//   npm run build && npx vite preview --port 4173 &  then  node scripts/e2e.mjs [url] [outDir]
// Walks the first-minute flow, fast-forwards the same simulation via a test hook, inspects results,
// opens each destination, and saves screenshots.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? 'test-results';
const vw = +(process.argv[4] ?? 1440), vh = +(process.argv[5] ?? 900);
const quick = process.argv.includes('--quick'); // mobile pass: first-minute flow only
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
await page.evaluate(() => { window.__ctrl.showPerf = true; });
await page.waitForTimeout(4000); // 240 frames of real-time playback for the frame-time sample
results.perfLap1 = await page.evaluate(() => window.__ctrl.perf());
await page.evaluate(() => { window.__ctrl.showPerf = false; });
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
if (!quick) {
  // replay the first race from its stored setup through the UI and check it reproduces the record
  const firstId = await page.evaluate(() => Object.keys(window.__ctrl.u.races)[0]);
  await page.click('nav.nav >> text=History');
  await page.click('.sheet button.link >> text=1926');
  await page.click('[role=tab] >> text=Calendar');
  await shot('09-season-calendar');
  await page.click('text=Result & replay >> nth=0');
  await page.waitForSelector('text=Watch replay');
  await shot('10-race-view');
  await page.click('text=Watch replay');
  await page.waitForSelector('.replay-banner');
  for (let i = 0; i < 6; i++) await page.evaluate(() => window.__ctrl.advanceSim(99999));
  await page.waitForTimeout(1500);
  await shot('11-replay-verified');
  results.replay = await page.evaluate((id) => { const c = window.__ctrl; return { meeting: c.live.meeting.id === id, result: c.live.replay?.result, banner: document.querySelector('.verify')?.textContent }; }, firstId);
  await page.click('text=Back to live →');
  results.afterReplay = await page.evaluate(() => { const c = window.__ctrl; return { round: c.live?.meeting.round, stage: c.live?.stage, replaying: !!c.replaying }; });
  // mid-race resume: advance into the race, let the resume point save, reload and continue
  await page.evaluate(() => { const c = window.__ctrl; if (c.live.stage === 'quali') c.live.skipSession(); });
  await page.waitForFunction(() => window.__ctrl.live?.stage === 'race', null, { timeout: 120000 });
  await page.evaluate(() => window.__ctrl.advanceSim(300));
  await page.evaluate(() => { window.__ctrl.live.playing = false; }); // hold the moment so the stored point is exactly this one
  const before = await page.evaluate(() => { const c = window.__ctrl; return { id: c.live.meeting.id, t: c.live.st.t, s: Array.from(c.live.st.cars, (x) => +x.s.toFixed(3)) }; });
  await page.waitForTimeout(6500);
  await page.reload();
  await page.waitForSelector('text=Continue');
  await page.click('.choice >> text=Continue');
  await page.waitForSelector('.tower', { timeout: 120000 });
  results.resume = await page.evaluate((b) => { const c = window.__ctrl; return { sameMeeting: c.live.meeting.id === b.id, stage: c.live.stage, tBefore: +b.t.toFixed(1), tResumed: +c.lastResume.t.toFixed(1), samePositions: JSON.stringify(c.lastResume.s.map((x) => +x.toFixed(3))) === JSON.stringify(b.s), message: c.message }; }, before);
  await shot('12-resumed');
  // a later era: simulate thirty years in the worker, then watch the next race
  const t1 = Date.now();
  await page.evaluate(() => window.__ctrl.simulate({ kind: 'year', year: 1956 }, 'Simulating to 1956'));
  await page.waitForFunction(() => !window.__ctrl.progress && window.__ctrl.live, null, { timeout: 900000 });
  results.simulate30YearsSeconds = (Date.now() - t1) / 1000;
  await page.evaluate(() => { const c = window.__ctrl; if (c.live.stage === 'quali') c.live.skipSession(); });
  await page.waitForFunction(() => window.__ctrl.live?.stage === 'race', null, { timeout: 120000 });
  await page.evaluate(() => window.__ctrl.advanceSim(90));
  await page.waitForTimeout(3000);
  await shot('13-era-1956');
  results.perf1956 = await page.evaluate(() => window.__ctrl.perf());
  results.era = await page.evaluate(() => { const c = window.__ctrl; return { year: c.live.meeting.year, meeting: c.live.meeting.name, geometry: c.live.meeting.geometryId, carEra: c.live.setup.entrants[0].vis.era, seasons: Object.keys(c.u.seasons).length, stories: Object.keys(c.u.stories).length }; });
  // a driver's history and a story chapter
  const champ = await page.evaluate(() => { const c = window.__ctrl; const s = c.u.seasons[1950]; return s.championId; });
  await page.evaluate((id) => window.__ctrl.open({ kind: 'person', id }), champ);
  await page.waitForTimeout(600);
  await shot('14-driver-history');
  await page.click('nav.nav >> text=Stories');
  await page.waitForTimeout(400);
  const hasChapters = await page.$('text=Chapters of history');
  if (hasChapters) { await page.click('.chapter button.link >> nth=0'); await page.waitForTimeout(300); }
  await shot('15-story-chapters');
  const storyBtn = await page.$('.story-card');
  if (storyBtn) { await storyBtn.click(); await page.waitForTimeout(400); await shot('16-story'); }
  results.stories = { chapters: !!hasChapters, opened: !!storyBtn };
  await page.click('nav.nav >> text=History');
  await page.click('[role=tab] >> text=All-time');
  await page.waitForTimeout(300);
  await shot('17-alltime');
  await page.click('[role=tab] >> text=Records');
  await page.waitForTimeout(300);
  await shot('18-records');
}
results.errors = logs.filter((l) => l.includes('error') && !l.includes('PCFSoftShadowMap'));
console.log(JSON.stringify(results, null, 1));
fs.writeFileSync(`${out}/e2e-results.json`, JSON.stringify(results, null, 1));
fs.writeFileSync(`${out}/console.log`, logs.join('\n'));
await browser.close();
