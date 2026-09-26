# Delivery report

This report lists what was built, what was checked, and the results those checks actually produced in the build environment: Linux container, 4 CPU cores, Node 22, headless Chromium with software WebGL (SwiftShader). Where something was not checked, or only partly, it says so.

## How to reproduce every check

```bash
npm install
npm run typecheck
npm test
npm run century -- century-1 100 out.json     # also run with verulam-1926 and e2e-seed
npm run build && npx vite preview --port 4173 &
node scripts/e2e.mjs http://localhost:4173/ test-results
node scripts/e2e.mjs http://localhost:4173/ test-results/mobile 390 844 --quick
```

## 1. Type check and production build

- `tsc --noEmit`: no errors.
- `vite build`: succeeds. The main bundle is about 1.3 MB (≈ 376 kB gzip) and the simulation worker about 0.54 MB. Map data ships separately (`stalbans-city.json`, 1.8 MB) and is fetched once.

## 2. Automated tests (`npm test`, vitest): 21 of 21 pass

| Suite | What it proves |
|---|---|
| determinism | The same seed gives an identical history (fingerprint of the whole universe after a season); a different seed gives a different one. A race watched live at 1×, 5× and 20× with irregular frame times gives exactly the same universe as headless simulation. **Every race of a simulated season replays from its stored setup to the recorded result**, and replaying leaves the universe byte-identical. Save → split → JSON → join between meetings continues identically. A save taken **mid-race** resumes the same weekend: same car positions at the same second, same final result. |
| rules | Classified positions are contiguous and ordered by laps then time; unclassified cars score nothing. Points match the regulations in force at each race (including fastest lap, pole and half points). Standings equal the sum of race points and are sorted, and the champion leads. Career statistics equal a rebuild from race records. Every race ends in a valid terminal state, with a category for every retirement. |
| ratings | A lap-1 **mechanical** failure moves a rating by under a tenth of a lap-1 crash. A late mechanical failure counts more than an early one but less than a crash. Team-mate comparisons outweigh others. Ratings never change the hidden skill model. |
| records | Awarded once per occasion; broken and equalled records keep the previous holders and values. |
| scenarios (labelled) | Finds, in simulated (not scripted) races, and prints: an overtake with its reason, a pit stop with its reason and time, a mechanical retirement classified as mechanical, and a penalty with its reason. |

Example output of the labelled scenario test (seed `scenarios`):

```
[OVERTAKE] St Albans Grand Prix 1926, lap 1: Nico Bernasconi passes Juan Vidal for P8 at St Michael's — spin
[PIT STOP] St Albans Grand Prix 1926, lap 8: Marjorie Ellison pits (reason: fuel; treaded tyres at 15% wear → fresh treaded, refuelled), 62.5 s in the pit lane
[MECHANICAL DNF] St Albans Grand Prix 1926: Graham Chalmers out after 14 laps — engine failure at Bluehouse Hill
[PENALTY] Verulam Trophy 1926, lap 1: Albert Prescott: reprimand — fined by the stewards for jump start
```

## 3. Hundred-year runs (`scripts/century.ts`, headless, final engine)

Three seeds, each simulating 1926–2025 with the same code the game uses. Fourteen integrity checks run on each.

| Seed | Time | Races | People | Champions | Title-winning lineages | Rule changes | Size in memory | Result |
|---|---|---|---|---|---|---|---|---|
| century-1 | 415 s (4.1 s/year) | 1,081 | 1,365 | 37 | 7 | 36 | 40.1 MB | 14/14 pass |
| verulam-1926 | 437 s (4.4 s/year) | 1,121 | 1,378 | 37 | 5 | 33 | 41.6 MB | 14/14 pass |
| e2e-seed | 420 s (4.2 s/year) | 1,083 | 1,352 | 44 | 11 | 34 | 40.8 MB | 14/14 pass |

Plus a 110-year run (seed `abbey-2035`, 1926–2035) that continues past 2025: 14/14 pass, 43 champions. It ran on the engine just before the final qualifying-fuel fix.

The checks: every calendar year present; no driver holds two seats; standings equal race points; career cache equals a rebuild; contiguous classification; **no NaN or Infinity anywhere in memory**; the founding generation fully replaced; **a full field every season outside declared national emergencies**; plausible parent ages in families; bounded finances; no unexplained runs of three meetings on one layout; several layouts per season; no duplicate record awards; every event cause refers to a real event.

National emergencies that suspend racing occurred in two of the three seeds (century-1: 1975–1980; e2e-seed: 1957–1961), and the championship recovered to full fields afterwards.

### Defects these runs found and that were fixed

1. **Grids collapsing after a cancelled season.** Prize money was divided among zero teams, which made cash Infinity and then NaN, which made every driver-market score NaN, so no one was signed. Grids fell to one or two drivers for decades on two of three seeds. The old check missed it because JSON serialisation turns NaN into null and the participation check only sampled every tenth year. Fixed at the source, market scoring made NaN-proof, and both checks rewritten.
2. **A driver holding two seats.** A driver benched through injury was "returned" to their old team after signing for another. Fixed, and guarded when entries are built.
3. **Qualifying cars running dry.** Qualifying runs were fuelled for three laps but could last five. Fixed, with a failsafe that ends a run before the tank is empty.
4. **Ratings.** Partial evidence was floored at 25% of a full result, so a lap-1 mechanical failure still cost a quarter of a crash. Fixed.
5. **The duplicate-award check** mis-keyed season-level records. Fixed.

## 4. Browser end-to-end (`scripts/e2e.mjs`, Chromium, 1440×900)

All steps passed, with **no console errors** (seed `e2e-seed`):

| Step | Result |
|---|---|
| Click "Watch history unfold" → timing tower of a live race on screen | **1.24 s** (1926 St Albans Grand Prix, Abbey & Verulamium circuit) |
| Race starts; director shows the opening-lap group; commentary follows events | "And they're away…", a puncture, a lead change and position changes on lap 1, each tied to a race event |
| Follow a driver by tapping the timing tower | Camera follows; the label shows "Following … (your choice)" |
| 20× speed, pause and resume with Space | As expected |
| Open Season while live, then "Return to the live race" | Back on the live race |
| Finish the race | Finished, 22/22 laps, 19 classified, 6 retirements, 42 overtakes; points sum to the table (24); standings leader = winner |
| People / History / Stories panels | Render |
| Next race | Round 2 on a **different layout** (London Road, reversed) |
| History → 1926 → Calendar → Result & replay → Watch replay | Replay runs; result panel: **"Replay reproduced the recorded result exactly"** |
| Back to live | Returns to round 2 where it was left |
| Mid-race reload → Continue | Same meeting, same session, **same second (306.6 s) and identical car positions** |
| Simulate 30 years in the worker | **114.7 s** (1926 → 1956), then the next race starts live |
| 1956 race | Front-engined cars on the Batchwood course, black-and-white TV grading, parked period cars; 31 seasons and 83 detected stories |
| Driver page, Stories chapters, a story, All-time, Records | Render |

## 5. Phone-sized pass (390×844, touch, `--quick`)

First-minute flow at 390×844 with touch emulation: first race on screen after **1.06 s**; follow, speed, pause, panels, result and next meeting all work; **no console errors**. The top navigation fits all five destinations, the playback bar scrolls horizontally, and the return-to-live button floats above the panel.

## 6. Performance

Measured by the built-in meter (key **P**), which records frame time, simulation cost per frame, draw calls and triangles.

| Moment | Frames/s (software) | p95 frame | Simulation per frame | Draw calls | Triangles | JS heap |
|---|---|---|---|---|---|---|
| 1926 race, lap 1 (medium quality) | 2 | 1606 ms | 0.18 ms | 43 | 0.91 M | 71 MB |
| 1956 race after simulating 30 years | 2 | 1890 ms | 5.59 ms | 35 | 0.99 M | 99 MB |
| Phone-sized pass, lap 1 | 3 | 1231 ms | 0.12 ms | 40 | 0.91 M | 70 MB |

- **Simulation cost** per frame at 1× is about 0.1–0.2 ms, and about 5–6 ms in the busier 1950s fields. Rendering, not simulation, is the budget.
- **Rendering in this environment is software (SwiftShader)**, so the measured 1–2 fps says nothing about real hardware. **Frame rates on real GPUs and phones were not measured.** Triangle budgets after reduction: low ≈ 0.48 M (phones), medium ≈ 0.86 M, high ≈ 1.28 M, with 25–60 draw calls. Phones default to low.
- **Background simulation:** 4.1–4.4 s per simulated year in Node, and about 4–5 s per year in the browser worker (30 years in 123–152 s across runs). Generating a full century in the browser therefore takes about 7–8 minutes. Explore mode shows the opening race live during generation, then verifies that race against the generated record.
- **Save size:** 40–42 MB per century, about 11–12 MB of which is replay setups. Autosave after each weekend rewrites only that season's chunk.

## 7. Screenshots

Stored in `docs/screenshots/`:

| File | Shows |
|---|---|
| `01-start.png` | Title screen with the three choices |
| `03-race-lap1.png` | 1926 St Albans Grand Prix, opening lap, director's group shot, newsreel grading |
| `08-next-meeting.png` | A different circuit (London Road, reversed) in round 2 |
| `09-season-calendar.png` | Season calendar with route maps, reasons for each meeting and replay links |
| `11-replay-verified.png` | Replay of the 1926 race, verified against the record |
| `13-era-1956.png` | A 1956 race: front-engined cars, a different layout, black-and-white TV grading, parked period cars |
| `14-driver-history.png` | A champion's page: rating trajectory with title marks, season table, record |
| `15-story-chapters.png` | Stories as chapters of history, each with a race to watch |
| `16-story.png` | A detected story with its evidence (beats), state and related stories |
| `17-alltime.png` | All-time leaderboard with the labelled, editable greatness index |
| `18-records.png` | Record book with holders over time |
| `mobile-*.png` | Live race, Season panel and Stories at phone size |

## 8. Requirements checklist

| Requirement | Status |
|---|---|
| Opening screen: Watch / Explore / Continue; 1926–2025; ≈12 teams and 24 drivers; ≈10 meetings; optional seed | Done (fields of 24–31 drivers; 9–12 meetings a year) |
| Moving cars within the first minute | Done (first race on screen 1.24 s after the click in headless Chromium) |
| Deterministic simulation: seeded PRNG, fixed clock, separate sporting and cosmetic streams, same rules live and fast, stable IDs, causal facts, live state separate from history, worker | Done; tested |
| Real St Albans geography from licensed data with attribution; at least 4 validated circuits with pits | Done: 5 circuits, 11 validated layouts (docs/CIRCUITS.md) |
| Varied calendar; St Albans Grand Prix; changes with causes | Done; checked over 300 simulated seasons |
| Racing: physics, overtakes with reasons, pits, tyres, fuel, damage, failures, SC / yellow / red, penalties, always-valid ending, 1× = real time | Done |
| Broadcast director: dwell times, overview / follow / battle / free, next moment, favourites | Done |
| Generational drivers, development, rookies, families, relationships | Done |
| Teams: finances, lineage, mergers, takeovers | Done |
| Cars and technology by era; regulations with announcements and per-event rules | Done |
| Weather process; event framework; season cycle | Done |
| Elo documented and separate from skill; mechanical failures as limited evidence | Done (docs/ELO.md; tests) |
| Records with previous holders; deep history; story detection with evidence | Done |
| Commentary and journalism without filler, no LLM | Done (template-based, event-driven) |
| Explore a century with spoiler control; immutable, deterministic replays | Done (replays verified in tests and in the browser) |
| UI: Live / Season / People / History / Stories; obvious return to live | Done |
| Playback 1/2/5/20×, next race, simulate season | Done (+10 years as well) |
| Touch, accessibility, reduced motion | Done: touch camera and tap-to-follow, labelled controls, focus outlines, live region for commentary, pattern-coded team colours, reduced-motion setting. **Not tested with a screen reader.** |
| Visual and audio eras | Done: car designs by era, picture grading by broadcast medium, synthesised period engine and crowd sound. **Audio was not listened to in this environment** (headless). |
| Circuit versions that persist | Done (layout versions with dates, reasons, per-version lap records) |
| IndexedDB saves; export and import that never overwrite | Done |
| Performance measurement | Done (meter and e2e numbers); real-hardware frame rates **not measured** |
| Tests: determinism, save/resume, classification, Elo treatment, 100-year run, screenshots | Done |

## 9. Known limitations

- Real-hardware rendering performance, screen-reader use and sound were not verified here (see above).
- The street network is present-day OpenStreetMap for all eras; historic road layouts are not reconstructed.
- A full century takes about 7–8 minutes to generate in the browser. Explore mode covers this with a live race, but the history views are only complete once generation ends.
- Replays reproduce records only under the engine version that recorded them. Commentary and camera choices in a replay are regenerated, not recorded (docs/SAVES_AND_REPLAYS.md).
- Long national emergencies (up to six seasons in one seed) are possible and are presented as such.
