// Original pixel-art codec portraits, drawn procedurally in four shades of
// phosphor green. 80x100 pixels, displayed at 2x.

export type CharId = 'stride' | 'tempo' | 'lactate' | 'gearbox';

export const CHARACTERS: Record<CharId, { name: string; role: string; freq: string }> = {
  stride: { name: 'STRIDE', role: 'FIELD OPERATIVE', freq: '' },
  tempo: { name: 'MAJOR TEMPO', role: 'MISSION COMMAND', freq: '142.19' },
  lactate: { name: 'DR. LACTATE', role: 'PHYSIOLOGY', freq: '121.10' },
  gearbox: { name: 'GEARBOX', role: 'EQUIPMENT', freq: '105.00' },
};

const P = ['#04140a', '#0e3a1c', '#1f6e34', '#3fae56', '#8cf29a'];

const cache = new Map<string, HTMLCanvasElement>();

export function portrait(id: CharId, mouth: number, blink: boolean): HTMLCanvasElement {
  const key = `${id}:${mouth}:${blink}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 80;
  c.height = 100;
  const g = c.getContext('2d')!;
  const R = (x: number, y: number, w: number, h: number, i: number) => {
    g.fillStyle = P[i];
    g.fillRect(x, y, w, h);
  };
  const E = (cx: number, cy: number, rx: number, ry: number, i: number) => {
    g.fillStyle = P[i];
    for (let y = -ry; y <= ry; y++) {
      const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
      g.fillRect(cx - w, cy + y, w * 2, 1);
    }
  };
  // background gradient + scan texture
  R(0, 0, 80, 100, 0);
  for (let y = 0; y < 100; y += 4) R(0, y, 80, 1, 1);

  // shoulders / body
  const body = () => {
    E(40, 104, 38, 22, 2);
    E(40, 106, 34, 18, 1);
  };
  const neck = () => R(34, 70, 12, 12, 2);
  const face = (cx = 40, cy = 50, rx = 18, ry = 23) => {
    E(cx, cy, rx, ry, 3);
    E(cx + 5, cy + 2, rx - 6, ry - 4, 2); // shading on right side
    E(cx - 3, cy - 1, rx - 5, ry - 3, 3);
  };
  const eyes = (y: number, sep = 8, glasses = false) => {
    if (glasses) {
      g.strokeStyle = P[4];
      g.lineWidth = 1;
      g.strokeRect(40 - sep - 5, y - 3, 9, 7);
      g.strokeRect(40 + sep - 4, y - 3, 9, 7);
      R(40 - 1, y, 2, 1, 4);
    }
    if (blink) {
      R(40 - sep - 3, y + 1, 6, 1, 0);
      R(40 + sep - 2, y + 1, 6, 1, 0);
    } else {
      R(40 - sep - 3, y, 6, 3, 0);
      R(40 + sep - 2, y, 6, 3, 0);
      R(40 - sep - 1, y, 2, 2, 4);
      R(40 + sep, y, 2, 2, 4);
    }
  };
  const brows = (y: number, sep = 8, angry = 0) => {
    R(40 - sep - 4, y - angry, 8, 2, 1);
    R(40 + sep - 3, y + angry, 8, 2, 1);
  };
  const nose = (y: number) => {
    R(39, y, 3, 6, 2);
    R(38, y + 5, 5, 2, 1);
  };
  const mouthDraw = (y: number, w = 10) => {
    if (mouth === 0) R(40 - w / 2, y, w, 2, 1);
    else if (mouth === 1) {
      R(40 - w / 2, y - 1, w, 4, 0);
      R(40 - w / 2 + 2, y + 2, w - 4, 1, 1);
    } else {
      R(40 - w / 2 + 1, y - 2, w - 2, 6, 0);
      R(40 - w / 2 + 3, y + 2, w - 6, 2, 1);
    }
  };

  if (id === 'stride') {
    body();
    // running singlet straps
    R(24, 84, 6, 16, 3);
    R(50, 84, 6, 16, 3);
    neck();
    face();
    // short hair + headband + head torch
    E(40, 30, 19, 10, 1);
    R(21, 32, 38, 5, 4);
    R(21, 33, 38, 1, 3);
    R(36, 29, 8, 7, 2);
    R(38, 31, 4, 3, 4);
    eyes(50);
    brows(45, 8, 1);
    nose(52);
    mouthDraw(63, 10);
    // stubble
    for (let i = 0; i < 18; i++) R(27 + ((i * 7) % 26), 60 + ((i * 5) % 9), 1, 1, 2);
  } else if (id === 'tempo') {
    body();
    // uniform collar + stopwatch
    R(20, 86, 40, 3, 3);
    E(40, 94, 6, 6, 4);
    E(40, 94, 4, 4, 1);
    R(40, 90, 1, 4, 4);
    R(38, 86, 4, 3, 4);
    neck();
    face(40, 52, 19, 22);
    // beret
    E(38, 30, 22, 8, 1);
    R(16, 32, 44, 4, 1);
    R(52, 28, 6, 4, 2);
    eyes(50, 9);
    brows(45, 9, -1);
    nose(53);
    // moustache
    R(29, 62, 22, 3, 1);
    R(27, 63, 4, 2, 1);
    R(49, 63, 4, 2, 1);
    mouthDraw(67, 8);
    // scar
    R(51, 42, 1, 12, 1);
  } else if (id === 'lactate') {
    body();
    // lab coat lapels + stethoscope
    R(26, 82, 6, 18, 4);
    R(48, 82, 6, 18, 4);
    g.strokeStyle = P[1];
    g.beginPath();
    g.arc(40, 88, 9, 0, Math.PI);
    g.stroke();
    neck();
    face(40, 51, 17, 22);
    // hair bun
    E(40, 30, 20, 11, 1);
    E(40, 17, 8, 7, 1);
    R(20, 32, 6, 22, 1);
    R(54, 32, 6, 22, 1);
    eyes(50, 8, true);
    brows(44, 8, 0);
    nose(53);
    mouthDraw(64, 8);
  } else {
    body();
    // headset mic
    neck();
    face(40, 52, 18, 22);
    // messy hair
    for (let i = 0; i < 9; i++) E(24 + i * 4, 30 + (i % 3) * 2, 5, 6, 1);
    // goggles on forehead
    R(22, 34, 36, 7, 2);
    E(31, 37, 6, 4, 4);
    E(49, 37, 6, 4, 4);
    E(31, 37, 4, 2, 1);
    E(49, 37, 4, 2, 1);
    eyes(51, 8);
    brows(46, 8, 0);
    nose(54);
    mouthDraw(65, 10);
    R(58, 50, 4, 12, 2);
    R(46, 62, 14, 2, 2);
    R(44, 61, 4, 4, 4);
  }
  // CRT scanlines over everything
  g.globalAlpha = 0.25;
  for (let y = 1; y < 100; y += 2) R(0, y, 80, 1, 0);
  g.globalAlpha = 1;
  cache.set(key, c);
  return c;
}
