// Minimal OSM XML loader for the build pipeline (tile files from the OSM API 0.6 /map endpoint).
import fs from 'node:fs';
import path from 'node:path';
import sax from 'sax';

export interface OsmNode { id: number; lat: number; lon: number; tags?: Record<string, string> }
export interface OsmWay { id: number; nodes: number[]; tags: Record<string, string> }
export interface OsmRelation { id: number; members: { type: string; ref: number; role: string }[]; tags: Record<string, string> }
export interface OsmData { nodes: Map<number, OsmNode>; ways: Map<number, OsmWay>; relations: Map<number, OsmRelation> }

function parseFile(file: string, out: OsmData): Promise<void> {
  return new Promise((resolve, reject) => {
    const parser = sax.createStream(true, {});
    let cur: any = null;
    parser.on('opentag', (t: any) => {
      const a = t.attributes;
      if (t.name === 'node') {
        cur = { kind: 'node', v: { id: +a.id, lat: +a.lat, lon: +a.lon } as OsmNode };
      } else if (t.name === 'way') {
        cur = { kind: 'way', v: { id: +a.id, nodes: [], tags: {} } as OsmWay };
      } else if (t.name === 'relation') {
        cur = { kind: 'rel', v: { id: +a.id, members: [], tags: {} } as OsmRelation };
      } else if (t.name === 'nd' && cur?.kind === 'way') {
        cur.v.nodes.push(+a.ref);
      } else if (t.name === 'member' && cur?.kind === 'rel') {
        cur.v.members.push({ type: a.type, ref: +a.ref, role: a.role });
      } else if (t.name === 'tag' && cur) {
        if (cur.kind === 'node') (cur.v.tags ??= {})[a.k] = a.v;
        else cur.v.tags[a.k] = a.v;
      }
    });
    parser.on('closetag', (name: string) => {
      if ((name === 'node' || name === 'way' || name === 'relation') && cur) {
        if (cur.kind === 'node') out.nodes.set(cur.v.id, cur.v);
        else if (cur.kind === 'way') {
          const prev = out.ways.get(cur.v.id);
          if (!prev || prev.nodes.length < cur.v.nodes.length) out.ways.set(cur.v.id, cur.v);
        } else out.relations.set(cur.v.id, cur.v);
        cur = null;
      }
    });
    parser.on('error', reject);
    parser.on('end', resolve);
    fs.createReadStream(file).pipe(parser);
  });
}

export async function loadOsmDir(dir: string): Promise<OsmData> {
  const out: OsmData = { nodes: new Map(), ways: new Map(), relations: new Map() };
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.osm')).sort();
  for (const f of files) await parseFile(path.join(dir, f), out);
  return out;
}
