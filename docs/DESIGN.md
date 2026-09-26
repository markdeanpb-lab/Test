# Design notes and assumptions

## One authoritative simulation

Everything that happens (races, careers, money, rules, history) comes from one deterministic simulation in `src/sim/`. It has no knowledge of rendering, the DOM or time of day. The interface only observes it and issues commands: play, speed, follow, simulate.

- **Randomness** comes from named, seeded sfc32 streams (`streamFor(seed, label)`): one each for the season, events, market, per-race sporting draws and weather. Visual and audio randomness (crowd bobbing, parked cars, livery details) uses separate `cosmetic:` streams, so presentation can never change a result.
- **Numerics** avoid platform-dependent functions in sporting code. `dexp`, `dlog`, `dpow` and `dtanh` are implemented in `dmath.ts`, so a seed gives the same history on any engine.
- **Fixed clock.** The race engine advances in 0.1 s steps. Live viewing at 1× runs ten steps per second of real time; 20× runs 200; "Next moment", "Simulate season" and the background worker run as many as they can. The step function is the same in every case (`tests/determinism.test.ts` plays races with irregular frame times at 1×, 5× and 20× and compares them with headless runs).
- **Stable IDs** (people `P…`, teams `T…`, lineages, cars `C<year>-T…`, meetings `M<year>-<round>`, events `E…`) link every fact. Events carry `causes` and `effects`, so the history can explain itself: a regulation cites the accident review that prompted it, and a cancelled meeting cites the fuel shortage.
- **Live state versus history.** Mutable state (people, teams, venues) is separate from immutable history (race records, season archives, record-breaking entries). Career statistics are a cache rebuilt from race records whenever needed (`rebuildCareers`), including "as known on date X" for spoiler-safe views.
- **Workers.** Long simulations ("Simulate season", "+10 years", generating a century) run in a Web Worker from a structured clone of the universe, with progress and safe cancellation between tasks.

## The city and circuits

The map pipeline (`tools/`) downloads OpenStreetMap data and elevation tiles for central St Albans. It builds a drivable street graph and routes each circuit through named junctions along real streets. It then validates each layout:
- a closed loop with no self-crossing
- only permitted streets
- a drivable minimum radius
- plausible gradients and widths
- a racing line clear of mapped buildings
- a pit lane on a clear corridor

The result is five circuits in eleven layout variants (reverse directions and chicane versions), all passing; see `docs/CIRCUITS.md`. Pit lanes and chicanes are fictional additions and are listed as such.

## Racing

- **Physics** is a point-mass model on the racing line. Corner speed comes from grip and downforce, the speed profile from forward and backward passes limited by power, drag, brakes and gradient, and a friction ellipse links braking and cornering. Wet grip, tyre temperature and wear, fuel load, damage and dirty air all feed the same profile.
- **Racing behaviour**: IDM-style following, two lanes where the road is wide enough, attack and defence with one defensive move per lap, and slipstream only in the same lane. An overtake is recorded only after the new order has held for 2 s, with a reason: faster on the straight, braking, a mistake ahead, a spin, the pits. Mistakes happen at corner entry, scaled by consistency, pressure, fatigue and conditions.
- **Strategy**: tyre compounds by era; wear projections blended with prior expectations; refuelling where the rules allow; weather-driven tyre changes with hysteresis; the mandatory-two-compound rule in its era.
- **Failures**: hazard-based per car system, affected by reliability, heat, age of technology and driver mechanical sympathy.
- **Flags and officiating**: safety car where the rules have one, localised yellows, red flags (restarts where permitted, otherwise results on the lap before), and blue flags where enforced. Stewards apply the era's regime: fines only in the early years, time penalties later, drive-throughs in the modern era, for collisions and jump starts.
- **Classification** (`race/results.ts`) always reaches a valid terminal state: finished, shortened (time limit or red flag) or abandoned. Positions are contiguous, and cars that cover too little of the winner's distance are not classified (era rule).
- **Qualifying** formats follow the regulations: a ballot in the early years, then practice times, single-lap and knockout.

## The world

- **Drivers** have separate hidden attributes and a personal development profile (growth rate, physical and mental peaks, decline, volatility, late blooming). Rookies arrive every year from a junior pool; about 7% are children of former drivers. Ability is not inherited, only opportunity and attention. Relationships (rivalry, friendship, mentorship, dispute) form from on-track episodes and team life, and are recorded with their causes.
- **Teams** have finances (prize money by position, sponsors that renew on exposure and the economy, owner backing, wages, development and operations), knowledge in five technical areas with diminishing returns and diffusion, and a lineage that survives renames and takeovers. Mergers keep the absorbed team's records separate. Teams in distress refinance, are taken over, merge or withdraw; new teams are recruited when the grid thins.
- **Cars** are designed each year from knowledge, technology and regulations, with a concept gamble. They receive in-season upgrades that can fail. Visual eras follow the technology and the year: vintage, streamliner, front-engined, cigar, wedge, ground-effect, turbo, raised-nose, aero, hybrid, and future designs after 2025.
- **Technology**: 33 technologies unlock as a world industry index grows. The first adopter is recorded, others follow, and regulators may ban a technology once it dominates.
- **Regulations** change only for a cause: safety reviews after accidents, dominance, costs, environmental pressure, speed, or format. Stability gates stop churn; points systems, for example, change at most every eight years. Each weekend stores the rules actually in force, and each rule set records its announcement date and reasons.
- **Weather** is a process: cloud, rain and standing water evolve during a session; the forecast is noisy and never reads the future.
- **Events** cover the wider world (recessions, booms, fuel shortages, national emergencies that suspend racing, environmental campaigns) and local life (road works, residents' objections, resurfacing, safety upgrades after accidents).
- **The calendar** holds about ten meetings a year and opens with the prestigious St Albans Grand Prix. It never places more than two consecutive meetings on one layout without a recorded reason, and records why each meeting and layout was chosen, cancelled or postponed.
- **Records** keep their full history of holders (set, broken, equalled, with the previous holder). Award keys make them idempotent.
- **Stories** are detected after the fact from recorded results and events: rivalries, title fights, dynasties and declines, long waits for a first win, stalled prospects, comebacks, revivals, breakthroughs, families, technical gambles, engineers who rebuild teams, and rain masters. Each carries its evidence (beats with facts and race links), a state and an uncertainty note. Stories describe the simulation; they never steer it.
- **Commentary and journalism** are template-based and driven by events, with semantic cooldowns. Nothing is said without an event behind it, and each report takes one angle rather than listing everything. No language model is used.

## Assumptions and deliberate simplifications

- The championship is fictional and exists in an alternate St Albans. The real town's history, and real people and teams, are not modelled.
- The streets are today's streets, from current OpenStreetMap data, used for every era. Layout versions change surfaces, barriers, safety, pit facilities and chicanes over time, but the road network itself is not back-dated.
- Buildings are shown as OSM footprints with heights estimated from their type. The cathedral and clock tower are modelled as landmarks. Terrain is SRTM-derived, smoothed along each route and exaggerated 1.6× vertically for readability.
- Cars are point masses on a racing line with lateral lanes, not full vehicle dynamics. Contact and damage are probabilistic outcomes of close racing, not rigid-body collisions.
- Fatal accidents are **off by default**. When enabled ("historical realism"), they are rare, confined mostly to low-safety eras, and handled without graphic detail.
- Money is kept in real terms (2025 pounds). Inflation is tracked for display only.
- The championship keeps going after 2025 with the same rules for change; "future" car designs are extrapolations.
- A full century takes about 4 s per simulated year in Node on a laptop-class CPU, and about 5 s per year in a browser worker (measured). Explore mode therefore generates in the background while the opening race is watched.
