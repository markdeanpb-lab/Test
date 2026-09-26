import { getTrack } from '../../sim/track';

/** Small route preview of a validated layout geometry: racing line, start/finish and the pit lane. */
export function RouteMap({ id, height = 140, compare }: { id: string; height?: number; compare?: string }) {
  const tr = getTrack(id);
  const g = tr.g;
  const other = compare ? getTrack(compare).g : undefined;
  const xs = [...g.x, ...(other?.x ?? [])], zs = [...g.z, ...(other?.z ?? [])];
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const pad = 30, w = maxX - minX + pad * 2, h = maxZ - minZ + pad * 2;
  const pts = (gx: number[], gz: number[]) => { const out: string[] = []; for (let i = 0; i < gx.length; i += 2) out.push(`${(gx[i] - minX + pad).toFixed(0)},${(gz[i] - minZ + pad).toFixed(0)}`); return out.join(' '); };
  const pit = g.pit.path.map((p) => `${(p[0] - minX + pad).toFixed(0)},${(p[1] - minZ + pad).toFixed(0)}`).join(' ');
  const sw = Math.max(w, h) / 90;
  return (
    <svg viewBox={`0 0 ${w.toFixed(0)} ${h.toFixed(0)}`} style={{ width: '100%', height, display: 'block' }} role="img" aria-label={`Map of ${g.name}${other ? ` compared with ${other.name}` : ''}`}>
      {other && <polygon points={pts(other.x, other.z)} fill="none" stroke="var(--series-2)" stroke-width={sw} stroke-dasharray={`${sw * 2} ${sw * 1.5}`} stroke-linejoin="round" />}
      <polygon points={pts(g.x, g.z)} fill="none" stroke="var(--series-1)" stroke-width={sw * 1.4} stroke-linejoin="round" />
      {pit && <polyline points={pit} fill="none" stroke="var(--muted)" stroke-width={sw * 0.7} stroke-dasharray={`${sw} ${sw}`} />}
      <circle cx={g.x[0] - minX + pad} cy={g.z[0] - minZ + pad} r={sw * 2.2} fill="var(--ink)" stroke="var(--panel)" stroke-width={sw * 0.8}><title>Start / finish</title></circle>
    </svg>
  );
}
