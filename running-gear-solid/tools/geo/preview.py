"""Top-down verification render of an arena: OSM layers + raw GPS (cyan) + map-matched course (red).
   python3 tools/geo/preview.py <arena> [course-index] [--zoom metres]"""
import json, sys, os
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
name = sys.argv[1]
ci = int(sys.argv[2]) if len(sys.argv) > 2 and not sys.argv[2].startswith('--') else 0
zoom = float(sys.argv[sys.argv.index('--zoom') + 1]) if '--zoom' in sys.argv else None
a = json.load(open(os.path.join(ROOT, 'public', 'arenas', name + '.json')))
course = a['courses'][ci]
cx = course['p'][0::2]; cz = course['p'][1::2]
if zoom:
    mx, mz = sum(cx) / len(cx), sum(cz) / len(cz)
    x0, x1, z0, z1 = mx - zoom, mx + zoom, mz - zoom, mz + zoom
else:
    pad = 150
    x0, x1, z0, z1 = min(cx) - pad, max(cx) + pad, min(cz) - pad, max(cz) + pad
S = 1600
sc = S / max(x1 - x0, z1 - z0)
W, H = int((x1 - x0) * sc), int((z1 - z0) * sc)
im = Image.new('RGB', (W, H), (38, 40, 42))
d = ImageDraw.Draw(im)
P = lambda p: [((p[i] - x0) * sc, (p[i + 1] - z0) * sc) for i in range(0, len(p), 2)]
col = {'park': (58, 92, 52), 'grass': (70, 105, 58), 'wood': (34, 70, 38), 'water': (40, 80, 130), 'pitch': (60, 120, 60), 'track': (150, 70, 50),
       'cemetery': (60, 80, 60), 'farmland': (90, 100, 60), 'paved': (70, 70, 72), 'sand': (150, 140, 100), 'playground': (110, 90, 70),
       'rail': (60, 55, 60), 'urban': (55, 52, 58), 'residential': (48, 48, 52)}
order = ['residential', 'urban', 'rail', 'farmland', 'park', 'grass', 'cemetery', 'wood', 'pitch', 'track', 'playground', 'paved', 'sand', 'water']
for k in order:
    for ar in a['areas']:
        if ar['k'] == k and len(ar['p']) >= 6:
            d.polygon(P(ar['p']), fill=col[k])
for w in a['water']:
    d.line(P(w['p']), fill=(40, 80, 130), width=max(1, int(w['w'] * sc)))
for b in a['buildings']:
    if len(b['p']) >= 6:
        d.polygon(P(b['p']), fill=(120, 110, 105))
for r in a['roads']:
    c = {'major': (200, 190, 160), 'road': (170, 170, 170), 'service': (140, 140, 140), 'pedestrian': (150, 150, 140), 'path': (190, 160, 120), 'track': (160, 140, 100), 'steps': (200, 120, 120)}[r['k']]
    d.line(P(r['p']), fill=c, width=max(1, int(r['w'] * sc)))
for rl in a['rails']:
    d.line(P(rl['p']), fill=(90, 80, 100), width=2)
t = a['trees']
for i in range(0, len(t), 2):
    x, y = (t[i] - x0) * sc, (t[i + 1] - z0) * sc
    d.ellipse([x - 2, y - 2, x + 2, y + 2], fill=(30, 120, 40))
d.line(P(course['gps']), fill=(0, 220, 255), width=2)
d.line(P(course['p']), fill=(255, 40, 30), width=2)
sx, sz = P(course['p'][:2])[0]
d.ellipse([sx - 6, sz - 6, sx + 6, sz + 6], outline=(255, 255, 255), width=2)
out = os.path.join(ROOT, 'output', 'review', f'map_{name}_{ci}.png')
os.makedirs(os.path.dirname(out), exist_ok=True)
im.save(out)
print(out, W, H, 'snapped', course['snapped'])
