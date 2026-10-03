'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/coach.js');
const K = require('../js/content.js');

const phrase = (id) => K.phraseById(id);

/** A take that follows the target exactly, plus an optional offset. */
function perfectTrack(target, offset) {
  const track = [];
  for (let i = 0; i < target.cents.length; i++) {
    const c = target.cents[i];
    track.push({ t: i * target.step, c: Number.isNaN(c) ? null : c + (offset || 0) });
  }
  return track;
}

test('every phrase has a pitch spec for every syllable at every level', () => {
  for (const p of K.PHRASES) {
    for (const lvl of ['simple']) {
      assert.equal(p[lvl].length, p.syl.length, `${p.id} ${lvl}`);
      p.syl.forEach(([s], k) => {
        if (s === '|') assert.equal(p[lvl][k], null, `${p.id} ${lvl} rest ${k}`);
        else assert.notEqual(p[lvl][k], null, `${p.id} ${lvl} syllable ${k}`);
      });
    }
    assert.ok(p.tips.length >= 2, `${p.id} tips`);
  }
});

test('patterns stay inside a safe range above the home note', () => {
  for (const p of K.PHRASES) {
    for (const lvl of ['steady', 'simple']) {
      const t = C.buildTarget(p, lvl);
      const vals = Array.from(t.cents).filter((c) => !Number.isNaN(c));
      assert.ok(Math.min(...vals) >= 0 && Math.max(...vals) <= 700, `${p.id} ${lvl}`);
    }
  }
});

test('adhan order has 15 phrases in 12 lines, 14 lines at Fajr', () => {
  assert.equal(K.adhanOrder(false).length, 12);
  assert.equal(K.adhanOrder(true).length, 14);
  const takbirs = K.adhanOrder(false).filter((id) => id.startsWith('takbir')).length * 2;
  assert.equal(takbirs, 6);
});

test('buildTarget: steady level is a single note with the pair rest', () => {
  const t = C.buildTarget(phrase('takbir-open'), 'steady');
  const vals = new Set(Array.from(t.cents).filter((c) => !Number.isNaN(c)));
  assert.deepEqual([...vals], [0]);
  // The breath between the two takbirs is silent.
  assert.ok(Number.isNaN(C.targetAt(t, 3.4)));
  assert.equal(t.syllables.length, 10);
});

test('buildTarget: glides interpolate between breakpoints', () => {
  const t = C.buildTarget(phrase('takbir-open'), 'simple');
  // "lā" starts at 0.35 s and rises to 200 by 30% of its 1.1 s.
  assert.ok(Math.abs(C.targetAt(t, 0.35 + 1.1 * 0.8) - 200) < 1);
  const early = C.targetAt(t, 0.35 + 1.1 * 0.1);
  assert.ok(early > 0 && early < 200);
});

test('a perfect take is in band and gets warm feedback', () => {
  const t = C.buildTarget(phrase('shahada-1'), 'simple');
  const a = C.analyzeTake(t, perfectTrack(t), { tol: 40 });
  assert.ok(a.heard > 0.98);
  assert.ok(a.inBand > 0.98);
  const fb = C.feedback(a, { level: 'simple' });
  assert.match(fb.well, /close to the pattern/);
});

test('an octave-up take counts as on the pattern', () => {
  const t = C.buildTarget(phrase('hayya-salah'), 'simple');
  const a = C.analyzeTake(t, perfectTrack(t, 1200), { tol: 40 });
  assert.ok(a.inBand > 0.98);
});

test('a consistently flat take is told to lift, not shamed', () => {
  const t = C.buildTarget(phrase('shahada-2'), 'simple');
  const a = C.analyzeTake(t, perfectTrack(t, -80), { tol: 40 });
  assert.ok(a.meanDev < -70);
  const fb = C.feedback(a, { level: 'simple' });
  assert.match(fb.next, /under the pattern/);
  assert.doesNotMatch(fb.well + fb.next, /bad|wrong|fail/i);
});

test('running out of breath is detected', () => {
  const t = C.buildTarget(phrase('tahlil'), 'simple');
  const track = perfectTrack(t).map((p) => (p.t > t.lastVoiced * 0.72 ? { t: p.t, c: null } : p));
  const a = C.analyzeTake(t, track, { tol: 40 });
  assert.ok(a.fadeOut);
  assert.match(C.feedback(a).next, /ran out/);
});

test('silence gets an encouraging nudge to sing out', () => {
  const t = C.buildTarget(phrase('hayya-falah'), 'steady');
  const a = C.analyzeTake(t, [], { tol: 40 });
  assert.equal(a.heard, 0);
  const fb = C.feedback(a);
  assert.match(fb.next, /closer to the mic/);
});

test('the demo voice has the flaws the coach should notice', () => {
  const t = C.buildTarget(phrase('takbir-open'), 'simple');
  const demo = C.demoContour(t);
  const track = Array.from(demo).map((c, i) => ({ t: i * t.step, c: Number.isNaN(c) ? null : c }));
  const a = C.analyzeTake(t, track, { tol: 40 });
  const ending = a.parts.find((p) => p.name === 'Ending');
  const middle = a.parts.find((p) => p.name === 'Middle');
  assert.ok(ending.meanAbs > middle.meanAbs);
  assert.ok(a.heard > 0.95);
  // At the gentlest band the sagging ending is still worth one tip.
  const gentle = C.analyzeTake(t, track, { tol: C.BANDS.gentle.cents });
  assert.match(C.feedback(gentle).next, /ending drifted/);
});

test('buildSequence chains lines with breathing gaps', () => {
  const items = K.adhanOrder(false).map((id) => ({ name: id, target: C.buildTarget(phrase(id), 'steady') }));
  const seq = C.buildSequence(items, 2.5);
  const sum = items.reduce((s, it) => s + it.target.dur, 0);
  assert.ok(Math.abs(seq.dur - (sum + 2.5 * 11)) < 1e-6);
  assert.equal(seq.parts.length, 12);
  assert.equal(seq.breaths.length, 11);
  // Each line starts after the previous line plus one breath.
  assert.equal(seq.starts.length, 12);
  assert.equal(seq.starts[0], 0);
  assert.ok(Math.abs(seq.starts[1] - (items[0].target.dur + 2.5)) < 1e-9);
});

test('targetFromCents reads a stored contour with silences', () => {
  const stored = [null, null, 0, 10, 20, 400, 400, null];
  const t = C.targetFromCents(stored);
  assert.ok(Number.isNaN(C.targetAt(t, 0)));
  assert.equal(C.targetAt(t, 0.03), 10);
  assert.equal(C.targetAt(t, 0.05), 400);
  assert.ok(Math.abs(t.firstVoiced - 0.02) < 1e-9);
  assert.ok(Math.abs(t.dur - 0.07) < 1e-9);
  assert.equal(C.targetFromCents(stored, -100).cents[5], 300);
});

test('targetFromContour transposes a recording to the home note', () => {
  // A 196 Hz recording tonic with a phrase a major third above it.
  const frames = [];
  for (let t = 0; t < 3; t += 0.01) frames.push({ t, hz: t > 0.5 && t < 2.5 ? 196 * Math.pow(2, 400 / 1200) : null });
  const tgt = C.targetFromContour(frames, { t0: 0.5, t1: 2.5 }, 196, 0);
  assert.ok(Math.abs(C.targetAt(tgt, 1.0) - 400) < 1);
  const shifted = C.targetFromContour(frames, { t0: 0.5, t1: 2.5 }, 196, -100);
  assert.ok(Math.abs(C.targetAt(shifted, 1.0) - 300) < 1);
});

test('cueFor gives direction outside the band', () => {
  assert.equal(C.cueFor(-60, 40), 'higher');
  assert.equal(C.cueFor(55, 40), 'lower');
  assert.equal(C.cueFor(10, 40), 'hold');
  assert.equal(C.cueFor(null, 40), null);
});
