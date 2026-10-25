"""Build the RELAY product film's soundtrack and timeline. Local only: no network, no stock assets.

1. Narration: each scene's text from script.json, spoken by a built-in Windows voice (System.Speech).
2. Music: an original ambient bed synthesized here (four slow chords, soft pads, gentle pulse).
3. Interface sounds: soft clicks, pops and whooshes, synthesized here, placed at scene cues.
4. Mix: music ducks under the voice; ffmpeg encodes web/public/tour/relay-tour.m4a.
5. Timeline: web/src/components/tour/timeline.json (scene starts/durations the player follows).

Usage:  python scripts/tour/build_audio.py --ffmpeg <path to ffmpeg>
Needs Windows (for the voice), numpy and ffmpeg. Everything generated is original.
"""
from __future__ import annotations
import argparse, json, subprocess, tempfile, wave
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SR = 44100
HERE = Path(__file__).resolve().parent


def speak(text, voice, rate, out):
    ps = ("Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
          f"$s.SelectVoice('{voice}'); $s.Rate = {int(rate)}; "
          f"$s.SetOutputToWaveFile('{out}'); $s.Speak([Console]::In.ReadToEnd()); $s.Dispose()")
    subprocess.run(['powershell', '-NoProfile', '-Command', ps], input=text, text=True, check=True)


def read_wav(path):
    with wave.open(str(path)) as w:
        n, ch, sr, sw = w.getnframes(), w.getnchannels(), w.getframerate(), w.getsampwidth()
        x = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32) / 32768
    if ch > 1: x = x.reshape(-1, ch).mean(axis=1)
    if sr != SR:  # linear resample is fine for speech at these rates
        t = np.linspace(0, len(x) / sr, int(len(x) * SR / sr), endpoint=False)
        x = np.interp(t, np.arange(len(x)) / sr, x).astype(np.float32)
    # trim leading/trailing silence the synthesizer adds
    idx = np.nonzero(np.abs(x) > 0.01)[0]
    return x[max(0, idx[0] - 400): idx[-1] + 2000] if len(idx) else x


def lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR); y = np.empty_like(x); acc = 0.0
    for i in range(len(x)):  # one-pole filter; small arrays only (sfx)
        acc = (1 - a) * x[i] + a * acc; y[i] = acc
    return y


def env(n, attack, release):
    e = np.ones(n, np.float32); a = min(n // 2, int(attack * SR)); r = min(n - a, int(release * SR))
    if a: e[:a] = np.linspace(0, 1, a)
    if r: e[-r:] *= np.linspace(1, 0, r)
    return e


def music(total):
    """Original ambient bed: Am9 - Fmaj7 - Cadd9 - G6, slow detuned pads with a soft pulse."""
    chords = [[57, 60, 64, 67, 71], [53, 57, 60, 64, 69], [48, 55, 60, 62, 64], [55, 59, 62, 64, 67]]
    bar = 4.0; n = int(total * SR); t = np.arange(n) / SR; out = np.zeros(n, np.float32)
    hz = lambda m: 440 * 2 ** ((m - 69) / 12)
    for i in range(int(total // bar) + 1):
        s, e = int(i * bar * SR), min(n, int((i + 1) * bar * SR + 1.2 * SR))
        if s >= n: break
        tt = t[s:e] - t[s]; seg = np.zeros(e - s, np.float32)
        for k, m in enumerate(chords[i % 4]):
            f = hz(m)
            seg += (np.sin(2 * np.pi * f * tt) + 0.5 * np.sin(2 * np.pi * f * 1.003 * tt + k)) * (0.16 if k else 0.22)
        seg += 0.25 * np.sin(2 * np.pi * hz(chords[i % 4][0] - 12) * tt)  # warm bass
        seg *= env(len(seg), 1.1, 1.4)
        out[s:e] += seg
    pulse = (0.5 + 0.5 * np.sin(2 * np.pi * t / 0.5)) ** 8  # gentle 120 bpm shimmer
    out += 0.06 * pulse * np.sin(2 * np.pi * hz(76) * t) * np.minimum(1, t / 3)
    out *= np.minimum(1, t / 2.5) * np.minimum(1, (total - t) / 3.0).clip(0)
    return out / (np.abs(out).max() + 1e-9)


def sfx(kind):
    rng = np.random.default_rng(7)
    if kind == 'click':
        n = int(0.05 * SR); x = rng.standard_normal(n).astype(np.float32) * np.exp(-np.arange(n) / (0.006 * SR))
        return lowpass(x, 3500) * 0.9
    if kind == 'pop':
        n = int(0.16 * SR); tt = np.arange(n) / SR; f = 880 * np.exp(-tt * 9) + 420
        return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 22)).astype(np.float32) * 0.5
    if kind == 'whoosh':
        n = int(0.7 * SR); x = rng.standard_normal(n).astype(np.float32)
        cut = np.linspace(400, 3200, n) * np.sin(np.linspace(0, np.pi, n)) + 200
        y = np.empty_like(x); acc = 0.0
        for i in range(n):
            a = np.exp(-2 * np.pi * cut[i] / SR); acc = (1 - a) * x[i] + a * acc; y[i] = acc
        return y * np.sin(np.linspace(0, np.pi, n)) ** 2 * 0.55
    if kind == 'chime':
        n = int(1.4 * SR); tt = np.arange(n) / SR
        return sum(np.sin(2 * np.pi * f * tt) * np.exp(-tt * d) for f, d in ((1046.5, 3), (1568, 4), (2093, 6))).astype(np.float32) * 0.18
    raise ValueError(kind)


# Interface sounds per scene, at seconds after the scene starts (matched to the animations).
CUES = {
    'intro': [(0.2, 'chime')],
    'problem': [(0.6, 'pop'), (1.4, 'pop'), (2.2, 'pop'), (3.0, 'pop'), (3.8, 'pop')],
    'install': [(2.4, 'click'), (4.2, 'click'), (5.4, 'pop')],
    'team': [(1.0, 'pop'), (2.0, 'pop'), (3.0, 'pop'), (6.5, 'click'), (8.5, 'chime')],
    'signin': [(2.2, 'click'), (4.4, 'click'), (6.0, 'pop')],
    'think': [(3.0, 'click'), (4.2, 'click'), (5.4, 'click'), (6.4, 'pop')],
    'moment': [(1.0, 'whoosh'), (5.0, 'pop')],
    'explain': [(1.2, 'click'), (4.0, 'pop'), (6.0, 'whoosh')],
    'challenge': [(1.5, 'click'), (3.0, 'pop'), (7.0, 'click'), (8.0, 'chime')],
    'fresh': [(2.5, 'click'), (3.6, 'click'), (4.6, 'pop')],
    'reflect': [(1.0, 'chime')],
    'outro': [(0.4, 'whoosh')],
}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--ffmpeg', required=True); a = ap.parse_args()
    script = json.loads((HERE / 'script.json').read_text(encoding='utf-8'))
    with tempfile.TemporaryDirectory() as td:
        voices, timeline, t = [], [], 0.0
        for i, sc in enumerate(script['scenes']):
            wav = Path(td) / f'{i}.wav'
            speak(sc['text'], script['voice'], script['rate'], wav)
            v = read_wav(wav); lead = 0.5
            dur = round(lead + len(v) / SR + sc['pad'], 2)
            voices.append((t + lead, v))
            timeline.append({'id': sc['id'], 'chapter': sc['chapter'], 'start': round(t, 2), 'duration': dur, 'text': sc['text']})
            t += dur
        total = t + 0.5
        n = int(total * SR)
        voice = np.zeros(n, np.float32)
        for start, v in voices:
            s = int(start * SR); voice[s:s + len(v)] += v[: n - s]
        fx = np.zeros(n, np.float32)
        for sc in timeline:
            fx[int(sc['start'] * SR): int(sc['start'] * SR) + 1] = 0  # anchor
            for at, kind in CUES.get(sc['id'], []):
                if at >= sc['duration']: continue
                x = sfx(kind); s = int((sc['start'] + at) * SR); fx[s:s + len(x)] += x[: n - s]
            if sc['id'] not in ('intro',):  # a soft whoosh on every chapter change
                x = sfx('whoosh') * 0.5; s = max(0, int((sc['start'] - 0.25) * SR)); fx[s:s + len(x)] += x[: n - s]
        bed = music(total)
        # Duck the music under speech (smoothed envelope of the voice).
        k = int(0.25 * SR); c = np.concatenate([[0.0], np.cumsum(np.abs(voice), dtype=np.float64)])
        idx = np.arange(n); lo = np.clip(idx - k // 2, 0, n); hi = np.clip(idx + k // 2, 0, n)
        speech = ((c[hi] - c[lo]) / k).astype(np.float32)  # moving average in O(n)
        duck = 1 - 0.65 * np.clip(speech / (speech.max() * 0.25 + 1e-9), 0, 1)
        mix = 0.95 * voice / (np.abs(voice).max() + 1e-9) + 0.16 * bed * duck + 0.32 * fx
        mix = np.tanh(mix * 1.1) * 0.9  # gentle limiter
        pcm = (mix * 32767).astype(np.int16)
        master = Path(td) / 'master.wav'
        with wave.open(str(master), 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
        out = ROOT / 'web/public/tour/relay-tour.m4a'; out.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run([a.ffmpeg, '-y', '-loglevel', 'error', '-i', str(master), '-c:a', 'aac', '-b:a', '128k', '-ac', '2', str(out)], check=True)
    tl = {'total': round(total, 2), 'voice': script['voice'], 'scenes': timeline}
    (ROOT / 'web/src/components/tour/timeline.json').parent.mkdir(parents=True, exist_ok=True)
    (ROOT / 'web/src/components/tour/timeline.json').write_text(json.dumps(tl, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(f'Soundtrack {total:.1f}s -> {out.relative_to(ROOT)}; {len(timeline)} scenes in timeline.json')


if __name__ == '__main__':
    main()
