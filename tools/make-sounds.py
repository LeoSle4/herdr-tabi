"""Makes the two alert sounds of tabi: a temple bell (blocked) and a wind chime (done).

Both are synthesized here, so they carry no third-party licence. Run it again after changing a number below:

    python3 -m venv /tmp/tabi-sounds && /tmp/tabi-sounds/bin/pip install numpy soundfile
    /tmp/tabi-sounds/bin/python tools/make-sounds.py sounds

It writes <folder>/blocked.mp3 and <folder>/done.mp3 (mono, 44.1 kHz).
"""
import os
import sys

import numpy as np
import soundfile as sf

SR = 44100


def partial(freq, amp, decay, length, beat=0.0, phase=0.0):
    """One decaying sine. `decay` is the time (s) the level takes to fall by 60 dB.

    `beat` adds a quieter, slightly detuned twin, so the level shimmers instead of dying in a straight line. The twin
    is kept weak (a quarter) so the two never cancel: with equal levels every partial would go silent at the same moment.
    """
    t = np.arange(int(length * SR)) / SR
    env = amp * 10 ** (-3 * t / decay)
    out = np.sin(2 * np.pi * freq * t + phase)
    if beat:
        out = 0.75 * out + 0.25 * np.sin(2 * np.pi * (freq + beat) * t + phase)
    return env * out


def strike(at, length, total):
    """A very short, dull noise burst that sells the moment of impact."""
    rng = np.random.default_rng(7)
    n = int(length * SR)
    burst = rng.standard_normal(n) * np.exp(-np.arange(n) / (n / 5))
    burst = np.convolve(burst, np.ones(24) / 24, mode="same")  # low-pass: no hiss
    out = np.zeros(int(total * SR))
    i = int(at * SR)
    out[i:i + n] += burst
    return out


def shape(x, peak, fade_in=0.003, fade_out=0.12):
    """Trim silence, fade the ends so nothing clicks, and set the peak (linear, 1.0 = full scale)."""
    a, b = int(fade_in * SR), int(fade_out * SR)
    x = x.copy()
    x[:a] *= np.linspace(0, 1, a)
    x[-b:] *= np.linspace(1, 0, b)
    return x / np.abs(x).max() * peak


def temple_bell():
    """blocked: one strike of a bell tuned like a real one (hum, prime, tierce, quint, nominal...), about 1.9 s."""
    total = 1.9
    base = 330.0  # the "prime"; the hum sounds an octave below
    # (ratio to the prime, level, decay in seconds)
    parts = [(0.5, 0.55, 1.9), (1.0, 1.0, 1.7), (1.2, 0.6, 1.2), (1.5, 0.45, 1.0),
             (2.0, 0.7, 0.9), (2.5, 0.3, 0.6), (3.0, 0.25, 0.5), (4.1, 0.18, 0.35)]
    x = np.zeros(int(total * SR))
    for k, (ratio, amp, decay) in enumerate(parts):
        x += partial(base * ratio, amp, decay, total, beat=0.35 + 0.21 * k)[: len(x)]
    x += 0.35 * strike(0.0, 0.012, total)
    return shape(x, peak=0.7)


def wind_chime():
    """done: two soft glassy taps, the second a little higher and later, about 1.3 s. Gentler than the bell."""
    total = 1.3
    x = np.zeros(int(total * SR))
    for at, base, gain in [(0.0, 2349.0, 1.0), (0.17, 3136.0, 0.7)]:
        i = int(at * SR)
        tap = np.zeros(len(x))
        for k, (ratio, amp, decay) in enumerate([(1.0, 1.0, 0.8), (2.32, 0.45, 0.45), (3.9, 0.2, 0.25)]):
            p = partial(base * ratio, amp, decay, total - at, beat=0.9 + 0.4 * k)
            tap[i:i + len(p)] += p
        x += gain * tap
    return shape(x, peak=0.4)


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "sounds"
    os.makedirs(out, exist_ok=True)
    for name, sound in [("blocked", temple_bell()), ("done", wind_chime())]:
        path = os.path.join(out, f"{name}.mp3")
        sf.write(path, sound.astype(np.float32), SR, format="MP3")
        print(f"{path}: {len(sound) / SR:.2f} s")


if __name__ == "__main__":
    main()
