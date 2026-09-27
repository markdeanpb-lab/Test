// Career-level facts derived from the full Strava run history
// (1,231 "Run" activities, 14.05.2020 - 27.09.2026; one duplicate upload of
// the 11.09.2021 Hampstead Heath 10k excluded). Personal bests are the times
// the athlete wrote in activity titles.

export const CAREER = {
  asOf: '27.09.2026',
  firstRun: '14.05.2020',
  runs: 1231,
  distanceKm: 9219,
  movingHours: 831,
  elevationM: 78546,
  yearly: [
    { year: 2020, km: 122.8, runs: 25 },
    { year: 2021, km: 232.7, runs: 41 },
    { year: 2022, km: 1194.1, runs: 198 },
    { year: 2023, km: 1802.8, runs: 237 },
    { year: 2024, km: 2201.0, runs: 267 },
    { year: 2025, km: 2006.1, runs: 279 },
    { year: 2026, km: 1659.6, runs: 184, partial: true },
  ],
  biggestMonth: { month: 'MAR 2026', km: 311 },
  highestRelativeEffort: { value: 739, activity: 'RICHMOND MARATHON 10.09.2023' },
  pbs: [
    { event: 'MILE', time: '5:06', where: 'GOLDEN STAG MILE', date: '19.07.2024' },
    { event: '5K', time: '18:19', where: 'STRIDERS FESTIVE 5K', date: '16.12.2025' },
    { event: '10K', time: '39:04', where: "REGENT'S PARK 10K", date: '21.03.2026' },
    { event: 'HALF', time: '1:24:17', where: 'ROBIN HOOD HALF', date: '29.09.2024' },
    { event: 'MARATHON', time: '3:20:03', where: 'MANCHESTER', date: '19.04.2026' },
  ],
  finsburyParkruns: 95,
  lastRun: { date: '27.09.2026', km: 20.01 },
};

/** Titled parkrun / 5K times on the road to sub-20 (Strava titles). */
export const SUB20_CHAIN = [
  { date: '19.03.2022', time: '21:53' },
  { date: '26.03.2022', time: '21:30' },
  { date: '16.04.2022', time: '21:04' },
  { date: '28.05.2022', time: '20:37' },
  { date: '30.07.2022', time: '20:34' },
  { date: '27.08.2022', time: '20:15' },
  { date: '28.01.2023', time: '20:21' },
  { date: '18.02.2023', time: '20:00' },
  { date: '11.03.2023', time: '20:07' },
  { date: '18.03.2023', time: '19:25' },
];

export interface LogEntry {
  date: string;
  headline: string;
  stat?: string;
  quote?: string;
}

/** Early career (basic training montage) */
export const EARLY_LOG: LogEntry[] = [
  { date: '19.06.2020', headline: 'RUN 6', quote: 'OUCH MY SHINS' },
  { date: '21.08.2021', headline: 'FIRST PARKRUN BACK', stat: '25:39' },
  { date: '31.03.2022', headline: 'FIRST HALF MARATHON (SOLO)', stat: '1:51:17', quote: 'RETIRING MY RUNNING SHOES' },
  { date: '02.05.2022', headline: 'VITALITY 10K', stat: '43:54' },
];

/** 2023 highlights between bosses */
export const LOG_2023: LogEntry[] = [
  { date: '15.04.2023', headline: 'BATTERSEA 10K', stat: '39:35', quote: 'SUB-40' },
  { date: '14.07.2023', headline: 'GOLDEN STAG MILE', stat: '5:12', quote: '1ST IN HEAT' },
  { date: '21.07.2023', headline: 'FINSBURY 5000s', stat: '18:55', quote: 'LAST 2KM WERE ABSOLUTELY BRUTAL' },
];

/** Peak form, 2024 */
export const PEAK_2024: LogEntry[] = [
  { date: '21.06.2024', headline: 'FINSBURY 5KS', stat: '18:46', quote: '1ST PLACE IN RACE 2' },
  { date: '01.09.2024', headline: 'BIG HALF', stat: '1:28:45' },
  { date: '07.09.2024', headline: 'FINSBURY PARKRUN', stat: '18:52', quote: 'FINALLY SUB 19 AT FINSBURY' },
  { date: '29.09.2024', headline: 'ROBIN HOOD HALF', stat: '1:24:17' },
  { date: '05.10.2024', headline: 'NEW 5K PB', stat: '18:42' },
];

export const SETBACK_LOG: LogEntry[] = [
  { date: '15.10.2024', headline: 'PULLING OUT OF TRACK TONIGHT', quote: 'SORE ANKLES' },
  { date: '29.10.2024', headline: 'ANKLE TEST', quote: "LET'S SEE HOW IT FEELS TOMORROW MORNING" },
  { date: '01.11.2024', headline: 'VALENCIA MARATHON DREAM OVER', quote: 'WE WILL COME BACK STRONGER' },
  { date: '20.11.2024', headline: 'WEIGHT TRAINING', quote: "ABSOLUTE SNOOZE FEST - CAN'T WAIT TO BE BACK RUNNING" },
  { date: '17.12.2024', headline: 'RUN', quote: 'ONE FOR THE COMEBACK MONTAGE' },
];

export const COMEBACK_LOG: LogEntry[] = [
  { date: '21.12.2024', headline: 'COMEBACK PARKRUN', stat: '21:40', quote: 'FULL SEND THE FIRST LAP AND THEN BIG REGRETS' },
  { date: '28.12.2024', headline: 'BACK TO SUB 20 PARKRUN!', stat: '19:48' },
  { date: '01.03.2025', headline: 'FINAL FINSBURY PARKRUN', stat: '19:10', quote: 'AFTER 95 PARKRUNS AT FINSBURY' },
  { date: '29.03.2025', headline: 'NEW 5K PB', stat: '18:28' },
  { date: '18.05.2025', headline: 'HACKNEY HALF', stat: '1:26:28', quote: 'HACKNEY PB' },
  { date: '08.06.2025', headline: 'ST ALBANS HALF', stat: '1:26:21', quote: 'BRUTALLY HILLY COURSE' },
  { date: '16.12.2025', headline: 'STRIDERS FESTIVE 5K', stat: '18:19', quote: 'NEW PB' },
];

export const WALL_BUILDUP: LogEntry[] = [
  { date: '21.12.2025', headline: 'WEEK 1/18', quote: 'MANCHESTER MARATHON TRAINING' },
  { date: '08.02.2026', headline: 'WEEK 8/18', quote: 'MISSED MULTIPLE SESSIONS TO CALM SHIN DOWN' },
  { date: '15.03.2026', headline: 'BATH HALF', stat: '1:28:08', quote: 'BIG BLOW UP AFTER 10K' },
  { date: '21.03.2026', headline: "REGENT'S PARK 10K", stat: '39:04', quote: 'PB' },
  { date: '31.03.2026', headline: 'CALF', quote: 'GOT TO GET TO THE START LINE IN ONE PIECE' },
];

export const AFTERMATH_LOG: LogEntry[] = [
  { date: '21.04.2026', headline: 'WALK TO THE END OF MY STREET WITH CRUTCHES', stat: '5:00', quote: 'NEW PB - 2 MINUTES OFF MY TIME FROM YESTERDAY' },
  { date: '02.05.2026', headline: 'RETURN TO RUN FOLLOWING MARATHON' },
  { date: '16.05.2026', headline: 'FUTAKOTAMAGAWA PARKRUN, JAPAN', stat: '19:50', quote: 'HOT HOT HOT' },
  { date: '13.09.2026', headline: 'CHIPPENHAM HALF', quote: 'GOODBYE TO THE 1.30 PACE GROUP' },
  { date: '26.09.2026', headline: 'ST ALBANS PARKRUN', stat: '18:43', quote: 'WHERE DID THAT COME FROM' },
];
