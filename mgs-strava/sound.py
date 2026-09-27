"""Tiny chiptune synth: original music loops and sound effects, mixed onto a timeline."""
import numpy as np

SR = 44100


def _t(dur):
    return np.arange(int(dur * SR)) / SR


def note_hz(n):
    """MIDI note number -> Hz."""
    return 440.0 * 2 ** ((n - 69) / 12)


def square(f, dur, duty=0.5, vol=0.2):
    t = _t(dur)
    return vol * np.where((t * f) % 1.0 < duty, 1.0, -1.0)


def tri(f, dur, vol=0.3):
    t = _t(dur)
    return vol * (2 * np.abs(2 * ((t * f) % 1.0) - 1) - 1)


def noise(dur, vol=0.2, seed=0):
    return vol * np.random.default_rng(seed).uniform(-1, 1, int(dur * SR))


def env(x, a=0.005, r=0.05):
    n = len(x)
    e = np.ones(n)
    na, nr = min(n, int(a * SR)), min(n, int(r * SR))
    if na:
        e[:na] = np.linspace(0, 1, na)
    if nr:
        e[n - nr:] *= np.linspace(1, 0, nr)
    return x * e


def decay(x, k=8.0):
    return x * np.exp(-k * np.arange(len(x)) / SR)


def place(buf, x, t0):
    i = int(t0 * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(x))
    buf[i:j] += x[: j - i]


# ---------------------------------------------------------------- music loops

def seq(pattern, step, voice, total):
    """pattern: list of midi notes or None, played on a fixed step grid for `total` seconds."""
    out = np.zeros(int(total * SR) + SR)
    t, k = 0.0, 0
    while t < total:
        n = pattern[k % len(pattern)]
        if n is not None:
            place(out, voice(n, step), t)
        t += step
        k += 1
    return out[: int(total * SR)]


def track_battle(total, root=38, bpm=150, intensity=1.0):
    step = 60 / bpm / 2
    bass = [root, root, root + 12, root, root + 3, root, root + 10, root + 7,
            root, root, root + 12, root, root + 1, root, root + 8, root + 6]
    b = seq(bass, step, lambda n, d: env(square(note_hz(n), d * 0.9, 0.25, 0.10), r=0.02), total)
    hat = seq([1, None, 1, 1] * 4, step, lambda n, d: decay(noise(d, 0.05, n), 60), total)
    kick = seq([1, None, None, None] * 4, step,
               lambda n, d: decay(np.sin(2 * np.pi * np.cumsum(np.linspace(120, 40, int(d * SR))) / SR) * 0.35, 18), total)
    lead_pat = [root + 24, None, None, root + 27, None, None, root + 26, None,
                root + 24, None, root + 22, None, root + 19, None, None, None,
                root + 24, None, None, root + 27, None, None, root + 29, None,
                root + 30, None, root + 29, None, root + 27, None, root + 26, None]
    lead = seq(lead_pat, step, lambda n, d: env(square(note_hz(n), d * 1.8, 0.125, 0.045), r=0.08), total)
    return b + hat + kick + lead * intensity


def track_pad(total, notes=(50, 53, 57, 60), vol=0.05):
    out = np.zeros(int(total * SR))
    t = _t(total)
    for i, n in enumerate(notes):
        f = note_hz(n)
        out += vol * np.sin(2 * np.pi * f * t + i) * (0.6 + 0.4 * np.sin(2 * np.pi * (0.1 + 0.03 * i) * t))
    fade = min(len(out), SR)
    out[:fade] *= np.linspace(0, 1, fade)
    out[-fade:] *= np.linspace(1, 0, fade)
    return out


def track_title(total):
    step = 0.5
    arp = [50, 57, 62, 65, 62, 57, 50, 57, 48, 55, 60, 64, 60, 55, 48, 55]
    a = seq(arp, step / 2, lambda n, d: env(tri(note_hz(n + 12), d * 1.5, 0.12), r=0.1), total)
    return a + track_pad(total, (38, 45, 50), 0.06)


def track_gameover(total):
    notes = [62, 61, 60, 59, 58, 57, 50]
    out = np.zeros(int(total * SR) + SR)
    for i, n in enumerate(notes):
        place(out, env(square(note_hz(n), 0.45 if i < 6 else 1.6, 0.5, 0.09), r=0.2), i * 0.42)
    return out[: int(total * SR)]


def track_victory(total):
    notes = [(62, .15), (62, .15), (62, .15), (67, .6), (69, .15), (71, .15), (74, 1.0)]
    out = np.zeros(int(total * SR) + 2 * SR)
    t = 0
    for n, d in notes:
        place(out, env(square(note_hz(n), d, 0.25, 0.08) + square(note_hz(n - 12), d, 0.5, 0.05), r=0.05), t)
        t += d
    return out[: int(total * SR)]


# ---------------------------------------------------------------------- sfx

def sfx_blip():
    return env(square(1800, 0.018, 0.5, 0.035), r=0.005)


def sfx_codec_ring():
    out = np.zeros(int(1.2 * SR))
    for k in range(3):
        place(out, env(square(1320, 0.07, 0.5, 0.08), r=0.01), k * 0.18)
        place(out, env(square(1760, 0.07, 0.5, 0.08), r=0.01), k * 0.18 + 0.08)
    return out


def sfx_alert():
    """The '!' stab: a bright rising chord burst."""
    d = 0.55
    t = _t(d)
    sweep = np.sin(2 * np.pi * np.cumsum(np.linspace(600, 1500, len(t))) / SR)
    chord = sum(square(note_hz(n), d, 0.5, 0.06) for n in (74, 78, 81))
    return decay(env(sweep * 0.25 + chord, r=0.1), 3)


def sfx_hit(seed=1):
    return decay(noise(0.25, 0.35, seed), 14) + decay(square(90, 0.25, 0.5, 0.15), 10)


def sfx_boom(seed=2):
    n = noise(0.9, 0.45, seed)
    k = np.ones(40) / 40
    n = np.convolve(n, k, mode="same")
    return decay(n * 3.0, 4)


def sfx_shot(seed=3):
    out = decay(noise(0.18, 0.4, seed), 25)
    out[: int(0.05 * SR)] += decay(square(2000, 0.05, 0.5, 0.05), 40)
    return out


def sfx_bossname():
    return decay(sum(square(note_hz(n), 1.2, 0.5, 0.05) for n in (38, 45, 50, 53)), 1.8)


def mix(total, music, sfx):
    """music: [(t0, t1, array)], sfx: [(t, array)] -> stereo int16"""
    buf = np.zeros(int(total * SR) + SR)
    for t0, t1, a in music:
        a = a[: int((t1 - t0) * SR)]
        f = min(len(a), int(0.08 * SR))
        a = a.copy()
        if f:
            a[:f] *= np.linspace(0, 1, f)
            a[-f:] *= np.linspace(1, 0, f)
        place(buf, a, t0)
    for t, a in sfx:
        place(buf, a, t)
    buf = buf[: int(total * SR)]
    buf = np.tanh(buf * 1.4) * 0.8
    st = np.stack([buf, buf], axis=1)
    return (st * 32767).astype(np.int16)
