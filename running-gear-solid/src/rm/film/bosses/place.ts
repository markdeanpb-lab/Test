// Placement helpers for bosses next to a race course.
import type { RaceScene } from '../RaceScene';

/** which side of the course (+1 right / -1 left) has water at `off` metres (defaults to +1) */
export function waterSide(race: RaceScene, s: number, off: number) {
  const wet = (side: number) => {
    const p = race.place(s, side * off);
    return race.arena.data.maskAt(p.x, p.z);
  };
  return wet(-1) > wet(1) ? -1 : 1;
}

/** yaw that makes an object at course offset `side` face back towards the course */
export function faceCourse(dx: number, dz: number, side: number) {
  return Math.atan2(side * dz, -side * dx);
}

/** m:ss for a race-clock display */
export function mmss(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
