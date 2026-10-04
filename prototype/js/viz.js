/*
 * Hayya: pitch lane.
 *
 * A canvas that shows the target pattern as a ribbon (with the tolerance
 * band around it) and the user's voice as a trail. The vertical axis is in
 * cents from the user's own home note, labelled with scale degrees rather
 * than Western note names, so microtonal maqam steps read correctly.
 *
 * Two modes: "overview" fits the whole line on screen (at rest, after a
 * take); "scroll" moves the ribbon toward a fixed "now" line while the
 * guide plays or the user sings.
 */
(function (root, factory) {
  const api = factory(root.Hayya.pitch, root.Hayya.coach);
  (root.Hayya = root.Hayya || {}).viz = api;
})(typeof self !== 'undefined' ? self : this, function (P, C) {
  'use strict';

  const TOKENS = ['lane-bg', 'lane-grid', 'lane-grid-faint', 'ribbon', 'ribbon-line', 'good', 'warn', 'guide', 'ink', 'ink-2', 'ink-3'];

  class PitchLane {
    constructor(canvas) {
      this.canvas = canvas;
      this.g = canvas.getContext('2d');
      this.target = null;
      this.tol = 60;
      this.degrees = [{ c: 0, label: '1' }];
      this.mode = 'overview';
      this.track = [];
      this.state = {};
      this.past = 2.2;
      this.future = 4.8;
      this.readColors();
      const ro = new ResizeObserver(() => this.resize());
      ro.observe(canvas);
      this.resize();
    }

    readColors() {
      const cs = getComputedStyle(this.canvas);
      this.col = {};
      for (const t of TOKENS) this.col[t] = cs.getPropertyValue('--' + t).trim() || '#888';
      this.fontBody = cs.getPropertyValue('--font-body').trim() || 'system-ui, sans-serif';
    }

    resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      if (!w || !h) return;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.W = w;
      this.H = h;
      this.draw();
    }

    setTarget(target, tol, degrees) {
      this.target = target;
      this.tol = tol;
      this.degrees = degrees || [{ c: 0, label: '1' }];
      let lo = Infinity, hi = -Infinity;
      if (target) for (const c of target.cents) if (!Number.isNaN(c)) { lo = Math.min(lo, c); hi = Math.max(hi, c); }
      if (!Number.isFinite(lo)) { lo = 0; hi = 0; }
      this.lo = Math.min(-250, lo - 220);
      this.hi = Math.max(550, hi + 220);
      this.track = [];
      this.state = {};
      this.draw();
    }

    setTrack(track) {
      this.track = track || [];
    }

    /** state: { now, live, cue, guide, countdown, label } */
    setState(state) {
      this.state = state || {};
    }

    y(c) {
      const top = 14, bottom = 26;
      return top + ((this.hi - c) / (this.hi - this.lo)) * (this.H - top - bottom);
    }

    /** Horizontal mapping for the current mode. */
    xMap() {
      const left = 38, right = 14;
      if (this.mode === 'scroll') {
        const nowX = left + (this.W - left - right) * 0.3;
        const pps = (this.W - right - nowX) / this.future;
        const now = this.state.now || 0;
        return { x: (t) => nowX + (t - now) * pps, t0: now - (nowX - left) / pps, t1: now + this.future, nowX, left, right };
      }
      const dur = this.target ? this.target.dur : 5;
      const span = this.W - left - right;
      return { x: (t) => left + (t / dur) * span, t0: 0, t1: dur, nowX: null, left, right };
    }

    /** Where to draw a sung pitch: next to the target, octave-forgiving. */
    displayC(t, c) {
      const tc = this.target ? C.targetAt(this.target, t) : NaN;
      if (!Number.isNaN(tc)) return tc + P.foldCents(c - tc);
      let v = c;
      while (v > this.hi) v -= 1200;
      while (v < this.lo) v += 1200;
      return v;
    }

    inBand(t, c) {
      const tc = this.target ? C.targetAt(this.target, t) : NaN;
      if (Number.isNaN(tc)) return null;
      return Math.abs(P.foldCents(c - tc)) <= this.tol;
    }

    draw() {
      const g = this.g, col = this.col;
      if (!this.W) return;
      const m = this.xMap();
      g.clearRect(0, 0, this.W, this.H);
      g.fillStyle = col['lane-bg'];
      g.fillRect(0, 0, this.W, this.H);

      // Faint semitone grid, then the level's scale degrees.
      g.lineWidth = 1;
      g.strokeStyle = col['lane-grid-faint'];
      for (let c = Math.ceil(this.lo / 100) * 100; c <= this.hi; c += 100) {
        g.beginPath();
        g.moveTo(m.left, this.y(c) + 0.5);
        g.lineTo(this.W - m.right, this.y(c) + 0.5);
        g.stroke();
      }
      g.font = `600 11px ${this.fontBody}`;
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      for (const d of this.degrees) {
        const yy = Math.round(this.y(d.c)) + 0.5;
        g.strokeStyle = col['lane-grid'];
        g.setLineDash(d.c === 0 ? [] : [3, 4]);
        g.beginPath();
        g.moveTo(m.left, yy);
        g.lineTo(this.W - m.right, yy);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = d.c === 0 ? col['ink-2'] : col['ink-3'];
        g.fillText(d.label, m.left - 8, yy);
      }

      if (this.target) this.drawTarget(m);
      this.drawTrack(m);

      // The "now" line, the guide marker and the live voice.
      if (m.nowX != null) {
        g.strokeStyle = col['ink-3'];
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(m.nowX, 8);
        g.lineTo(m.nowX, this.H - 20);
        g.stroke();
        const now = this.state.now || 0;
        if (this.state.guide && this.target) {
          const tc = C.targetAt(this.target, now);
          if (!Number.isNaN(tc)) this.dot(m.nowX, this.y(tc), 6, col['guide'], true);
        }
        if (this.state.live != null) {
          const c = this.displayC(now, this.state.live);
          const ok = this.inBand(now, this.state.live);
          const color = ok === false ? col['warn'] : col['good'];
          this.dot(m.nowX, this.y(c), 8, color, false);
          if (this.state.cue === 'higher' || this.state.cue === 'lower') this.arrow(m.nowX + 20, this.y(c), this.state.cue, color);
        }
      }

      if (this.state.countdown != null) {
        g.fillStyle = col['ink'];
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `700 44px ${this.fontBody}`;
        g.fillText(String(this.state.countdown), this.W / 2, this.H / 2 - 12);
        g.font = `400 15px ${this.fontBody}`;
        g.fillStyle = col['ink-2'];
        g.fillText('Breathe in', this.W / 2, this.H / 2 + 24);
      }
    }

    drawTarget(m) {
      const g = this.g, col = this.col, t = this.target;
      const i0 = Math.max(0, Math.floor(m.t0 / t.step));
      const i1 = Math.min(t.cents.length - 1, Math.ceil(m.t1 / t.step));
      const bandPx = Math.abs(this.y(0) - this.y(this.tol));

      // Breathing markers between lines of a full adhan.
      if (t.breaths) {
        g.strokeStyle = col['ink-3'];
        g.setLineDash([2, 4]);
        g.font = `400 11px ${this.fontBody}`;
        g.textAlign = 'center';
        g.fillStyle = col['ink-3'];
        for (const b of t.breaths) {
          if (b < m.t0 || b > m.t1) continue;
          const x = m.x(b);
          g.beginPath();
          g.moveTo(x, 12);
          g.lineTo(x, this.H - 24);
          g.stroke();
          if (this.mode === 'scroll') g.fillText('breathe', x, this.H - 12);
        }
        g.setLineDash([]);
      }

      // Ribbon: one filled band and a centre line per voiced run.
      let run = [];
      const flush = () => {
        if (run.length < 2) { run = []; return; }
        g.beginPath();
        run.forEach(([x, c], k) => (k ? g.lineTo(x, this.y(c + this.tol)) : g.moveTo(x, this.y(c + this.tol))));
        for (let k = run.length - 1; k >= 0; k--) g.lineTo(run[k][0], this.y(run[k][1] - this.tol));
        g.closePath();
        g.fillStyle = col['ribbon'];
        g.fill();
        g.beginPath();
        run.forEach(([x, c], k) => (k ? g.lineTo(x, this.y(c)) : g.moveTo(x, this.y(c))));
        g.strokeStyle = col['ribbon-line'];
        g.lineWidth = 2;
        g.lineJoin = 'round';
        g.stroke();
        run = [];
      };
      const stride = this.mode === 'overview' ? Math.max(1, Math.floor((i1 - i0) / (this.W * 1.5))) : 1;
      for (let i = i0; i <= i1; i += stride) {
        const c = t.cents[i];
        if (Number.isNaN(c)) flush();
        else run.push([m.x(i * t.step), c]);
      }
      flush();

      // Syllables above the ribbon, when there is room.
      g.font = `600 12px ${this.fontBody}`;
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      g.fillStyle = col['ink-2'];
      let lastRight = -Infinity;
      for (const s of t.syllables) {
        if (s.t1 < m.t0 || s.t0 > m.t1) continue;
        const x0 = m.x(s.t0), x1 = m.x(s.t1);
        const w = g.measureText(s.label).width;
        const cx = Math.max(x0 + w / 2, Math.min((x0 + x1) / 2, x0 + 30));
        if (cx - w / 2 < lastRight + 4 || x1 - x0 < 6) continue;
        let top = -Infinity;
        for (let tt = s.t0; tt < s.t1 - 0.005; tt += 0.05) {
          const v = C.targetAt(t, tt);
          if (!Number.isNaN(v)) top = Math.max(top, v);
        }
        if (!Number.isFinite(top)) continue;
        g.fillText(s.label, cx, this.y(top) - bandPx - 6);
        lastRight = cx + w / 2;
      }
    }

    drawTrack(m) {
      const g = this.g, col = this.col;
      if (!this.track.length) return;
      g.lineWidth = 3;
      g.lineCap = 'round';
      let prev = null;
      for (const p of this.track) {
        if (p.c == null || p.t < m.t0 - 0.1 || p.t > m.t1) { prev = null; continue; }
        if (m.nowX != null && p.t > (this.state.now || 0)) break;
        const c = this.displayC(p.t, p.c);
        const x = m.x(p.t), yy = this.y(c);
        if (prev && p.t - prev.t < 0.06 && Math.abs(c - prev.dc) < 250) {
          const ok = this.inBand(p.t, p.c);
          g.strokeStyle = ok === false ? col['warn'] : ok ? col['good'] : col['ink-3'];
          g.beginPath();
          g.moveTo(prev.x, prev.y);
          g.lineTo(x, yy);
          g.stroke();
        }
        prev = { t: p.t, x, y: yy, dc: c };
      }
    }

    dot(x, y, r, color, hollow) {
      const g = this.g;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      if (hollow) {
        g.lineWidth = 2.5;
        g.strokeStyle = color;
        g.fillStyle = this.col['lane-bg'];
        g.fill();
        g.stroke();
      } else {
        g.fillStyle = color;
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = this.col['lane-bg'];
        g.stroke();
      }
    }

    arrow(x, y, dir, color) {
      const g = this.g, up = dir === 'higher', s = up ? -1 : 1;
      const tip = y + s * 22, base = y + s * 12;
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(x, tip);
      g.lineTo(x - 7, base);
      g.lineTo(x + 7, base);
      g.closePath();
      g.fill();
      g.fillRect(x - 2, up ? base : y + 4, 4, 8);
    }
  }

  return { PitchLane };
});
