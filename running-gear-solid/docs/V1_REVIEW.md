# RUNNING GEAR SOLID v1 — review before the remaster

Watched end to end (5:07, 154 frames sampled every 2 s, plus targeted stills).
Timestamps refer to the v1 master `output/running-gear-solid.mp4`.

## What works and must survive

- **Recurring goals.** SUB 1:30 (Phantom encounter at Hackney 2023 → rematch
  2024) and SUB 20 (the 20:XX chain, "20:00 NOT UNDER. EXACTLY.", 19:25) are the
  strongest material. They work *because they come back*.
- **The Wall ending.** "STRIDE. THE WALL IS STILL STANDING." / "SO AM I."
  and the SUB 3 / SUB 18 unfinished objectives.
- **Real data as game data.** Live projected finish at Manchester (turns red at
  km 28, 3:00:31), the Claw fingers as real segment efforts, the 18 weekly
  brick columns.
- **Humour from the logs.** Crutches "5:00 NEW PB", shingles codec, "Absolute
  snooze fest", "one for the comeback montage".
- Codec format, mission-select, service record, boss title cards as a visual
  language; deterministic renderer and render pipeline.

## Story and pacing problems

| Where | Problem |
|---|---|
| 0:24–0:38 Basic training | Two years compressed into 14 s; the parkrun chain (21:53 → 20:15) scrolls by as a list — the viewer never feels the 5K getting faster. |
| 1:06–1:12 SUB 20 briefing | SUB 20 is introduced *and* resolved within 30 s. No attempt is shown failing slowly; Vienna "almost a sub 20" (Nov 2022) and the 20:21 "everything aches" are missing. The payoff at 1:32 is on screen for ~2 s. |
| 1:34 → 1:36 | Cuts from the sub-20 payoff straight into Phantom 1:30. SUB 1:30 is never set up — it appears as a boss name with no reason to care. |
| 1:36–1:46 Phantom I | 12 s. The 1:35:30 result and "happy with 1:35" flash past; no reaction, no consequence. |
| 1:46–2:20 Furnace | First marathon arrives with one codec line of preparation; no build-up, no reason given for running a marathon. |
| 2:20–2:38 Claw | Beautiful idea but disconnected: why this run, why now? |
| 2:40–3:08 Phantom II | Payoff of the best storyline gets 10 s of racing and a 2 s stamp; the "peak form" montage immediately buries it. |
| 3:08–3:22 Setback | Works tonally but is rushed; Valencia was never mentioned before it is cancelled. |
| 3:24–3:34 Comeback | Seven log cards in 10 s: unreadable, no cause and effect, the farewell to Finsbury (95 parkruns) is a 1.7 s card. |
| 3:36–3:44 Build | The marathon build is 10 s — SUB 3 appears for the first time 2 s before the race. The audience has no reason to believe it could happen. |
| 3:46–4:26 Manchester | Best sequence, but too short for a final boss; the change of question (from "can he break three hours?" to "can he finish?") isn't staged; the finish has no breathing room. |
| 4:28–4:38 Aftermath | Five beats in 10 s. **Factual error:** Chippenham 2026 ("Goodbye to the 1.30 pace group", 1:32:11) is shown as the runner leaving the 1:30 pacer behind; the log means the opposite. |
| 4:40–4:52 Records | Dashboard of totals disconnected from the story. |
| Throughout | Between bosses the film shows random highlights instead of the training that caused the next result. No quiet character moments at all. |

## Visual bugs and weak frames

- Black/near-black frames at nearly every sequence boundary (0:12, 0:22, 0:38,
  1:34, 1:46, 1:52, 2:38, 3:08, 3:22) — dead air rather than transitions.
- 0:46–0:48 (Hinge) and 2:02 (Furnace): "detail" shots are unreadable extreme
  close-ups of a texture.
- 1:12 Double Zero: flag shot is a flat blue rectangle.
- 1:14 / 2:04 / 3:50: title cards cover the boss they introduce.
- 0:26–0:30: Finsbury Park is a procedural oval — **not the real parkrun
  course**; 1:26–1:30 "Finsbury" round 2 is a generic green hill.
- Hinge (Hackney 2022) and all comeback/aftermath scenes use generic streets,
  not the GPS route. Routes that do use GPS were reduced to 50–120 points, and
  the surroundings are random boxes unrelated to the real place.
- Crowds are flat billboards; buildings are untextured boxes with repeated
  windows; trees are crossed quads; the runner is a rigid box figure whose
  feet slide and whose head is a textured sphere.
- Setback X-ray: bones clip through the scan panel; comeback runner overlaps
  log cards; several HUD elements at scale 1 are unreadable at 1080p.
- 3:58 overhead "tactical" shots show buildings rotated off the street grid.
- Codec dialogue boxes cut off mid-line when scenes end (0:40, 1:48, 2:40).

## Data issues

- Chippenham 2026 meaning reversed (see above).
- Setback scan said "AREA: ANKLE" — logs say "sore ankles"; the stress
  reaction's location is not recorded (fixed in code after v1).
- "Big Half 1:28:45" etc. shown as a "peak form" montage without the fact that
  they came *after* sub-1:30 — the cause/effect chain was lost.
