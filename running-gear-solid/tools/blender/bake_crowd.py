"""Bake crowd poses: runners and spectators as static, decimated meshes (CPU-skinned in Blender).

   python3 tools/blender/bake_crowd.py  ->  public/assets/char/crowd.glb

Meshes are named <pose>_<body>_<frame> (e.g. run_m_03). The UV x coordinate carries the kit
part id (0 skin, 1 top, 2 shorts, 3 socks, 4 shoes, 5 hair, 6 eyes, 7 watch) so the
instanced shader can colour each person differently.
"""
import bpy, bmesh, os, math
from mathutils.bvhtree import BVHTree
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CH = os.path.join(ROOT, 'public', 'assets', 'char')
OUT = os.environ.get('CROWD_OUT', os.path.join(CH, 'crowd.glb'))
BODIES = {'m': 'runner.glb', 'b': 'runner_m2.glb', 'f': 'runner_f.glb'}
POSES = [  # name, clip, frames, target tris
    ('run', 'Jog_Fwd_Loop', 12, 2600),
    ('idle', 'Idle_Loop', 3, 2200),
    ('rail', 'Idle_Rail_Loop', 2, 2200),
    ('call', 'Idle_Rail_Call', 2, 2200),
    ('arms', 'Idle_FoldArms_Loop', 1, 2200),
    ('phone', 'Idle_TalkingPhone_Loop', 1, 2200),
    ('walk', 'Walk_Loop', 8, 2200),
]
PART = {'Skin': 0, 'Singlet': 1, 'Shorts': 2, 'Socks': 3, 'Shoes': 4, 'Hair': 5, 'Eyebrows': 5, 'Brows': 5, 'Eyes': 6, 'Watch': 7}

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
for f in ['UAL1_Standard.glb', 'UAL2_Standard.glb']:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(CH, f))
    for o in set(bpy.data.objects) - before:
        bpy.data.objects.remove(o, do_unlink=True)
actions = {}
for a in bpy.data.actions:
    actions.setdefault(a.name.split('_Armature')[0], a)
print('actions', len(actions))
mat = bpy.data.materials.new('crowd')
baked = []
for key, fname in BODIES.items():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(CH, fname))
    objs = list(set(bpy.data.objects) - before)
    arm = next(o for o in objs if o.type == 'ARMATURE')
    meshes = [o for o in objs if o.type == 'MESH']
    arm.animation_data_create()
    for pose, clip, nframes, tris in POSES:
        act = actions.get(clip)
        if not act:
            print('missing', clip)
            continue
        arm.animation_data.action = act
        f0, f1 = act.frame_range
        span = f1 - f0
        for k in range(nframes):
            fr = f0 + span * k / nframes
            scene.frame_set(int(math.floor(fr)), subframe=fr - math.floor(fr))
            dg = bpy.context.evaluated_depsgraph_get()
            parts = []
            for m in meshes:
                name = next((p for p in PART if m.name.startswith(p)), None)
                if name is None:
                    continue
                me = bpy.data.meshes.new_from_object(m.evaluated_get(dg), depsgraph=dg)
                me.transform(m.matrix_world)
                ob = bpy.data.objects.new('tmp', me)
                scene.collection.objects.link(ob)
                if not me.uv_layers:
                    me.uv_layers.new()
                u = (PART[name] + 0.5) / 8
                for d in me.uv_layers.active.data:
                    d.uv = (u, 0.5)
                me.materials.clear()
                me.materials.append(mat)
                ob['part'] = PART[name]
                parts.append(ob)
            # near LOD: decimate only skin + hair (separately, so kit parts keep their ids and
            # garment edges stay clean); far LOD: everything, aggressively
            def dec(ob, ratio):
                if ratio >= 1:
                    return
                bpy.context.view_layer.objects.active = ob
                d = ob.modifiers.new('dec', 'DECIMATE')
                d.ratio = ratio
                bpy.ops.object.modifier_apply(modifier='dec')
            def join(obs, name):
                bpy.ops.object.select_all(action='DESELECT')
                for o in obs:
                    o.select_set(True)
                bpy.context.view_layer.objects.active = obs[0]
                bpy.ops.object.join()
                ob = bpy.context.view_layer.objects.active
                ob.name = ob.data.name = name
                return ob
            # skin hidden under the kit is deleted before decimation; otherwise the coarse
            # decimated body pokes through garments and reads as torn clothing
            skin = next((o for o in parts if o.get('part') == 0), None)
            kit = [o for o in parts if o.get('part') in (1, 2, 3, 4)]
            if skin and kit:
                kb = bmesh.new()
                for o in kit:
                    kb.from_mesh(o.data)
                bvh = BVHTree.FromBMesh(kb)
                sb = bmesh.new()
                sb.from_mesh(skin.data)
                sb.faces.ensure_lookup_table()
                gone = []
                for fc in sb.faces:
                    c, n = fc.calc_center_median(), fc.normal
                    if bvh.ray_cast(c + n * 0.001, n, 0.04)[0] is not None:
                        gone.append(fc)
                bmesh.ops.delete(sb, geom=gone, context='FACES')
                sb.to_mesh(skin.data)
                sb.free()
                kb.free()
            far = []
            for o in parts:
                c = o.copy()
                c.data = o.data.copy()
                scene.collection.objects.link(c)
                far.append(c)
            for o in parts:
                n = len(o.data.polygons)
                if o.get('part') == 0 and n > 2200:
                    dec(o, 2200 / n)  # visible skin
                elif o.get('part') in (1, 2, 4) and n > 500:
                    dec(o, 0.7)  # top, shorts, shoes: edges stay clean
                elif n > 300:
                    dec(o, 0.4)  # socks (mostly in shoes), hair, brows, eyes
            for o in far:
                dec(o, 0.14)
            ob = join(parts, f'{pose}_{key}_{k:02d}')
            lo = join(far, f'{pose}_{key}_{k:02d}_lo')
            baked += [ob, lo]
            print('baked', ob.name, len(ob.data.polygons), len(lo.data.polygons), flush=True)
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
for o in baked:
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animations=False, export_skins=False, export_materials='PLACEHOLDER')
print('wrote', OUT, os.path.getsize(OUT))
