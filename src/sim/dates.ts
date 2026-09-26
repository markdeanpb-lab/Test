// Calendar arithmetic. Day 0 = 1900-01-01 (proleptic Gregorian). Years always advance correctly,
// independent of whether a championship runs.
import type { Day } from './types';

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function daysInYear(y: number) { return isLeap(y) ? 366 : 365; }
export function dayOf(y: number, m: number, d: number): Day {
  // m is 1-based
  let days = 0;
  if (y >= 1900) for (let yy = 1900; yy < y; yy++) days += daysInYear(yy);
  else for (let yy = y; yy < 1900; yy++) days -= daysInYear(yy);
  for (let mm = 1; mm < m; mm++) days += mm === 2 && isLeap(y) ? 29 : MDAYS[mm - 1];
  return days + d - 1;
}
export function ymd(day: Day): { y: number; m: number; d: number } {
  let y = 1900;
  let rem = day;
  if (rem >= 0) { while (rem >= daysInYear(y)) { rem -= daysInYear(y); y++; } }
  else { while (rem < 0) { y--; rem += daysInYear(y); } }
  let m = 1;
  for (;;) { const md = m === 2 && isLeap(y) ? 29 : MDAYS[m - 1]; if (rem < md) break; rem -= md; m++; }
  return { y, m, d: rem + 1 };
}
export function yearOf(day: Day) { return ymd(day).y; }
export function fmtDate(day: Day, short = false) { const { y, m, d } = ymd(day); return short ? `${d} ${MON[m - 1]} ${y}` : `${d} ${MONTHS[m - 1]} ${y}`; }
export function fmtMonthYear(day: Day) { const { y, m } = ymd(day); return `${MONTHS[m - 1]} ${y}`; }
/** Age in whole years on a given day. */
export function ageOn(dob: Day, day: Day): number {
  const a = ymd(dob), b = ymd(day);
  let age = b.y - a.y;
  if (b.m < a.m || (b.m === a.m && b.d < a.d)) age--;
  return age;
}
export function ageYears(dob: Day, day: Day): number { return (day - dob) / 365.2425; }
/** Nearest day in the given month that falls on a Sunday (race day), deterministic. */
export function sundayNear(y: number, m: number, d: number): Day {
  const base = dayOf(y, m, d);
  const dow = (base + 1) % 7; // 1900-01-01 was a Monday -> day 0 has dow 1 (0 = Sunday)
  return base + ((7 - dow) % 7);
}
export function monthOf(day: Day) { return ymd(day).m - 1; }
