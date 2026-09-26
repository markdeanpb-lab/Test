import { loadOsmDir } from './lib/osm';
import { buildGraph } from './lib/graph';
const d = await loadOsmDir('data-raw/osm');
const g = buildGraph(d);
const streets = process.argv.slice(2);
// junction nodes between any two of the listed streets (or a listed street and any other named street when only one given)
const byNode = new Map<number, Set<string>>();
for (const e of g.edges) for (const n of [e.a, e.b]) { if (!byNode.has(n)) byNode.set(n, new Set()); byNode.get(n)!.add(e.name || '(' + e.cls + ')'); }
for (const [n, names] of byNode) {
  const hit = [...names].filter((x) => streets.includes(x));
  if (hit.length === 0) continue;
  if (streets.length > 1 && hit.length < 2 && !(names.size >= 2 && streets.length === 1)) continue;
  if (names.size < 2) continue;
  const p = g.nodes.get(n)!;
  console.log(n, [...names].join(' | '), `x=${p.x.toFixed(0)} z=${p.z.toFixed(0)}`);
}
