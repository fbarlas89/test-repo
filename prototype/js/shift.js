/*
 * Hayya: pitch shifter.
 *
 * Moves a real recording to the user's home note without changing its
 * timing: stretch the audio in time with WSOLA (overlap-add of windowed
 * grains, each spliced where it best matches the previous one), then
 * resample back to the original length. The net effect is a pitch change
 * with the duration unchanged.
 *
 * Formants move with the pitch, so large shifts (beyond about six
 * semitones) start to change the character of the voice.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.Hayya = root.Hayya || {}).shift = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function hann(n) {
    const w = new Float32Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
    return w;
  }

  /**
   * WSOLA time stretch. Output is about `factor` times as long as input,
   * at the same pitch.
   */
  function timeStretch(input, factor, sampleRate) {
    if (Math.abs(factor - 1) < 1e-4) return Float32Array.from(input);
    // Whole-sample sizes matter: a fractional typed-array index is silently
    // dropped by JavaScript.
    const Hs = Math.round(0.01 * sampleRate); // 10 ms synthesis hop
    const N = 4 * Hs; // 40 ms grains
    const Ha = Hs / factor; // analysis hop
    const tol = Math.round(0.01 * sampleRate); // ±10 ms splice search
    const stride = Math.max(1, Math.round(sampleRate / 11025)); // correlate on a decimated grid
    const win = hann(N);
    const outLen = Math.round(input.length * factor);
    const out = new Float32Array(outLen + N);
    const norm = new Float32Array(outLen + N);

    let prev = 0;
    for (let k = 0; ; k++) {
      const outPos = k * Hs;
      if (outPos >= outLen) break;
      const nominal = Math.round(k * Ha);
      let pos = Math.min(nominal, Math.max(0, input.length - N));
      if (k > 0) {
        // The previous grain's natural continuation is what this grain
        // should look like; pick the nearby offset that matches it best.
        const target = prev + Hs;
        let best = -Infinity, bestPos = pos;
        const lo = Math.max(0, nominal - tol), hi = Math.min(input.length - N, nominal + tol);
        for (let p = lo; p <= hi; p++) {
          let s = 0;
          for (let i = 0; i < N; i += stride) s += input[p + i] * input[target + i < input.length ? target + i : input.length - 1];
          if (s > best) {
            best = s;
            bestPos = p;
          }
        }
        pos = bestPos;
      }
      for (let i = 0; i < N && pos + i < input.length; i++) {
        out[outPos + i] += input[pos + i] * win[i];
        norm[outPos + i] += win[i];
      }
      prev = pos;
    }
    const res = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) res[i] = norm[i] > 1e-3 ? out[i] / norm[i] : 0;
    return res;
  }

  /** Linear-interpolation resampler: reads the input `rate` times faster. */
  function resample(input, rate, length) {
    const n = length != null ? length : Math.floor(input.length / rate);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i * rate;
      const j = Math.floor(x);
      const f = x - j;
      const a = input[j] || 0, b = input[j + 1] || 0;
      out[i] = a + (b - a) * f;
    }
    return out;
  }

  /** Shift pitch by `cents`, keeping the duration. */
  function pitchShift(samples, sampleRate, cents) {
    if (Math.abs(cents) < 1) return Float32Array.from(samples);
    const ratio = Math.pow(2, cents / 1200);
    const stretched = timeStretch(samples, ratio, sampleRate);
    return resample(stretched, ratio, samples.length);
  }

  return { timeStretch, resample, pitchShift };
});
