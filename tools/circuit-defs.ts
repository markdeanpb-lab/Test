// Circuit definitions as ordered via-junctions on the real St Albans street graph (OSM node IDs).
// The router fills in the path between vias using only the listed streets (other streets are heavily penalised
// and reported). Every route is re-validated by build-map.ts: continuity, closure, no self-crossing, junction
// turn feasibility, width, gradient and pit lane clearance.
//
// "Fictional racing modifications" (chicanes, temporary pit lanes) are declared explicitly and flagged as such
// in the output: they are not claims about real road layouts.

export interface ChicaneMod { kind: 'chicane'; street: string; at: number; length: number; reason: string }
export interface CircuitDef {
  id: string;
  name: string;
  short: string;
  character: string;
  vias: number[]; // closed loop: first via is repeated implicitly at the end
  streets: string[]; // permitted street names ('' = unnamed link roads such as slip roads)
  sfStreets: string[]; // streets searched for the clearest start/finish straight and pit lane site
  pitLength?: number; // pit lane length excluding tapers (default 300 m)
  cornerNames?: Record<string, string>; // overrides for auto-generated corner names
  sfAt: number; // preferred position along that street's run on the route (0..1)
  surfaceEra1920: 'setts' | 'macadam' | 'tarmac';
  variants: { key: string; label: string; reverse?: boolean; mods?: ChicaneMod[]; note: string }[];
}

const J = {
  peahen: 490664, // Chequer St / Holywell Hill / High St / London Rd
  townHall: 490669, // St Peter's St / Chequer St / Victoria St
  clockTower: 13341455, // High St / George St / Verulam Rd
  romeland: 24579969, // George St / Romeland Hill
  fishpoolTop: 24580162, // Romeland Hill / Fishpool St
  stMichaels: 25151652, // St Michael's St / Fishpool St
  stMichaelsLink: 2277855442,
  bluehouseLink: 2277855465,
  bluehouseRbtS: 17258127, // King Harry Lane / Bluehouse Hill Roundabout
  bluehouseRbtN: 17258130,
  kingHarryE: 15114203, // Watford Rd / King Harry Lane
  stStephens: 490779, // St Stephen's Hill / Watford Road / Watling St
  verulamFolly: 1781626960, // Folly Lane / Verulam Rd
  follyCatherine: 17888214, // Folly Lane / Catherine St
  catherineA1081: 13607805,
  stPetersRbtN: 17561279,
  hatfieldA1081: 17561278,
  stanhope: 490695, // Hatfield Rd / Stanhope Rd / Clarence Rd
  victoriaEast: 1744011, // Victoria St / Stanhope Rd
  almaVictoria: 490671,
  almaLondon: 1644177596,
  stonecross: 13884246, // St Peter's St / Avenue Rd / Stonecross
  harpendenTownsend: 21685469, // Harpenden Rd / Townsend Drive
  batchwoodE: 1733660, // Harpenden Rd / Batchwood Drive
  batchwoodRbtDrive: 1622659103,
  batchwoodRbtRedbourn: 17258134,
  redbournVerulam: 13342158,
};

export const CIRCUITS: CircuitDef[] = [
  {
    id: 'abbey',
    name: 'Abbey & Verulamium Circuit',
    short: 'Abbey',
    character: 'The classic. A plunge down Holywell Hill, the long King Harry Lane beside Verulamium, then the narrow climb up Fishpool Street past the Cathedral to the Clock Tower.',
    vias: [J.peahen, J.stStephens, J.kingHarryE, J.bluehouseRbtS, J.bluehouseRbtN, J.bluehouseLink, J.stMichaelsLink, J.stMichaels, J.fishpoolTop, J.romeland, J.clockTower],
    streets: ['Holywell Hill', "St Stephen's Hill", 'A5183', 'Watford Road', 'King Harry Lane', 'Bluehouse Hill Roundabout', 'Bluehouse Hill', '', "St Michael's Street", 'Fishpool Street', 'Romeland Hill', 'George Street', 'High Street', 'Chequer Street'],
    sfStreets: ['King Harry Lane'],
    cornerNames: { 'King Harry': "St Stephen's", 'Fishpool Bend': 'Kingsbury', 'Fishpool Bend 2': 'Fishpool', 'King Harry Bend': 'Verulamium Kink' },
    sfAt: 0.55,
    surfaceEra1920: 'macadam',
    variants: [
      { key: 'v1', label: 'Original', note: 'Full-speed descent of Holywell Hill.' },
      { key: 'v2', label: 'Holywell chicane', mods: [{ kind: 'chicane', street: 'Holywell Hill', at: 0.55, length: 42, reason: 'Temporary barrier chicane to cut the downhill approach speed to the St Stephen\'s corner (fictional racing modification).' }], note: 'Barrier chicane halfway down Holywell Hill.' },
      { key: 'rev', label: 'Reverse', reverse: true, note: 'Run anticlockwise: Fishpool Street downhill, Holywell Hill as a long climb.' },
    ],
  },
  {
    id: 'verulam',
    name: 'Verulam Triangle',
    short: 'Verulam',
    character: 'A tight triangle from the Market Place: past the Clock Tower, out along Verulam Road, back through Folly Lane and Catherine Street to the wide St Peter\'s Street.',
    vias: [J.townHall, J.peahen, J.clockTower, J.verulamFolly, J.follyCatherine, J.catherineA1081, J.stPetersRbtN],
    streets: ["St Peter's Street", 'Chequer Street', 'High Street', 'Verulam Road', 'Folly Lane', 'Catherine Street', 'A1081'],
    sfStreets: ["St Peter's Street"],
    sfAt: 0.5,
    surfaceEra1920: 'setts',
    variants: [
      { key: 'v1', label: 'Original', note: 'Uses the full width of St Peter\'s Street for the start.' },
      { key: 'v2', label: 'Verulam Road chicane', mods: [{ kind: 'chicane', street: 'Verulam Road', at: 0.45, length: 40, reason: 'Barrier chicane on the Verulam Road descent after run-off concerns (fictional racing modification).' }], note: 'Chicane on Verulam Road.' },
    ],
  },
  {
    id: 'london',
    name: 'London Road Circuit',
    short: 'London Road',
    character: 'Short and stop-start: down London Road from the Peahen, a hard left into Alma Road, then the climb up Victoria Street towards the Town Hall (the City station sits just beyond the Alma Road corner).',
    vias: [J.townHall, J.peahen, J.almaLondon, J.almaVictoria],
    streets: ['Chequer Street', 'London Road', 'Alma Road', 'Victoria Street', "St Peter's Street"],
    sfStreets: ['Victoria Street', 'London Road', 'Alma Road', 'Chequer Street'],
    pitLength: 200,
    sfAt: 0.45,
    surfaceEra1920: 'setts',
    variants: [
      { key: 'v1', label: 'Original', note: 'Tight, low-speed street course.' },
      { key: 'rev', label: 'Reverse', reverse: true, note: 'Victoria Street downhill into a tight left at Alma Road.' },
    ],
  },
  {
    id: 'hatfield',
    name: 'Hatfield Road Circuit',
    short: 'Hatfield',
    character: 'Fast and wide: up St Peter\'s Street, a long blast east along Hatfield Road, then back via Stanhope Road and Victoria Street.',
    vias: [J.townHall, J.stPetersRbtN, J.hatfieldA1081, J.stanhope, J.victoriaEast],
    streets: ["St Peter's Street", 'A1081', 'Hatfield Road', 'Stanhope Road', 'Victoria Street'],
    sfStreets: ['Hatfield Road'],
    sfAt: 0.5,
    surfaceEra1920: 'macadam',
    variants: [
      { key: 'v1', label: 'Original', note: 'Long Hatfield Road straight.' },
      { key: 'v2', label: 'Hatfield chicane', mods: [{ kind: 'chicane', street: 'Hatfield Road', at: 0.9, length: 42, reason: 'Chicane to limit top speed on Hatfield Road (fictional racing modification).' }], note: 'Chicane before Stanhope Road.' },
    ],
  },
  {
    id: 'batchwood',
    name: 'Batchwood Road Course',
    short: 'Batchwood',
    character: 'The high-speed northern loop: Harpenden Road, the sweeping and exposed Batchwood Drive, back in along Redbourn Road and Folly Lane.',
    vias: [J.stPetersRbtN, J.stonecross, J.harpendenTownsend, J.batchwoodE, J.batchwoodRbtDrive, J.batchwoodRbtRedbourn, J.redbournVerulam, J.verulamFolly, J.follyCatherine, J.catherineA1081],
    streets: ["St Peter's Street", 'A1081', '', 'Stonecross', 'Harpenden Road', 'Batchwood Drive', 'Batchwood Roundabout', 'Redbourn Road', 'Verulam Road', 'Folly Lane', 'Catherine Street'],
    sfStreets: ['Harpenden Road'],
    sfAt: 0.35,
    surfaceEra1920: 'macadam',
    variants: [
      { key: 'v1', label: 'Original', note: 'Flat-out Batchwood Drive.' },
      { key: 'v2', label: 'Batchwood chicane', mods: [{ kind: 'chicane', street: 'Batchwood Drive', at: 0.4, length: 44, reason: 'Chicane to slow the fastest section after safety review (fictional racing modification).' }], note: 'Chicane on Batchwood Drive.' },
    ],
  },
];
