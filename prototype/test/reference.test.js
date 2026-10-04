'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/pitch.js');
const K = require('../js/content.js');
const { matchLines } = require('../tools/prepare-reference.js');

const seg = (t0, t1) => ({ t0, t1 });

test('one phrase per line maps straight through', () => {
  const order = K.adhanOrder(false);
  const segs = order.map((_, k) => seg(k * 10, k * 10 + 6));
  const m = matchLines(segs, order);
  assert.equal(m.segs.length, 12);
  assert.deepEqual(m.segs[5], segs[5]);
});

test('takbīrs sung one per breath are paired back up', () => {
  const order = K.adhanOrder(false);
  // 4 opening takbīrs, 8 middle lines, 2 closing takbīrs, tahlīl = 15
  const segs = Array.from({ length: 15 }, (_, k) => seg(k * 10, k * 10 + 4));
  const m = matchLines(segs, order);
  assert.equal(m.segs.length, 12);
  assert.deepEqual(m.segs[0], seg(0, 14));
  assert.deepEqual(m.segs[1], seg(20, 34));
  assert.deepEqual(m.segs[2], segs[4]);
  assert.deepEqual(m.segs[10], seg(120, 134));
  assert.deepEqual(m.segs[11], segs[14]);
});

test('an unexpected number of phrases is refused, not guessed', () => {
  const order = K.adhanOrder(false);
  assert.equal(matchLines(Array.from({ length: 9 }, (_, k) => seg(k, k + 0.5)), order), null);
});

test('home note is the lowest note the melody returns to, not a passing low note', () => {
  const frames = [];
  let t = 0;
  const add = (hz, sec) => {
    for (let i = 0; i < sec * 100; i++) frames.push({ t: (t += 0.01), hz });
  };
  add(98, 0.2); // a brief dip below the home note
  add(196, 2); // the home note
  add(247, 4); // the melody mostly sits above it
  add(262, 3);
  const est = P.estimateTonic(frames);
  assert.ok(Math.abs(P.hzToCents(est, 196)) < 10, `got ${est.toFixed(1)} Hz`);
});

test('ribbon smoothing removes vibrato but keeps the melody and the silences', () => {
  const { smoothRuns } = require('../tools/prepare-reference.js');
  const raw = new Float32Array(200).fill(NaN);
  for (let i = 20; i < 180; i++) raw[i] = (i < 100 ? 0 : 400) + 25 * Math.sin((2 * Math.PI * i) / 19);
  const s = smoothRuns(raw, 7);
  assert.ok(Number.isNaN(s[10]) && Number.isNaN(s[190]));
  assert.ok(Math.abs(s[60]) < 8, `wobble left: ${s[60]}`);
  assert.ok(Math.abs(s[150] - 400) < 8);
});
