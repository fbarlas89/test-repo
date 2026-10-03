'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/shift.js');
const P = require('../js/pitch.js');

const SR = 22050;

function voice(freq, seconds) {
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let h = 1; h <= 6; h++) v += Math.sin((2 * Math.PI * freq * h * i) / SR) / h;
    out[i] = 0.4 * v;
  }
  return out;
}

/** Median pitch over the steady middle of a signal. */
function medianPitch(samples) {
  const hz = [];
  for (let i = Math.round(0.3 * SR); i + 2048 < samples.length - 0.3 * SR; i += 512) {
    const r = P.detectFrame(samples.subarray(i, i + 2048), SR);
    if (r.freq) hz.push(r.freq);
  }
  return P.median(hz);
}

for (const cents of [-500, 300, -1100]) {
  test(`shifts a 147 Hz voice by ${cents} cents and keeps its length`, () => {
    const input = voice(146.83, 2);
    const out = S.pitchShift(input, SR, cents);
    assert.equal(out.length, input.length);
    const expected = 146.83 * Math.pow(2, cents / 1200);
    const got = medianPitch(out);
    assert.ok(Math.abs(P.hzToCents(got, expected)) < 10, `expected ${expected.toFixed(1)} Hz, got ${got.toFixed(1)} Hz`);
  });
}

test('a zero shift leaves the signal unchanged', () => {
  const input = voice(130.81, 0.5);
  assert.deepEqual(S.pitchShift(input, SR, 0), input);
});

test('time stretch changes length but not pitch', () => {
  const input = voice(130.81, 1.5);
  const out = S.timeStretch(input, 1.5, SR);
  assert.ok(Math.abs(out.length - input.length * 1.5) <= 1);
  assert.ok(Math.abs(P.hzToCents(medianPitch(out), 130.81)) < 10);
});

test('shifted output has no runaway level', () => {
  const out = S.pitchShift(voice(146.83, 1), SR, -400);
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  assert.ok(peak < 1.2, `peak ${peak}`);
});
