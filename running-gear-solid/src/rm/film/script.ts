// The film: every scene in order. `only` filters by scene-id prefix (for previews).
import { Film, Scene } from './core';
import { testRace } from './chapters/test';

export const FPS = 24;

export function buildFilm(only?: string): Film {
  const all: Scene[] = [testRace()];
  return new Film(only ? all.filter((s) => s.id.startsWith(only)) : all);
}
