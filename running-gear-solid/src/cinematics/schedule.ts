// Single source of truth for film timing. Pure data (no DOM / three.js), so the
// offline audio synthesiser can import it too.

export const FPS = 60;
export const OUTPUT_W = 1920;
export const OUTPUT_H = 1080;
/** composite framebuffer (UI resolution); final output is an exact 2x nearest upscale */
export const COMP_W = 960;
export const COMP_H = 540;
/** 3D scene resolution; upscaled 2x nearest into the composite (4x in the final video) */
export const SCENE_W = 480;
export const SCENE_H = 270;

export type SeqId =
  | 'coldOpen'
  | 'title'
  | 'training'
  | 'hingeBrief'
  | 'hinge'
  | 'doubleZero'
  | 'phantom1'
  | 'richmondBrief'
  | 'furnace'
  | 'claw'
  | 'shingles'
  | 'phantom2'
  | 'setback'
  | 'comeback'
  | 'wallBuild'
  | 'wall'
  | 'aftermath'
  | 'records'
  | 'next';

const ORDER: [SeqId, number][] = [
  ['coldOpen', 13],
  ['title', 10],
  ['training', 16],
  ['hingeBrief', 7],
  ['hinge', 22],
  ['doubleZero', 27],
  ['phantom1', 12],
  ['richmondBrief', 6],
  ['furnace', 29],
  ['claw', 17],
  ['shingles', 7],
  ['phantom2', 23],
  ['setback', 14],
  ['comeback', 13],
  ['wallBuild', 10],
  ['wall', 42],
  ['aftermath', 12],
  ['records', 14],
  ['next', 13],
];

export interface SeqSlot {
  id: SeqId;
  start: number;
  duration: number;
  end: number;
}

export const SCHEDULE: SeqSlot[] = (() => {
  let t = 0;
  return ORDER.map(([id, duration]) => {
    const s = { id, start: t, duration, end: t + duration };
    t += duration;
    return s;
  });
})();

export const DURATION = SCHEDULE[SCHEDULE.length - 1].end;
export const slot = (id: SeqId) => SCHEDULE.find((s) => s.id === id)!;
