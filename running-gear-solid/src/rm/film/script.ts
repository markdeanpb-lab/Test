// The film: every scene in order. `only` filters by scene-id prefix (for previews).
import { Film, Scene } from './core';
import { prologue } from './chapters/prologue';
import { ch1 } from './chapters/ch1';
import { ch2 } from './chapters/ch2';
import { testRace } from './chapters/test';
import { wristTest } from './chapters/wristtest';

export const FPS = 24;

export function buildFilm(only?: string): Film {
  const all: Scene[] = [...prologue(), ...ch1(), ...ch2()];
  const tests: Scene[] = [testRace(), wristTest()];
  const pick = only ? [...all, ...tests].filter((s) => s.id.startsWith(only)) : all;
  return new Film(pick);
}
