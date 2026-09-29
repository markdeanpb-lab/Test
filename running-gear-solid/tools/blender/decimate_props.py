"""Decimate Poly Haven street props to game-ready meshes and export single .glb files.
   python3 tools/blender/decimate_props.py
Output: public/assets/props/<name>.glb"""
import bpy, os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MODELS = os.path.join(ROOT, 'public', 'assets', 'models')
OUT = os.path.join(ROOT, 'public', 'assets', 'props')
os.makedirs(OUT, exist_ok=True)
TARGET = {'street_lamp_01': 2500, 'street_lamp_02': 2500, 'concrete_road_barrier': 1500, 'fire_hydrant': 2500,
          'painted_wooden_bench': 700, 'modular_chainlink_fence': 6000, 'shrub_02': 5000, 'shrub_03': 5000, 'shrub_04': 5000,
          # the lockdown flat and boss arenas (interior close-ups: keep detail)
          'sofa_02': 20000, 'television_02': 12000, 'coffee_table_round_01': 6000, 'drawer_cabinet': 10000,
          'vintage_wooden_drawer_01': 10000, 'potted_plant_01': 12000, 'wall_clock': 4000, 'modern_ceiling_lamp_01': 4000,
          'standing_picture_frame_01': 2000, 'large_castle_door': 30000, 'rubber_boots': 8000, 'wooden_bookshelf_worn': 12000,
          'modern_wooden_cabinet': 10000}
ONLY = set(os.environ.get('ONLY', '').split(',')) - {''}
for name, tris in TARGET.items():
    if ONLY and name not in ONLY:
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, name, name + '.gltf'))
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    total = sum(len(o.data.polygons) for o in meshes) * 2
    ratio = min(1.0, tris / max(1, total))
    for o in meshes:
        if ratio < 1:
            m = o.modifiers.new('dec', 'DECIMATE')
            m.ratio = ratio
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.modifier_apply(modifier='dec')
    for o in bpy.data.objects:
        o.select_set(o.type == 'MESH')
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + '.glb'), export_format='GLB', use_selection=True, export_image_format=os.environ.get('IMGFMT', 'WEBP'), export_image_quality=80)
    after = sum(len(o.data.polygons) for o in meshes)
    print('prop', name, total, '->', after * 2 if ratio < 1 else total, flush=True)
