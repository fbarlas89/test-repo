/*
 * Prepare a reference adhan recording for Hayya's "Recorded adhan" level.
 *
 * Decodes the recording in Chromium (which reads ogg, mp3, m4a and wav),
 * traces its melody with the app's own pitch code, splits it into the
 * lines of the adhan, and writes:
 *
 *   reference/NN-<line>-<rep>.wav   one mono 22.05 kHz clip per line
 *   reference/manifest.json         credit, licence, home note, and each
 *                                   line's traced melody (cents, 10 ms)
 *
 * Usage (needs Playwright):
 *   node tools/prepare-reference.js <recording> \
 *     --title "Beautiful adhan" --credit "Wikimedia Commons contributor" \
 *     --license "CC0 1.0" --source "https://commons.wikimedia.org/wiki/File:Beautiful_adhan.ogg" \
 *     [--fajr] [--min-gap 0.6] [--segments "1.2-8.9,10.4-17.0,..."] [--out reference]
 *
 * It prints one row per line. Listen to the result in the app and use
 * --segments (start-end seconds per line) if a line is split wrongly.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const K = require('../js/content.js');
const C = require('../js/coach.js');

const ROOT = path.join(__dirname, '..');
const RATE = 22050;

function writeWav(file, pcm16, rate) {
  const data = Buffer.from(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8);
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([head, data]));
}

/**
 * Moving average (±half samples) within each voiced run, so the ribbon
 * shows the melody rather than every wobble of the singer's vibrato.
 */
function smoothRuns(cents, half) {
  const out = Float32Array.from(cents);
  for (let i = 0; i < cents.length; i++) {
    if (Number.isNaN(cents[i])) continue;
    let s = 0, n = 0;
    for (let k = i - half; k <= i + half; k++) {
      if (k >= 0 && k < cents.length && !Number.isNaN(cents[k])) {
        s += cents[k];
        n++;
      }
    }
    out[i] = s / n;
  }
  return out;
}

/** Decode and trace in Chromium, using the same pitch.js the app runs. */
async function analyse(input, minGap, chromiumPath) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ executablePath: chromiumPath || process.env.CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><title>prepare</title>');
    await page.addScriptTag({ path: path.join(ROOT, 'js/pitch.js') });
    return await page.evaluate(
      async ({ b64, rate, minGap }) => {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const decoded = await new OfflineAudioContext(1, 1, rate).decodeAudioData(bytes.buffer);
        // Mix to mono at the clip rate.
        const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * rate), rate);
        const src = off.createBufferSource();
        src.buffer = decoded;
        src.connect(off.destination);
        src.start();
        const mono = (await off.startRendering()).getChannelData(0);
        const P = window.Hayya.pitch;
        const frames = await P.extractContour(mono, rate, { hop: 0.01 });
        const segs = P.segmentPhrases(frames, { minGap, minLen: 1.0 });
        const tonicHz = P.estimateTonic(frames);
        let peak = 0;
        for (const v of mono) peak = Math.max(peak, Math.abs(v));
        const gain = peak > 0 ? Math.min(4, 0.9 / peak) : 1;
        const pcm = new Int16Array(mono.length);
        for (let i = 0; i < mono.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(mono[i] * gain * 32767)));
        const u8 = new Uint8Array(pcm.buffer);
        let s = '';
        for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
        return {
          duration: mono.length / rate,
          tonicHz,
          segs,
          frames: frames.map((f) => [Math.round(f.t * 1000) / 1000, f.hz ? Math.round(f.hz * 100) / 100 : 0]),
          pcm: btoa(s),
        };
      },
      { b64: fs.readFileSync(input).toString('base64'), rate: RATE, minGap }
    );
  } finally {
    await browser.close();
  }
}

/**
 * Match detected phrases to the lines of the adhan. Some muezzins take a
 * breath after every takbīr; then the six takbīrs arrive as six phrases
 * and are paired back up.
 */
function matchLines(segs, order) {
  if (segs.length === order.length) return { segs, note: 'one phrase per line' };
  if (segs.length === order.length + 3) {
    const n = segs.length;
    const join = (a, b) => ({ t0: a.t0, t1: b.t1 });
    const merged = [join(segs[0], segs[1]), join(segs[2], segs[3]), ...segs.slice(4, n - 3), join(segs[n - 3], segs[n - 2]), segs[n - 1]];
    return { segs: merged, note: 'takbīrs were sung one per breath and have been paired' };
  }
  return null;
}

async function prepareReference(opts) {
  const o = { out: path.join(ROOT, 'reference'), fajr: false, minGap: 0.6 };
  for (const [k, v] of Object.entries(opts)) if (v !== undefined) o[k] = v; // blanks keep the defaults
  const order = K.adhanOrder(o.fajr);
  const a = await analyse(o.input, o.minGap, o.chromiumPath);
  const frames = a.frames.map(([t, hz]) => ({ t, hz: hz || null }));

  let found = o.segments || a.segs;
  const matched = o.segments ? { segs: o.segments, note: 'segments given by hand' } : matchLines(found, order);
  if (!matched || matched.segs.length !== order.length) {
    const list = found.map((s) => `${s.t0.toFixed(2)}-${s.t1.toFixed(2)}`).join(',');
    throw new Error(
      `Found ${found.length} phrases but the adhan has ${order.length} lines${o.fajr ? ' (Fajr)' : ''}.\n` +
        `Detected: ${list}\nPass --segments with one start-end per line, or try a different --min-gap.`
    );
  }

  fs.mkdirSync(o.out, { recursive: true });
  const raw = Buffer.from(a.pcm, 'base64');
  const pcm = new Int16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  const segs = matched.segs;
  const lines = [];
  const reps = {};
  console.log(`Home note of the recording: ${a.tonicHz.toFixed(1)} Hz (${matched.note})`);
  console.log(' #  line                         start   length');
  order.forEach((id, k) => {
    const seg = segs[k];
    const prevEnd = k > 0 ? segs[k - 1].t1 : 0;
    const nextStart = k < segs.length - 1 ? segs[k + 1].t0 : a.duration;
    const start = Math.max(0, seg.t0 - 0.3, prevEnd + 0.05);
    const end = Math.min(a.duration, seg.t1 + 0.9, nextStart - 0.05);
    reps[id] = (reps[id] || 0) + 1;
    const file = `${String(k + 1).padStart(2, '0')}-${id}-${reps[id]}.wav`;
    writeWav(path.join(o.out, file), pcm.subarray(Math.round(start * RATE), Math.round(end * RATE)), RATE);
    const target = C.targetFromContour(frames, { t0: start, t1: end }, a.tonicHz, 0, 0);
    const cents = Array.from(smoothRuns(target.cents, 7), (c) => (Number.isNaN(c) ? null : Math.round(c * 10) / 10));
    lines.push({ id, rep: reps[id], file, dur: Math.round((end - start) * 1000) / 1000, cents });
    console.log(`${String(k + 1).padStart(2)}  ${(K.phraseById(id).translit + ' ' + reps[id]).padEnd(28)} ${start.toFixed(2).padStart(6)}s ${(end - start).toFixed(2).padStart(6)}s`);
  });

  const manifest = {
    version: 1,
    title: o.title || path.basename(o.input),
    credit: o.credit || '',
    license: o.license || '',
    source: o.source || '',
    tonicHz: Math.round(a.tonicHz * 100) / 100,
    fajr: !!o.fajr,
    sampleRate: RATE,
    step: C.STEP,
    lines,
  };
  fs.writeFileSync(path.join(o.out, 'manifest.json'), JSON.stringify(manifest));
  return manifest;
}

module.exports = { prepareReference, matchLines, smoothRuns };

if (require.main === module) {
  const args = process.argv.slice(2);
  const WITH_VALUE = ['title', 'credit', 'license', 'source', 'min-gap', 'segments', 'out'];
  const named = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const name = args[i].startsWith('--') ? args[i].slice(2) : null;
    if (name && WITH_VALUE.includes(name)) named[name] = args[++i];
    else if (name) named[name] = true;
    else positional.push(args[i]);
  }
  const opt = (name) => named[name];
  const input = positional[0];
  if (!input) {
    console.error('Usage: node tools/prepare-reference.js <recording> [--title ..] [--credit ..] [--license ..] [--source ..] [--fajr] [--min-gap 0.6] [--segments "a-b,c-d,.."] [--out reference]');
    process.exit(2);
  }
  const segments = opt('segments')
    ? opt('segments').split(',').map((p) => {
        const [t0, t1] = p.split('-').map(Number);
        return { t0, t1 };
      })
    : undefined;
  prepareReference({
    input,
    out: opt('out') ? path.resolve(opt('out')) : undefined,
    title: opt('title'),
    credit: opt('credit'),
    license: opt('license'),
    source: opt('source'),
    fajr: !!named.fajr,
    minGap: opt('min-gap') ? Number(opt('min-gap')) : undefined,
    segments,
  })
    .then((m) => console.log(`\nWrote ${m.lines.length} clips and manifest.json`))
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
