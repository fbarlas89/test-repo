/*
 * Hayya: audio engine.
 *
 * One Web Audio graph for everything the user hears:
 *
 *   sources ─▶ bus ─┬─▶ dry ───────────────────────────┐
 *                   ├─▶ convolver (room) ─▶ wet ───────┤─▶ limiter ─▶ out
 *                   └─▶ echo send ─▶ delay ⟲ feedback ─┘
 *
 * Sources are the guide voice, replays, and (when the user turns on live
 * monitoring with headphones) the microphone. Pitch analysis always reads
 * the microphone before any effect, so reverb never hides a wrong note.
 */
(function (root, factory) {
  const api = factory(root.Hayya.pitch);
  (root.Hayya = root.Hayya || {}).audio = api;
})(typeof self !== 'undefined' ? self : this, function (P) {
  'use strict';

  // Spaces are named after rooms people pray in, never after a muezzin.
  const SPACES = {
    dry: { label: 'Dry', about: 'Your voice exactly as it is.', decay: 0.4, wet: 0, echo: 0, echoTime: 0.15, repeats: 0 },
    home: { label: 'Home', about: 'A small, furnished room.', decay: 0.6, wet: 0.14, echo: 0, echoTime: 0.12, repeats: 0.1 },
    musalla: { label: 'Musallā', about: 'A carpeted prayer room.', decay: 1.3, wet: 0.24, echo: 0.05, echoTime: 0.14, repeats: 0.15 },
    masjid: { label: 'Masjid', about: 'A community masjid hall.', decay: 2.6, wet: 0.34, echo: 0.1, echoTime: 0.19, repeats: 0.25 },
    dome: { label: 'Grand dome', about: 'A large domed prayer hall with a long tail.', decay: 4.8, wet: 0.44, echo: 0.16, echoTime: 0.28, repeats: 0.35 },
  };

  function impulse(ctx, decay) {
    const rate = ctx.sampleRate;
    const pre = Math.floor(rate * 0.015);
    const len = Math.max(1, Math.floor(rate * decay));
    const ir = ctx.createBuffer(2, pre + len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let seed = 1234 + ch * 777;
      let lp = 0;
      for (let i = 0; i < len; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const noise = (seed / 4294967296) * 2 - 1;
        const t = i / rate;
        // Walls absorb the highs first: the tail darkens as it decays.
        const k = 0.85 - 0.75 * (i / len);
        lp += k * (noise - lp);
        d[pre + i] = lp * Math.exp((-6.9 * t) / decay);
      }
      // A few early reflections off nearby walls.
      [0.011, 0.019, 0.027, 0.041].forEach((s, n) => {
        const idx = pre + Math.floor(s * rate * (1 + ch * 0.07));
        if (idx < d.length) d[idx] += 0.5 / (n + 1);
      });
    }
    return ir;
  }

  /** Fill rests with the nearest voiced value so glides don't jump. */
  function holdCurve(cents) {
    const out = new Float32Array(cents.length);
    let last = NaN;
    for (let i = 0; i < cents.length; i++) {
      if (!Number.isNaN(cents[i])) last = cents[i];
      out[i] = last;
    }
    let next = NaN;
    for (let i = out.length - 1; i >= 0; i--) {
      if (!Number.isNaN(out[i])) next = out[i];
      else out[i] = Number.isNaN(next) ? 0 : next;
    }
    return out;
  }

  function envelope(cents, step) {
    const env = new Float32Array(cents.length);
    const k = 1 - Math.exp(-step / 0.035);
    let v = 0;
    for (let i = 0; i < cents.length; i++) {
      v += k * ((Number.isNaN(cents[i]) ? 0 : 1) - v);
      env[i] = v;
    }
    return env;
  }

  /**
   * A soft sung "aa" that follows a contour: sawtooth through vowel
   * formants, with gentle vibrato. Works on live and offline contexts.
   */
  function voice(ctx, dest, tonicHz, cents, step, when, opts) {
    const o = Object.assign({ level: 0.32, vibrato: 11, breath: 0 }, opts);
    // A silent tail lets the last note release instead of clicking off.
    const padded = new Float32Array(cents.length + Math.round(0.2 / step)).fill(NaN);
    padded.set(cents);
    cents = padded;
    const dur = Math.max(step * 2, cents.length * step);
    const curve = holdCurve(cents);
    const env = envelope(cents, step);
    for (let i = 0; i < env.length; i++) env[i] *= o.level;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = tonicHz;
    osc.detune.setValueCurveAtTime(curve, when, dur);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = o.vibrato;
    lfo.connect(lfoGain).connect(osc.detune);

    const amp = ctx.createGain();
    amp.gain.value = 0;
    amp.gain.setValueCurveAtTime(env, when, dur);

    const body = ctx.createBiquadFilter();
    body.type = 'lowpass';
    body.frequency.value = 1600;
    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    osc.connect(body).connect(mix);
    // Formants of an open "aa" for an adult male voice.
    [[730, 6, 1.3], [1090, 8, 0.9], [2440, 10, 0.4]].forEach(([f, q, gn]) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gn;
      osc.connect(bp).connect(g).connect(mix);
    });
    mix.connect(amp).connect(dest);

    if (o.breath > 0) {
      const n = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let seed = 99;
      for (let i = 0; i < n; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        d[i] = ((seed / 4294967296) * 2 - 1) * o.breath;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2500;
      src.connect(hp).connect(amp);
      src.start(when);
    }

    osc.start(when);
    lfo.start(when);
    osc.stop(when + dur + 0.05);
    lfo.stop(when + dur + 0.05);
    return { stop: () => { try { amp.gain.cancelScheduledValues(0); amp.gain.value = 0; osc.stop(); lfo.stop(); } catch (e) { /* already stopped */ } } };
  }

  class Engine {
    constructor() {
      this.ctx = null;
      this.stream = null;
      this.space = Object.assign({}, SPACES.masjid);
      this.irCache = new Map();
      this.active = [];
    }

    async ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC({ latencyHint: 'interactive' });
        this.build();
      }
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return this.ctx;
    }

    build() {
      const c = this.ctx;
      this.bus = c.createGain();
      this.dry = c.createGain();
      this.convolver = c.createConvolver();
      this.wet = c.createGain();
      this.echoSend = c.createGain();
      this.delay = c.createDelay(1.5);
      this.echoTone = c.createBiquadFilter();
      this.echoTone.type = 'lowpass';
      this.echoTone.frequency.value = 3200;
      this.feedback = c.createGain();
      this.limiter = c.createDynamicsCompressor();
      this.limiter.threshold.value = -6;
      this.limiter.ratio.value = 8;

      this.bus.connect(this.dry).connect(this.limiter);
      this.bus.connect(this.convolver).connect(this.wet).connect(this.limiter);
      this.bus.connect(this.echoSend).connect(this.delay).connect(this.echoTone);
      this.echoTone.connect(this.feedback).connect(this.delay);
      this.echoTone.connect(this.limiter);
      this.limiter.connect(c.destination);
      this.setSpace(this.space);
    }

    setSpace(params) {
      this.space = Object.assign({}, this.space, params);
      if (!this.ctx) return;
      const s = this.space, now = this.ctx.currentTime;
      const key = s.decay.toFixed(2);
      if (!this.irCache.has(key)) this.irCache.set(key, impulse(this.ctx, s.decay));
      if (this.convolver.buffer !== this.irCache.get(key)) this.convolver.buffer = this.irCache.get(key);
      this.wet.gain.setTargetAtTime(s.wet, now, 0.05);
      this.dry.gain.setTargetAtTime(1 - s.wet * 0.35, now, 0.05);
      this.echoSend.gain.setTargetAtTime(s.echo, now, 0.05);
      this.delay.delayTime.setTargetAtTime(s.echoTime, now, 0.05);
      this.feedback.gain.setTargetAtTime(Math.min(0.7, s.repeats), now, 0.05);
    }

    /** Route a source either through the space or straight out. */
    target(throughSpace) {
      return throughSpace === false ? this.limiter : this.bus;
    }

    latencyMs() {
      if (!this.ctx) return null;
      return Math.round(((this.ctx.baseLatency || 0) + (this.ctx.outputLatency || 0)) * 1000);
    }

    static micPossible() {
      try {
        if (document.featurePolicy && !document.featurePolicy.allowsFeature('microphone')) return false;
      } catch (e) { /* not supported */ }
      return !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }

    async startMic() {
      await this.ensure();
      if (this.stream) return;
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      this.micSrc = this.ctx.createMediaStreamSource(this.stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.frame = new Float32Array(this.analyser.fftSize);
      this.micSrc.connect(this.analyser);
      this.monitor = this.ctx.createGain();
      this.monitor.gain.value = 0;
      this.micSrc.connect(this.monitor).connect(this.bus);
    }

    setMonitoring(on) {
      if (this.monitor) this.monitor.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.02);
    }

    /** Pitch of the dry microphone signal right now. */
    readMic() {
      this.analyser.getFloatTimeDomainData(this.frame);
      return P.detectFrame(this.frame, this.ctx.sampleRate);
    }

    startRecording() {
      if (!window.MediaRecorder) return null;
      const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      const mimeType = types.find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
      const chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const done = new Promise((resolve) => {
        rec.onstop = async () => {
          try {
            const blob = new Blob(chunks, { type: rec.mimeType });
            resolve(await this.decode(await blob.arrayBuffer()));
          } catch (e) {
            resolve(null);
          }
        };
      });
      rec.start();
      return { stop: () => { if (rec.state !== 'inactive') rec.stop(); return done; } };
    }

    async decode(arrayBuffer) {
      await this.ensure();
      return await this.ctx.decodeAudioData(arrayBuffer);
    }

    static mono(buffer) {
      if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
      const out = new Float32Array(buffer.length);
      for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        const d = buffer.getChannelData(ch);
        for (let i = 0; i < d.length; i++) out[i] += d[i] / buffer.numberOfChannels;
      }
      return out;
    }

    /** Play the guide voice for a target, starting at context time `when`. */
    guide(target, tonicHz, when) {
      const v = voice(this.ctx, this.bus, tonicHz, target.cents, target.step, when, { level: 0.3 });
      this.active.push(v);
      return v;
    }

    /** A plain held tone on a note, for hearing the home note. */
    tone(hz, seconds) {
      const n = Math.round(seconds / 0.01);
      const cents = new Float32Array(n).fill(0);
      const v = voice(this.ctx, this.bus, hz, cents, 0.01, this.ctx.currentTime + 0.05, { level: 0.3, vibrato: 4 });
      this.active.push(v);
      return v;
    }

    play(buffer, opts) {
      const o = Object.assign({ offset: 0, duration: undefined, when: this.ctx.currentTime + 0.05, throughSpace: true }, opts);
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(this.target(o.throughSpace));
      src.start(o.when, Math.max(0, o.offset), o.duration);
      const handle = { stop: () => { try { src.stop(); } catch (e) { /* done */ } }, when: o.when };
      this.active.push(handle);
      return handle;
    }

    stopAll() {
      this.active.forEach((h) => h.stop());
      this.active = [];
    }

    /**
     * Render a synthetic learner singing a contour (the demo voice).
     * Returns an AudioBuffer.
     */
    async renderVoice(cents, step, tonicHz) {
      await this.ensure();
      const rate = 44100;
      const dur = cents.length * step + 0.3;
      const off = new OfflineAudioContext(1, Math.ceil(rate * dur), rate);
      voice(off, off.destination, tonicHz, cents, step, 0, { level: 0.45, vibrato: 9, breath: 0.004 });
      return await off.startRendering();
    }
  }

  return { SPACES, Engine, impulse };
});
