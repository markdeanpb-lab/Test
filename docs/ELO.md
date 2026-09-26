# Driver ratings

Each driver has an Elo-style rating of **demonstrated performance**. It is computed only from recorded results (race classification and, when valid, qualifying order). It never changes the hidden attributes that drive the simulation (pace, racecraft, consistency and so on). A rating can therefore be wrong about a driver, most of all early in a career or in a poor car.

Teams in the simulated world see drivers the way real teams do: through results and reputation. When the driver market judges a driver, it uses the rating as one observed signal, alongside noisy scouting. That is the only way ratings reach the simulation, and it affects who gets hired, never how fast anyone is.

Implementation: `src/sim/world/elo.ts`. Tests: `tests/rules.test.ts` ("Elo rating treatment").

## Update rule

After every race that is not abandoned, each pair of starters (i, j) is compared.

- Score S = 1 if i was classified ahead of j, 0 if behind. Non-classified cars are ordered by distance covered.
- Expectation E = 1 / (1 + 10^(−((Rᵢ + Cᵢ) − (Rⱼ + Cⱼ)) / 400)), where R is the driver rating and C is the rating of the car each drove (see below).
- Each comparison has a weight w (below). A driver's evidence is the weighted mean deviation:

  Δᵢ = K(rdᵢ) · [ Σⱼ wᵢⱼ (Sᵢⱼ − Eᵢⱼ) / Σⱼ wᵢⱼ ] · min(1, Σⱼ wᵢⱼ / (N − 1))

  The mean means a 30-car field does not produce bigger swings than a 12-car field. The last factor scales the update by how much evidence the race actually gave (1 for a full race of comparisons).
- K(rd) = 12 + 0.22 · rd, where rd is the rating's uncertainty. It starts at ±180 for a rookie, shrinks by 6% per rated race (floor ±45), and grows by 25 per season a driver sits out (cap ±220).
- Qualifying adds comparisons at weight 0.3 when the format is a real timed session. Grids decided by ballot carry no evidence.

## Weights

| Situation | Weight on each comparison |
|---|---|
| Both classified or retired through their own doing (driver error, collision) | 1 |
| Against a team-mate | × 2.0: team-mates share equipment, so these comparisons say the most about the driver |
| Retired with a **mechanical** failure | 0.5 × (laps completed ÷ laps run) |
| Retired for "other" causes (for example running out of fuel) | 0.3 × (laps completed ÷ laps run) |
| Disqualified | 0.3 |
| Qualifying order (valid timed formats only) | 0.3 (× 2.0 against a team-mate) |

A pair's weight is the smaller of the two drivers' weights. So a car that breaks on lap 1 contributes almost nothing, neither for its driver nor for the drivers it "beat". A car that breaks with two laps to go still counts, at a discount, for the running position it had earned. Driver errors and collisions count in full: they are the driver's evidence.

Measured on the unit fixtures: a lap-1 mechanical retirement moves a rating by under a tenth of what a lap-1 crash does, and a late mechanical failure moves it more than an early one but less than a crash at the same point.

## Car ratings

Each season's car has its own rating C, starting at half of the team's previous car's rating (0 for a new team). After every race the car absorbs the part of each result not explained within the team (a gain of 18 × mean deviation × 0.5, for comparisons with weight ≥ 0.5; bounded to ±400). This stops a dominant car from simply inflating its drivers: beating slower cars in a much faster car is expected and earns little.

## Peaks, ages and what the numbers mean

- A peak rating counts only after ten rated races, so a lucky early run cannot set one. The peak's date, age and race are stored.
- Ratings compare drivers with the people they actually raced. Across eras whose drivers never met, and with different race lengths, reliability and numbers of races, ratings are not strictly comparable. The head-to-head view says so whenever two careers did not overlap.
- The **greatness index** in History → All-time is a separate, labelled editorial construction. It is a weighted sum of titles, wins, podiums, poles, peak rating above 1500, and share of team-mate comparisons won (scaled by sample size). The weights are shown and can be changed in the interface; it is an opinion, not a measurement.
