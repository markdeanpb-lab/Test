// Drivable street graph built from OSM ways, with a constrained shortest-path router.
import type { OsmData } from './osm';
import { project } from './geo';

export const DRIVABLE = new Set(['trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street']);

/** Default carriageway widths (m) by class, used when OSM has no width/lanes tag. */
export function roadWidth(tags: Record<string, string>): number {
  const w = parseFloat(tags.width ?? '');
  if (w > 3 && w < 30) return w;
  const lanes = parseInt(tags.lanes ?? '', 10);
  const base: Record<string, number> = { trunk: 10, primary: 9.5, primary_link: 7, secondary: 8.5, secondary_link: 6.5, tertiary: 7.5, tertiary_link: 6, unclassified: 6, residential: 6.2, living_street: 5, service: 4.5, pedestrian: 7 };
  let b = base[tags.highway] ?? 6;
  if (lanes >= 2) b = Math.max(b, lanes * 3.4 + 0.6);
  if (tags.oneway === 'yes' && !(lanes >= 2)) b = Math.min(b, 6);
  return b;
}

export interface Edge { a: number; b: number; wayId: number; name: string; cls: string; width: number; len: number; bridge: boolean }
export interface Graph { nodes: Map<number, { x: number; z: number; lat: number; lon: number }>; adj: Map<number, Edge[]>; edges: Edge[] }

export function buildGraph(d: OsmData): Graph {
  const nodes: Graph['nodes'] = new Map();
  const adj = new Map<number, Edge[]>();
  const edges: Edge[] = [];
  for (const w of d.ways.values()) {
    if (!DRIVABLE.has(w.tags.highway)) continue;
    if (w.tags.area === 'yes') continue;
    const width = roadWidth(w.tags);
    for (let i = 0; i + 1 < w.nodes.length; i++) {
      const na = d.nodes.get(w.nodes[i]), nb = d.nodes.get(w.nodes[i + 1]);
      if (!na || !nb) continue;
      for (const n of [na, nb]) if (!nodes.has(n.id)) { const [x, z] = project(n.lat, n.lon); nodes.set(n.id, { x, z, lat: n.lat, lon: n.lon }); }
      const A = nodes.get(na.id)!, B = nodes.get(nb.id)!;
      const e: Edge = { a: na.id, b: nb.id, wayId: w.id, name: w.tags.name ?? w.tags.ref ?? '', cls: w.tags.highway, width, len: Math.hypot(A.x - B.x, A.z - B.z), bridge: w.tags.bridge === 'yes' };
      edges.push(e);
      if (!adj.has(e.a)) adj.set(e.a, []);
      if (!adj.has(e.b)) adj.set(e.b, []);
      adj.get(e.a)!.push(e); adj.get(e.b)!.push(e);
    }
  }
  return { nodes, adj, edges };
}

export function nearestNode(g: Graph, lat: number, lon: number, names?: string[]): number {
  const [x, z] = project(lat, lon);
  let best = -1, bd = Infinity;
  for (const [id, n] of g.nodes) {
    if (names) { const es = g.adj.get(id) ?? []; if (!es.some((e) => names.includes(e.name))) continue; }
    const dd = (n.x - x) ** 2 + (n.z - z) ** 2;
    if (dd < bd) { bd = dd; best = id; }
  }
  return best;
}

/** Dijkstra with a strong cost penalty for streets outside `allowed` and a ban on `forbidden` nodes. */
export function route(g: Graph, from: number, to: number, allowed: Set<string> | null, forbidden: Set<number>): number[] | null {
  const dist = new Map<number, number>([[from, 0]]);
  const prev = new Map<number, number>();
  const open: [number, number][] = [[0, from]];
  const done = new Set<number>();
  while (open.length) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
    const [du, u] = open.splice(bi, 1)[0];
    if (done.has(u)) continue; done.add(u);
    if (u === to) break;
    for (const e of g.adj.get(u) ?? []) {
      const v = e.a === u ? e.b : e.a;
      if (forbidden.has(v) && v !== to) continue;
      const pen = allowed && !allowed.has(e.name) ? 25 : 1;
      const nd = du + e.len * pen;
      if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, u); open.push([nd, v]); }
    }
  }
  if (!prev.has(to) && from !== to) return null;
  const path = [to];
  while (path[path.length - 1] !== from) path.push(prev.get(path[path.length - 1])!);
  return path.reverse();
}

export function edgeBetween(g: Graph, a: number, b: number): Edge | undefined {
  return (g.adj.get(a) ?? []).find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
}
