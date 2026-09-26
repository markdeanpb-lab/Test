// Line chart for ratings over time: one y-axis, 2px lines, recessive grid, legend for >=2 series with
// direct end labels, hover crosshair + tooltip, and an accessible table fallback supplied by callers.
import { useRef, useState } from 'preact/hooks';

export interface Series { name: string; slot: 1 | 2 | 3; points: [number, number][]; marks?: { x: number; label: string }[] }

export function LineChart({ series, height = 220, yLabel, fmtX = (x) => String(Math.floor(x)), fmtY = (y) => String(Math.round(y)), ariaLabel }: { series: Series[]; height?: number; yLabel?: string; fmtX?: (x: number) => string; fmtY?: (y: number) => string; ariaLabel: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ x: number; px: number } | null>(null);
  const all = series.flatMap((s) => s.points);
  if (all.length < 2) return <p class="small muted">Not enough rated races yet to draw a trajectory.</p>;
  const W = 640, H = height, m = { l: 44, r: series.length > 1 ? 92 : 44, t: 10, b: 24 };
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs) + 1e-6;
  const yPad = (Math.max(...ys) - Math.min(...ys)) * 0.08 + 10;
  const y0 = Math.floor((Math.min(...ys) - yPad) / 50) * 50, y1 = Math.ceil((Math.max(...ys) + yPad) / 50) * 50;
  const sx = (x: number) => m.l + ((x - x0) / (x1 - x0)) * (W - m.l - m.r);
  const sy = (y: number) => m.t + (1 - (y - y0) / (y1 - y0)) * (H - m.t - m.b);
  const yTicks: number[] = []; const step = (y1 - y0) / 50 > 8 ? 100 : 50; for (let y = y0; y <= y1; y += step) yTicks.push(y);
  const xTicks: number[] = []; const span = x1 - x0; const xs2 = span > 40 ? 10 : span > 15 ? 5 : span > 6 ? 2 : 1; for (let x = Math.ceil(x0 / xs2) * xs2; x <= x1; x += xs2) xTicks.push(x);
  const path = (pts: [number, number][]) => pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join('');
  const nearest = (s: Series, x: number) => { let best = s.points[0]; for (const p of s.points) if (Math.abs(p[0] - x) < Math.abs(best[0] - x)) best = p; return best; };
  const onMove = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const x = x0 + ((px - m.l) / (W - m.l - m.r)) * (x1 - x0);
    if (x < x0 || x > x1) { setHover(null); return; }
    setHover({ x, px: (e.clientX - r.left) });
  };
  return (
    <div class="chart-wrap">
      {series.length > 1 && <div class="chart-legend">{series.map((s) => <span><i style={{ background: `var(--series-${s.slot})` }} />{s.name}</span>)}</div>}
      <svg ref={ref} class="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} onPointerMove={onMove as any} onPointerLeave={() => setHover(null)} style={{ touchAction: 'pan-y' }}>
        {yTicks.map((y) => <g><line x1={m.l} x2={W - m.r} y1={sy(y)} y2={sy(y)} stroke="var(--grid)" stroke-width="1" /><text x={m.l - 6} y={sy(y) + 4} text-anchor="end" font-size="11" fill="var(--axis-ink)">{fmtY(y)}</text></g>)}
        {xTicks.map((x) => <text x={sx(x)} y={H - 6} text-anchor="middle" font-size="11" fill="var(--axis-ink)">{fmtX(x)}</text>)}
        {yLabel && <text x={4} y={m.t + 4} font-size="11" fill="var(--axis-ink)" dominant-baseline="hanging" transform={`rotate(-90 4 ${m.t + 4})`} text-anchor="end">{yLabel}</text>}
        {series.map((s) => <path d={path(s.points)} fill="none" stroke={`var(--series-${s.slot})`} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />)}
        {series.flatMap((s) => (s.marks ?? []).map((mk) => { const p = nearest(s, mk.x); return <g><circle cx={sx(p[0])} cy={sy(p[1])} r="5" fill={`var(--series-${s.slot})`} stroke="var(--chart-surface)" stroke-width="2"><title>{mk.label}</title></circle></g>; }))}
        {series.length > 1 && series.map((s) => { const p = s.points[s.points.length - 1]; return <g><circle cx={sx(p[0])} cy={sy(p[1])} r="4" fill={`var(--series-${s.slot})`} stroke="var(--chart-surface)" stroke-width="2" /><text x={sx(p[0]) + 8} y={sy(p[1]) + 4} font-size="11" fill="var(--ink-2)">{s.name}</text></g>; })}
        {hover && <line x1={sx(hover.x)} x2={sx(hover.x)} y1={m.t} y2={H - m.b} stroke="var(--axis-ink)" stroke-width="1" />}
        {hover && series.map((s) => { const p = nearest(s, hover.x); return <circle cx={sx(p[0])} cy={sy(p[1])} r="4" fill={`var(--series-${s.slot})`} stroke="var(--chart-surface)" stroke-width="2" />; })}
      </svg>
      {hover && <div class="chart-tip" style={{ left: hover.px, top: 30 }}>{fmtX(hover.x)}{series.map((s) => ` · ${s.name}: ${fmtY(nearest(s, hover.x)[1])}`).join('')}</div>}
    </div>
  );
}

/** Elo history (packed [day, rating*10]) as chart points in fractional years, optionally cut off at a date. */
export function eloPoints(history: number[], until?: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < history.length; i += 2) { if (until !== undefined && history[i] > until) break; pts.push([1900 + history[i] / 365.2425, history[i + 1] / 10]); }
  return pts;
}
