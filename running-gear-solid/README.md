# RUNNING GEAR SOLID

A five-minute cinematic "lost 1998 PS1 tactical-espionage game", generated in
code from a real Strava running career (1,231 runs, 14.05.2020 – 27.09.2026).
Every race, time, split, heart rate, route and quote on screen comes from the
athlete's Strava history; where something could not be established from the
data, it is not shown as fact.

```
npm install
npm run dev       # live preview at http://localhost:5199 (space = play, arrows = seek, ?t=SECONDS)
npm run render    # synthesise audio, render every frame, encode output/running-gear-solid.mp4
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
