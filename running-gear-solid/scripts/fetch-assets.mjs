// Download the CC0 assets used by the remaster from Poly Haven (https://polyhaven.com, CC0).
//   node scripts/fetch-assets.mjs
// HDRIs -> public/assets/hdri, PBR textures -> public/assets/tex, glTF models -> public/assets/models
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const A = path.join(ROOT, 'public', 'assets');

export const HDRIS = [
  'greenwich_park', 'greenwich_park_02', 'greenwich_park_03', 'canary_wharf', 'docklands_01', 'docklands_02', 'lakeside_dawn',
  'misty_farm_road', 'old_tree_in_city_park', 'night_bridge', 'modern_evening_street', 'cobblestone_street_night',
  'bethnal_green_entrance', 'cloudy_vondelpark', 'kloppenheim_06', 'sunflowers', 'cambridge', 'dresden_station_night',
  // sky-only HDRIs (no near geometry on the horizon to clash with the rebuilt streets)
  'kloofendal_overcast_puresky', 'kloofendal_misty_morning_puresky', 'kloofendal_28d_misty_puresky', 'kloofendal_48d_partly_cloudy_puresky',
  'qwantani_dawn_puresky', 'qwantani_sunrise_puresky', 'qwantani_dusk_2_puresky', 'qwantani_sunset_puresky', 'qwantani_night_puresky',
  'belfast_sunset_puresky', 'industrial_sunset_puresky', 'overcast_soil_puresky', 'wasteland_clouds_puresky', 'the_sky_is_on_fire',
  'winter_sky', 'moonless_golf', 'rooftop_night', 'kloofendal_43d_clear_puresky', 'qwantani_noon_puresky',
];
export const TEXTURES = [
  'asphalt_02', 'clean_asphalt', 'worn_asphalt', 'concrete_pavement', 'brick_pavement_02', 'leafy_grass', 'sparse_grass',
  'grass_path_2', 'forest_leaves_02', 'brown_mud_leaves_01', 'rocky_trail', 'gravel_road', 'brick_wall_02', 'brick_wall_08',
  'brick_4', 'white_stucco', 'painted_brick', 'concrete_wall_003', 'roof_slates_02', 'grey_roof_tiles', 'container_side',
  'corrugated_iron', 'bark_brown_02', 'plastered_wall_02', 'cobblestone_floor_08',
];
export const MODELS = [
  'island_tree_01', 'island_tree_02', 'island_tree_03', 'tree_small_02', 'shrub_01', 'shrub_02', 'shrub_03', 'shrub_04',
  'street_lamp_01', 'street_lamp_02', 'painted_wooden_bench', 'concrete_road_barrier', 'modular_chainlink_fence', 'fire_hydrant',
  'jacaranda_tree', 'fir_tree_01', 'pine_tree_01', 'grass_medium_01', 'grass_medium_02', 'dead_tree_trunk_02', 'nettle_plant', 'dandelion_01',
];

function get(url, file) {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return true;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (let n = 0; n < 4; n++) {
    const r = spawnSync('curl', ['-sS', '-f', '-L', '-m', '600', '-o', file + '.part', url]);
    if (r.status === 0) {
      fs.renameSync(file + '.part', file);
      return true;
    }
  }
  console.warn('failed', url);
  return false;
}
function api(id) {
  const f = path.join(ROOT, 'assets-src', 'polyhaven', id + '.json');
  get(`https://api.polyhaven.com/files/${id}`, f);
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

for (const id of HDRIS) {
  const j = api(id);
  get(j.hdri['2k'].hdr.url, path.join(A, 'hdri', `${id}_2k.hdr`));
  console.log('hdri', id);
}
for (const id of TEXTURES) {
  const j = api(id);
  for (const [key, suffix] of [['Diffuse', 'diff'], ['nor_gl', 'nor_gl'], ['Rough', 'rough'], ['AO', 'ao']]) {
    const e = j[key]?.['1k']?.jpg;
    if (e) get(e.url, path.join(A, 'tex', `${id}_${suffix}_1k.jpg`));
  }
  console.log('tex', id);
}
for (const id of MODELS) {
  const j = api(id);
  const g = j.gltf?.['1k']?.gltf;
  if (!g) {
    console.warn('no gltf', id);
    continue;
  }
  const dir = path.join(A, 'models', id);
  get(g.url, path.join(dir, `${id}.gltf`));
  for (const [rel, inc] of Object.entries(g.include ?? {})) get(inc.url, path.join(dir, rel));
  console.log('model', id);
}
