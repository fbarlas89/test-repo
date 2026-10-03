/*
 * A synthetic stand-in "recording" for tests: a harmonic voice that sings
 * the Simple-level melody of each adhan line in order, with breaths
 * between lines and a little room echo. It is never shipped as a
 * reference; it only proves the preparation pipeline finds the lines.
 */
'use strict';
const fs = require('fs');
const K = require('../js/content.js');
const C = require('../js/coach.js');

function makeStandIn(file, options) {
  const o = Object.assign({ tonicHz: 196, rate: 22050, gap: 1.6, lead: 0.8, singleTakbirs: false }, options);
  const pieces = [];
  for (const id of K.adhanOrder(false)) {
    const t = C.buildTarget(K.phraseById(id), 'simple');
    pieces.push({ id, cents: t.cents });
  }
  const expected = [];
  const step = C.STEP;
  let total = o.lead;
  for (const p of pieces) total += p.cents.length * step + o.gap;
  const n = Math.ceil(total * o.rate);
  const out = new Float32Array(n);
  let t = o.lead;
  let phase = 0;
  for (const p of pieces) {
    const start = t;
    for (let i = 0; i < p.cents.length * step * o.rate; i++) {
      const tt = i / o.rate;
      let c = p.cents[Math.min(p.cents.length - 1, Math.floor(tt / step))];
      // Sung one takbīr per breath: open a short gap at the pair's rest.
      if (Number.isNaN(c) && !o.singleTakbirs) c = p.cents[Math.floor(tt / step) - 20] || 0;
      if (Number.isNaN(c)) { phase = 0; continue; }
      const f = o.tonicHz * Math.pow(2, (c + 10 * Math.sin(2 * Math.PI * 5.2 * tt)) / 1200);
      phase += (2 * Math.PI * f) / o.rate;
      let v = 0;
      for (let h = 1; h <= 7; h++) v += Math.sin(phase * h) / (h * h * 0.5 + 0.5);
      const env = Math.min(1, tt / 0.05, (p.cents.length * step - tt) / 0.08);
      out[Math.round((t + tt) * o.rate)] += 0.25 * v * Math.max(0, env);
    }
    t += p.cents.length * step;
    expected.push({ id: p.id, t0: start, t1: t });
    t += o.gap;
  }
  // A little room: one soft echo.
  const d = Math.round(0.07 * o.rate);
  for (let i = n - 1; i >= d; i--) out[i] += 0.25 * out[i - d];

  const pcm = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(out[i] * 32767))), i * 2);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + pcm.length, 4); head.write('WAVE', 8);
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(o.rate, 24); head.writeUInt32LE(o.rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(file, Buffer.concat([head, pcm]));
  return expected;
}

module.exports = { makeStandIn };
