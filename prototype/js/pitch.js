/*
 * Hayya: pitch engine.
 *
 * YIN fundamental-frequency detection tuned for adult male voices,
 * plus the helpers the coach needs: cents maths, smoothing, offline
 * contour extraction for uploaded recordings, and phrase segmentation.
 *
 * Works as a classic browser script (window.Hayya.pitch) and as a
 * CommonJS module for the Node test suite.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.Hayya = root.Hayya || {}).pitch = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULTS = {
    minFreq: 70,      // lowest note of a bass voice
    maxFreq: 600,     // well above the top of a tenor's adhan
    threshold: 0.15,  // YIN absolute threshold
    fallbackMax: 0.3, // accept a weaker dip only below this
    minRms: 0.01,     // silence gate
  };

  /** Cents from ref to f. */
  function hzToCents(f, ref) {
    return 1200 * Math.log2(f / ref);
  }

  /** Frequency that sits `c` cents above ref. */
  function centsToHz(c, ref) {
    return ref * Math.pow(2, c / 1200);
  }

  /**
   * Fold an interval into [-600, 600). A user singing the right shape an
   * octave away from the target is treated as on the pattern.
   */
  function foldCents(d) {
    return ((((d + 600) % 1200) + 1200) % 1200) - 600;
  }

  function rmsOf(buf) {
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return Math.sqrt(s / buf.length);
  }

  /** Box-filter decimation. Crude, but plenty for f0 below 600 Hz. */
  function downsample(buf, factor) {
    if (factor <= 1) return buf;
    const n = Math.floor(buf.length / factor);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      const o = i * factor;
      for (let k = 0; k < factor; k++) s += buf[o + k];
      out[i] = s / factor;
    }
    return out;
  }

  /** Decimation factor that brings a sample rate down to about 16 kHz. */
  function factorFor(sampleRate) {
    return Math.max(1, Math.round(sampleRate / 16000));
  }

  /**
   * YIN pitch detection on one frame.
   * Returns { freq, clarity, rms } with freq null when unvoiced.
   */
  function detectPitch(buf, sampleRate, options) {
    const o = Object.assign({}, DEFAULTS, options);
    const rms = rmsOf(buf);
    if (rms < o.minRms) return { freq: null, clarity: 0, rms };

    const maxTau = Math.min(Math.floor(sampleRate / o.minFreq), Math.floor(buf.length / 2));
    const minTau = Math.max(2, Math.floor(sampleRate / o.maxFreq));
    const W = buf.length - maxTau;
    if (W <= 0 || minTau >= maxTau) return { freq: null, clarity: 0, rms };

    // Difference function.
    const d = new Float32Array(maxTau + 1);
    for (let tau = 1; tau <= maxTau; tau++) {
      let s = 0;
      for (let j = 0; j < W; j++) {
        const x = buf[j] - buf[j + tau];
        s += x * x;
      }
      d[tau] = s;
    }

    // Cumulative mean normalised difference.
    d[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= maxTau; tau++) {
      running += d[tau];
      d[tau] = running > 0 ? (d[tau] * tau) / running : 1;
    }

    // First dip under the threshold, walked down to its local minimum.
    let tau = -1;
    for (let t = minTau; t <= maxTau; t++) {
      if (d[t] < o.threshold) {
        while (t + 1 <= maxTau && d[t + 1] < d[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau === -1) {
      let best = minTau;
      for (let t = minTau + 1; t <= maxTau; t++) if (d[t] < d[best]) best = t;
      if (d[best] > o.fallbackMax) return { freq: null, clarity: 1 - d[best], rms };
      tau = best;
    }

    // Parabolic interpolation around the chosen lag.
    let refined = tau;
    if (tau > 1 && tau < maxTau) {
      const s0 = d[tau - 1], s1 = d[tau], s2 = d[tau + 1];
      const denom = s0 + s2 - 2 * s1;
      if (denom !== 0) refined = tau + (s0 - s2) / (2 * denom);
    }
    return { freq: sampleRate / refined, clarity: 1 - d[tau], rms };
  }

  /**
   * Detect pitch on a full-rate frame, decimating to about 16 kHz first.
   * Used by the live microphone loop.
   */
  function detectFrame(buf, sampleRate, options) {
    const f = factorFor(sampleRate);
    const r = detectPitch(downsample(buf, f), sampleRate / f, options);
    r.rms = rmsOf(buf);
    return r;
  }

  /** Running median over the last few voiced values. Gaps reset it. */
  class Smoother {
    constructor(size) {
      this.size = size || 5;
      this.values = [];
      this.gap = 0;
    }
    push(v) {
      if (v == null) {
        if (++this.gap > 3) this.values = [];
        return null;
      }
      this.gap = 0;
      this.values.push(v);
      if (this.values.length > this.size) this.values.shift();
      const sorted = this.values.slice().sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    }
    reset() {
      this.values = [];
      this.gap = 0;
    }
  }

  function median(arr) {
    if (!arr.length) return null;
    const s = arr.slice().sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function percentile(arr, p) {
    if (!arr.length) return null;
    const s = arr.slice().sort((a, b) => a - b);
    const i = Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))));
    return s[i];
  }

  /**
   * Pitch contour of a whole recording.
   * Returns [{ t, hz, rms }] every `hop` seconds (hz null when unvoiced).
   * Yields to the event loop every few hundred frames so the page stays
   * responsive, and reports progress in [0, 1].
   */
  async function extractContour(samples, sampleRate, options) {
    const o = Object.assign({ hop: 0.01, windowSec: 0.05, onProgress: null }, options);
    const f = factorFor(sampleRate);
    const data = downsample(samples, f);
    const rate = sampleRate / f;
    const win = Math.round(o.windowSec * rate);
    const hop = Math.max(1, Math.round(o.hop * rate));
    const frames = [];
    const total = Math.max(1, Math.floor((data.length - win) / hop));
    const smoother = new Smoother(5);
    for (let i = 0, n = 0; i + win <= data.length; i += hop, n++) {
      const frame = data.subarray(i, i + win);
      const r = detectPitch(frame, rate, o);
      const hz = r.freq == null ? null : smoother.push(r.freq);
      frames.push({ t: (i + win / 2) / rate, hz, rms: r.rms });
      if (n % 300 === 299) {
        if (o.onProgress) o.onProgress(n / total);
        await new Promise((res) => setTimeout(res, 0));
      }
    }
    // Drop voiced frames that are much quieter than the performance:
    // reverb tails and room noise.
    const loud = frames.filter((fr) => fr.hz != null).map((fr) => fr.rms);
    const gate = (percentile(loud, 90) || 0) * 0.12;
    for (const fr of frames) if (fr.hz != null && fr.rms < gate) fr.hz = null;
    if (o.onProgress) o.onProgress(1);
    return frames;
  }

  /**
   * Split a contour into phrases at silences.
   * Returns [{ t0, t1 }] in seconds.
   */
  function segmentPhrases(frames, options) {
    const o = Object.assign({ minGap: 0.45, minLen: 0.8 }, options);
    const segs = [];
    let start = null;
    let lastVoiced = null;
    for (const fr of frames) {
      if (fr.hz != null) {
        if (start == null) start = fr.t;
        else if (fr.t - lastVoiced > o.minGap) {
          segs.push({ t0: start, t1: lastVoiced });
          start = fr.t;
        }
        lastVoiced = fr.t;
      }
    }
    if (start != null) segs.push({ t0: start, t1: lastVoiced });
    return segs.filter((s) => s.t1 - s.t0 >= o.minLen);
  }

  /**
   * Estimate the "home" note of a recording: the lowest note the melody
   * keeps returning to, which is where maqam phrases come to rest. In
   * practice, the lowest 75-cent region holding at least 4% of the
   * singing, so passing low notes and glides don't count.
   */
  function estimateTonic(frames) {
    const ref = 100;
    const cents = frames.filter((f) => f.hz != null).map((f) => hzToCents(f.hz, ref));
    if (!cents.length) return null;
    const bins = new Map();
    for (const c of cents) {
      const b = Math.round(c / 25);
      bins.set(b, (bins.get(b) || 0) + 1);
    }
    const need = cents.length * 0.04;
    const keys = [...bins.keys()].sort((a, b) => a - b);
    for (const k of keys) {
      const mass = (bins.get(k - 1) || 0) + bins.get(k) + (bins.get(k + 1) || 0);
      if (mass >= need) {
        const near = cents.filter((c) => Math.abs(c / 25 - k) <= 1.5);
        return centsToHz(median(near), ref);
      }
    }
    return centsToHz(median(cents), ref);
  }

  return {
    DEFAULTS,
    hzToCents,
    centsToHz,
    foldCents,
    rmsOf,
    downsample,
    factorFor,
    detectPitch,
    detectFrame,
    Smoother,
    median,
    percentile,
    extractContour,
    segmentPhrases,
    estimateTonic,
  };
});
