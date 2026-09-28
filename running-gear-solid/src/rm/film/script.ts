// The film: every scene in order. `only` filters by scene-id prefix (for previews).
import { Film, Scene } from './core';
import { prologue } from './chapters/prologue';
import { ch1 } from './chapters/ch1';
import { ch2 } from './chapters/ch2';
import { ch3 } from './chapters/ch3';
import { ch4 } from './chapters/ch4';
import { ch5 } from './chapters/ch5';
import { ch6 } from './chapters/ch6';
import { ch7 } from './chapters/ch7';
import { ch8 } from './chapters/ch8';
import { epilogue } from './chapters/epilogue';
import { testRace } from './chapters/test';
import { wristTest } from './chapters/wristtest';

export const FPS = 24;

export function buildFilm(only?: string): Film {
  const all: Scene[] = [...prologue(), ...ch1(), ...ch2(), ...ch3(), ...ch4(), ...ch5(), ...ch6(), ...ch7(), ...ch8(), ...epilogue()];
  const tests: Scene[] = [testRace(), wristTest()];
  const pick = only ? [...all, ...tests].filter((s) => s.id.startsWith(only)) : all;
  return new Film(pick);
}
