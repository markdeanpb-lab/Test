"""Simplified course polylines (local metres) for every arena course -> public/arenas/routes-lite.json
   Used by 2D screens (title logo, briefing maps)."""
import json, glob, os, math
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
def simplify(p, tol):
    pts = [(p[i], p[i + 1]) for i in range(0, len(p), 2)]
    def rdp(a, b):
        if b <= a + 1: return [a]
        (x0, y0), (x1, y1) = pts[a], pts[b]
        dx, dy = x1 - x0, y1 - y0; L = math.hypot(dx, dy) or 1
        best, bi = -1, a
        for i in range(a + 1, b):
            d = abs((pts[i][0] - x0) * dy - (pts[i][1] - y0) * dx) / L
            if d > best: best, bi = d, i
        if best > tol: return rdp(a, bi) + rdp(bi, b)
        return [a]
    idx = rdp(0, len(pts) - 1) + [len(pts) - 1]
    return [round(v, 1) for i in idx for v in pts[i]]
out = {}
for f in sorted(glob.glob(os.path.join(ROOT, 'public', 'arenas', '*.json'))):
    if f.endswith('routes-lite.json'): continue
    a = json.load(open(f))
    for c in a['courses']:
        out[c['name']] = simplify(c['p'], 4)
json.dump(out, open(os.path.join(ROOT, 'public', 'arenas', 'routes-lite.json'), 'w'))
print({k: len(v) // 2 for k, v in out.items()})
