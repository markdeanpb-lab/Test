import * as THREE from 'three';
import { rng } from '../core/util';
import { drawText, textWidth } from '../hud/font';

// Procedural low-resolution textures (PS1 VRAM was 1 MB - so are we, roughly).
// Everything is drawn with seeded randomness so the film is reproducible.

const cache = new Map<string, THREE.Texture>();

function make(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, r: () => number) => void, repeat = true) {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  draw(g, rng(key.split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0));
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  cache.set(key, t);
  return t;
}

const rgb = (r: number, g: number, b: number) => `rgb(${r | 0},${g | 0},${b | 0})`;

function speckle(g: CanvasRenderingContext2D, r: () => number, w: number, h: number, base: [number, number, number], amp: number, n = 1) {
  for (let y = 0; y < h; y += n)
    for (let x = 0; x < w; x += n) {
      const k = (r() - 0.5) * amp;
      g.fillStyle = rgb(base[0] + k, base[1] + k, base[2] + k);
      g.fillRect(x, y, n, n);
    }
}

export const TEX = {
  concrete: () =>
    make('concrete', 64, 64, (g, r) => {
      speckle(g, r, 64, 64, [128, 128, 124], 26, 2);
      g.fillStyle = 'rgba(40,40,40,0.5)';
      g.fillRect(0, 31, 64, 1);
      g.fillRect(31, 0, 1, 64);
      for (let i = 0; i < 6; i++) {
        g.fillStyle = `rgba(60,55,50,${0.1 + r() * 0.2})`;
        g.fillRect(r() * 60, r() * 40, 2 + r() * 6, 8 + r() * 20);
      }
    }),
  brick: () =>
    make('brick', 64, 64, (g, r) => {
      g.fillStyle = '#5a4a40';
      g.fillRect(0, 0, 64, 64);
      for (let row = 0; row < 8; row++) {
        const off = row % 2 ? 8 : 0;
        for (let col = -1; col < 5; col++) {
          const k = r() * 40 - 20;
          g.fillStyle = rgb(128 + k, 58 + k * 0.5, 44 + k * 0.4);
          g.fillRect(col * 16 + off + 1, row * 8 + 1, 14, 6);
        }
      }
    }),
  metal: () =>
    make('metal', 64, 64, (g, r) => {
      speckle(g, r, 64, 64, [100, 106, 110], 18, 2);
      g.fillStyle = 'rgba(20,20,24,0.8)';
      g.fillRect(0, 0, 64, 1);
      g.fillRect(0, 32, 64, 1);
      g.fillRect(0, 0, 1, 64);
      g.fillRect(32, 0, 1, 64);
      g.fillStyle = '#c8ccd0';
      for (const [x, y] of [[3, 3], [28, 3], [3, 28], [28, 28], [35, 3], [60, 3], [35, 28], [60, 28], [3, 35], [28, 35], [3, 60], [28, 60], [35, 35], [60, 35], [35, 60], [60, 60]])
        g.fillRect(x, y, 2, 2);
    }),
  rust: () =>
    make('rust', 64, 64, (g, r) => {
      speckle(g, r, 64, 64, [96, 70, 56], 30, 2);
      for (let i = 0; i < 30; i++) {
        g.fillStyle = `rgba(${140 + r() * 60},${60 + r() * 30},20,${0.3 + r() * 0.4})`;
        g.fillRect(r() * 64, r() * 64, 2 + r() * 8, 2 + r() * 8);
      }
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(0, 0, 64, 2);
      g.fillStyle = '#b0a090';
      for (let i = 4; i < 64; i += 12) g.fillRect(i, 4, 2, 2);
    }),
  hazard: () =>
    make('hazard', 32, 32, (g) => {
      g.fillStyle = '#e8c020';
      g.fillRect(0, 0, 32, 32);
      g.fillStyle = '#141414';
      for (let i = -32; i < 64; i += 16) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i + 8, 0);
        g.lineTo(i + 8 + 32, 32);
        g.lineTo(i + 32, 32);
        g.fill();
      }
    }),
  asphalt: () =>
    make('asphalt', 64, 64, (g, r) => {
      speckle(g, r, 64, 64, [58, 58, 62], 14, 2);
      for (let i = 0; i < 5; i++) {
        g.fillStyle = 'rgba(20,20,22,0.5)';
        g.fillRect(r() * 64, r() * 64, 1 + r() * 10, 1);
      }
    }),
  road: () =>
    make('road', 32, 64, (g, r) => {
      speckle(g, r, 32, 64, [56, 56, 60], 12, 2);
      g.fillStyle = '#d8d8c8';
      g.fillRect(15, 4, 2, 24);
      g.fillStyle = '#b8b8a8';
      g.fillRect(0, 0, 1, 64);
      g.fillRect(31, 0, 1, 64);
    }),
  grass: () =>
    make('grass', 64, 64, (g, r) => {
      speckle(g, r, 64, 64, [58, 86, 44], 22, 2);
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(${90 + r() * 30},${120 + r() * 30},60,0.6)`;
        g.fillRect(r() * 64, r() * 64, 1, 2);
      }
    }),
  gravel: () => make('gravel', 64, 64, (g, r) => speckle(g, r, 64, 64, [140, 128, 108], 40, 2)),
  water: () =>
    make('water', 64, 64, (g, r) => {
      g.fillStyle = '#20384a';
      g.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 70; i++) {
        g.fillStyle = `rgba(${110 + r() * 60},${150 + r() * 60},${170 + r() * 50},${0.25 + r() * 0.35})`;
        g.fillRect(r() * 64, r() * 64, 3 + r() * 9, 1);
      }
    }),
  windows: () =>
    make('windows', 64, 64, (g, r) => {
      g.fillStyle = '#2a2c30';
      g.fillRect(0, 0, 64, 64);
      for (let y = 2; y < 64; y += 8)
        for (let x = 2; x < 64; x += 8) {
          const lit = r();
          g.fillStyle = lit > 0.8 ? '#e0c878' : lit > 0.7 ? '#8a9aa8' : '#121418';
          g.fillRect(x, y, 5, 5);
        }
    }),
  darkWindows: () =>
    make('darkWindows', 64, 64, (g, r) => {
      g.fillStyle = '#6a625a';
      g.fillRect(0, 0, 64, 64);
      for (let y = 3; y < 64; y += 10)
        for (let x = 3; x < 64; x += 8) {
          g.fillStyle = r() > 0.85 ? '#d8b868' : '#1a1c22';
          g.fillRect(x, y, 4, 6);
        }
    }),
  terrace: () =>
    make('terrace', 64, 64, (g, r) => {
      // red brick terrace facade with windows + door
      for (let y = 0; y < 64; y += 4)
        for (let x = 0; x < 64; x += 8) {
          const k = r() * 30;
          g.fillStyle = rgb(120 + k, 56 + k * 0.4, 42);
          g.fillRect(x + (y % 8 ? 4 : 0) - 4, y, 7, 3);
        }
      g.fillStyle = '#e8e0d0';
      g.fillRect(8, 10, 14, 16);
      g.fillRect(40, 10, 14, 16);
      g.fillRect(8, 38, 14, 16);
      g.fillStyle = '#1c2230';
      g.fillRect(10, 12, 10, 12);
      g.fillRect(42, 12, 10, 12);
      g.fillRect(10, 40, 10, 12);
      g.fillStyle = '#2a3a2a';
      g.fillRect(42, 36, 10, 28);
    }),
  corrugated: (hue = 0) =>
    make('corrugated' + hue, 32, 32, (g, r) => {
      const pal = [[160, 60, 40], [50, 90, 130], [70, 110, 70], [170, 130, 50], [120, 120, 124]][hue % 5];
      for (let x = 0; x < 32; x++) {
        const k = x % 4 < 2 ? 18 : -12;
        g.fillStyle = rgb(pal[0] + k, pal[1] + k, pal[2] + k);
        g.fillRect(x, 0, 1, 32);
      }
      for (let i = 0; i < 6; i++) {
        g.fillStyle = 'rgba(80,50,30,0.4)';
        g.fillRect(r() * 32, r() * 32, 3, 2 + r() * 5);
      }
    }),
  stone: () =>
    make('stone', 32, 32, (g, r) => {
      speckle(g, r, 32, 32, [118, 116, 108], 30, 2);
      g.fillStyle = 'rgba(40,60,30,0.5)';
      for (let i = 0; i < 8; i++) g.fillRect(r() * 32, 20 + r() * 12, 3, 3);
    }),
  foliage: () =>
    make('foliage', 64, 64, (g, r) => {
      g.clearRect(0, 0, 64, 64);
      for (let i = 0; i < 260; i++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * 28;
        const x = 32 + Math.cos(a) * d * 0.9;
        const y = 30 + Math.sin(a) * d;
        const k = r() * 40;
        g.fillStyle = rgb(30 + k, 58 + k, 30 + k * 0.4);
        g.fillRect(x | 0, y | 0, 3, 3);
      }
      g.fillStyle = '#3a2a1c';
      g.fillRect(30, 50, 4, 14);
    }, false),
  crowd: () =>
    make('crowd', 128, 32, (g, r) => {
      // 8 silhouettes, alpha background
      g.clearRect(0, 0, 128, 32);
      for (let i = 0; i < 8; i++) {
        const x = i * 16;
        const k = r();
        const body = [rgb(40 + k * 120, 40 + r() * 60, 50 + r() * 100), rgb(20, 20, 26), rgb(120, 30, 30), rgb(30, 60, 110)][i % 4];
        g.fillStyle = body;
        g.fillRect(x + 4, 12, 8, 20);
        g.fillStyle = rgb(160 + r() * 60, 120 + r() * 40, 90 + r() * 30);
        g.fillRect(x + 5, 5, 6, 7);
        g.fillStyle = body;
        if (i % 3 === 0) {
          g.fillRect(x + 1, 4, 3, 10); // raised arm
          g.fillRect(x + 12, 4, 3, 10);
        } else {
          g.fillRect(x + 2, 13, 2, 10);
          g.fillRect(x + 12, 13, 2, 10);
        }
      }
    }, false),
  face: () =>
    make('face', 16, 16, (g) => {
      g.fillStyle = '#d8a882';
      g.fillRect(0, 0, 16, 16);
      g.fillStyle = '#3a2418';
      g.fillRect(0, 0, 16, 4);
      g.fillRect(0, 0, 2, 7);
      g.fillRect(14, 0, 2, 7);
      g.fillStyle = '#5a3a28';
      g.fillRect(3, 5, 4, 1);
      g.fillRect(9, 5, 4, 1);
      g.fillStyle = '#f0e8e0';
      g.fillRect(3, 6, 3, 2);
      g.fillRect(10, 6, 3, 2);
      g.fillStyle = '#1a1010';
      g.fillRect(4, 6, 2, 2);
      g.fillRect(10, 6, 2, 2);
      g.fillStyle = '#b07a60';
      g.fillRect(7, 8, 2, 3);
      g.fillStyle = '#7a3a30';
      g.fillRect(5, 12, 6, 1);
    }, false),
  // spherical head map: u=0.25 front (+z), 0.5 right side, 0.75 back
  head: (hair = '#3a2418', skin = '#d8a882') =>
    make('head:' + hair + skin, 32, 16, (g) => {
      g.fillStyle = skin;
      g.fillRect(0, 0, 32, 16);
      g.fillStyle = hair;
      g.fillRect(0, 0, 32, 5); // top
      g.fillRect(17, 0, 15, 11); // back of the head
      g.fillRect(0, 0, 1, 10);
      g.fillStyle = '#b07a5c';
      g.fillRect(1, 7, 2, 3); // ear left
      g.fillRect(14, 7, 2, 3); // ear right
      // face centred on x=8
      g.fillStyle = '#4a2c1c';
      g.fillRect(4, 6, 3, 1);
      g.fillRect(9, 6, 3, 1);
      g.fillStyle = '#f0e8e0';
      g.fillRect(4, 7, 3, 1);
      g.fillRect(9, 7, 3, 1);
      g.fillStyle = '#1a1010';
      g.fillRect(5, 7, 1, 1);
      g.fillRect(10, 7, 1, 1);
      g.fillStyle = '#b87e62';
      g.fillRect(7, 8, 2, 2);
      g.fillStyle = '#8a4a3c';
      g.fillRect(6, 11, 4, 1);
      g.fillStyle = 'rgba(60,40,30,0.35)';
      g.fillRect(4, 10, 8, 3); // stubble shadow
    }),
  headSide: () =>
    make('headSide', 16, 16, (g) => {
      g.fillStyle = '#d8a882';
      g.fillRect(0, 0, 16, 16);
      g.fillStyle = '#3a2418';
      g.fillRect(0, 0, 16, 5);
      g.fillRect(9, 0, 7, 9);
      g.fillStyle = '#c08a6a';
      g.fillRect(6, 6, 3, 4);
      g.fillStyle = '#b07a5c';
      g.fillRect(0, 7, 2, 3);
    }, false),
  hairBack: () =>
    make('hairBack', 16, 16, (g) => {
      g.fillStyle = '#3a2418';
      g.fillRect(0, 0, 16, 16);
      g.fillStyle = '#d8a882';
      g.fillRect(3, 12, 10, 4);
    }, false),
  cemetery: () =>
    make('cemetery', 32, 64, (g, r) => {
      speckle(g, r, 32, 64, [92, 94, 90], 24, 2);
      g.fillStyle = 'rgba(20,20,20,0.6)';
      g.fillRect(8, 12, 16, 2);
      g.fillRect(10, 18, 12, 1);
      g.fillRect(10, 22, 12, 1);
    }),
  panel: () =>
    make('panel', 64, 64, (g, r) => {
      g.fillStyle = '#1a2224';
      g.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 12; i++) {
        g.fillStyle = r() > 0.5 ? '#3a8a4a' : '#8a3a2a';
        g.fillRect(4 + (i % 4) * 15, 6 + Math.floor(i / 4) * 18, 4, 3);
      }
      g.fillStyle = '#2a3436';
      g.fillRect(2, 44, 60, 16);
      g.fillStyle = '#52c070';
      for (let x = 4; x < 60; x += 3) g.fillRect(x, 60 - r() * 14, 2, 2);
    }),
  xray: () =>
    make('xray', 64, 64, (g) => {
      g.fillStyle = '#0a1418';
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = 'rgba(160,200,220,0.2)';
      for (let y = 0; y < 64; y += 2) g.fillRect(0, y, 64, 1);
    }),
};

/** Race bib: white card with number/text */
export function bibTexture(text: string) {
  return make('bib:' + text, 64, 32, (g) => {
    g.fillStyle = '#f2f2ea';
    g.fillRect(0, 0, 64, 32);
    g.fillStyle = '#c02020';
    g.fillRect(0, 0, 64, 6);
    g.fillRect(0, 28, 64, 4);
    const w = textWidth(text, 2);
    drawText(g, text, (64 - w) / 2, 10, 2, '#101010');
  }, false);
}

/** Text rendered onto a small texture (signs, banners) */
export function signTexture(text: string, fg = '#fff', bg = '#000', w = 128, h = 16, scale = 1) {
  return make(`sign:${text}:${fg}:${bg}:${w}x${h}:${scale}`, w, h, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    const tw = textWidth(text, scale);
    drawText(g, text, Math.round((w - tw) / 2), Math.round((h - 7 * scale) / 2), scale, fg);
  }, false);
}
