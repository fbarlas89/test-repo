'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/pitch.js');

const SR = 48000;

/** Deterministic noise so failures reproduce. */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
}

/** A voice-like tone: fundamental plus decaying harmonics and noise. */
function tone(freq, seconds, opts) {
  const o = Object.assign({ harmonics: 1, noise: 0, amp: 0.5, sr: SR }, opts);
  const n = Math.round(seconds * o.sr);
  const out = new Float32Array(n);
  const rand = rng(42);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let h = 1; h <= o.harmonics; h++) v += Math.sin((2 * Math.PI * freq * h * i) / o.sr) / h;
    out[i] = o.amp * v + o.noise * rand();
  }
  return out;
}

function centsError(detected, expected) {
  return Math.abs(P.hzToCents(detected, expected));
}

test('cents and Hz round-trip', () => {
  for (const c of [-1200, -350, 0, 49.5, 700, 1200]) {
    const f = P.centsToHz(c, 130.81);
    assert.ok(Math.abs(P.hzToCents(f, 130.81) - c) < 1e-9);
  }
  assert.equal(Math.round(P.hzToCents(220, 110)), 1200);
});

test('foldCents keeps the interval, forgives octaves', () => {
  assert.equal(P.foldCents(0), 0);
  assert.equal(P.foldCents(1200), 0);
  assert.equal(P.foldCents(-1200), 0);
  assert.equal(P.foldCents(1230), 30);
  assert.equal(P.foldCents(-1250), -50);
  assert.equal(P.foldCents(599), 599);
  assert.equal(P.foldCents(600), -600);
});

for (const f of [98, 147, 220]) {
  test(`detects a pure sine at ${f} Hz within 5 cents`, () => {
    const buf = tone(f, 2048 / SR);
    const r = P.detectFrame(buf, SR);
    assert.ok(r.freq, 'expected a pitch');
    assert.ok(centsError(r.freq, f) < 5, `got ${r.freq.toFixed(2)} Hz`);
  });

  test(`detects a harmonic tone with noise at ${f} Hz within 5 cents`, () => {
    const buf = tone(f, 2048 / SR, { harmonics: 8, noise: 0.05 });
    const r = P.detectFrame(buf, SR);
    assert.ok(r.freq, 'expected a pitch');
    assert.ok(centsError(r.freq, f) < 5, `got ${r.freq.toFixed(2)} Hz`);
  });
}

test('works at 44.1 kHz too', () => {
  const buf = tone(123.47, 2048 / 44100, { harmonics: 6, noise: 0.03, sr: 44100 });
  const r = P.detectFrame(buf, 44100);
  assert.ok(centsError(r.freq, 123.47) < 5, `got ${r.freq}`);
});

test('silence is unvoiced', () => {
  const r = P.detectFrame(new Float32Array(2048), SR);
  assert.equal(r.freq, null);
});

test('white noise is unvoiced', () => {
  const rand = rng(7);
  const buf = new Float32Array(2048).map(() => 0.3 * rand());
  const r = P.detectFrame(buf, SR);
  assert.equal(r.freq, null);
});

test('Smoother rejects a single octave spike', () => {
  const s = new P.Smoother(5);
  const out = [130, 131, 262, 130, 131].map((v) => s.push(v));
  assert.ok(Math.abs(out[4] - 130.5) <= 1);
});

test('extractContour follows a two-note melody and segments it', async () => {
  const a = tone(130.81, 1.2, { harmonics: 6, noise: 0.02 });
  const gap = new Float32Array(Math.round(0.8 * SR));
  const b = tone(164.81, 1.2, { harmonics: 6, noise: 0.02 });
  const all = new Float32Array(a.length + gap.length + b.length);
  all.set(a, 0);
  all.set(gap, a.length);
  all.set(b, a.length + gap.length);

  const frames = await P.extractContour(all, SR);
  const segs = P.segmentPhrases(frames);
  assert.equal(segs.length, 2, JSON.stringify(segs));

  const mid = (seg) => {
    const hz = frames.filter((f) => f.t > seg.t0 + 0.2 && f.t < seg.t1 - 0.2 && f.hz).map((f) => f.hz);
    return P.median(hz);
  };
  assert.ok(centsError(mid(segs[0]), 130.81) < 5);
  assert.ok(centsError(mid(segs[1]), 164.81) < 5);
  // The home note is the lower of the two.
  assert.ok(centsError(P.estimateTonic(frames), 130.81) < 10);
});
