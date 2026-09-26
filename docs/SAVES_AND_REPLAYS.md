# Saves, resume, export and replays

## What is saved

A universe is stored in the browser's IndexedDB (database `stalbans-racing`) in two parts:

- a **core** record: live state (people, teams, cars, venues, regulations, relationships, records, stories, news, RNG stream states, the clock) and a summary for the save list;
- one **archive chunk per season**: that season's immutable race records and the packed weekend setups used to reconstruct them.

The universe **autosaves after every weekend**. Only the season just raced is rewritten, not the whole century. During a live weekend the game also records, every few seconds, a small resume point: the meeting, session and sporting time.

`splitUniverse` / `joinUniverse` in `src/persist/db.ts` do the splitting. `tests/determinism.test.ts` checks that split → JSON → join, then continuing, gives exactly the same history as never saving.

## Resuming mid-race

Autosaves happen between weekends, so a reload returns to the state before the current weekend began. Weekends are deterministic, and a weekend that has begun is rebuilt from its stored setup, so re-running it reproduces the same race exactly. The game then fast-forwards the same engine, silently, to the stored session and second. The browser check measured resume at the same second of the same race (306 s before and after a reload).

A weekend's stored setup is reused whenever that weekend is begun again, so an export taken mid-race also resumes into the same race. `tests/determinism.test.ts` ("a save taken mid-race…") covers this.

## Export and import

Settings → Export writes a versioned JSON file (`format`, `schemaVersion`, `engineVersion`, the universe). Import validates the file and always stores it under a **new id** with "(imported)" appended. It never overwrites an existing save. Files from a newer schema are refused with an explanation. Files from a different engine version load; their recorded results stand as recorded, and replays carry a warning (below).

## Replays

Every weekend stores its **setup**: an immutable, compact snapshot of everything the race engine reads. That covers entrants, driver and car snapshots, strategy dispositions, the rules in force, the layout version, weather seeds and the race seed. Live, background and replayed weekends all run from that stored setup, so there is no second copy that could drift.

A replay (Race → Watch replay, or a chapter's "Watch" button) rebuilds the weekend from the setup and runs it with the same engine, at any speed, with the director and commentary. The universe is not modified: the replay classifies the result itself and compares a fingerprint (driver, position, laps and time for every car) with the fingerprint stored in the race record. The result panel then says either "Replay reproduced the recorded result exactly" or that it differs.

`tests/determinism.test.ts` replays every race of a simulated season and requires every one to match, and requires the universe to be byte-for-byte unchanged. The browser check replays the first race through the interface and gets "match".

### Limits

- **Engine version.** A replay is guaranteed to reproduce its record only under the engine version that recorded it (`ENGINE_VERSION`, stored on every race). Replaying a race recorded by another version is allowed but labelled: the physics or strategy may have changed.
- **Presentation is regenerated, not stored.** Commentary lines and director camera choices are produced afresh during a replay. They depend on the same events, but they are not a recording. The commentary also uses today's names for people and teams; team entries use their period branding.
- **Canonical history keeps consequential events only.** The race record stores the events that matter (lead changes, retirements, incidents, penalties, top-ten overtakes and so on). The complete stream of every minor position change exists only while a race runs or replays.
- **Setups are rounded** to four decimal places when packed. Live running uses the same rounded setup, so this never causes a mismatch, but the stored numbers are not the unrounded internal values.
- **Size.** A full century is roughly 35–45 MB in memory and in IndexedDB, about a third of it weekend setups. Browsers normally allow this; if storage is refused, the game reports that the autosave failed and keeps running.
