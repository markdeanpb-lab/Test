// Every statistic the film shows comes from this file (or career.ts).
// Values were read from the athlete's Strava account (athlete 4500815) on
// 27.09.2026 via the Strava API: activity summaries, laps (1 km auto-laps),
// heart-rate and GPS/altitude streams. Times quoted in activity titles are the
// athlete's own chip/official times and are preferred over GPS moving time.
// Nothing here is invented; fictional elements (boss names, concepts) are
// clearly separated in the `boss*` fields.

import manchesterRoute from './routes/manchester-2026.json';
import richmondRoute from './routes/richmond-2023.json';
import clawRoute from './routes/claw-2023.json';
import hackneyRoute from './routes/hackney-2024.json';
import hackney2023Route from './routes/hackney-2023.json';
import victoriaDockRoute from './routes/victoria-dock-2023.json';

export interface RouteData {
  activityId: string;
  latlng: [number, number][];
  altitude: number[];
  heartRate?: number[];
  distance?: number[];
}

export interface BossPhase {
  name: string;
  fromKm: number;
  toKm: number;
  note: string;
}

export interface BossEncounter {
  key: string;
  activityId: string;
  date: string; // DD.MM.YYYY
  stravaTitle: string;
  stravaDescription?: string;
  location: string;
  distanceKm: number;
  /** official / titled finishing time, seconds */
  timeSec: number;
  timeLabel: string;
  movingSec: number;
  elapsedSec: number;
  hrAvg?: number;
  hrMax?: number;
  elevationGain: number;
  relativeEffort?: number;
  /** per-km GPS auto-lap split times, seconds */
  splits: number[];
  /** avg HR for each auto-lap */
  splitHr?: number[];
  route?: RouteData;
  // ---- fiction layer ----
  bossName: string;
  bossSubtitle: string;
  bossConcept: string;
  phases: BossPhase[];
  result: string;
}

const hms = (h: number, m: number, s: number) => h * 3600 + m * 60 + s;

export const HINGE: BossEncounter = {
  key: 'hinge',
  activityId: '7183271311',
  date: '22.05.2022',
  stravaTitle: 'Hackney Half - 01:46:30',
  stravaDescription: 'The knee held out - great atmosphere',
  location: 'HACKNEY, LONDON',
  distanceKm: 21.31,
  timeSec: hms(1, 46, 30),
  timeLabel: '1:46:30',
  movingSec: 6390,
  elapsedSec: 6396,
  hrAvg: 183,
  hrMax: 194,
  elevationGain: 71,
  relativeEffort: 460,
  splits: [264, 268, 272, 274, 281, 285, 287, 281, 289, 296, 293, 305, 298, 310, 330, 337, 334, 315, 338, 309, 329],
  splitHr: [159, 173, 171, 187, 188, 187, 186, 188, 189, 188, 188, 188, 188, 187, 182, 182, 182, 180, 180, 182, 182],
  bossName: 'HINGE',
  bossSubtitle: 'THE JOINT THAT WOULD NOT HOLD',
  bossConcept:
    'A rusted hydraulic knee bolted to the Hackney railway viaduct. It is the protagonist\'s own injured knee made colossal: every stride is a load test.',
  phases: [
    { name: 'CONTROLLED', fromKm: 0, toKm: 5, note: 'splits 4:24-4:41' },
    { name: 'GRIND', fromKm: 5, toKm: 14, note: 'splits 4:45-5:10, HR 186-189' },
    { name: 'SEIZE', fromKm: 14, toKm: 21.31, note: 'splits 5:09-5:38' },
  ],
  result: 'JOINT HELD',
};

export const DOUBLE_ZERO_R1: BossEncounter = {
  key: 'doublezero-r1',
  activityId: '8579717477',
  date: '18.02.2023',
  stravaTitle: 'Victoria Dock - 20:00',
  stravaDescription: 'Close to sub 20 but affected massively by the wind',
  location: 'ROYAL VICTORIA DOCK, LONDON',
  distanceKm: 5.01,
  timeSec: 1200,
  timeLabel: '20:00',
  movingSec: 1201,
  elapsedSec: 1201,
  hrAvg: 172,
  hrMax: 189,
  elevationGain: 29,
  relativeEffort: 71,
  splits: [221, 234, 252, 244, 246],
  splitHr: [152, 169, 180, 181, 178],
  route: victoriaDockRoute as RouteData,
  bossName: 'DOUBLE ZERO',
  bossSubtitle: 'THE MINUTE THAT WOULD NOT BREAK',
  bossConcept:
    'A dockside sentinel whose head is a four-digit clock. It fights with wind turbines. It cannot be hurt by anything slower than 19:59.',
  phases: [
    { name: 'OPENING', fromKm: 0, toKm: 2, note: '3:41, 3:54' },
    { name: 'HEADWIND', fromKm: 2, toKm: 5.01, note: '4:12, 4:04, 4:06' },
  ],
  result: 'TIME LOCK: 20:00 - NOT UNDER',
};

export const DOUBLE_ZERO_R2: BossEncounter = {
  key: 'doublezero-r2',
  activityId: '8733307232',
  date: '18.03.2023',
  stravaTitle: '19:25',
  location: 'FINSBURY PARK, LONDON',
  distanceKm: 4.98,
  timeSec: hms(0, 19, 25),
  timeLabel: '19:25',
  movingSec: 1166,
  elapsedSec: 1166,
  hrAvg: 163,
  hrMax: 175,
  elevationGain: 56,
  relativeEffort: 53,
  splits: [215, 236, 229, 246, 238],
  splitHr: [145, 164, 170, 168, 166],
  bossName: 'DOUBLE ZERO',
  bossSubtitle: 'REMATCH',
  bossConcept: 'The clock sentinel follows the runner home to the Finsbury Park hill.',
  phases: [{ name: 'SUB-20', fromKm: 0, toKm: 4.98, note: '3:35, 3:56, 3:49, 4:06, 3:58' }],
  result: 'SUB-20 ACHIEVED',
};

export const PHANTOM_2023: BossEncounter = {
  key: 'phantom-2023',
  activityId: '9111133818',
  date: '21.05.2023',
  stravaTitle: 'Hackney Half 2023 - 1:35:30',
  stravaDescription: 'An ambitious attempt at 1:30 but happy with 1:35',
  location: 'HACKNEY, LONDON',
  distanceKm: 21.35,
  timeSec: hms(1, 35, 30),
  timeLabel: '1:35:30',
  movingSec: 5731,
  elapsedSec: 5731,
  hrAvg: 183,
  hrMax: 194,
  elevationGain: 110,
  relativeEffort: 421,
  splits: [252, 243, 249, 249, 254, 254, 254, 252, 264, 263, 266, 266, 271, 279, 279, 285, 276, 284, 303, 291, 300],
  splitHr: [183, 189, 188, 188, 187, 186, 186, 187, 186, 186, 185, 185, 184, 183, 182, 181, 181, 180, 178, 177, 174],
  route: hackney2023Route as RouteData,
  bossName: 'PHANTOM 1:30',
  bossSubtitle: 'ENCOUNTER 01',
  bossConcept: 'A wireframe pacer carrying a 1:30 flag. It cannot be caught by hoping.',
  phases: [
    { name: 'AHEAD', fromKm: 0, toKm: 12, note: 'up to 41 s ahead of 1:30 pace (GPS)' },
    { name: 'OVERTAKEN', fromKm: 12, toKm: 21.35, note: 'fade to 5:00/km' },
  ],
  result: 'PHANTOM ESCAPED',
};

export const RICHMOND: BossEncounter = {
  key: 'furnace',
  activityId: '9820689274',
  date: '10.09.2023',
  stravaTitle: 'Richmond Runfest Marathon - 3:55:11',
  stravaDescription:
    'That was really hard - managed to pass through the end when they started to cancel the race due to too many casualties.',
  location: 'RICHMOND, LONDON',
  distanceKm: 42.39,
  timeSec: hms(3, 55, 11),
  timeLabel: '3:55:11',
  movingSec: 14026,
  elapsedSec: 14116,
  hrAvg: 169,
  hrMax: 184,
  elevationGain: 75,
  relativeEffort: 739,
  splits: [291, 290, 296, 290, 290, 283, 291, 280, 292, 301, 296, 290, 289, 296, 296, 305, 303, 307, 302, 308, 316, 325, 335, 339, 351, 367, 378, 386, 396, 397, 406, 370, 409, 344, 353, 394, 372, 368, 382, 411, 374, 330],
  splitHr: [163, 178, 179, 178, 179, 179, 180, 180, 179, 178, 179, 180, 180, 179, 179, 175, 174, 175, 177, 176, 176, 174, 171, 170, 167, 166, 164, 160, 158, 158, 157, 160, 160, 166, 166, 159, 158, 158, 157, 153, 153, 163],
  route: richmondRoute as RouteData,
  bossName: 'FURNACE',
  bossSubtitle: 'THE DAY THE COURSE BURNED',
  bossConcept:
    'A riverside thermal plant that wakes up at kilometre 20. Fighting it is not about winning: it is about getting out before the gates close.',
  phases: [
    { name: 'CRUISE', fromKm: 0, toKm: 20, note: 'first half 1:43:32' },
    { name: 'MELTDOWN', fromKm: 20, toKm: 31, note: 'splits 5:16 -> 6:46' },
    { name: 'EVACUATION', fromKm: 31, toKm: 42.39, note: 'race being cancelled behind the runner' },
  ],
  result: 'SURVIVED',
};

export const CLAW: BossEncounter = {
  key: 'claw',
  activityId: '10283563227',
  date: '26.11.2023',
  stravaTitle: 'The Claw',
  stravaDescription: 'Getting it done',
  location: 'HIGHGATE, LONDON',
  distanceKm: 22.3,
  timeSec: 8050,
  timeLabel: '2:14:10',
  movingSec: 8050,
  elapsedSec: 8248,
  hrAvg: 148,
  hrMax: 180,
  elevationGain: 445,
  relativeEffort: 185,
  splits: [339, 352, 388, 507, 341, 381, 364, 386, 386, 386, 394, 398, 356, 382, 423, 371, 356, 336, 328, 326, 309, 324],
  route: clawRoute as RouteData,
  bossName: 'THE CLAW',
  bossSubtitle: 'FIVE FINGERS OF HIGHGATE',
  bossConcept:
    'A mechanical hand buried under Highgate. Each finger is a real climb from the run: the only way to beat it is to go up every one.',
  phases: [
    { name: "SWAIN'S LANE", fromKm: 0, toKm: 3, note: '' },
    { name: 'HIGHGATE HILL', fromKm: 3, toKm: 8, note: '' },
    { name: 'HIGHGATE WEST HILL', fromKm: 8, toKm: 12, note: '' },
    { name: 'HORNSEY LANE', fromKm: 12, toKm: 15, note: '' },
    { name: 'DARTMOUTH PARK HILL', fromKm: 15, toKm: 22.3, note: '' },
  ],
  result: 'CLAW RETRACTED',
};

export const PHANTOM_2024: BossEncounter = {
  key: 'phantom-2024',
  activityId: '11445196501',
  date: '19.05.2024',
  stravaTitle: 'Hackney Half 2024 - 1:29:01',
  location: 'HACKNEY, LONDON',
  distanceKm: 21.35,
  timeSec: hms(1, 29, 1),
  timeLabel: '1:29:01',
  movingSec: 5343,
  elapsedSec: 5343,
  hrAvg: 172,
  hrMax: 182,
  elevationGain: 87,
  relativeEffort: 207,
  splits: [259, 253, 249, 248, 255, 245, 249, 242, 244, 253, 249, 254, 255, 255, 246, 246, 251, 249, 253, 247, 250],
  splitHr: [139, 167, 177, 176, 175, 175, 176, 177, 178, 176, 175, 174, 174, 174, 174, 173, 174, 172, 172, 173, 172],
  route: hackneyRoute as RouteData,
  bossName: 'PHANTOM 1:30',
  bossSubtitle: 'ENCOUNTER 02',
  bossConcept: 'The same phantom, one year later. This time it is the one being chased.',
  phases: [{ name: 'METRONOME', fromKm: 0, toKm: 21.35, note: 'every split 4:02-4:19' }],
  result: 'PHANTOM DESTROYED',
};

export const MANCHESTER: BossEncounter = {
  key: 'wall',
  activityId: '18170691745',
  date: '19.04.2026',
  stravaTitle: 'Manchester Marathon - 3.20.03',
  stravaDescription:
    "The Wall Won. Didn't have it in me physically and mentally for sub 3. But now I know. Achilles giving me grief from the start and the pain didn't get any better... Now for a long rest...",
  location: 'MANCHESTER / TRAFFORD',
  distanceKm: 42.44,
  timeSec: hms(3, 20, 3),
  timeLabel: '3:20:03',
  movingSec: 11951,
  elapsedSec: 12003,
  hrAvg: 163,
  hrMax: 182,
  elevationGain: 184,
  relativeEffort: 409,
  splits: [249, 252, 252, 257, 250, 251, 249, 253, 250, 250, 251, 248, 254, 254, 254, 254, 256, 257, 248, 258, 258, 252, 258, 261, 264, 268, 282, 297, 334, 312, 331, 318, 330, 346, 329, 345, 351, 351, 346, 335, 319, 326],
  splitHr: [162, 172, 174, 173, 174, 174, 173, 174, 174, 175, 175, 175, 173, 171, 171, 174, 172, 173, 174, 177, 175, 174, 175, 173, 171, 169, 163, 160, 154, 153, 152, 153, 151, 149, 148, 148, 148, 144, 146, 151, 152, 151],
  route: manchesterRoute as RouteData,
  bossName: 'THE WALL',
  bossSubtitle: 'OBJECTIVE: SUB 3:00:00',
  bossConcept:
    'Named by the athlete: "The Wall Won." It is invisible for 26 km, then rises out of the road and never stops coming.',
  phases: [
    { name: 'THE MACHINE', fromKm: 0, toKm: 21.1, note: 'halfway 1:29:39, splits 4:08-4:18' },
    { name: 'FRICTION', fromKm: 21.1, toKm: 27, note: '4:12 -> 4:42' },
    { name: 'THE WALL', fromKm: 27, toKm: 35, note: '4:57, 5:34, 5:12, 5:31...' },
    { name: 'SURVIVAL', fromKm: 35, toKm: 42.44, note: '5:19, 5:26 to the line' },
  ],
  result: 'THE WALL WON',
};

export const FIRST_RUN = {
  activityId: '3449101540',
  date: '14.05.2020',
  startTime: '11:46',
  title: 'Lunch Run',
  location: "REGENT'S PARK",
  distanceKm: 5.07,
  movingSec: 2276, // 37:56
  elapsedSec: 2938, // 48:58
};

/** Seconds elapsed at a given GPS distance (km) using per-km splits. */
export function clockAt(splits: number[], km: number) {
  let t = 0;
  for (let i = 0; i < splits.length; i++) {
    if (km <= i + 1) return t + splits[i] * (km - i);
    t += splits[i];
  }
  return t + splits[splits.length - 1] * (km - splits.length);
}
/** Inverse: GPS distance reached at clock time t */
export function kmAt(splits: number[], t: number) {
  let acc = 0;
  for (let i = 0; i < splits.length; i++) {
    if (t <= acc + splits[i]) return i + (t - acc) / splits[i];
    acc += splits[i];
  }
  return splits.length + (t - acc) / splits[splits.length - 1];
}
/** Pace (s/km) in effect at a given km */
export const paceAt = (splits: number[], km: number) =>
  splits[Math.min(splits.length - 1, Math.max(0, Math.floor(km)))];
