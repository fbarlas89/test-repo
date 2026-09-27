/*
 * Hayya: coach.
 *
 * Builds target contours from the content patterns (or from an uploaded
 * reference recording), compares a take against a target, and turns the
 * comparison into gentle feedback: one thing that went well and one thing
 * to try. There is no score and no ranking by design.
 */
(function (root, factory) {
  const P = typeof module === 'object' && module.exports ? require('./pitch.js') : root.Hayya.pitch;
  const api = factory(P);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.Hayya = root.Hayya || {}).coach = api;
})(typeof self !== 'undefined' ? self : this, function (P) {
  'use strict';

  const STEP = 0.01; // seconds per target sample

  const BANDS = {
    gentle: { label: 'Gentle', cents: 60 },
    normal: { label: 'Normal', cents: 40 },
    precise: { label: 'Precise', cents: 25 },
  };

  function specAt(spec, frac) {
    if (typeof spec === 'number') return spec;
    if (frac <= spec[0][0]) return spec[0][1];
    for (let i = 1; i < spec.length; i++) {
      const [f1, c1] = spec[i];
      if (frac <= f1) {
        const [f0, c0] = spec[i - 1];
        const k = f1 === f0 ? 1 : (frac - f0) / (f1 - f0);
        return c0 + (c1 - c0) * k;
      }
    }
    return spec[spec.length - 1][1];
  }

  function thirds(t0, t1) {
    const d = (t1 - t0) / 3;
    return [
      { name: 'Beginning', t0, t1: t0 + d },
      { name: 'Middle', t0: t0 + d, t1: t0 + 2 * d },
      { name: 'Ending', t0: t0 + 2 * d, t1 },
    ];
  }

  function voicedBounds(cents) {
    let a = -1, b = -1;
    for (let i = 0; i < cents.length; i++) {
      if (!Number.isNaN(cents[i])) {
        if (a < 0) a = i;
        b = i;
      }
    }
    return { first: a * STEP, last: b * STEP };
  }

  /** Target for one phrase at one level. */
  function buildTarget(phrase, levelId, degrees) {
    const specs = levelId === 'steady' ? phrase.syl.map(([s]) => (s === '|' ? null : 0)) : phrase[levelId];
    const dur = phrase.syl.reduce((s, [, d]) => s + d, 0);
    const n = Math.round(dur / STEP) + 1;
    const cents = new Float32Array(n).fill(NaN);
    const syllables = [];
    let t = 0;
    phrase.syl.forEach(([label, d], k) => {
      const spec = specs[k];
      const i0 = Math.round(t / STEP);
      const i1 = Math.round((t + d) / STEP);
      if (label !== '|' && spec != null) {
        for (let i = i0; i < i1 && i < n; i++) cents[i] = specAt(spec, (i - i0) / Math.max(1, i1 - i0));
        syllables.push({ t0: t, t1: t + d, label });
      }
      t += d;
    });
    const vb = voicedBounds(cents);
    return {
      step: STEP,
      dur,
      cents,
      syllables,
      degrees: degrees || [0],
      parts: thirds(vb.first, vb.last),
      firstVoiced: vb.first,
      lastVoiced: vb.last,
    };
  }

  /**
   * Target from a segment of an uploaded reference recording.
   * frames: [{t, hz}] from pitch.extractContour; seg: {t0, t1};
   * refTonicHz: the recording's home note; shift: extra cents.
   */
  function targetFromContour(frames, seg, refTonicHz, shift) {
    const pad = 0.15;
    const t0 = seg.t0 - pad;
    const dur = seg.t1 - seg.t0 + 2 * pad;
    const n = Math.round(dur / STEP) + 1;
    const raw = new Float32Array(n).fill(NaN);
    let j = 0;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * STEP;
      while (j + 1 < frames.length && frames[j + 1].t <= t) j++;
      const a = frames[j], b = frames[j + 1];
      const pick = b && Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a;
      if (pick && pick.hz && Math.abs(pick.t - t) <= 0.03) raw[i] = P.hzToCents(pick.hz, refTonicHz) + (shift || 0);
    }
    // Bridge short dropouts, then median-smooth.
    const filled = bridgeGaps(raw, Math.round(0.12 / STEP));
    const cents = new Float32Array(n).fill(NaN);
    const half = 3;
    for (let i = 0; i < n; i++) {
      if (Number.isNaN(filled[i])) continue;
      const win = [];
      for (let k = i - half; k <= i + half; k++) if (k >= 0 && k < n && !Number.isNaN(filled[k])) win.push(filled[k]);
      cents[i] = P.median(win);
    }
    const vb = voicedBounds(cents);
    return {
      step: STEP,
      dur,
      cents,
      syllables: [],
      degrees: [0],
      parts: thirds(vb.first, vb.last),
      firstVoiced: vb.first,
      lastVoiced: vb.last,
      source: { t0, t1: t0 + dur },
    };
  }

  function bridgeGaps(arr, maxGap) {
    const out = Float32Array.from(arr);
    let last = -1;
    for (let i = 0; i < out.length; i++) {
      if (Number.isNaN(out[i])) continue;
      if (last >= 0 && i - last > 1 && i - last <= maxGap) {
        for (let k = last + 1; k < i; k++) out[k] = out[last] + ((out[i] - out[last]) * (k - last)) / (i - last);
      }
      last = i;
    }
    return out;
  }

  /** Chain several targets with breathing gaps, for a full adhan. */
  function buildSequence(items, gap) {
    gap = gap == null ? 2.5 : gap;
    const total = items.reduce((s, it) => s + it.target.dur, 0) + gap * Math.max(0, items.length - 1);
    const n = Math.round(total / STEP) + 1;
    const cents = new Float32Array(n).fill(NaN);
    const syllables = [];
    const parts = [];
    const breaths = [];
    let t = 0;
    items.forEach((it, idx) => {
      const off = Math.round(t / STEP);
      it.target.cents.forEach((c, i) => {
        if (off + i < n) cents[off + i] = c;
      });
      it.target.syllables.forEach((s) => syllables.push({ t0: s.t0 + t, t1: s.t1 + t, label: s.label }));
      parts.push({ name: it.name, t0: t + it.target.firstVoiced, t1: t + it.target.lastVoiced });
      t += it.target.dur;
      if (idx < items.length - 1) {
        breaths.push(t + gap / 2);
        t += gap;
      }
    });
    const vb = voicedBounds(cents);
    return {
      step: STEP,
      dur: total,
      cents,
      syllables,
      degrees: items[0] ? items[0].target.degrees : [0],
      parts,
      breaths,
      firstVoiced: vb.first,
      lastVoiced: vb.last,
    };
  }

  /** Target pitch (cents) at time t, or NaN in a rest. */
  function targetAt(target, t) {
    const i = Math.round(t / target.step);
    if (i < 0 || i >= target.cents.length) return NaN;
    return target.cents[i];
  }

  /** Direction cue for a folded deviation. */
  function cueFor(dev, tol) {
    if (dev == null || Number.isNaN(dev)) return null;
    if (dev < -tol) return 'higher';
    if (dev > tol) return 'lower';
    return 'hold';
  }

  function mean(a) {
    return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
  }

  function std(a) {
    if (a.length < 2) return 0;
    const m = mean(a);
    return Math.sqrt(mean(a.map((v) => (v - m) * (v - m))));
  }

  /** Runs where the target holds one pitch for at least `minSec`. */
  function heldRuns(target, minSec) {
    const runs = [];
    const c = target.cents;
    let a = -1;
    for (let i = 0; i <= c.length; i++) {
      const same = i < c.length && !Number.isNaN(c[i]) && a >= 0 && Math.abs(c[i] - c[a]) < 1;
      if (same) continue;
      if (a >= 0 && (i - a) * target.step >= minSec) runs.push({ t0: a * target.step, t1: (i - 1) * target.step });
      a = i < c.length && !Number.isNaN(c[i]) ? i : -1;
    }
    return runs;
  }

  /**
   * Compare a take with its target.
   * track: [{t, c}] with c in cents from the home note (null = silent),
   * t aligned to the target's clock.
   */
  function analyzeTake(target, track, options) {
    const tol = (options && options.tol) || BANDS.gentle.cents;
    const pts = track.filter((p) => p.c != null).sort((a, b) => a.t - b.t);
    const samples = [];
    let j = 0;
    for (let i = 0; i < target.cents.length; i++) {
      const tc = target.cents[i];
      if (Number.isNaN(tc)) continue;
      const t = i * target.step;
      while (j + 1 < pts.length && pts[j + 1].t <= t) j++;
      let best = null;
      for (const k of [j, j + 1]) {
        const p = pts[k];
        if (p && Math.abs(p.t - t) <= 0.04 && (!best || Math.abs(p.t - t) < Math.abs(best.t - t))) best = p;
      }
      samples.push({ t, tc, dev: best ? P.foldCents(best.c - tc) : null, c: best ? best.c : null });
    }

    const heardS = samples.filter((s) => s.dev != null);
    const devs = heardS.map((s) => s.dev);
    const within = devs.filter((d) => Math.abs(d) <= tol).length;

    const parts = target.parts.map((part) => {
      const inPart = samples.filter((s) => s.t >= part.t0 && s.t <= part.t1);
      const hd = inPart.filter((s) => s.dev != null).map((s) => s.dev);
      return {
        name: part.name,
        n: inPart.length,
        heard: inPart.length ? hd.length / inPart.length : 0,
        meanDev: mean(hd),
        meanAbs: mean(hd.map(Math.abs)),
        outFrac: hd.length ? hd.filter((d) => Math.abs(d) > tol).length / hd.length : 0,
      };
    });

    const held = heldRuns(target, 0.6).map((run) => {
      const span = run.t1 - run.t0;
      const a = run.t0 + span * 0.2, b = run.t1 - span * 0.2;
      const vals = heardS.filter((s) => s.t >= a && s.t <= b).map((s) => s.dev);
      return { t0: run.t0, t1: run.t1, n: vals.length, std: std(vals) };
    });

    const n = samples.length;
    const tail = samples.slice(Math.floor(n * 0.8));
    const tailHeard = tail.length ? tail.filter((s) => s.dev != null).length / tail.length : 0;
    const heard = n ? heardS.length / n : 0;

    return {
      tol,
      heard,
      inBand: heardS.length ? within / heardS.length : 0,
      meanDev: mean(devs),
      meanAbs: mean(devs.map(Math.abs)),
      parts,
      held,
      wobble: held.some((h) => h.n >= 25 && h.std > 35),
      steadyHold: held.some((h) => h.n >= 30 && h.std < 20),
      fadeOut: heard > 0.5 && tailHeard < 0.45,
      samples,
    };
  }

  /** One thing that went well and one thing to try. */
  function feedback(a, context) {
    const level = (context && context.level) || 'simple';
    const heardParts = a.parts.filter((p) => p.heard > 0.5 && p.n > 0);
    const best = heardParts.slice().sort((x, y) => x.outFrac - y.outFrac || x.meanAbs - y.meanAbs)[0];
    const worst = heardParts.slice().sort((x, y) => y.outFrac - x.outFrac || y.meanAbs - x.meanAbs)[0];
    const drifted = (p) => p && (p.outFrac > 0.25 || p.meanAbs > a.tol);
    const tendency = Math.abs(a.meanDev) > a.tol * 0.6 && a.inBand < 0.8;
    const partWord = (p) => p.name.toLowerCase();

    let well;
    if (a.heard < 0.3) well = 'You started. Every muezzin began with a first, uncertain try.';
    else if (a.inBand >= 0.8) well = 'Alhamdulillah, you stayed close to the pattern for nearly the whole line.';
    else if (a.steadyHold) well = 'You held the long note steadily. That steadiness is what carries an adhan.';
    else if (best && best.outFrac < 0.15) well = `Alhamdulillah, your ${partWord(best)} was steady and close to the pattern.`;
    else if (a.heard >= 0.9) well = 'You kept your voice going through the whole line. That is the breath you need.';
    else well = 'You followed the shape of the line. The shape matters more than any single note.';

    let next;
    if (a.heard < 0.3) {
      next = 'We didn\'t hear much of your voice. Move closer to the mic and sing out. Clear and steady beats quiet and careful.';
    } else if (a.fadeOut) {
      next = 'Your voice ran out near the end. Take a fuller breath before you start, and save some for the last word.';
    } else if (tendency && a.meanDev < 0) {
      next = 'You tended to sit a little under the pattern. Lift the note slightly, as if brightening it rather than pushing.';
    } else if (tendency && a.meanDev > 0) {
      next = 'You tended to sit a little over the pattern. Relax and let the note settle. There is no need to reach.';
    } else if (a.wobble) {
      next = 'The long note wavered. Support it from your belly, keep your jaw loose, and let it ride on the breath.';
    } else if (drifted(worst)) {
      const msg = {
        beginning: 'The start took a moment to find the note. Hum your home note once before you begin.',
        middle: 'The middle, where the melody moves, drifted. Try it slowly with the guide a few times.',
        ending: 'The ending drifted from the pattern. Listen once more to how the line lands, then land with it.',
      }[partWord(worst)];
      next = msg || `The line "${worst.name}" drifted most. Listen to it again, then try just that line.`;
    } else if (level === 'steady') {
      next = 'When this feels easy, try the Simple melody level with the same care for the letters.';
    } else {
      next = 'Try once more with the space set to Dry, so you hear your own voice exactly as it is.';
    }
    return { well, next };
  }

  /** Plain-language summary of a deviation, for the private details view. */
  function describeDev(meanDev, meanAbs, tol) {
    const size = Math.round(meanAbs);
    const dir = Math.abs(meanDev) < tol * 0.4 ? 'centred on the pattern' : meanDev < 0 ? 'mostly under' : 'mostly over';
    return { size, dir };
  }

  /**
   * A believable learner's performance of a target, for the demo voice:
   * a slightly flat entry, a wobble on the longest held note, and a sag
   * as breath runs out at the end.
   */
  function demoContour(target) {
    const c = Float32Array.from(target.cents);
    const runs = heldRuns(target, 0.6).sort((a, b) => b.t1 - b.t0 - (a.t1 - a.t0));
    const wob = runs[0];
    const fv = target.firstVoiced, lv = target.lastVoiced;
    for (let i = 0; i < c.length; i++) {
      if (Number.isNaN(c[i])) continue;
      const t = i * target.step;
      if (t - fv < 0.5) c[i] -= 110 * (1 - (t - fv) / 0.5);
      if (wob && t >= wob.t0 && t <= wob.t1) c[i] += 30 * Math.sin(2 * Math.PI * 3.2 * (t - wob.t0));
      if (lv - t < 1.3) c[i] -= 170 * Math.pow(1 - (lv - t) / 1.3, 1.3);
    }
    return c;
  }

  return {
    STEP,
    BANDS,
    buildTarget,
    targetFromContour,
    buildSequence,
    targetAt,
    cueFor,
    analyzeTake,
    feedback,
    describeDev,
    demoContour,
    heldRuns,
  };
});
