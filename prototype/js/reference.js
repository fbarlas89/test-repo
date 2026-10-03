/*
 * Hayya: recorded adhan.
 *
 * Loads the bundled reference recording (reference/manifest.json plus one
 * clip per line, made by tools/prepare-reference.js), builds each line's
 * ribbon from the melody traced ahead of time, and serves the clips either
 * as recorded or moved to the user's home note.
 */
(function (root, factory) {
  const H = root.Hayya;
  (root.Hayya = root.Hayya || {}).reference = factory(H.pitch, H.coach, H.shift, H.audio);
})(typeof self !== 'undefined' ? self : this, function (P, C, S, A) {
  'use strict';

  /**
   * Cents to move a recording whose home note is `fromHz` so it rests on
   * `toHz`, choosing the nearest octave so the voice changes as little as
   * possible (never more than six semitones).
   */
  function shiftToNote(fromHz, toHz, extraCents) {
    return P.foldCents(P.hzToCents(toHz, fromHz) + (extraCents || 0));
  }

  /** A mono copy of part of a buffer. */
  function slice(engine, buffer, t0, t1) {
    const mono = A.Engine.mono(buffer);
    const a = Math.max(0, Math.round(t0 * buffer.sampleRate));
    const b = Math.min(mono.length, Math.round(t1 * buffer.sampleRate));
    const out = engine.ctx.createBuffer(1, Math.max(1, b - a), buffer.sampleRate);
    out.copyToChannel(mono.subarray(a, b), 0);
    return out;
  }

  /**
   * The buffer moved by `cents`, cached under `key`. `source` is a buffer
   * or a function that makes one, so slicing only happens on a cache miss.
   */
  async function shifted(engine, source, cents, cache, key) {
    const c = Math.round(cents);
    const get = () => (typeof source === 'function' ? source() : source);
    if (Math.abs(c) < 15) return get();
    const k = key + '|' + c;
    if (!cache.has(k)) {
      cache.set(k, (async () => {
        await new Promise((r) => setTimeout(r, 0)); // let progress text paint
        const buf = get();
        const out = S.pitchShift(A.Engine.mono(buf), buf.sampleRate, c);
        const ab = engine.ctx.createBuffer(1, out.length, buf.sampleRate);
        ab.copyToChannel(out, 0);
        return ab;
      })());
    }
    return cache.get(k);
  }

  class RecordedAdhan {
    constructor(engine, manifest, base) {
      this.engine = engine;
      this.m = manifest;
      this.base = base;
      this.clips = new Map();
      this.cache = new Map();
    }

    /** The bundled recording, or null when none has been added. */
    static async load(engine, url) {
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) return null;
        const m = await res.json();
        if (!m || !Array.isArray(m.lines) || !m.lines.length || !m.tonicHz) return null;
        return new RecordedAdhan(engine, m, url.replace(/[^/]*$/, ''));
      } catch (e) {
        return null;
      }
    }

    get tonicHz() {
      return this.m.tonicHz;
    }

    credit() {
      const m = this.m;
      return [m.title, m.credit, m.license].filter(Boolean).join(' · ');
    }

    line(id, rep) {
      return this.m.lines.find((l) => l.id === id && l.rep === (rep || 1)) || this.m.lines.find((l) => l.id === id) || null;
    }

    target(id, rep) {
      const l = this.line(id, rep);
      return l ? C.targetFromCents(l.cents) : null;
    }

    async clip(line) {
      if (!this.clips.has(line.file)) {
        const loading = (async () => {
          const res = await fetch(this.base + line.file);
          if (!res.ok) throw new Error('Missing clip ' + line.file);
          return this.engine.decode(await res.arrayBuffer());
        })();
        loading.catch(() => this.clips.delete(line.file)); // retry on the next Listen
        this.clips.set(line.file, loading);
      }
      return this.clips.get(line.file);
    }

    /** The line's clip, moved by `cents` (0 = as recorded). */
    async clipAt(line, cents) {
      const buf = await this.clip(line);
      return shifted(this.engine, buf, cents, this.cache, line.file);
    }
  }

  return { RecordedAdhan, shiftToNote, slice, shifted };
});
