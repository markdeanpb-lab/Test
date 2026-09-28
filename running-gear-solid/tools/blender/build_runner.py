"""Build the protagonist glTF from CC0 Quaternius assets (Universal Base Characters).

- body + hair + eyebrows bound to ONE armature (same UE-style bone names as the
  Universal Animation Library, so all clips apply directly)
- running kit generated from the skinned body surface, so every garment
  deforms with the rig: singlet, shorts, socks, shoes, watch
- body skin under the kit removed (no poke-through)

Run: python3 tools/blender/build_runner.py [--body male|female] [--hair Hair_X] [--out name.glb]
     -> public/assets/char/runner.glb
"""
import bpy, bmesh, os, sys
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'assets-src', 'Universal Base Characters[Standard]')
arg = lambda k, d: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
SEX = arg('--body', 'male')
BODY = os.path.join(SRC, 'Base Characters', 'Godot - UE', 'Superhero_%s_FullBody.gltf' % ('Female' if SEX == 'female' else 'Male'))
HAIRDIR = os.path.join(SRC, 'Hairstyles', 'Rigged to Head Bone', 'glTF (Godot -Unreal)')
OUT = os.path.join(ROOT, 'public', 'assets', 'char', arg('--out', 'runner.glb'))
HAIR = arg('--hair', 'Hair_SimpleParted')

bpy.ops.wm.read_factory_settings(use_empty=True)


def imp(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


body_objs = imp(BODY)
arm = next(o for o in body_objs if o.type == 'ARMATURE')
body = max((o for o in body_objs if o.type == 'MESH'), key=lambda o: len(o.data.vertices))
extra_meshes = [o for o in body_objs if o.type == 'MESH' and o is not body]

for extra in (HAIR,):
    objs = imp(os.path.join(HAIRDIR, extra + '.gltf'))
    for o in objs:
        if o.type == 'MESH':
            o.parent = arm
            o.matrix_parent_inverse.identity()
            for m in o.modifiers:
                if m.type == 'ARMATURE':
                    m.object = arm
            o.name = 'Hair' if extra == HAIR else 'Brows'
            extra_meshes.append(o)
    for o in objs:
        if o.type == 'ARMATURE':
            bpy.data.objects.remove(o, do_unlink=True)
    for o in list(bpy.data.objects):
        if o.type == 'EMPTY' and not o.children:
            bpy.data.objects.remove(o, do_unlink=True)

# ---------------------------------------------------------------- geometry helpers
mw = body.matrix_world
bones = {b.name: arm.matrix_world @ b.head_local for b in arm.data.bones}
up = 2  # Z in Blender
z = lambda n: bones[n][up]
print('height', z('Head') - min((mw @ v.co)[up] for v in body.data.vertices))

gidx = {g.name: g.index for g in body.vertex_groups}


def weights(v):
    return {body.vertex_groups[g.group].name: g.weight for g in v.groups}


def wsum(w, names):
    return sum(w.get(n, 0.0) for n in names)


knee = (z('calf_l') + z('calf_r')) / 2
hip = (z('thigh_l') + z('thigh_r')) / 2
ankle = (z('foot_l') + z('foot_r')) / 2
waist = z('spine_01') + 0.02
mid_thigh = knee + 0.62 * (hip - knee)
print('hip', hip, 'knee', knee, 'ankle', ankle, 'waist', waist)

SPINE = ['spine_01', 'spine_02', 'spine_03']
ARMB = ['upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r']
FOOT = ['foot_l', 'foot_r', 'ball_l', 'ball_r']


def region(v):
    w = weights(v)
    p = mw @ v.co
    out = set()
    arms = wsum(w, ARMB)
    headneck = wsum(w, ['neck_01', 'Head'])
    torso = wsum(w, SPINE + ['pelvis', 'clavicle_l', 'clavicle_r'])
    if p[up] > waist - 0.075 and arms < 0.12 and headneck < 0.08 and torso > 0.45:
        out.add('singlet')
    if p[up] > mid_thigh and p[up] < waist + 0.035 and wsum(w, ['pelvis', 'thigh_l', 'thigh_r', 'spine_01']) > 0.5:
        out.add('shorts')
    if p[up] < ankle + 0.075 and wsum(w, FOOT + ['calf_l', 'calf_r']) > 0.4:
        out.add('socks')
    if p[up] < ankle + 0.02 and wsum(w, FOOT + ['calf_l', 'calf_r']) > 0.4:
        out.add('shoes')
    if w.get('lowerarm_l', 0) > 0.3 and (p - bones['hand_l']).length < 0.075:
        out.add('watch')
    return out


regions = [region(v) for v in body.data.vertices]


def make_garment(name, key, offset, smooth=0, flatten_sole=False, cover_skin=True):
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.verts.ensure_lookup_table()
    keep = [f for f in bm.faces if all(key in regions[v.index] for v in f.verts)]
    kill = [f for f in bm.faces if f not in set(keep)]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    # weld UV/normal seams so the offset shell has no cracks
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
    # clean garment edges (necklines, armholes, hems): smooth boundary loops along themselves
    for _ in range(8):
        bnd = [v for v in bm.verts if v.is_boundary]
        new = {}
        for v in bnd:
            nb = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
            if len(nb) == 2:
                new[v] = (nb[0].co + nb[1].co) * 0.5 * 0.6 + v.co * 0.4
        for v, co in new.items():
            v.co = co
    for _ in range(smooth):
        bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * offset
    if flatten_sole:
        # flatten the underside into a sole and thicken it
        lo = min(v.co[up] for v in bm.verts)
        for v in bm.verts:
            if v.co[up] < lo + 0.012:
                v.co[up] = lo - 0.012
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = body.copy()
    ob.data = me
    ob.name = name
    bpy.context.collection.objects.link(ob)
    for g in body.vertex_groups:
        if g.name not in ob.vertex_groups:
            ob.vertex_groups.new(name=g.name)
    ob.parent = arm
    ob.matrix_parent_inverse = body.matrix_parent_inverse.copy()
    if not any(m.type == 'ARMATURE' for m in ob.modifiers):
        mod = ob.modifiers.new('Armature', 'ARMATURE')
        mod.object = arm
    ob.data.materials.clear()
    mat = bpy.data.materials.new('KIT_' + name)
    mat.use_nodes = True
    ob.data.materials.append(mat)
    return ob, keep


garments = {}
for name, key, off, sm, flat in [
    ('Singlet', 'singlet', 0.009, 1, False),
    ('Shorts', 'shorts', 0.013, 1, False),
    ('Socks', 'socks', 0.004, 0, False),
    ('Shoes', 'shoes', 0.012, 4, True),
    ('Watch', 'watch', 0.009, 0, False),
]:
    ob, _ = make_garment(name, key, off, sm, flat)
    garments[name] = ob
    print(name, len(ob.data.vertices), 'verts')

# remove skin fully hidden by singlet/shorts/shoes
bm = bmesh.new()
bm.from_mesh(body.data)
hidden = [f for f in bm.faces if all(({'singlet', 'shorts', 'shoes'} & regions[v.index]) for v in f.verts)]
bmesh.ops.delete(bm, geom=hidden, context='FACES')
bm.to_mesh(body.data)
bm.free()
body.name = 'Skin'

for o in bpy.data.objects:
    o.select_set(o.type == 'ARMATURE' or (o.type == 'MESH' and o.parent == arm and len(o.vertex_groups) > 0))
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animations=False, export_skins=True, export_image_format='WEBP', export_image_quality=85)
print('wrote', OUT, os.path.getsize(OUT))
