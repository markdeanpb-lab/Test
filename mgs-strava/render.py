"""METAL GEAR STRIDE - renders a year of Strava runs as PS1-era stealth-game boss fights.

Usage:  python3 render.py [--start S] [--seconds N] [--still T ...] [--out PATH]
Renders 640x360 pixel frames, upscales 3x (nearest) to 1080p and muxes a synthesized soundtrack.
"""
import argparse
import math
import os
import random
import subprocess
import sys
import wave
from multiprocessing import Pool

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFont

import sound as S
from data import BOSSES

W, H, FPS, SCALE = 640, 360, 30, 3
HERE = os.path.dirname(os.path.abspath(__file__))
FONT = ImageFont.truetype("/usr/share/fonts/opentype/unifont/unifont.otf", 16)

BLACK = (0, 0, 0)
WHITE = (235, 240, 235)
GREEN = (90, 255, 150)
DGREEN = (10, 40, 22)
MGREEN = (40, 130, 75)
RED = (230, 40, 40)
YELLOW = (255, 220, 60)
CYAN = (90, 220, 255)
GREY = (120, 130, 125)

ACCENT = dict(mantis=(200, 90, 255), ocelot=(230, 170, 60), tank=(160, 170, 90), ninja=(120, 240, 255),
              raven=(150, 170, 230), rex=(255, 80, 60), wolf=(220, 220, 220), liquid=(255, 200, 80))

SUBTITLE = dict(
    mantis="THE MIND READER OF THE ALBAN WAY",
    ocelot="THE GUNSLINGER OF WESTMINSTER LODGE",
    tank="THE ARMOUR OF POTTERS CROUCH",
    ninja="THE GHOST IN THE GPS",
    raven="THE GIANT OF ASHRIDGE",
    rex="THE WALL AT KILOMETRE 28",
    wolf="THE HUNTER OF THE 1:30 PACK",
    liquid="THE BROTHER. THE PARKRUN. THE END.",
)

GEAR = dict(  # (WEAPON, ITEM) boxes
    mantis=("HEADPHONES", "RADIO 4"), ocelot=("SPIKES", "STOPWATCH"), tank=("CHAFF GEL", "TIRED LEGS"),
    ninja=("RACING FLATS", "GPS (FAULTY)"), raven=("LONG-RUN LEGS", "ENERGY GEL x4"),
    rex=("CARBON PLATES", "ACHILLES"), wolf=("RACE SHOES", "PACE BAND 1:30"), liquid=("BARE FISTS", "PARKRUN BARCODE"),
)

# player / boss life keyframes over race progress p
LIFE = dict(
    mantis=(([0, .45, .62, .74, 1], [1, .7, .32, .5, .85]), ([0, .7, 1], [1, .72, 0])),
    ocelot=(([0, .3, 1], [1, .7, .45]), ([0, 1], [1, 0])),
    tank=(([0, .1, .6, 1], [.75, .6, .5, .42]), ([0, .5, .52, 1], [1, .5, .45, 0])),
    ninja=(([0, 1], [1, .55]), ([0, 1], [1, 0])),
    raven=(([0, .3, .55, .9, 1], [1, .8, .45, .5, .6]), ([0, .55, 1], [1, .7, 0])),
    rex=(([0, .6, .64, .72, 1], [1, .8, .55, .2, .04]), ([0, .62, 1], [1, .42, .42])),
    wolf=(([0, .62, .72, 1], [1, .75, .4, .3]), ([0, .66, 1], [1, .45, .45])),
    liquid=(([0, .5, 1], [1, .5, .35]), ([0, 1], [1, 0])),
)

# (p_start, p_end, speaker, text)
CAPTIONS = dict(
    mantis=[(0.02, .24, "MANTIS", "I see... you let a man called WILL hot-box your toilet before a run."),
            (.26, .46, "MANTIS", "And the Ricky Road Run. Defeated by William Giltrow. At William Penn's gaff."),
            (.5, .66, "MANTIS", "You are FLOUNDERING, Mark. 6:19 per kilometre. I can read your legs."),
            (.8, .98, "MANTIS", "Impossible! I can't read your mind... all I hear is... ROBOT ROCK!")],
    ocelot=[(0.02, .22, "OCELOT", "Twelve laps. Six bullets. More than enough to kill anything that moves."),
            (.3, .46, "OCELOT", "Heart rate 190 on lap two? Now THIS is the best part..."),
            (.62, .8, "OCELOT", "Lap ten, 93 seconds. You're slowing, Mark."),
            (.86, .99, "OCELOT", "82 seconds on the last lap?! ...You're pretty good.")],
    tank=[(0.02, .22, "COMMANDER", "Week 5 of 18. Tired legs. You'll never get past Potters Crouch!"),
          (.26, .46, "SYSTEM", "HEART RATE 188 IN KM 2. ARMOUR HOLDING."),
          (.52, .7, "COMMANDER", "Lap two! Load the shells - Ragged Hall Lane, +20 metres!"),
          (.78, .98, "MARK", "Chaff gel away. ...Happy with that on tired legs.")],
    ninja=[(0.02, .22, "NINJA", "Fight me, Mark! 3:52 a kilometre. Every. Kilometre."),
           (.26, .46, "SYSTEM", "PACE LOCKED 3:47 - 3:55 /KM. PERFECT PACING."),
           (.52, .72, "NINJA", "Stealth camouflage... your GPS reads 10.00. The course reads 10.10."),
           (.78, .98, "MARK", "I thought I was well under 39... until it was too late.")],
    raven=[(0.02, .22, "RAVEN", "A 10k PB yesterday. Today, 20 miles. The ravens will feast."),
           (.26, .46, "SYSTEM", "LITTLE HEATH LANE +81m.  BULLBEGGARS LANE +84m."),
           (.5, .68, "RAVEN", "The Long Slog. The Frithsden Freefall. Ashridge is my Alaska."),
           (.72, .98, "SYSTEM", "NEGATIVE SPLIT DETECTED. KM 20-22 @ 4:32, 4:26, 4:22.")],
    rex=[(0.02, .2, "MEGAN", "Target: sub 3. That's 4:15 a kilometre. For 42 of them."),
         (.22, .4, "SYSTEM", "HALFWAY 1:29:39. ON SCHEDULE."),
         (.44, .6, "SYSTEM", "WARNING: ACHILLES DAMAGED SINCE THE START LINE."),
         (.64, .8, "SYSTEM", "REX HAS DEPLOYED: THE WALL.  KM 29 @ 5:34."),
         (.82, .99, "MARK", "Didn't have it in me. Physically and mentally.")],
    wolf=[(0.02, .22, "WOLF", "I have you in my sights. Me... and my pack. The 1:30 pace group."),
          (.26, .5, "SYSTEM", "RUNNING WITH THE PACK. 4:05 - 4:15 /KM. HR 176."),
          (.56, .68, "SYSTEM", "KM 14: LONG-RUN DEFICIT DETECTED."),
          (.72, .9, "WOLF", "The wolves are leaving, Mark. Goodbye."),
          (.91, .99, "MARK", "Felt good until 14km...")],
    liquid=[(0.02, .22, "LIQUID", "Brother! We finish this on top of REX. The St Albans parkrun!"),
            (.26, .46, "SYSTEM", "KM 2: +34m. 'UP DOWN ROUND AND ROUND'."),
            (.5, .7, "LIQUID", "Heart rate 192?! Where are you getting this?!"),
            (.76, .98, "MARK", "Where did that come from.")],
)

OUTCOME = dict(
    mantis=("BOSS DEFEATED", "23.01 KM  2:11:19  LAST 3 KM @ 4:44-5:05", "MANTIS",
            "You're the first man I've met... who couldn't hear me over a French house album."),
    ocelot=("BOSS DEFEATED", "5K 18:19  NEW PB", "OCELOT", "Twelve laps... I'll be back for your PB, Mark."),
    tank=("BOSS DEFEATED", "10 MILES 1:05:06  4:03 /KM ON TIRED LEGS", "COMMANDER", "A runner... with a tank's engine..."),
    ninja=("BOSS DEFEATED", "10K 39:04  NEW PB  (GPS: GUILTY)", "NINJA", "The watch... is my shadow... 4 seconds..."),
    raven=("BOSS DEFEATED", "20 MILES 2:48:34  335m CLIMB  NEGATIVE SPLIT", "RAVEN", "I will be watching you... from the Chilterns."),
    wolf=("TARGET ESCAPED", "HALF MARATHON 1:32:11  THE PACK GOT AWAY", "WOLF", "Next time... bring more long runs."),
    liquid=("BOSS DEFEATED", "PARKRUN 18:43  NEW COURSE PB  HR 192", "LIQUID", "Brother... you ARE the better runner..."),
)


# ------------------------------------------------------------------ helpers

def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def fmt_time(s):
    s = int(round(s))
    h, m, sec = s // 3600, (s % 3600) // 60, s % 60
    return f"{h}:{m:02d}:{sec:02d}" if h else f"{m}:{sec:02d}"


def parse_time(t):
    parts = [int(x) for x in t.split(":")]
    return sum(v * 60 ** i for i, v in enumerate(reversed(parts)))


_mask_cache = {}


def big_mask(s, scale):
    key = (s, scale)
    if key not in _mask_cache:
        w = int(FONT.getlength(s)) + 2
        im = Image.new("L", (w, 17), 0)
        ImageDraw.Draw(im).text((1, 0), s, font=FONT, fill=255)
        _mask_cache[key] = im.resize((w * scale, 17 * scale), Image.NEAREST)
    return _mask_cache[key]


def big(img, s, x, y, scale, color, anchor="l", shadow=True, grad=None):
    m = big_mask(s, scale)
    if anchor == "c":
        x -= m.width // 2
    elif anchor == "r":
        x -= m.width
    x, y = int(x), int(y)
    if shadow:
        img.paste((0, 0, 0), (x + scale, y + scale), m)
    if grad:  # vertical metal gradient
        g = Image.new("RGB", m.size)
        gd = ImageDraw.Draw(g)
        for yy in range(m.height):
            k = yy / max(1, m.height - 1)
            c = tuple(int(grad[0][i] * (1 - k) + grad[1][i] * k) for i in range(3))
            gd.line([(0, yy), (m.width, yy)], fill=c)
        img.paste(g, (x, y), m)
    else:
        img.paste(color, (x, y), m)
    return m.width


def txt(d, xy, s, fill=WHITE, anchor="la"):
    d.text(xy, s, font=FONT, fill=fill, anchor=anchor)


def wrap(s, width):
    words, lines, cur = s.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if FONT.getlength(t) > width and cur:
            lines.append(cur)
            cur = w
        else:
            cur = t
    if cur:
        lines.append(cur)
    return lines


def typed(s, lt, cps=38):
    return s[: max(0, int(lt * cps))]


def bar(d, x, y, w, h, frac, color, back=(30, 30, 30)):
    d.rectangle([x - 1, y - 1, x + w + 1, y + h + 1], outline=(200, 200, 200))
    d.rectangle([x, y, x + w, y + h], fill=back)
    if frac > 0:
        d.rectangle([x, y, x + int(w * clamp(frac)), y + h], fill=color)


# ------------------------------------------------------------ portraits/icons

def green(k):
    k = clamp(k)
    return (int(8 + k * 110), int(30 + k * 220), int(16 + k * 130))


def portrait(who, w, h, t, talking):
    im = Image.new("RGB", (w, h), green(0.05))
    d = ImageDraw.Draw(im)
    cx = w / 2
    if who == "MEGAN":  # long hair behind the face
        d.ellipse([w * .16, h * .12, w * .84, h * .92], fill=green(.22))
    d.polygon([(w * .02, h), (w * .16, h * .8), (w * .84, h * .8), (w * .98, h)], fill=green(.28))
    d.rectangle([w * .42, h * .62, w * .58, h * .82], fill=green(.45))
    d.ellipse([w * .27, h * .2, w * .73, h * .72], fill=green(.62))
    if who == "MARK":
        d.chord([w * .26, h * .14, w * .74, h * .5], 180, 360, fill=green(.3))
        d.rectangle([w * .26, h * .3, w * .74, h * .36], fill=green(.2))  # bandana
        sway = math.sin(t * 6) * 5
        d.polygon([(w * .72, h * .31), (w * .98, h * .38 + sway), (w * .96, h * .44 + sway), (w * .72, h * .36)], fill=green(.2))
        d.polygon([(w * .72, h * .33), (w * .92, h * .5 + sway), (w * .88, h * .54 + sway), (w * .72, h * .36)], fill=green(.18))
        for i in range(14):  # stubble
            rx = random.Random(i).uniform(.36, .64)
            ry = random.Random(i + 50).uniform(.58, .68)
            d.point((w * rx, h * ry), fill=green(.45))
    else:
        d.chord([w * .25, h * .15, w * .75, h * .48], 180, 360, fill=green(.22))
        d.polygon([(w * .27, h * .3), (w * .5, h * .22), (w * .6, h * .36), (w * .7, h * .3), (w * .7, h * .2), (w * .3, h * .2)], fill=green(.22))
        d.arc([w * .18, h * .2, w * .82, h * .6], 180, 360, fill=green(.9), width=2)  # headset
        d.line([(w * .24, h * .45), (w * .4, h * .62)], fill=green(.9), width=2)
    blink = (t % 3.1) < 0.12
    ey = h * .44
    for ex in (w * .4, w * .6):
        if blink:
            d.line([(ex - 6, ey), (ex + 6, ey)], fill=green(.15), width=2)
        else:
            d.rectangle([ex - 6, ey - 2, ex + 6, ey + 2], fill=green(.15))
            d.point((ex, ey), fill=green(1))
    d.line([(cx, h * .47), (cx - 3, h * .55), (cx + 2, h * .56)], fill=green(.4))
    if talking and int(t * 9) % 2:
        d.ellipse([cx - 7, h * .6, cx + 7, h * .66], fill=green(.1))
    else:
        d.line([(cx - 8, h * .63), (cx + 8, h * .63)], fill=green(.2), width=2)
    a = np.asarray(im).astype(np.float32)
    a[::2] *= 0.7
    return Image.fromarray(a.astype(np.uint8))


def boss_icon(key, color, size=64):
    """Hand-built silhouettes on a 64x64 grid."""
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c, dk = color + (255,), tuple(int(v * .45) for v in color) + (255,)
    red = (255, 40, 40, 255)
    if key == "mantis":
        d.ellipse([14, 6, 50, 48], fill=dk)
        d.ellipse([18, 16, 30, 30], fill=c)
        d.ellipse([34, 16, 46, 30], fill=c)
        d.rectangle([27, 36, 37, 52], fill=dk)
        d.ellipse([24, 48, 40, 60], fill=c)
        d.line([(32, 44), (50, 58)], fill=c, width=2)
    elif key == "ocelot":
        d.rectangle([6, 20, 44, 27], fill=c)          # barrel
        d.rectangle([36, 17, 50, 33], fill=dk)        # cylinder
        d.polygon([(46, 26), (58, 26), (60, 52), (50, 54), (48, 34)], fill=c)  # grip
        d.arc([38, 30, 52, 44], 0, 180, fill=c, width=2)
        d.rectangle([6, 17, 9, 20], fill=c)
    elif key == "tank":
        d.rounded_rectangle([4, 38, 60, 54], 7, fill=dk)
        for x in range(10, 58, 9):
            d.ellipse([x - 4, 42, x + 4, 50], fill=c)
        d.polygon([(10, 38), (54, 38), (48, 28), (16, 28)], fill=c)
        d.rectangle([22, 18, 42, 28], fill=dk)
        d.rectangle([42, 21, 62, 25], fill=c)
    elif key == "ninja":
        d.ellipse([16, 10, 48, 44], fill=dk)
        d.rectangle([18, 24, 46, 30], fill=(20, 20, 20, 255))
        d.rectangle([29, 25, 35, 29], fill=red)
        d.polygon([(20, 44), (44, 44), (52, 62), (12, 62)], fill=c)
        d.line([(6, 58), (58, 4)], fill=(230, 230, 230, 255), width=2)
    elif key == "raven":
        d.polygon([(32, 26), (2, 12), (10, 26), (0, 30), (14, 34), (24, 40), (32, 50),
                   (40, 40), (50, 34), (64, 30), (54, 26), (62, 12)], fill=c)
        d.polygon([(28, 22), (36, 22), (38, 30), (26, 30)], fill=dk)
        d.polygon([(36, 25), (44, 27), (36, 29)], fill=(230, 200, 60, 255))
    elif key == "rex":
        d.polygon([(14, 18), (40, 10), (56, 18), (50, 30), (20, 30)], fill=c)       # head/cockpit
        d.rectangle([22, 30, 46, 40], fill=dk)
        d.polygon([(24, 40), (16, 52), (20, 62), (26, 62), (24, 52), (32, 42)], fill=c)
        d.polygon([(44, 40), (52, 52), (48, 62), (42, 62), (44, 52), (36, 42)], fill=c)
        d.rectangle([2, 22, 16, 25], fill=c)        # railgun
        d.rectangle([40, 15, 46, 20], fill=red)
    elif key == "wolf":
        d.polygon([(10, 50), (14, 20), (20, 8), (26, 20), (40, 18), (46, 8), (50, 22),
                   (62, 40), (52, 44), (40, 42), (34, 56), (18, 58)], fill=c)
        d.rectangle([44, 26, 48, 29], fill=(20, 20, 20, 255))
        d.ellipse([2, 2, 62, 62], outline=red, width=2)
        d.line([(32, 0), (32, 64)], fill=red)
        d.line([(0, 32), (64, 32)], fill=red)
    elif key == "liquid":
        d.polygon([(14, 16), (32, 6), (50, 16), (58, 50), (48, 40), (44, 58), (20, 58), (16, 40), (6, 50)], fill=dk)
        d.ellipse([20, 14, 44, 44], fill=c)
        d.rectangle([20, 22, 44, 26], fill=dk)
        d.rectangle([26, 30, 30, 32], fill=(20, 20, 20, 255))
        d.rectangle([34, 30, 38, 32], fill=(20, 20, 20, 255))
        d.polygon([(22, 44), (42, 44), (54, 64), (10, 64)], fill=c)
    elif key == "mark":
        d.ellipse([20, 14, 44, 44], fill=c)
        d.rectangle([19, 22, 45, 26], fill=dk)
        d.polygon([(44, 22), (60, 30), (58, 34), (44, 26)], fill=dk)
        d.polygon([(22, 44), (42, 44), (54, 64), (10, 64)], fill=c)
    return im


# ------------------------------------------------------------------ geometry

RADAR = (12, 36, 408, 298)


def project(route, box, pad=18):
    lat0 = sum(p[0] for p in route) / len(route)
    k = math.cos(math.radians(lat0))
    xs = [p[1] * k for p in route]
    ys = [-p[0] for p in route]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    bw, bh = box[2] - box[0] - 2 * pad, box[3] - box[1] - 2 * pad
    s = min(bw / max(1e-9, x1 - x0), bh / max(1e-9, y1 - y0))
    ox = box[0] + pad + (bw - (x1 - x0) * s) / 2
    oy = box[1] + pad + (bh - (y1 - y0) * s) / 2
    pts = [(ox + (x - x0) * s, oy + (y - y0) * s) for x, y in zip(xs, ys)]
    cum = [0.0]
    for a, b in zip(pts, pts[1:]):
        cum.append(cum[-1] + math.dist(a, b))
    return pts, cum


def along(pts, cum, p):
    target = clamp(p) * cum[-1]
    for i in range(1, len(cum)):
        if cum[i] >= target:
            seg = cum[i] - cum[i - 1] or 1
            f = (target - cum[i - 1]) / seg
            a, b = pts[i - 1], pts[i]
            return (a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f), i
    return pts[-1], len(pts) - 1


def sample(arr, p):
    x = clamp(p) * (len(arr) - 1)
    i = int(x)
    j = min(i + 1, len(arr) - 1)
    return arr[i] + (arr[j] - arr[i]) * (x - i)


def stadium(lat0, lng0, straight=84.4, radius=36.5, rot=math.radians(28), n=64):
    """A 400m athletics track as lat/lng points (the 48-sample GPS trace is too coarse to read as an oval)."""
    per = 2 * straight + 2 * math.pi * radius
    out = []
    for i in range(n):
        s = i / n * per
        if s < straight:
            x, y = -straight / 2 + s, -radius
        elif s < straight + math.pi * radius:
            a = (s - straight) / radius - math.pi / 2
            x, y = straight / 2 + radius * math.cos(a), radius * math.sin(a)
        elif s < 2 * straight + math.pi * radius:
            x, y = straight / 2 - (s - straight - math.pi * radius), radius
        else:
            a = (s - 2 * straight - math.pi * radius) / radius + math.pi / 2
            x, y = -straight / 2 + radius * math.cos(a), radius * math.sin(a)
        x, y = x * math.cos(rot) - y * math.sin(rot), x * math.sin(rot) + y * math.cos(rot)
        out.append([lat0 + y / 111320, lng0 + x / (111320 * math.cos(math.radians(lat0)))])
    return out + [out[0]]


for b in BOSSES:
    if b["key"] == "ocelot":
        lat0 = sum(p[0] for p in b["route"]) / len(b["route"])
        lng0 = sum(p[1] for p in b["route"]) / len(b["route"])
        b["route"], b["laps"] = stadium(lat0, lng0), 12
    b["pts"], b["cum"] = project(b["route"], RADAR, 50 if b["key"] == "ocelot" else 18)
    b["total_s"] = parse_time(b["time"])


# ------------------------------------------------------------ scene drawing

def scanline_bg(img, color=(8, 12, 10)):
    ImageDraw.Draw(img).rectangle([0, 0, W, H], fill=color)


def draw_title(img, d, lt, dur):
    rnd = random.Random(int(lt * 10))
    for i in range(60):  # starfield/noise dots
        x, y = rnd.randrange(W), rnd.randrange(H)
        d.point((x, y), fill=(40, 60, 50))
    a = clamp(lt / 1.5)
    txt(d, (W // 2, 60), "A STRAVA TACTICAL ENDURANCE ACTION", tuple(int(v * a) for v in GREY), "ma")
    if lt > 0.8:
        slide = int((1 - clamp((lt - .8) / .6)) * 200)
        big(img, "METAL GEAR", W // 2 - slide, 100, 5, None, "c", grad=((250, 250, 250), (90, 100, 110)))
    if lt > 1.6:
        slide = int((1 - clamp((lt - 1.6) / .5)) * 200)
        big(img, "STRIDE", W // 2 + slide, 185, 5, None, "c", grad=((255, 90, 70), (120, 10, 10)))
        d.line([(120, 272), (520, 272)], fill=(120, 20, 20), width=2)
    if lt > 2.6:
        txt(d, (W // 2, 282), "OPERATION: ALBAN WAY   ·   OCT 2025 - SEP 2026", WHITE, "ma")
    if lt > 3.4 and int(lt * 2.5) % 2 == 0:
        txt(d, (W // 2, 318), "PRESS START", YELLOW, "ma")


def draw_codec(img, d, lt, dur, lines, freq="140.85", right="MEGAN"):
    """lines: [(t_start, speaker, text)]"""
    img.paste((0, 0, 0), [0, 0, W, H])
    open_k = clamp(lt / 0.5)
    ph, pw = 150, 128
    speaker, text, tstart = None, "", 0
    for ts, sp, tx in lines:
        if lt >= ts:
            speaker, text, tstart = sp, tx, ts
    talking_l = speaker == "MARK" and (lt - tstart) * 38 < len(text)
    talking_r = speaker == right and (lt - tstart) * 38 < len(text)
    hh = int(ph * open_k)
    for x0, who, talk in ((40, "MARK", talking_l), (W - 40 - pw, right, talking_r)):
        d.rectangle([x0 - 4, 40 - 4, x0 + pw + 4, 40 + ph + 4], outline=MGREEN, width=2)
        if hh > 4:
            p = portrait(who, pw, ph, lt, talk).crop((0, (ph - hh) // 2, pw, (ph - hh) // 2 + hh))
            img.paste(p, (x0, 40 + (ph - hh) // 2))
        txt(d, (x0 + pw // 2, 40 + ph + 8), who, GREEN, "ma")
    # frequency block
    cx = W // 2
    d.rectangle([cx - 110, 60, cx + 110, 160], outline=MGREEN, width=2)
    txt(d, (cx - 100, 66), "PTT", MGREEN)
    txt(d, (cx + 100, 66), "MEMORY", MGREEN, "ra")
    big(img, freq, cx, 88, 3, GREEN, "c", shadow=False)
    for i in range(10):  # signal meter
        lvl = (math.sin(lt * 9 + i) * .5 + .5) if (talking_l or talking_r) else .15
        hgt = 4 + i * 2
        col = GREEN if lvl > i / 10 else DGREEN
        d.rectangle([cx - 90 + i * 18, 150 - hgt, cx - 80 + i * 18, 150], fill=col)
    txt(d, (cx, 176), "◄  TUNE  ►", MGREEN, "ma")
    # text box
    d.rectangle([24, 250, W - 24, H - 16], outline=MGREEN, width=2)
    if speaker:
        txt(d, (40, 258), speaker + ":", GREEN)
        shown = typed(text, lt - tstart)
        for i, ln in enumerate(wrap(shown, W - 110)):
            txt(d, (40, 280 + i * 20), ln, WHITE)


def draw_boss_intro(img, d, lt, dur, b, idx):
    acc = ACCENT[b["key"]]
    rnd = random.Random(idx * 100 + int(lt * 15))
    for i in range(24):  # red streaks
        y = rnd.randrange(H)
        x = rnd.randrange(-200, W)
        d.line([(x, y), (x + rnd.randrange(60, 300), y)], fill=(60 + rnd.randrange(80), 0, 0))
    flash = clamp(1 - lt / 0.25)
    if flash > 0:
        img.paste(tuple(int(255 * flash) for _ in range(3)), [0, 0, W, H])
    txt(d, (40, 40), f"BOSS {idx:02d} / 08", acc)
    txt(d, (40, 60), b["date"], GREY)
    slide = int((1 - clamp((lt - .2) / .5)) * -400)
    big(img, b["boss"], 40 + slide, 110, 3 if len(b["boss"]) > 10 else 4, acc)
    if lt > .8:
        txt(d, (42, 186), typed(SUBTITLE[b["key"]], lt - .8, 50), WHITE)
    if lt > 1.6:
        d.line([(40, 220), (400, 220)], fill=acc)
        txt(d, (42, 230), "MISSION FILE:", GREY)
        for i, ln in enumerate(wrap('"' + b["activity"] + '"', 360)[:2]):
            txt(d, (42, 250 + i * 18), ln, YELLOW)
        txt(d, (42, 292), f'{b["dist_km"]:.2f} KM   {b["time"]}   +{b["elev"]}m   HR MAX {b["max_hr"]}', WHITE)
    icon = boss_icon(b["key"], acc).resize((160, 160), Image.NEAREST)
    k = clamp((lt - .3) / .4)
    if k > 0:
        ic = icon.copy()
        ic.putalpha(Image.eval(ic.getchannel("A"), lambda v: int(v * k)))
        jitter = int(math.sin(lt * 40) * 2) if lt < 1 else 0
        img.paste(ic, (W - 190 + jitter, 40), ic)


def radar_base(img, d, b, lt, p):
    x0, y0, x1, y1 = RADAR
    key = b["key"]
    base = dict(raven=(10, 18, 34), rex=(26, 8, 6), liquid=(22, 22, 26)).get(key, DGREEN)
    grid = tuple(min(255, v + 18) for v in base)
    d.rectangle(RADAR, fill=base)
    if key == "liquid":  # riveted plates on top of REX
        plates = Image.new("RGB", (x1 - x0, y1 - y0), base)
        pd = ImageDraw.Draw(plates)
        for gx in range(0, x1 - x0, 48):
            for gy in range(0, y1 - y0, 32):
                pd.rectangle([gx + 1, gy + 1, gx + 46, gy + 30], outline=(50, 50, 58))
                pd.point((gx + 4, gy + 4), fill=(90, 90, 100))
        img.paste(plates, (x0, y0))
    else:
        for gx in range(x0, x1, 16):
            d.line([(gx, y0), (gx, y1)], fill=grid)
        for gy in range(y0, y1, 16):
            d.line([(x0, gy), (x1, gy)], fill=grid)
    d.rectangle(RADAR, outline=MGREEN, width=2)


def draw_route(d, b, p, shake=(0, 0), color_done=(170, 255, 190), color_todo=(40, 120, 70)):
    pts = [(x + shake[0], y + shake[1]) for x, y in b["pts"]]
    d.line(pts, fill=color_todo, width=2, joint="curve")
    laps = b.get("laps", 1)
    if laps > 1 and p * laps >= 1:
        d.line(pts, fill=color_done, width=2, joint="curve")
        return along(pts, b["cum"], (p * laps) % 1)[0]
    pos, i = along(pts, b["cum"], p * laps)
    done = pts[:i] + [pos]
    if len(done) > 1:
        d.line(done, fill=color_done, width=2, joint="curve")
    return pos


def cone(ov, src, dst, color, length=60, spread=0.45):
    ang = math.atan2(dst[1] - src[1], dst[0] - src[0])
    a = (src[0] + math.cos(ang - spread) * length, src[1] + math.sin(ang - spread) * length)
    c = (src[0] + math.cos(ang + spread) * length, src[1] + math.sin(ang + spread) * length)
    ImageDraw.Draw(ov).polygon([src, a, c], fill=color + (70,))


def runner(d, pos, lt, color=WHITE):
    if int(lt * 6) % 4 != 0:
        d.rectangle([pos[0] - 3, pos[1] - 3, pos[0] + 3, pos[1] + 3], fill=color, outline=BLACK)


def caption_box(img, d, lt_in, speaker, text, acc):
    x0, y0, x1, y1 = RADAR[0] + 6, RADAR[3] - 62, RADAR[2] - 6, RADAR[3] - 6
    ov = Image.new("RGBA", (x1 - x0, y1 - y0), (0, 0, 0, 190))
    img.paste(ov, (x0, y0), ov)
    d.rectangle([x0, y0, x1, y1], outline=acc)
    col = WHITE if speaker == "MARK" else (YELLOW if speaker in ("SYSTEM", "MEGAN") else acc)
    txt(d, (x0 + 8, y0 + 4), speaker, col)
    for i, ln in enumerate(wrap(typed(text, lt_in), x1 - x0 - 16)[:2]):
        txt(d, (x0 + 8, y0 + 20 + i * 16), ln, WHITE)


def fx_mantis(img, d, ov, b, p, lt, pos):
    rnd = random.Random(int(lt * 20))
    cx, cy = pos[0] + math.cos(lt * 1.3) * 70, pos[1] + math.sin(lt * 1.7) * 45
    cx, cy = clamp(cx, RADAR[0] + 30, RADAR[2] - 30), clamp(cy, RADAR[1] + 30, RADAR[3] - 70)
    cone(ov, (cx, cy), pos, (200, 90, 255), 70)
    ic = boss_icon("mantis", ACCENT["mantis"], 64).resize((32, 32), Image.NEAREST)
    img.paste(ic, (int(cx - 16), int(cy - 16 + math.sin(lt * 5) * 3)), ic)
    for i in range(6):  # floating psychic debris
        a = lt * (0.8 + i * .2) + i
        x, y = cx + math.cos(a) * (40 + i * 6), cy + math.sin(a) * (30 + i * 4)
        d.rectangle([x, y, x + 3, y + 3], fill=(200, 90, 255))
    if .68 <= p < .8:
        x0, y0 = 60, 110
        d.rectangle([x0, y0, x0 + 280, y0 + 90], fill=BLACK, outline=YELLOW, width=2)
        txt(d, (x0 + 140, y0 + 8), "SWITCH CONTROLLER PORT!", YELLOW, "ma")
        sw = p > .72
        txt(d, (x0 + 16, y0 + 36), "PORT 1  RADIO 4", GREY if sw else WHITE)
        txt(d, (x0 + 16, y0 + 58), "PORT 2  DAFT PUNK: ALIVE 2007", GREEN if sw else GREY)
        d.text((x0 + 250, y0 + (58 if sw else 36)), "◄", font=FONT, fill=YELLOW)
    if p > .72:  # music notes streaming off the runner
        for i in range(5):
            ph = (lt * 1.5 + i / 5) % 1
            x, y = pos[0] + 10 + ph * 50, pos[1] - 10 - ph * 40 + math.sin(ph * 12 + i) * 6
            txt(d, (x, y), "♪", GREEN)
    return (rnd.randint(-2, 2), rnd.randint(-2, 2)) if .5 <= p < .66 else (0, 0)


def fx_ocelot(img, d, ov, b, p, lt, pos):
    x0, y0, x1, y1 = [min(q[0] for q in b["pts"]), min(q[1] for q in b["pts"]),
                      max(q[0] for q in b["pts"]), max(q[1] for q in b["pts"])]
    rnd = random.Random(7)
    for i in range(22):  # C4 ring around the track
        a = i / 22 * 2 * math.pi
        cx, cy = (x0 + x1) / 2 + math.cos(a) * ((x1 - x0) / 2 + 22), (y0 + y1) / 2 + math.sin(a) * ((y1 - y0) / 2 + 18)
        d.rectangle([cx - 4, cy - 3, cx + 4, cy + 3], fill=(120, 60, 40))
        if (int(lt * 4) + i) % 3 == 0:
            d.point((cx, cy), fill=RED)
    op, _ = along(b["pts"], b["cum"], (p * 12 + .5) % 1)  # 12 laps
    cone(ov, op, pos, ACCENT["ocelot"], 80)
    ic = boss_icon("ocelot", ACCENT["ocelot"]).resize((28, 28), Image.NEAREST)
    img.paste(ic, (int(op[0] - 14), int(op[1] - 14)), ic)
    shot = (lt * 1.6) % 1
    if shot < .18:  # ricochet
        r = random.Random(int(lt * 1.6))
        a = (op[0], op[1])
        pts = [a]
        for _ in range(3):
            pts.append((r.uniform(RADAR[0] + 20, RADAR[2] - 20), r.uniform(RADAR[1] + 20, RADAR[3] - 80)))
        d.line(pts, fill=YELLOW, width=1)
    lap = min(12, int(p * 12) + 1)
    big(img, f"LAP {lap:02d}/12", RADAR[0] + 12, RADAR[1] + 8, 2, ACCENT["ocelot"])
    lt_s = b["splits"][lap - 1]
    txt(d, (RADAR[0] + 16, RADAR[1] + 46), f"400m  {lt_s}s", WHITE)
    if .47 < p < .55 and int(lt * 8) % 2:
        big(img, "RELOAD", (RADAR[0] + RADAR[2]) // 2, 150, 3, YELLOW, "c")
    return (0, 0)


def fx_tank(img, d, ov, b, p, lt, pos):
    tp, _ = along(b["pts"], b["cum"], (p + 0.06) % 1)
    cone(ov, tp, pos, ACCENT["tank"], 90, .3)
    ic = boss_icon("tank", ACCENT["tank"]).resize((36, 36), Image.NEAREST)
    img.paste(ic, (int(tp[0] - 18), int(tp[1] - 18)), ic)
    period = 1.3
    ph = (lt % period) / period
    r = random.Random(int(lt / period))
    tx, ty = pos[0] + r.uniform(-40, 40), pos[1] + r.uniform(-30, 30)
    if ph < .15:
        d.line([tp, (tx, ty)], fill=YELLOW)
    elif ph < .45:
        rad = 4 + (ph - .15) * 60
        d.ellipse([tx - rad, ty - rad, tx + rad, ty + rad], outline=(255, 140, 40), width=2)
        d.ellipse([tx - rad / 2, ty - rad / 2, tx + rad / 2, ty + rad / 2], fill=(255, 220, 120))
    txt(d, (RADAR[0] + 14, RADAR[1] + 10), f"LAP {1 if p < .5 else 2} OF 2", ACCENT["tank"])
    return (0, 0)


def fx_ninja(img, d, ov, b, p, lt, pos):
    np_, _ = along(b["pts"], b["cum"], (p + 0.03) % 1)
    vis = 1 if p < .5 else (1 if int(lt * 12) % 5 == 0 else 0)
    if vis:
        ic = boss_icon("ninja", ACCENT["ninja"]).resize((30, 30), Image.NEAREST)
        img.paste(ic, (int(np_[0] - 15), int(np_[1] - 15)), ic)
        cone(ov, np_, pos, ACCENT["ninja"], 50)
    else:  # stealth shimmer
        for i in range(12):
            a = lt * 7 + i
            d.point((np_[0] + math.cos(a) * 10, np_[1] + math.sin(a * 1.3) * 12), fill=ACCENT["ninja"])
    if p > .5:  # GPS ghost track drifting off course
        ghost = [(x + math.sin(i * .9 + lt * 2) * 6, y + math.cos(i * .7) * 6) for i, (x, y) in enumerate(b["pts"])]
        pp, i = along(ghost, b["cum"], p)
        seg = ghost[:i] + [pp]
        for k in range(0, len(seg) - 1, 2):
            d.line([seg[k], seg[k + 1]], fill=(200, 60, 60))
        txt(d, (RADAR[2] - 12, RADAR[1] + 8), "GPS SIGNAL: SPOOFED", RED if int(lt * 3) % 2 else YELLOW, "ra")
    if p > .78:
        el = b["total_s"] * p if p < .99 else b["total_s"]
        shown = min(el, 2339 + (p - .78) / .2 * 5)  # hover under 39 before the reveal
        if p >= .97:
            shown = b["total_s"]
        big(img, fmt_time(shown), (RADAR[0] + RADAR[2]) // 2, 120, 4, RED if shown >= 2340 else GREEN, "c")
    return (0, 0)


def fx_raven(img, d, ov, b, p, lt, pos):
    rnd = random.Random(3)
    for i in range(70):  # snow
        x = (rnd.uniform(0, W) + lt * rnd.uniform(5, 20)) % (RADAR[2] - RADAR[0]) + RADAR[0]
        y = (rnd.uniform(0, H) + lt * rnd.uniform(20, 50)) % (RADAR[3] - RADAR[1]) + RADAR[1]
        d.point((x, y), fill=(220, 230, 255))
    for i in range(6):  # ravens crossing
        ph = (lt * .15 + i / 6) % 1
        x = RADAR[0] + ph * (RADAR[2] - RADAR[0])
        y = RADAR[1] + 30 + i * 30 + math.sin(lt * 3 + i) * 8
        f = 3 if int(lt * 8 + i) % 2 else -2
        d.line([(x - 6, y - f), (x, y), (x + 6, y - f)], fill=BLACK, width=2)
    # elevation profile across the bottom of the radar
    prof = b["alt"]
    lo, hi = min(prof), max(prof)
    base_y, top_y = RADAR[3] - 70, RADAR[3] - 150
    pts = [(RADAR[0] + 10 + i / (len(prof) - 1) * (RADAR[2] - RADAR[0] - 20),
            base_y - (v - lo) / (hi - lo) * (base_y - top_y)) for i, v in enumerate(prof)]
    ImageDraw.Draw(ov).polygon(pts + [(pts[-1][0], base_y), (pts[0][0], base_y)], fill=(150, 170, 230, 60))
    d.line(pts, fill=(170, 190, 240))
    cx = pts[0][0] + p * (pts[-1][0] - pts[0][0])
    d.line([(cx, top_y - 10), (cx, base_y)], fill=YELLOW)
    rp, _ = along(b["pts"], b["cum"], (p + 0.04) % 1)
    ic = boss_icon("raven", ACCENT["raven"]).resize((40, 40), Image.NEAREST)
    img.paste(ic, (int(rp[0] - 20), int(rp[1] - 20)), ic)
    cone(ov, rp, pos, ACCENT["raven"], 80, .5)
    return (0, 0)


def fx_rex(img, d, ov, b, p, lt, pos):
    ic = boss_icon("rex", (70, 25, 20)).resize((220, 220), Image.NEAREST)
    img.paste(ic, (RADAR[2] - 240, RADAR[1] + 10), ic)
    shake = (0, 0)
    if p > .62:
        k = clamp((p - .62) / .2)
        top = int(RADAR[3] - k * 180)
        for row, y in enumerate(range(top, RADAR[3], 12)):
            off = 0 if row % 2 else 14
            for x in range(RADAR[0] - off, RADAR[2], 28):
                d.rectangle([max(RADAR[0], x), y, min(RADAR[2], x + 26), min(RADAR[3], y + 10)],
                            fill=(120, 40, 30), outline=(60, 15, 10))
        if k > .3:
            big(img, "THE WALL", (RADAR[0] + RADAR[2]) // 2, top + 20, 4, (255, 210, 180), "c")
        r = random.Random(int(lt * 25))
        shake = (r.randint(-3, 3), r.randint(-2, 2))
    if .44 < p < .7 and int(lt * 4) % 2:
        txt(d, (RADAR[0] + 14, RADAR[1] + 10), "! ACHILLES", RED)
    return shake


def fx_wolf(img, d, ov, b, p, lt, pos):
    leave = clamp((p - .66) / .2)
    for i in range(9):  # the 1:30 pace group
        ahead = 0.004 * (i % 3) + leave * (0.08 + 0.01 * i)
        wp, _ = along(b["pts"], b["cum"], min(1, p + ahead))
        wx, wy = wp[0] + math.sin(i * 2.1) * 8, wp[1] + math.cos(i * 1.7) * 8
        if leave < .98:
            d.ellipse([wx - 3, wy - 3, wx + 3, wy + 3], fill=(200, 200, 200))
    if leave > .05:
        fp, _ = along(b["pts"], b["cum"], min(1, p + leave * .12))
        txt(d, (fp[0] + 8, fp[1] - 18), "1:30", (200, 200, 200))
    # sniper scope tracking the runner
    sx, sy = pos[0] + math.sin(lt * 1.1) * 12, pos[1] + math.cos(lt * .9) * 10
    d.ellipse([sx - 36, sy - 36, sx + 36, sy + 36], outline=RED, width=2)
    d.line([(sx - 44, sy), (sx + 44, sy)], fill=RED)
    d.line([(sx, sy - 44), (sx, sy + 44)], fill=RED)
    d.line([(RADAR[2], RADAR[1] + 20), (sx, sy)], fill=(255, 0, 0))
    if p > .74 and int(lt * 3) % 2:
        txt(d, ((RADAR[0] + RADAR[2]) // 2, RADAR[1] + 12), "GOODBYE, 1:30 PACE GROUP", YELLOW, "ma")
    return (0, 0)


def fx_liquid(img, d, ov, b, p, lt, pos):
    lp, _ = along(b["pts"], b["cum"], (p + 0.025) % 1)
    ic = boss_icon("liquid", ACCENT["liquid"]).resize((34, 34), Image.NEAREST)
    img.paste(ic, (int(lp[0] - 17), int(lp[1] - 17)), ic)
    cone(ov, lp, pos, ACCENT["liquid"], 60)
    km_edges = np.cumsum(b["splits"]) / sum(b["splits"])
    for e in km_edges[:-1]:
        if 0 <= p - e < .05:
            big(img, "POW!", pos[0] + 10, pos[1] - 40, 2, YELLOW)
    el = b["total_s"] * p
    big(img, "TIME " + fmt_time(el), RADAR[0] + 14, RADAR[1] + 8, 2, ACCENT["liquid"])
    return (0, 0)


FX = dict(mantis=fx_mantis, ocelot=fx_ocelot, tank=fx_tank, ninja=fx_ninja, raven=fx_raven,
          rex=fx_rex, wolf=fx_wolf, liquid=fx_liquid)

BATTLE_LEAD, BATTLE_RUN = 0.9, 11.0


def battle_p(lt):
    return clamp((lt - BATTLE_LEAD) / BATTLE_RUN)


def draw_battle(img, d, lt, dur, b):
    key, acc = b["key"], ACCENT[b["key"]]
    p = battle_p(lt)
    n = len(b["splits"])
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    radar_base(img, d, b, lt, p)
    pos0, _ = along(b["pts"], b["cum"], (p * b.get("laps", 1)) % 1 if p < 1 else 1)
    shake = FX[key](img, d, ov, b, p, lt, pos0)
    pos = draw_route(d, b, p, shake)
    img.paste(ov, (0, 0), ov)
    runner(d, pos, lt)
    if lt < BATTLE_LEAD + .3:  # the "!" alert
        big(img, "!", pos[0] - 6, pos[1] - 44, 3, RED)
    # top HUD
    life_keys, boss_keys = LIFE[key]
    pl = float(np.interp(p, *life_keys))
    bl = float(np.interp(p, *boss_keys))
    txt(d, (12, 6), "LIFE", WHITE)
    bar(d, 52, 10, 160, 8, pl, (60, 220, 110) if pl > .3 else RED)
    txt(d, (228, 6), "MARK", GREY)
    txt(d, (W - 12, 4), b["boss"], acc, "ra")
    bar(d, W - 212, 22, 200, 6, bl, (220, 50, 50))
    # right intel panel
    px = 420
    d.rectangle([px - 6, RADAR[1], W - 12, RADAR[3]], outline=MGREEN, width=2)
    txt(d, (px, RADAR[1] + 6), "MISSION INTEL", GREEN)
    k = p * n
    i = min(n - 1, int(k))
    split_len = b["dist_km"] / n
    pace = b["splits"][i] / split_len
    avg_pace = b["total_s"] / b["dist_km"]
    pace_col = RED if pace > avg_pace * 1.06 else (CYAN if pace < avg_pace * .97 else WHITE)
    elapsed = (sum(b["splits"][:i]) + (k - i) * b["splits"][i]) * b["total_s"] / sum(b["splits"])
    if p >= 1:
        elapsed = b["total_s"]
    hr = sample(b["hr"], p)
    alt = sample(b["alt"], p)
    rows = [("DIST", f"{b['dist_km'] * p:5.2f} / {b['dist_km']:.2f} KM", WHITE),
            ("TIME", fmt_time(elapsed), WHITE),
            ("PACE", f"{fmt_time(pace)} /KM", pace_col),
            ("HR", f"{hr:3.0f} BPM", RED if hr > 180 else WHITE),
            ("ELEV", f"{alt:4.0f} M", WHITE)]
    for r, (lab, val, col) in enumerate(rows):
        txt(d, (px, RADAR[1] + 30 + r * 19), lab, GREY)
        txt(d, (px + 44, RADAR[1] + 30 + r * 19), val, col)
    beat = (lt * hr / 60) % 1 < .2
    heart_x, heart_y = W - 34, RADAR[1] + 30 + 3 * 19 + 8
    rr = 5 if beat else 4
    d.ellipse([heart_x - rr - 3, heart_y - rr, heart_x - 3 + rr, heart_y + rr], fill=RED)
    d.ellipse([heart_x + 3 - rr, heart_y - rr, heart_x + 3 + rr, heart_y + rr], fill=RED)
    d.polygon([(heart_x - 8 - (rr - 4), heart_y + 1), (heart_x + 8 + (rr - 4), heart_y + 1), (heart_x, heart_y + 10)], fill=RED)
    # hr + elevation mini graphs
    gx0, gx1, gy0, gy1 = px, W - 20, RADAR[1] + 132, RADAR[1] + 190
    d.rectangle([gx0, gy0, gx1, gy1], fill=(4, 14, 8), outline=MGREEN)
    lo, hi = min(b["alt"]), max(b["alt"]) + 1
    ap = [(gx0 + j / (len(b["alt"]) - 1) * (gx1 - gx0), gy1 - 2 - (v - lo) / (hi - lo) * (gy1 - gy0 - 30)) for j, v in enumerate(b["alt"])]
    d.line(ap, fill=MGREEN)
    hp = [(gx0 + j / (len(b["hr"]) - 1) * (gx1 - gx0), gy1 - 2 - clamp((v - 90) / 110) * (gy1 - gy0 - 4)) for j, v in enumerate(b["hr"])]
    cut = max(2, int(p * (len(hp) - 1)) + 1)
    d.line(hp[:cut], fill=RED)
    cxp = gx0 + p * (gx1 - gx0)
    d.line([(cxp, gy0), (cxp, gy1)], fill=YELLOW)
    txt(d, (gx0 + 2, gy0 + 1), "HR", RED)
    txt(d, (gx1 - 2, gy0 + 1), "ELEV", MGREEN, "ra")
    # weapon / item boxes
    wpn, item = GEAR[key]
    if key == "mantis" and p > .72:
        item = "ALIVE 2007"
    for j, (lab, val) in enumerate((("WEAPON", wpn), ("ITEM", item))):
        by = RADAR[1] + 198 + j * 30
        d.rectangle([px, by, W - 20, by + 26], outline=GREY)
        txt(d, (px + 4, by + 1), lab, GREY)
        txt(d, (W - 24, by + 10), val, YELLOW if j == 0 else CYAN, "ra")
    # split bars
    sx0, sx1, sy0, sy1 = 12, W - 12, 306, 352
    txt(d, (sx0, sy0 - 2), "400M LAPS" if key == "ocelot" else "KM SPLITS", GREY)
    bw = (sx1 - sx0 - 90) / n
    fast, slow = min(b["splits"]), max(b["splits"])
    for j, s in enumerate(b["splits"]):
        h = 8 + (slow - s) / max(1, slow - fast) * 30
        x = sx0 + 90 + j * bw
        y = sy1 - h
        if j < i or p >= 1:
            good = (255, 170, 80) if key == "rex" else acc
            col = good if s <= avg_pace * split_len * 1.03 else (150, 45, 40)
            d.rectangle([x + 1, y, x + bw - 2, sy1], fill=col)
        elif j == i:
            fill_h = (k - i) * h
            d.rectangle([x + 1, sy1 - fill_h, x + bw - 2, sy1], fill=WHITE)
            d.rectangle([x + 1, y, x + bw - 2, sy1], outline=WHITE)
        else:
            d.rectangle([x + 1, y, x + bw - 2, sy1], outline=(40, 60, 50))
    txt(d, (sx0, sy0 + 16), fmt_time(pace), pace_col)
    txt(d, (sx0, sy0 + 32), "/KM", GREY)
    # captions
    for ps, pe, sp, tx in CAPTIONS[key]:
        if ps <= p < pe:
            caption_box(img, d, (p - ps) * BATTLE_RUN, sp, tx, acc)


def draw_outcome(img, d, lt, dur, b):
    acc = ACCENT[b["key"]]
    head, stat, who, line = OUTCOME[b["key"]]
    d.rectangle([0, 0, W, H], fill=(6, 6, 8))
    k = clamp(lt / .4)
    col = acc if head == "BOSS DEFEATED" else YELLOW
    big(img, head, W // 2, 70 - int((1 - k) * 40), 4, col, "c")
    if lt > .5:
        txt(d, (W // 2, 150), stat, WHITE, "ma")
    ic = boss_icon(b["key"], acc).resize((96, 96), Image.NEAREST)
    if head == "BOSS DEFEATED" and lt > .6:  # dissolve
        a = np.array(ic)
        rnd = np.random.default_rng(3)
        mask = rnd.random(a.shape[:2]) < clamp((lt - .6) / (dur - .8)) * .9
        a[mask, 3] = 0
        ic = Image.fromarray(a)
    img.paste(ic, (60, 190), ic)
    if lt > .8:
        txt(d, (180, 200), who + ":", acc)
        for i, ln in enumerate(wrap(typed(line, lt - .8, 40), W - 220)):
            txt(d, (180, 222 + i * 20), ln, WHITE)


def draw_gameover(img, d, lt, dur):
    d.rectangle([0, 0, W, H], fill=BLACK)
    if lt < 2.2:
        s = typed("MARK?   MARK?!   MAAAAAARK!!", lt, 16)
        txt(d, (W // 2, 160), s, RED, "ma")
    else:
        k = clamp((lt - 2.2) / 1.2)
        c = tuple(int(v * k) for v in (220, 20, 20))
        big(img, "GAME OVER", W // 2, 110, 6, c, "c")
        if lt > 3:
            txt(d, (W // 2, 230), "MANCHESTER MARATHON  3:20:03", WHITE, "ma")
            txt(d, (W // 2, 252), "SUB 3: FAILED    CAUSE: THE WALL (+ ACHILLES)", GREY, "ma")


def draw_continue(img, d, lt, dur):
    d.rectangle([0, 0, W, H], fill=BLACK)
    big(img, "CONTINUE?", W // 2, 70, 4, WHITE, "c")
    cnt = max(0, 9 - int(lt * 3))
    big(img, str(cnt), W // 2, 140, 4, RED, "c")
    chosen = lt > 2.4
    sel_on = not chosen or int(lt * 10) % 2
    txt(d, (W // 2 - 80, 240), ("▶ " if True else "  ") + "CONTINUE", YELLOW if sel_on else WHITE)
    txt(d, (W // 2 + 40, 240), "  EXIT", GREY)
    if chosen:
        txt(d, (W // 2, 290), "CONTINUES USED: 1", GREY, "ma")


def draw_crutches(img, d, lt, dur):
    d.rectangle([0, 0, W, H], fill=(4, 10, 8))
    txt(d, (40, 40), "21 APR 2026  ·  2 DAYS LATER", GREY)
    big(img, "REHAB MISSION", 40, 64, 3, CYAN)
    for i, ln in enumerate(wrap(typed('"Walk-to-the-end-of-my-street-with-crutches 2026 - 5.00 (New PB)"', lt - .4, 45), 560)):
        txt(d, (40, 130 + i * 20), ln, YELLOW)
    if lt > 2.2:
        txt(d, (40, 190), typed("2 minutes off my time from yesterday.", lt - 2.2, 40), WHITE)
    k = clamp((lt - .5) / (dur - 1.2))
    y = 250
    d.line([(60, y), (580, y)], fill=MGREEN, width=2)
    x = 60 + k * 520
    ic = boss_icon("mark", WHITE).resize((32, 32), Image.NEAREST)
    img.paste(ic, (int(x - 16), y - 36), ic)
    for dx in (-10, 10):  # crutches
        d.line([(x + dx, y - 22), (x + dx * 1.4 + math.sin(lt * 6) * 3, y)], fill=GREY, width=2)
    txt(d, (60, y + 12), f"{k * 956:4.0f}m / 956m", WHITE)
    txt(d, (580, y + 12), "0.6 m/s", GREY, "ra")


MONTAGE = [("02 MAY", "RETURN TO RUN FOLLOWING MARATHON", "5.07 KM"),
           ("16 MAY", "FUTAKOTAMAGAWA PARKRUN, JAPAN - 'HOT HOT HOT'", "19:50"),
           ("02 AUG", "FIRST RUN POST WISDOM TEETH EXTRACTION", "5.01 KM"),
           ("22 AUG", "BACK TO SUB 20 AT ST ALBANS", "19:44"),
           ("05 SEP", "STAMPEDE RELAY - 4 LAPS, WHEELS FULLY OFF", "25.55 KM")]


def draw_montage(img, d, lt, dur):
    d.rectangle([0, 0, W, H], fill=(4, 10, 8))
    big(img, "SUPPLY RUN", 40, 30, 3, GREEN)
    txt(d, (44, 84), "REBUILDING LIFE BAR  MAY - SEP 2026", GREY)
    k = clamp(lt / (dur - .6))
    bar(d, 44, 108, 552, 10, .08 + .92 * k, (60, 220, 110) if k > .3 else RED)
    for i, (dt, name, val) in enumerate(MONTAGE):
        t0 = .5 + i * 1.1
        if lt > t0:
            y = 140 + i * 38
            txt(d, (44, y), dt, CYAN)
            txt(d, (120, y), typed(name, lt - t0, 60), WHITE)
            if lt > t0 + .5:
                txt(d, (596, y), val, YELLOW, "ra")
                d.rectangle([44, y + 22, 596, y + 23], fill=(20, 50, 32))


def draw_epilogue(img, d, lt, dur):
    d.rectangle([0, 0, W, H], fill=BLACK)
    rnd = random.Random(1)
    # road rushing past (the escape)
    for i in range(30):
        y = 200 + i * 5
        off = (lt * (80 + i * 20)) % 60
        for x in range(-60, W + 60, 60):
            d.line([(x + off, y), (x + off + 20 + i, y)], fill=(30 + i * 3, 60 + i * 4, 40))
    txt(d, (W // 2, 50), "27 SEP 2026  ·  THE NEXT DAY", GREY, "ma")
    big(img, "20.01 KM", W // 2, 76, 4, WHITE, "c")
    if lt > 1.2:
        txt(d, (W // 2, 150), typed("1:47:57  ·  4 PRs  ·  St Albans", lt - 1.2, 40), YELLOW, "ma")
    if lt > 2.8:
        txt(d, (W // 2, 176), typed("The sub-3 marathon remains at large. Mark was last seen on the Alban Way.", lt - 2.8, 40), WHITE, "ma")


RESULTS = None


def draw_results(img, d, lt, dur):
    d.rectangle([0, 0, W, H], fill=(4, 8, 14))
    big(img, "MISSION RESULTS", W // 2, 20, 3, WHITE, "c")
    for i, (lab, val) in enumerate(RESULTS):
        t0 = .4 + i * .45
        if lt > t0:
            y = 84 + i * 24
            txt(d, (110, y), lab, GREY)
            room = 530 - FONT.getlength(val) - 8 - (110 + FONT.getlength(lab) + 4)
            txt(d, (110 + FONT.getlength(lab) + 4, y), "." * max(0, int(room / 8)), (40, 50, 60))
            txt(d, (530, y), val, WHITE, "ra")
    if lt > 6.2:
        k = clamp((lt - 6.2) / .4)
        big(img, "FOX", 530, 84 + 9 * 24 - 4 - int((1 - k) * 20), 2, (255, 140, 40), "r")


def draw_end(img, d, lt, dur):
    d.rectangle([0, 0, W, H], fill=BLACK)
    a = clamp(lt / 1.0) * clamp((dur - lt) / 1.0)
    c = lambda col: tuple(int(v * a) for v in col)
    big(img, "TO BE CONTINUED...", W // 2, 120, 3, c(WHITE), "c")
    txt(d, (W // 2, 200), "NEXT MISSION: SUB 3", c(RED), "ma")
    txt(d, (W // 2, 300), "Data: Strava · Oct 2025 - Sep 2026 · Built with Claude Code", c(GREY), "ma")


# ------------------------------------------------------------------ timeline

TIMELINE = []  # (start, dur, fn)
MUSIC, SFX = [], []


def add(dur, fn):
    start = TIMELINE[-1][0] + TIMELINE[-1][1] if TIMELINE else 0.0
    TIMELINE.append((start, dur, fn))
    return start


def blips(t0, text, cps=38, every=2):
    for i in range(0, len(text), every):
        if text[i] != " ":
            SFX.append((t0 + i / cps, S.sfx_blip()))


def build():
    global RESULTS
    t = add(6.0, draw_title)
    MUSIC.append((t, t + 6.0, S.track_title(6.0)))
    SFX.append((t + .8, S.sfx_boom(9) * .6))
    SFX.append((t + 1.6, S.sfx_boom(10) * .6))

    lines = [(1.4, "MEGAN", "Mark, do you read me? I've been through twelve months of your Strava. I count eight hostiles."),
             (5.8, "MARK", "Eight boss fights... on the Alban Way?"),
             (8.6, "MEGAN", "The first is waiting on 9 November. And Mark... keep the easy runs EASY.")]
    t = add(13.0, lambda img, d, lt, dur: draw_codec(img, d, lt, dur, lines))
    SFX.append((t + .1, S.sfx_codec_ring()))
    for ts, _, tx in lines:
        blips(t + ts, tx)
    MUSIC.append((t, t + 13, S.track_pad(13, (45, 52, 57, 60), .035)))

    for idx, b in enumerate(BOSSES, 1):
        key = b["key"]
        t = add(4.0, lambda img, d, lt, dur, b=b, idx=idx: draw_boss_intro(img, d, lt, dur, b, idx))
        SFX.append((t, S.sfx_bossname()))
        SFX.append((t + .05, S.sfx_boom(idx)))
        bdur = BATTLE_LEAD + BATTLE_RUN + 1.0
        t = add(bdur, lambda img, d, lt, dur, b=b: draw_battle(img, d, lt, dur, b))
        SFX.append((t + .1, S.sfx_alert()))
        root = {"rex": 36, "liquid": 40, "raven": 35, "mantis": 37}.get(key, 38)
        bpm = {"ocelot": 165, "liquid": 170, "raven": 132, "rex": 140}.get(key, 150)
        MUSIC.append((t + .3, t + bdur, S.track_battle(bdur, root, bpm)))
        for ps, pe, sp, tx in CAPTIONS[key]:
            blips(t + BATTLE_LEAD + ps * BATTLE_RUN, tx, every=3)
        # boss-specific sfx
        at = lambda p: t + BATTLE_LEAD + p * BATTLE_RUN
        if key == "ocelot":
            k = 0.0
            while k < BATTLE_LEAD + BATTLE_RUN:
                SFX.append((t + k, S.sfx_shot(int(k * 10)) * .6))
                k += 1 / 1.6
        elif key == "tank":
            k = 0.0
            while k < BATTLE_LEAD + BATTLE_RUN:
                SFX.append((t + k + .25, S.sfx_boom(int(k * 10)) * .5))
                k += 1.3
        elif key == "mantis":
            SFX.append((at(.72), S.sfx_alert()))
        elif key == "ninja":
            SFX.append((at(.52), S.sfx_hit(4)))
            SFX.append((at(.97), S.sfx_alert()))
        elif key == "rex":
            SFX.append((at(.62), S.sfx_boom(20)))
            SFX.append((at(.66), S.sfx_boom(21)))
            SFX.append((at(.7), S.sfx_boom(22)))
        elif key == "wolf":
            SFX.append((at(.02), S.sfx_shot(5)))
            SFX.append((at(.72), S.sfx_alert()))
        elif key == "liquid":
            for e in np.cumsum(b["splits"])[:-1] / sum(b["splits"]):
                SFX.append((at(e), S.sfx_hit(int(e * 100))))

        if key == "rex":
            t = add(5.5, draw_gameover)
            MUSIC.append((t + 2.2, t + 5.5, S.track_gameover(3.3)))
            SFX.append((t + .05, S.sfx_hit(30)))
            t = add(4.0, draw_continue)
            for k in range(0, 8):
                SFX.append((t + k / 3, S.sfx_blip() * 3))
            SFX.append((t + 2.4, S.sfx_alert()))
            t = add(6.0, draw_crutches)
            MUSIC.append((t, t + 6, S.track_pad(6, (48, 55, 60, 64), .04)))
            blips(t + .4, '"Walk-to-the-end-of-my-street-with-crutches 2026 - 5.00 (New PB)"', 45)
            t = add(7.2, draw_montage)
            MUSIC.append((t, t + 7.2, S.track_title(7.2)))
        else:
            t = add(4.2, lambda img, d, lt, dur, b=b: draw_outcome(img, d, lt, dur, b))
            MUSIC.append((t, t + 4.2, S.track_victory(4.2) if key != "wolf" else S.track_pad(4.2, (43, 46, 50), .05)))
            blips(t + .8, OUTCOME[key][3], 40, 3)

    t = add(7.0, draw_epilogue)
    MUSIC.append((t, t + 7, S.track_battle(7, 40, 176, .6)))

    total_km = sum(b["dist_km"] for b in BOSSES)
    total_s = sum(b["total_s"] for b in BOSSES)
    kudos = 19 + 38 + 48 + 36 + 31 + 88 + 38 + 24
    RESULTS = [("BOSSES FACED", "8"), ("BOSSES DEFEATED", "6"), ("TARGETS ESCAPED", "1  (1:30 PACK)"),
               ("CONTINUES", "1  (MANCHESTER)"), ("BOSS-FIGHT DISTANCE", f"{total_km:.2f} KM"),
               ("BOSS-FIGHT TIME", fmt_time(total_s)), ("MAX HEART RATE", "192 BPM"),
               ("RATIONS", "6 PUBS  (ST ALBANS SIXER)"), ("KUDOS RECEIVED", str(kudos)),
               ("CODE NAME", "      ")]
    t = add(9.0, draw_results)
    MUSIC.append((t, t + 9, S.track_title(9)))
    for i in range(len(RESULTS)):
        SFX.append((t + .4 + i * .45, S.sfx_blip() * 4))
    SFX.append((t + 6.2, S.sfx_alert()))
    t = add(5.0, draw_end)
    MUSIC.append((t, t + 5, S.track_pad(5, (38, 45, 50, 57), .05)))


build()
TOTAL = TIMELINE[-1][0] + TIMELINE[-1][1]

yy = np.linspace(-1, 1, H)[:, None]
xx = np.linspace(-1, 1, W)[None, :]
VIGNETTE = (1 - 0.35 * (xx ** 2 + yy ** 2) ** 1.5).clip(0.5, 1)[..., None].astype(np.float32)
SCAN = np.ones((H, 1, 1), np.float32)
SCAN[1::2] = 0.8


def render_frame(fi):
    t = fi / FPS
    img = Image.new("RGB", (W, H), BLACK)
    d = ImageDraw.Draw(img)
    for start, dur, fn in TIMELINE:
        if start <= t < start + dur:
            fn(img, d, t - start, dur)
            fade = min(1, (t - start) / 0.12, (start + dur - t) / 0.12)
            break
    else:
        fade = 0
    a = np.asarray(img).astype(np.float32) * VIGNETTE * SCAN * max(0.0, fade)
    return a.clip(0, 255).astype(np.uint8).tobytes()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(HERE, "out", "metal_gear_stride.mp4"))
    ap.add_argument("--start", type=float, default=0)
    ap.add_argument("--seconds", type=float, default=None)
    ap.add_argument("--still", type=float, action="append", help="write a PNG still at this time instead")
    args = ap.parse_args()
    os.makedirs(os.path.dirname(args.out), exist_ok=True)

    if args.still:
        for s in args.still:
            raw = render_frame(int(s * FPS))
            im = Image.frombytes("RGB", (W, H), raw).resize((W * 2, H * 2), Image.NEAREST)
            p = os.path.join(os.path.dirname(args.out), f"still_{s:07.2f}.png")
            im.save(p)
            print(p)
        return

    t0 = args.start
    t1 = TOTAL if args.seconds is None else min(TOTAL, t0 + args.seconds)
    print(f"total runtime {TOTAL:.1f}s; rendering {t0:.1f}-{t1:.1f}s", flush=True)

    wav = os.path.join(os.path.dirname(args.out), "soundtrack.wav")
    pcm = S.mix(TOTAL, MUSIC, SFX)[int(t0 * S.SR): int(t1 * S.SR)]
    with wave.open(wav, "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(S.SR)
        wf.writeframes(pcm.tobytes())

    ff = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [ff, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
           "-i", "-", "-i", wav, "-vf", f"scale={W * SCALE}:{H * SCALE}:flags=neighbor",
           "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", args.out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    frames = range(int(t0 * FPS), int(t1 * FPS))
    with Pool(os.cpu_count()) as pool:
        for n, raw in enumerate(pool.imap(render_frame, frames, chunksize=8)):
            proc.stdin.write(raw)
            if n % (FPS * 10) == 0:
                print(f"  {n / FPS:6.1f}s", flush=True)
    proc.stdin.close()
    proc.wait()
    os.remove(wav)
    print("wrote", args.out)


if __name__ == "__main__":
    sys.exit(main())
