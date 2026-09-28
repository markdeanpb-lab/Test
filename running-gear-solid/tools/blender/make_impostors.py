"""Bake 8-view impostor atlases for the Poly Haven trees (CC0) with Cycles.

   python3 tools/blender/make_impostors.py [tree ...]

Output: public/assets/impostors/<tree>.png (8 columns x 1 row, RGBA, 512 px per view)
        public/assets/impostors/<tree>.json (height/width of the tree in metres, view order)
View k looks at the tree from azimuth k*45 degrees (0 = from +Y/south in Blender = +z in three.js).
"""
import bpy, os, sys, json, math
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MODELS = os.path.join(ROOT, 'public', 'assets', 'models')
OUT = os.path.join(ROOT, 'public', 'assets', 'impostors')
os.makedirs(OUT, exist_ok=True)
trees = [a for a in sys.argv[1:] if not a.startswith('-')] or ['island_tree_01', 'island_tree_02', 'island_tree_03', 'tree_small_02']
RES = 512
VIEWS = 8

for tree in trees:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, tree, tree + '.gltf'))
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
    for o in meshes:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    size = hi - lo
    height = size.z
    radius = max(size.x, size.y) / 2
    cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    half = max(height, radius * 2) / 2 * 1.04
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.film_transparent = True
    scene.render.resolution_x = RES
    scene.render.resolution_y = RES
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.view_settings.view_transform = 'Standard'
    # soft even lighting: sky + gentle sun from above so the impostor relights well
    world = bpy.data.worlds.new('w'); scene.world = world; world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.8, 0.85, 0.9, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = 0.9
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 2.2; sun.rotation_euler = (math.radians(35), 0, math.radians(30))
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = half * 2
    scene.collection.objects.link(cam); scene.camera = cam
    frames = []
    for k in range(VIEWS):
        a = k * 2 * math.pi / VIEWS
        d = 50
        cam.location = (cx + math.sin(a) * -d, cy + math.cos(a) * -d, lo.z + half)
        cam.rotation_euler = (math.radians(90), 0, math.atan2(math.sin(a) * -1, math.cos(a) * -1) + math.pi)
        # point camera at tree centre
        direction = Vector((cx, cy, lo.z + half)) - cam.location
        cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
        f = os.path.join(OUT, f'_{tree}_{k}.png')
        scene.render.filepath = f
        bpy.ops.render.render(write_still=True)
        frames.append(f)
        print('view', tree, k, flush=True)
    # stitch
    atlas = bpy.data.images.new('atlas', RES * VIEWS, RES, alpha=True)
    px = [0.0] * (RES * VIEWS * RES * 4)
    for k, f in enumerate(frames):
        img = bpy.data.images.load(f)
        p = list(img.pixels)
        for y in range(RES):
            src = y * RES * 4
            dst = (y * RES * VIEWS + k * RES) * 4
            px[dst:dst + RES * 4] = p[src:src + RES * 4]
        os.remove(f)
    atlas.pixels = px
    atlas.filepath_raw = os.path.join(OUT, tree + '.png'); atlas.file_format = 'PNG'; atlas.save()
    json.dump({'height': height, 'width': half * 2, 'views': VIEWS, 'ground': (lo.z - (lo.z + half - half)) / (half * 2)}, open(os.path.join(OUT, tree + '.json'), 'w'))
    print('done', tree, round(height, 1), 'm', flush=True)
