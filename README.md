# 100 Years of St Albans Racing

A spectator game about a fictional motorsport century, raced on the real streets of St Albans. You never drive and never manage: you choose what to watch, whom to follow, how fast time passes and which parts of history to explore. Every team, driver, car and race is invented and simulated; the streets, gradients and junctions come from real map data.

Within the first minute of **Watch history unfold** you are watching the inaugural 1926 St Albans Grand Prix. **Explore a century** generates 1926–2025 in the background while that first race plays, then lets you follow the century's strongest stories chapter by chapter. **Continue** resumes the last universe, even mid-race.

## Running it

Requirements: Node 20 or newer and a WebGL-capable browser.

```bash
npm install
npm run dev          # development server, then open the printed URL
npm run build        # typecheck + production build into dist/
npm run preview      # serve the production build (http://localhost:4173)
```

The production build is a static site (`dist/`); host it anywhere. No server, account or network access is needed once loaded.

### Controls

| Action | Mouse / touch | Keyboard |
|---|---|---|
| Play / pause | ❚❚ / ▶ | Space |
| Speed 1× / 2× / 5× / 20× | speed buttons | 1 – 4 |
| Jump to the next meaningful moment (same simulation, fast-forwarded) | Next moment | N |
| Follow a driver | click the car, or a row in the timing tower | |
| Director's camera / overview / free camera | camera buttons; drag, pinch and scroll in free mode | A / O |
| Back to the live race | Return to the live race, or Live | Esc |
| Performance meter | | P |

At 1×, one second of screen time is one second of sporting time. Faster speeds, "Next moment", "Simulate season" and "+10 years" all run the same engine with the same fixed 0.1 s step. Only the number of steps per frame changes, so outcomes are identical however you watch.

## Checks

```bash
npm run typecheck                         # TypeScript
npm test                                  # vitest: determinism, replay, save/resume, rules, ratings, records, scenarios
npm run century -- century-1 100 out.json # headless 100-year run with integrity checks (≈7 min)
npm run build && npx vite preview --port 4173 &
node scripts/e2e.mjs http://localhost:4173/ test-results            # browser flow + screenshots (Chromium)
node scripts/e2e.mjs http://localhost:4173/ test-results/mobile 390 844 --quick   # phone-sized pass
```

What each check covers, and the results of the last run, are in [docs/DELIVERY_REPORT.md](docs/DELIVERY_REPORT.md).

## Project layout

```
src/sim/            the authoritative simulation (no rendering, no DOM)
  rng.ts dmath.ts   seeded sfc32 streams; deterministic exp/log/pow
  race/             race engine (physics, strategy, flags, penalties), classification, packed weekend setups
  world/            people, teams, cars, technology, regulations, venues, calendar, market, Elo, records,
                    stories, news, season cycle
  track.ts          runtime track model built from the validated circuit geometry
src/app/            controller, live session (live and replay), broadcast director
src/narrative/      commentary and previews (template-based; no language model)
src/render/         three.js city, circuit dressing, cars by era, street life, WebAudio sound
src/ui/             Preact interface: live overlay, Season / People / History / Stories, settings
src/persist/        IndexedDB saves (core + per-season chunks), export / import
src/worker/         background simulation worker (same code as live)
tools/              map pipeline: OSM + terrain download, street graph, circuit routing and validation
scripts/            century run, end-to-end browser check, harnesses
tests/              vitest suites
docs/               design notes, rating rules, saves and replays, circuit report, delivery report
```

## Documentation

- [docs/DESIGN.md](docs/DESIGN.md): how the simulation is built, the assumptions it makes, and what is deliberately fictional
- [docs/ELO.md](docs/ELO.md): the rating system, including how mechanical failures and team-mates are treated
- [docs/SAVES_AND_REPLAYS.md](docs/SAVES_AND_REPLAYS.md): what is saved, how replays are reconstructed and verified, and their limits
- [docs/CIRCUITS.md](docs/CIRCUITS.md): how each circuit was routed through the real street graph, with its validation checks
- [docs/DELIVERY_REPORT.md](docs/DELIVERY_REPORT.md): which checks were run, with their actual results

## Data and attribution

- **Map data** © OpenStreetMap contributors, available under the [Open Database Licence (ODbL)](https://www.openstreetmap.org/copyright). The street network, building footprints, land use, waterways and railway in `public/data/stalbans-city.json`, and the circuit geometry in `src/data/circuits.json`, are derived from OSM. The derived database is also ODbL.
- **Elevation**: [Terrain Tiles on AWS](https://registry.opendata.aws/terrain-tiles/) (Mapzen/Tilezen, Terrarium encoding), which in this area derive from SRTM (NASA / USGS, public domain).
- **Libraries**: [three.js](https://threejs.org) (MIT), [Preact](https://preactjs.com) (MIT); development tooling Vite, TypeScript, Vitest, Playwright (Apache-2.0 / MIT).
- Sound is synthesised at runtime (no samples). Fonts are system fonts.

To rebuild the map data: `npm run geodata:fetch && npm run geodata:build` (downloads into the git-ignored `data-raw/`).

**Fiction notice.** St Albans has never hosted a motor-racing championship. All people, teams, sponsors and events are invented; any resemblance to real people is coincidental. Real racing names were removed from the name pools. The pit lanes, temporary chicanes and some closures are fictional modifications, and each is listed in `docs/CIRCUITS.md`.
