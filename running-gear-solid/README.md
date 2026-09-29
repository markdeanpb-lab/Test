# RUNNING GEAR SOLID: REMASTERED

A 26-minute cinematic film, made in code from a real Strava running career (14.05.2020 – 27.09.2026). It is staged as a
modern high-budget remake of a late-1990s tactical-espionage game. Every race, time, split, route and quote on
screen comes from the Strava record. Codec dialogue is fiction and never states a fact the data doesn't support.

```
npm install
npm run dev       # live preview (remaster.html; ?only=<scene prefix> to jump, e.g. ?only=c8)
npm run render    # render every chapter to output/parts/, synthesise audio, assemble output/running-gear-solid.mp4
```

`npm run render` renders one part per chapter, so a single chapter can be redone:
`node scripts/rm-parts.mjs --only 08 --force`, then `node scripts/rm-parts.mjs --assemble-only`.
Output: 1920×1080, 24 fps, H.264 + AAC. With SwiftShader and no GPU, frames take about 0.85 s each; the whole film
renders in about 7–8 hours with 2 workers.

## The bosses

Each boss is a physical machine in the scene, driven by the real race data (`src/rm/film/bosses/`):

| Boss | Race | Level (genre, mechanic) |
|---|---|---|
| THE DOOR | first run, lockdown day 53 | domestic horror-comedy: excuses through the letterbox, countered by searching the flat, then mash NOW |
| THE HARE | four races, 2022–2026 | fairy tale: a Wonderland chase; CHASE floods the stamina gauge, BLOW UP, it laughs down its hole |
| HINGE | Hackney Half 2022 | steampunk viaduct: a rusted knee mech; keep cadence, dodge its stamps; the joint holds |
| DOUBLE ZERO | Victoria Dock 20:00, Finsbury 19:25 | sci-fi storm: a clock sentinel; round 1 TIME UP / DRAW, round 2 each sub-4:00 split is a hit |
| FORTY | Battersea 10K 39:35 | medieval castle: the portcullis drops towards 40:00, SLIDE under it |
| NINETEEN | Lordship 19:00 | mind games: it reads his memory card, VIDEO 1, switch controller port; it still stops on 19:00 |
| PHANTOM 1:30 | Hackney 2023 / 2024 | gothic horror: a ghost town at night, PACE GOGGLES; 2023 it hunts him down and escapes, 2024 he overtakes and it dissolves at dawn |
| FURNACE | Richmond Marathon 2023 | volcanic hell: HEAT gauge, O DRINK, X DODGE, the course collapsing into lava as the race is stopped |
| THE CLAW | Highgate hills 2023 | mech: run UP each of five giant fingers as they curl; cleared fingers retract |
| HAIRLINE | stress reaction 2024 | body horror: an X-ray void; CANNOT ATTACK; the MGS3-style CURE screen |
| EIGHTEEN | Striders Festive 5K 18:19 | retro arcade: TIME from 18:00, CHECKPOINT / EXTEND!, TIME UP, high-score table |
| THE WALL | Manchester Marathon 2026 | final boss: the real course, then a brick canyon; it erupts at the 3:00 crossing, BREAK THROUGH, it rebuilds; SURVIVAL to 3:20:03 |

The story bible (threads, boss tiers, chapter beats, sources) is in [`docs/STORY.md`](docs/STORY.md). The v1 critique
that drove the remaster is in [`docs/V1_REVIEW.md`](docs/V1_REVIEW.md).

## Structure

| Chapter | Span | Climax |
|---|---|---|
| PROLOGUE | Manchester start pen, watch set to 3:00:00 | "A line." → six years earlier |
| 1 BASIC TRAINING | First run (11 minutes standing still), first parkrun back | – |
| 2 20:XX | SUB 20 appears; THE HARE, HINGE, near misses | **DOUBLE ZERO** R1 20:00 (wind) → R2 19:25 |
| 3 AMBITION | FORTY, SUB 19, SUB 1:30 appears | **PHANTOM 1:30** I escapes; FURNACE; THE CLAW |
| 4 THE PHANTOM | Shingles, doubt | **PHANTOM 1:30** II: 1:29:01, the music stops |
| 5 HAIRLINE | Stress reaction, Valencia cancelled | The boss you can't fight |
| 6 RETURN | Comeback, final Finsbury, SUB 18 | **EIGHTEEN**: 18:19, not yet |
| 7 THE LINE | 18 weeks of bricks, THE HARE at Bath, Regent's Park | Watch set to 3:00:00 |
| 8 THE WALL | Manchester Marathon on real splits | MACHINE → FRICTION → WALL → SURVIVAL: 3:20:03, "I AM STILL STANDING" |
| EPILOGUE | Crutches, 18:43, mission log | SUB 3 and SUB 18 incomplete: new mission detected |

## How it is built

- **Engine** (`src/rm/engine/`): the Three.js renderer with a custom quarter-res SSAO, bokeh, bloom, FXAA and a final
  grade/grain/letterbox pass that composites the 1080p HUD canvas. Also the HDRI sky, the sun, and shadows that
  follow the runner.
- **World** (`src/rm/world/`): arenas built from OpenStreetMap, terrain tiles and map-matched Strava GPS
  (`tools/geo/`). Includes chunked splat-textured terrain, extruded buildings, tree impostors, water and barriers.
  Courses are the real ones (Finsbury is the two-lap course).
- **Characters** (`src/rm/char/`): STRIDE is a Quaternius CC0 body with a generated kit (`tools/blender/build_runner.py`).
  The gait uses stance time-warp from a cadence model, plus procedural fatigue, lean and watch checks. The crowd is
  baked in Blender (`tools/blender/bake_crowd.py`, not committed; rebuild before rendering).
- **Film** (`src/rm/film/`):
  - `core.ts` is the deterministic `renderFrame(t)` scene graph with cues.
  - `RaceScene.ts` stages a race from a real RunProfile, with its field, spectators and camera rigs.
  - `Codec.ts`, `Cards.ts`, `VRScene.ts`, `Bricks.ts` and `fx.ts` provide codec calls, 2D cards, the VR void, the
    training-brick wall, and the ghost pacers, holo numbers and wall effects.
  - `chapters/*.ts` hold the edit.
- **HUD** (`src/rm/hud/`): contextual TARGET / PROJECTION / DELTA blocks, boss plates, splits and the watch inset.
- **Audio** (`scripts/rm-audio.ts`): the score, ambience and SFX are synthesised from the film's own cue list. Silence
  cues duck the music.
- **Render** (`scripts/rm-parts.mjs`, `scripts/rm-render.mjs`): headless Chromium steps exact timestamps, and workers
  stream raw RGB into x264.

Third-party assets: Quaternius (CC0), Poly Haven (CC0), OpenStreetMap (ODbL), AWS Terrain Tiles, Rajdhani and
Share Tech Mono (OFL). Fetch them with `node scripts/fetch-assets.mjs`. All names, characters, music and dialogue
are original.

---

# v1: the five-minute PS1 cut

The original prototype still builds with `npm run render:v1` / `npm run audio:v1`.

A five-minute cinematic "lost 1998 PS1 tactical-espionage game", generated in
code from a real Strava running career (1,231 runs, 14.05.2020 – 27.09.2026).
Every race, time, split, heart rate, route and quote on screen comes from the
athlete's Strava history; where something could not be established from the
data, it is not shown as fact.

```
npm install
npx vite          # (v1) live preview at http://localhost:5199/index.html (space = play, arrows = seek, ?t=SECONDS)
npm run render:v1 # synthesise audio, render every frame, encode output/running-gear-solid.mp4 (same path as the remaster; pass `-- --out output/v1.mp4`)
```

`npm run render` passes options through: `npm run render -- --workers 3`,
`--from 226 --to 268` (render a slice), `--frames` (save every frame to
`output/frames/` as PNG, then encode from the image sequence).
Output: 1920×1080, 60 fps, H.264 + AAC, ~5:07. On a 4-core machine with no GPU
(SwiftShader) the full render takes about 35–40 minutes.

## The story (boss encounters)

| # | Encounter | Activity | What makes it the boss |
|---|-----------|----------|------------------------|
| – | Cold open | 14.05.2020, first run on record: 5.07 km, 37:56 moving, 48:58 elapsed | 11:02 standing still |
| – | Basic training | 2020–2022 volume ×5; parkrun chain 21:53 → 20:15; first half 1:51:17 | |
| 1 | **HINGE** | Hackney Half 22.05.2022, 1:46:30 – "The knee held out" | A rusted hydraulic knee chasing the runner under the viaduct |
| 2 | **DOUBLE ZERO** | Victoria Dock parkrun 18.02.2023, **20:00** ("affected massively by the wind"); 20:07 on 11.03, then 19:25 on 18.03.2023 | A dockside clock sentinel that will not go below 20:00 |
| 3 | **PHANTOM 1:30** (I) | Hackney Half 21.05.2023, 1:35:30 – "An ambitious attempt at 1:30" | A hologram pacer; GPS delta vs even 1:30 pace drives the chase |
| 4 | **FURNACE** | Richmond Runfest Marathon 10.09.2023, 3:55:11; halves 1:43:32 / 2:09:47; relative effort 739 (career high) | "Managed to pass through the end when they started to cancel the race" |
| 5 | **THE CLAW** | Highgate hills 26.11.2023, 22.3 km, +445 m | Five climbs into Highgate village; one Strava segment on the run is literally "Highgate Claw" |
| 6 | **PHANTOM 1:30** (II) | Hackney Half 19.05.2024, **1:29:01**, every split 4:02–4:19 | The same phantom, now behind |
| – | Setback | Oct–Dec 2024: sore ankles, Valencia cancelled, "one for the comeback montage" | |
| – | Comeback | 2025 PBs: 5K 18:28 → 18:19, Hackney 1:26:28, St Albans 1:26:21 | |
| – | The build | 18 weeks, 1,120 km (weekly km from Strava), March 2026 = 311 km (biggest month) | |
| 7 | **THE WALL** | Manchester Marathon 19.04.2026, 3:20:03 (−35:08 PB) – "The Wall Won … But now I know." | Sub-3 projection (elapsed + remaining at average pace) crosses 3:00 at km 28 |
| – | Aftermath | "Walk to the end of my street with crutches – 5.00 (New PB)" … 18:43 "where did that come from" | |
| – | Next objective | Sub 3:00:00 marathon, unscheduled; last contact 27.09.2026, 20.01 km | |

Data lives in `src/data/` (`activities.ts`, `career.ts`, `routes/*.json` –
GPS/altitude streams reduced to 50–120 points).

## How it is built

- **TypeScript + Vite + vanilla Three.js + GSAP**, no framework.
- `src/cinematics/schedule.ts` – the edit (sequence order and durations).
- `src/cinematics/Film.ts` – one paused GSAP master timeline;
  `renderFrame(t)` seeks it and renders. Every camera shot tweens its own proxy
  object, so any timestamp can be rendered in any order with identical output.
- `src/cinematics/sequences/*` – one class per sequence: `build()` the set and
  shots, `update(t)` the world, `drawUI(t)` the HUD.
- `src/cinematics/RaceSequence.ts` – real GPS routes rebuilt 1:1; shots are
  anchored to race kilometres so the runner is on the actual stretch of road.
- `src/data/activities.ts` – `BossEncounter` objects (splits, HR, phases,
  quotes) that drive both visuals and HUD.
- `src/bosses/*` – procedural low-poly bosses.
- `src/shaders/ps1.ts` – PS1 material (vertex snapping, affine texture
  mapping, vertex lighting, fog) and deterministic GPU particles.
- `src/renderer/Renderer.ts` – 480×270 scene → post pass (dither, colour
  quantisation, grade, heat haze) → nearest-neighbour composite with the 2D
  HUD at 960×540 → ×2 nearest upscale to 1080p in FFmpeg.
- `src/hud/*` – original 5×7 bitmap font, codec screens, run HUD, radar,
  title cards, result screens, procedural pixel portraits.
- `scripts/synth-audio.ts` – the whole soundtrack and SFX, synthesised
  offline from oscillators and seeded noise (no samples).
- `scripts/render.mjs` – headless Chromium (Playwright) steps exact frame
  timestamps; each worker streams raw frames into FFmpeg; segments are
  concatenated and muxed with the audio.

All names, characters, music, logos and dialogue are original.
