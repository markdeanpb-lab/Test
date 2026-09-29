// CHAPTER 5 - HAIRLINE (Oct - Dec 2024)
// A stress reaction. The boss you cannot fight: a crack that grows across the screen.
import { CodecScene } from '../Codec';
import { chapterCard, logCard, boardCard } from '../common';
import { hairlineBoss } from './hairline';
import { Card, grid } from '../Cards';
import { COL, env, smooth, clamp01, Hud } from '../../hud/Hud';
import { hash } from '../../engine/assets';
import { Scene } from '../core';

/** a branching crack drawn progressively (u 0..1), deterministic */
export function crack(h: Hud, u: number, seed = 1, alpha = 1, col = '#f4f4f4') {
  const g = h.g;
  g.save();
  g.globalAlpha = alpha;
  g.strokeStyle = col;
  g.shadowColor = col;
  g.shadowBlur = 8;
  const branch = (x: number, y: number, ang: number, len: number, depth: number, s: number, t0: number) => {
    const steps = 18;
    let px = x, py = y;
    for (let k = 0; k < steps; k++) {
      const tk = t0 + (k / steps) * (1 - t0) * 0.7;
      if (u < tk) break;
      const a2 = ang + (hash(s, k, depth) - 0.5) * 0.9;
      const nx = px + Math.cos(a2) * (len / steps), ny = py + Math.sin(a2) * (len / steps);
      g.lineWidth = Math.max(0.6, 3.2 - depth * 1.1 - k * 0.08);
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(nx, ny);
      g.stroke();
      if (depth < 2 && hash(s, k, 7) < 0.16) branch(nx, ny, a2 + (hash(s, k, 8) < 0.5 ? -0.8 : 0.8), len * 0.45, depth + 1, s * 3 + k, tk);
      px = nx;
      py = ny;
    }
  };
  branch(-20, 300 + hash(seed) * 200, 0.08, 2100, 0, seed, 0);
  g.restore();
}

export function ch5(): Scene[] {
  const scenes: Scene[] = [chapterCard('c5-card', 'CHAPTER 5', 'HAIRLINE', 'OCTOBER  -  DECEMBER 2024')];
  scenes.push(
    logCard('c5-ankles', [
      ['15.10.2024', 'sore ankles'],
      ['29.10.2024', 'Ankle test'],
    ], { title: 'MISSION LOG  -  VALENCIA BUILD', hold: 0.8, col: COL.amber }),
    new CodecScene({
      id: 'c5-codec-ankles',
      freq: '140.96',
      tint: 'amber',
      lines: [
        { who: 'LACTATE', text: 'Your ankles. How long have they been sore?' },
        { who: 'STRIDE', text: "A couple of weeks. It's fine. Valencia's close. I'll run through it." },
        { who: 'LACTATE', text: 'Stride. If you run through it, something comes through the other way.' },
      ],
    }),
    hairlineBoss(),
    logCard('c5-over', [['01.11.2024', 'Valencia Marathon dream over - we will come back stronger.']], { hold: 1.8, col: COL.red }),
    boardCard('c5-cancelled', { dur: 7, op: 'VALENCIA MARATHON', objective: 'OBJECTIVE', target: 'VALENCIA', size: 0.55, strike: 1, sub: 'MARATHON  -  DECEMBER 2024', status: 'MISSION CANCELLED', statusCol: COL.red }),
    new Card({
      id: 'c5-continue',
      dur: 12,
      draw: (t, h) => {
        const a = env(t, 0, 12, 0.5, 0.8);
        h.text('LOG: "ABSOLUTE SNOOZE FEST."', 960, 260, { font: 'mono', size: 28, color: COL.uiDim, align: 'center', alpha: a * smooth(0.3, 0.8, t), tracking: 4 });
        h.text('WEIGHTS', 960, 320, { font: 'mono', size: 22, color: COL.uiDim, align: 'center', alpha: a * smooth(0.3, 0.8, t), tracking: 10 });
        h.text('CONTINUE?', 960, 540, { font: 'head', size: 120, weight: 700, color: COL.red, align: 'center', alpha: a * smooth(1.5, 2.2, t), tracking: 20, glow: 20 });
        const blink = Math.floor(t * 2) % 2 === 0;
        h.text(t > 6 ? '> YES' : 'YES', 860, 680, { font: 'mono', size: 44, color: t > 6 ? COL.white : COL.uiDim, align: 'center', alpha: a * smooth(3, 3.5, t) * (t > 6 && t < 7.5 && !blink ? 0.3 : 1), tracking: 6 });
        h.text('EXIT', 1060, 680, { font: 'mono', size: 44, color: COL.uiDim, align: 'center', alpha: a * smooth(3, 3.5, t), tracking: 6 });
        h.text('LOG: "ONE FOR THE COMEBACK MONTAGE."', 960, 850, { font: 'mono', size: 30, color: COL.green, align: 'center', alpha: a * smooth(8, 8.6, t), tracking: 4 });
        grid(h, a * 0.3);
      },
      cues: [{ t: 1.5, kind: 'gameover' }, { t: 6, kind: 'select' }],
    }),
    logCard('c5-log-2024', [['31.12.2024', "Still thinking about what could've been at Valencia... Maybe we will try a marathon again... most importantly I've had a great time running with all my friends."]], { hold: 2 }),
  );
  return scenes;
}
