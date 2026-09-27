# METAL GEAR STRIDE

A year of Mark's Strava running (Oct 2025 - Sep 2026) retold as a series of PS1-era stealth-game boss fights.

**Watch:** [`out/metal_gear_stride.mp4`](out/metal_gear_stride.mp4) (3m47s, 1080p, with sound)

| # | Boss | Activity | Why this boss |
|---|------|----------|---------------|
| 1 | Psycho Mantis | *The run saved by Daft Punk* (9 Nov 2025, 23 km) | He reads your mind until you switch the "controller port": Radio 4 to *Alive 2007* |
| 2 | Revolver Ocelot | Striders Festive 5k, 18:19 PB (16 Dec 2025) | Twelve 400 m laps inside a ring of C4 and ricochets |
| 3 | M1 Tank | Fred Hughes 10 Mile (18 Jan 2026) | Two armoured laps of Potters Crouch on tired legs |
| 4 | Cyborg Ninja | Regents Park 10k, 39:04 (21 Mar 2026) | Stealth camo = the GPS that said you were under 39 |
| 5 | Vulcan Raven | Gade Valley 20 miler (22 Mar 2026) | The giant of Ashridge, the day after a 10k PB |
| 6 | Metal Gear REX | Manchester Marathon, 3:20:03 (19 Apr 2026) | "The Wall Won." Game over, continue, crutches, comeback |
| 7 | Sniper Wolf | Chippenham Half (13 Sep 2026) | Her wolf pack is the 1:30 pace group that got away at 14 km |
| 8 | Liquid Snake | St Albans parkrun, 18:43 course PB (26 Sep 2026) | The final fistfight: "Where did that come from" |

Every battle screen is driven by the real activity: the radar map is the GPS trace, and the HUD, heart-rate/elevation graph and split bars come from that run's streams and laps. Life bars follow the story the splits tell. The Ocelot fight is the exception: its 48-point GPS trace was too coarse to read as a track, so it uses an idealised 400 m oval centred on the real track position.

## Rebuild

```sh
pip install -r requirements.txt
python3 render.py                 # full video -> out/metal_gear_stride.mp4
python3 render.py --still 48      # PNG still at t=48s, for layout checks
```

- `data.py`: the Strava data (routes, heart rate and altitude downsampled to 48 points, plus splits)
- `render.py`: scenes, HUD and timeline. Frames are drawn at 640x360 and upscaled 3x with nearest-neighbour.
- `sound.py`: an original chiptune soundtrack and sound effects, synthesised with numpy

A fan-made parody for personal use. All music and art are original and procedural.
