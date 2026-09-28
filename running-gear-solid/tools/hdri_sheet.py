"""Contact sheet of the HDRIs (tone-mapped) for choosing skies: python3 tools/hdri_sheet.py out.jpg"""
import numpy as np, glob, os, sys
from PIL import Image, ImageDraw

def read_hdr(path):
    f = open(path, 'rb').read()
    i = f.index(b'\n\n') + 2
    j = f.index(b'\n', i)
    dims = f[i:j].decode().split()
    H, W = int(dims[1]), int(dims[3])
    data = f[j + 1:]
    img = np.zeros((H, W, 4), np.uint8)
    p = 0
    for y in range(H):
        p += 4  # 2,2,hi,lo
        for c in range(4):
            x = 0
            while x < W:
                n = data[p]; p += 1
                if n > 128:
                    n -= 128
                    img[y, x:x + n, c] = data[p]; p += 1
                else:
                    img[y, x:x + n, c] = np.frombuffer(data[p:p + n], np.uint8); p += n
                x += n
    e = img[..., 3].astype(np.float32)
    rgb = img[..., :3].astype(np.float32) * np.ldexp(1.0, (e - 136).astype(np.int32))[..., None]
    return rgb

out = sys.argv[1]
fs = sorted(glob.glob('public/assets/hdri/*_2k.hdr'))
tw, th = 512, 256
sheet = Image.new('RGB', (tw * 3, (th + 16) * ((len(fs) + 2) // 3)))
d = ImageDraw.Draw(sheet)
for k, f in enumerate(fs):
    rgb = read_hdr(f)[::4, ::4]
    x = rgb / (1 + rgb)
    x = np.clip(x ** (1 / 2.2) * 1.3, 0, 1)
    im = Image.fromarray((x * 255).astype(np.uint8)).resize((tw, th))
    X, Y = (k % 3) * tw, (k // 3) * (th + 16)
    sheet.paste(im, (X, Y))
    d.text((X + 4, Y + th + 2), os.path.basename(f), fill=(255, 255, 255))
sheet.save(out, quality=85)
