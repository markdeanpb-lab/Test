// Persistence in IndexedDB: a core record per universe (live state, people, teams, events...) plus one
// archive chunk per season (race records and weekend setups). Export/import use a versioned JSON file.
import type { Universe } from '../sim/types';
import { ENGINE_VERSION, SCHEMA_VERSION } from '../sim/types';

const DB = 'stalbans-racing';
const VER = 1;
export interface SaveSummary { id: string; name: string; seed: string; savedAt: string; year: number; phase: string; champion?: string; seasons: number; engineVersion: string; schemaVersion: number }

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('universes')) db.createObjectStore('universes', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks', { keyPath: ['uid', 'year'] });
      if (!db.objectStoreNames.contains('prefs')) db.createObjectStore('prefs');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function tx<T>(db: IDBDatabase, stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => T): Promise<T> {
  return new Promise((res, rej) => { const t = db.transaction(stores, mode); const out = fn(t); t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
}
const req = <T>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export function summarise(u: Universe): SaveSummary {
  const years = Object.keys(u.seasons).map(Number).sort((a, b) => b - a);
  const last = years.find((y) => u.seasons[y].championId);
  const ch = last ? u.people[u.seasons[last].championId!] : undefined;
  return { id: u.meta.id, name: u.meta.name, seed: u.meta.seed, savedAt: new Date().toISOString(), year: u.clock.year, phase: u.clock.phase, champion: ch ? `${ch.first} ${ch.last} (${last})` : undefined, seasons: years.length, engineVersion: u.meta.engineVersion, schemaVersion: u.meta.schemaVersion };
}

/** Save: core + per-season chunks. `years` limits which chunks are (re)written (default: all). */
export async function saveUniverse(u: Universe, years?: number[]): Promise<void> {
  const db = await open();
  const byYear = new Map<number, { races: Record<string, any>; setups: Record<string, string> }>();
  for (const [id, r] of Object.entries(u.races)) { const y = r.year; if (!byYear.has(y)) byYear.set(y, { races: {}, setups: {} }); byYear.get(y)!.races[id] = r; }
  for (const [id, s] of Object.entries(u.setups)) { const y = +id.slice(1, 5); if (!byYear.has(y)) byYear.set(y, { races: {}, setups: {} }); byYear.get(y)!.setups[id] = s; }
  const core = { ...u, races: {}, setups: {} } as Universe;
  core.meta = { ...u.meta, savedAt: new Date().toISOString() };
  await tx(db, ['universes', 'chunks'], 'readwrite', (t) => {
    t.objectStore('universes').put({ id: u.meta.id, summary: summarise(u), core });
    for (const [y, c] of byYear) if (!years || years.includes(y)) t.objectStore('chunks').put({ uid: u.meta.id, year: y, ...c });
  });
  db.close();
}

export async function listSaves(): Promise<SaveSummary[]> {
  try {
    const db = await open();
    const all = await tx(db, ['universes'], 'readonly', (t) => req(t.objectStore('universes').getAll()));
    db.close();
    const rows = (await all) as any[];
    return rows.map((r) => r.summary).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  } catch { return []; }
}

export async function loadUniverse(id: string): Promise<Universe> {
  const db = await open();
  const rec: any = await tx(db, ['universes'], 'readonly', (t) => req(t.objectStore('universes').get(id))).then((p) => p);
  const row = await rec;
  if (!row) throw new Error('Save not found');
  const chunks: any[] = await (await tx(db, ['chunks'], 'readonly', (t) => req(t.objectStore('chunks').getAll(IDBKeyRange.bound([id, -1e9], [id, 1e9])))));
  db.close();
  const u = row.core as Universe;
  check(u);
  for (const c of chunks) { Object.assign(u.races, c.races); Object.assign(u.setups, c.setups); }
  return u;
}

export async function deleteSave(id: string) {
  const db = await open();
  await tx(db, ['universes', 'chunks'], 'readwrite', (t) => { t.objectStore('universes').delete(id); t.objectStore('chunks').delete(IDBKeyRange.bound([id, -1e9], [id, 1e9])); });
  db.close();
}

export async function getPref<T>(key: string, dflt: T): Promise<T> {
  try { const db = await open(); const v = await (await tx(db, ['prefs'], 'readonly', (t) => req(t.objectStore('prefs').get(key)))); db.close(); return (v as T) ?? dflt; } catch { return dflt; }
}
export async function setPref(key: string, v: unknown) { try { const db = await open(); await tx(db, ['prefs'], 'readwrite', (t) => t.objectStore('prefs').put(v, key)); db.close(); } catch { /* preferences are optional */ } }

function check(u: any) {
  if (!u || typeof u !== 'object' || !u.meta || !u.clock || !u.people) throw new Error('This is not a St Albans Racing universe file.');
  if (u.meta.schemaVersion > SCHEMA_VERSION) throw new Error(`This save uses a newer format (schema ${u.meta.schemaVersion}); this build reads schema ${SCHEMA_VERSION}.`);
  if (u.meta.engineVersion !== ENGINE_VERSION) u.meta.engineNote = `Created with engine ${u.meta.engineVersion}; this build runs ${ENGINE_VERSION}. Results are kept as recorded; replays of older races are only guaranteed under their original engine.`;
}

export function exportUniverse(u: Universe): Blob {
  return new Blob([JSON.stringify({ format: 'st-albans-racing', schemaVersion: SCHEMA_VERSION, engineVersion: ENGINE_VERSION, exportedAt: new Date().toISOString(), universe: u })], { type: 'application/json' });
}

/** Import never overwrites: the imported universe is stored under a fresh id. */
export async function importUniverse(text: string): Promise<Universe> {
  let o: any;
  try { o = JSON.parse(text); } catch { throw new Error('The file is not valid JSON.'); }
  if (o?.format !== 'st-albans-racing' || !o.universe) throw new Error('The file is not a St Albans Racing export.');
  const u = o.universe as Universe;
  check(u);
  u.meta = { ...u.meta, id: `${u.meta.id}-imp-${Date.now().toString(36)}`, name: `${u.meta.name} (imported)` };
  await saveUniverse(u);
  return u;
}
