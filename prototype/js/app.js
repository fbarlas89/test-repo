/*
 * Hayya: app flow.
 *
 * Intention → home note → practice (listen, sing, reflect) → close.
 * All state is in memory; small preferences are remembered on this device
 * only. Recorded takes are never stored or uploaded.
 */
(function () {
  'use strict';
  const { pitch: P, coach: C, content: K, audio: A, viz: V } = window.Hayya;
  const $ = (id) => document.getElementById(id);
  const BASE_HZ = 130.81; // C3, the default home note

  // ---------- Preferences (this device only) ----------
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('hayya.' + key);
        return v == null ? fallback : JSON.parse(v);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem('hayya.' + key, JSON.stringify(value));
      } catch (e) {
        /* storage unavailable: preferences just won't persist */
      }
    },
  };

  const state = {
    tonic: store.get('tonic', BASE_HZ),
    fajr: store.get('fajr', false),
    level: store.get('level', 'simple'),
    band: store.get('band', 'gentle'),
    spaceId: store.get('space', 'masjid'),
    comfy: new Set(store.get('comfy', [])),
    headphones: store.get('headphones', false),
    monitor: false,
    reminder: store.get('reminder', -1),
    phraseId: 'takbir-open',
    full: false,
    micState: A.Engine.micPossible() ? 'unknown' : 'blocked',
    target: null,
    take: null,
    ref: null,
    run: null,
  };
  if (state.level === 'ref') state.level = 'simple';

  const engine = new A.Engine();
  engine.space = Object.assign({}, A.SPACES[state.spaceId] || A.SPACES.masjid);
  const lane = new V.PitchLane($('lane'));

  const tol = () => C.BANDS[state.band].cents;

  // ---------- Screens ----------
  const SCREENS = ['intention', 'note', 'practice', 'close'];
  function show(name) {
    stopRun();
    SCREENS.forEach((s) => ($('screen-' + s).hidden = s !== name));
    document.querySelectorAll('.steps button').forEach((b) => b.setAttribute('aria-current', b.dataset.step === name ? 'step' : 'false'));
    if (name === 'practice') {
      lane.readColors();
      lane.resize();
      refreshTarget();
    }
    if (name === 'close') renderClose();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.steps button').forEach((b) => b.addEventListener('click', () => show(b.dataset.step)));

  // ---------- 1. Intention ----------
  function showReminder(advance) {
    if (advance || state.reminder < 0) state.reminder = (state.reminder + 1) % K.REMINDERS.length;
    const r = K.REMINDERS[state.reminder];
    $('reminder-text').textContent = r.text;
    $('reminder-source').textContent = r.source;
    $('reminder-note').textContent = r.note || '';
    $('reminder-note').hidden = !r.note;
    store.set('reminder', state.reminder);
  }
  $('next-reminder').addEventListener('click', () => showReminder(true));
  $('begin').addEventListener('click', () => show('note'));

  // ---------- 2. Home note ----------
  function setTonic(hz, fromSlider) {
    state.tonic = Math.min(330, Math.max(65, hz));
    store.set('tonic', state.tonic);
    $('home-note').textContent = Math.round(state.tonic) + ' Hz';
    if (!fromSlider) $('note-slider').value = String(Math.max(-7, Math.min(9, Math.round(P.hzToCents(state.tonic, BASE_HZ) / 100))));
  }

  function meter(el, rms) {
    const db = 20 * Math.log10(Math.max(1e-5, rms));
    el.style.width = Math.max(0, Math.min(1, (db + 50) / 44)) * 100 + '%';
  }

  function micBlocked(err) {
    state.micState = 'blocked';
    $('mic-note').hidden = false;
    return err;
  }

  $('note-listen').addEventListener('click', async () => {
    const status = $('note-status');
    if (state.micState === 'blocked') {
      status.textContent = 'The microphone isn\'t available on this page. Choose your note by ear, or upload a short recording.';
      return;
    }
    try {
      await engine.startMic();
      state.micState = 'ok';
    } catch (e) {
      micBlocked(e);
      status.textContent = 'We couldn\'t use the microphone. Choose your note by ear, or upload a short recording.';
      return;
    }
    const found = [];
    const smoother = new P.Smoother(5);
    const start = performance.now();
    $('note-listen').disabled = true;
    status.textContent = 'Listening. Keep holding a relaxed "Allāh"…';
    await new Promise((resolve) => {
      const tick = () => {
        const r = engine.readMic();
        meter($('note-meter'), r.rms);
        const elapsed = (performance.now() - start) / 1000;
        if (r.freq && r.clarity > 0.8) {
          const v = smoother.push(r.freq);
          if (elapsed > 0.4 && v) found.push(v);
        }
        if (elapsed < 3.2) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    $('note-listen').disabled = false;
    $('note-meter').style.width = '0';
    if (found.length < 40) {
      status.textContent = 'We couldn\'t hear a steady note. Try again a little closer to the mic, or choose by ear.';
      return;
    }
    setTonic(P.median(found));
    status.textContent = 'Got it. Every pattern will now fit this note.';
  });

  $('note-slider').addEventListener('input', (e) => setTonic(BASE_HZ * Math.pow(2, Number(e.target.value) / 12), true));
  $('note-play').addEventListener('click', async () => {
    await engine.ensure();
    engine.stopAll();
    engine.tone(state.tonic, 1.6);
  });
  $('note-lower').addEventListener('click', () => setTonic(state.tonic / Math.pow(2, 1 / 12)));
  $('note-higher').addEventListener('click', () => setTonic(state.tonic * Math.pow(2, 1 / 12)));
  $('note-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const status = $('note-status');
    try {
      status.textContent = 'Listening to your recording…';
      const buffer = await engine.decode(await file.arrayBuffer());
      const frames = await P.extractContour(A.Engine.mono(buffer), buffer.sampleRate);
      const hz = frames.filter((f) => f.hz).map((f) => f.hz);
      if (hz.length < 50) throw new Error('too short');
      setTonic(P.median(hz));
      status.textContent = 'Got it. Every pattern will now fit this note.';
    } catch (err) {
      status.textContent = 'We couldn\'t find a steady note in that file. Try a recording of one held "Allāh".';
    }
  });
  $('headphones').checked = state.headphones;
  $('headphones').addEventListener('change', (e) => {
    state.headphones = e.target.checked;
    store.set('headphones', state.headphones);
    updateMonitorNote();
  });
  $('to-practice').addEventListener('click', () => show('practice'));

  // ---------- 3. Practice: targets ----------
  function lineLabel(id, k) {
    const p = K.phraseById(id);
    const order = K.adhanOrder(state.fajr);
    const nth = order.slice(0, k + 1).filter((x) => x === id).length;
    return p.times > 1 ? `${p.translit} (${nth === 1 ? '1st' : '2nd'})` : p.translit;
  }

  function refIndexFor(id, lineIndex) {
    const order = K.adhanOrder(state.fajr);
    const base = lineIndex == null ? order.indexOf(id) : lineIndex;
    const idx = base + (state.ref.nudge[id] || 0);
    return Math.max(0, Math.min(state.ref.segs.length - 1, idx));
  }

  function phraseTarget(phrase, lineIndex) {
    if (state.level === 'ref' && state.ref) {
      const seg = state.ref.segs[refIndexFor(phrase.id, lineIndex)];
      if (seg) return C.targetFromContour(state.ref.frames, seg, state.ref.tonicHz, state.ref.shift * 100);
    }
    const lvl = state.level === 'ref' ? 'simple' : state.level;
    return C.buildTarget(phrase, lvl);
  }

  function currentTarget() {
    if (state.full) {
      const items = K.adhanOrder(state.fajr).map((id, k) => ({ name: lineLabel(id, k), target: phraseTarget(K.phraseById(id), k) }));
      return C.buildSequence(items, 2.5);
    }
    return phraseTarget(K.phraseById(state.phraseId));
  }

  function degreesFor() {
    const lvl = K.LEVELS.find((l) => l.id === state.level);
    if (!lvl) return [{ c: 0, label: '1' }];
    return lvl.degrees.map((c, i) => ({ c, label: lvl.labels[i] }));
  }

  function refreshTarget() {
    stopRun();
    state.target = currentTarget();
    lane.mode = 'overview';
    lane.setTarget(state.target, tol(), degreesFor());
    state.take = null;
    renderReflection();
    renderPhrases();
    renderCard();
    renderRef();
    const lvl = K.LEVELS.find((l) => l.id === state.level);
    $('level-about').textContent =
      state.level === 'ref'
        ? 'The melody of your uploaded recording, moved to your home note.'
        : lvl.about;
    setCue(idleCue());
  }

  function idleCue() {
    return state.micState === 'blocked' ? 'Press Listen, then upload a take or watch a demo.' : 'Press Listen to hear the pattern, then Your turn.';
  }

  // ---------- Practice: rendering ----------
  function renderPhrases() {
    const list = $('phrase-list');
    list.textContent = '';
    K.PHRASES.filter((p) => state.fajr || !p.fajrOnly).forEach((p, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'phrase-item';
      b.setAttribute('aria-pressed', String(!state.full && p.id === state.phraseId));
      const num = document.createElement('span');
      num.className = 'pi-num';
      num.textContent = String(i + 1);
      const text = document.createElement('span');
      text.className = 'pi-text';
      const tr = document.createElement('span');
      tr.className = 'pi-tr';
      tr.textContent = p.translit;
      const times = document.createElement('span');
      times.className = 'pi-times';
      times.textContent = p.timesNote;
      text.append(tr, times);
      const comfy = document.createElement('span');
      comfy.className = 'pi-comfy';
      comfy.textContent = state.comfy.has(p.id) ? '✓' : '';
      if (state.comfy.has(p.id)) comfy.title = 'You marked this line as comfortable';
      b.append(num, text, comfy);
      b.addEventListener('click', () => {
        state.full = false;
        state.phraseId = p.id;
        refreshTarget();
      });
      li.append(b);
      list.append(li);
    });
    $('full-adhan').setAttribute('aria-pressed', String(state.full));
    $('full-adhan').classList.toggle('primary', state.full);
  }

  function renderCard() {
    const tips = $('card-tips');
    tips.textContent = '';
    if (state.full) {
      const n = K.adhanOrder(state.fajr).length;
      $('card-times').textContent = `Full adhan · ${n} lines`;
      $('card-ar').textContent = 'حَيَّ عَلَى الصَّلَاةِ';
      $('card-tr').textContent = 'The whole adhan, line by line';
      $('card-meaning').textContent = 'Sing each line as it reaches the marker. Breathe at each dotted line.';
      ['Keep the letters right before anything else.', 'The adhan is a call, not a race. Let each line settle before the next.'].forEach((t) => {
        const li = document.createElement('li');
        li.textContent = t;
        tips.append(li);
      });
      $('card-breath').textContent = '';
      return;
    }
    const p = K.phraseById(state.phraseId);
    $('card-times').textContent = p.timesNote;
    $('card-ar').textContent = p.arabic;
    $('card-tr').textContent = p.translit;
    $('card-meaning').textContent = p.meaning;
    p.tips.forEach((t) => {
      const li = document.createElement('li');
      li.textContent = t;
      tips.append(li);
    });
    $('card-breath').innerHTML = '';
    const b = document.createElement('b');
    b.textContent = 'Breath: ';
    $('card-breath').append(b, document.createTextNode(p.breath));
  }

  const CUES = { higher: 'A little higher ↑', lower: 'A little lower ↓', hold: 'Hold it there', rest: 'Breathe' };
  function setCue(text) {
    $('cue').textContent = text;
  }

  // ---------- Practice: the run loop ----------
  function setBusy(on) {
    ['btn-listen', 'btn-sing', 'btn-demo', 'take-file', 'replay-space', 'replay-dry'].forEach((id) => ($(id).disabled = on));
    $('btn-stop').hidden = !on;
  }

  function startRun(run) {
    stopRun();
    state.run = run;
    lane.mode = 'scroll';
    setBusy(true);
    const tick = () => {
      if (state.run !== run) return;
      const now = engine.ctx.currentTime - run.t0;
      if (run.frame) run.frame(now);
      lane.setState(Object.assign({ now }, run.view ? run.view(now) : {}));
      lane.draw();
      if (now >= run.end) {
        const done = run.done;
        stopRun();
        if (done) done();
        return;
      }
      run.raf = requestAnimationFrame(tick);
    };
    run.raf = requestAnimationFrame(tick);
  }

  function stopRun() {
    const run = state.run;
    if (!run) return;
    cancelAnimationFrame(run.raf);
    state.run = null;
    engine.stopAll();
    if (run.cleanup) run.cleanup();
    setBusy(false);
    lane.mode = 'overview';
    lane.setState({});
    lane.setTrack(state.take ? state.take.track : []);
    lane.draw();
    $('voice-meter').style.width = '0';
  }
  $('btn-stop').addEventListener('click', () => {
    stopRun();
    setCue('Stopped.');
  });

  function liveAt(track, t) {
    let lo = 0, hi = track.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (track[mid].t < t) lo = mid + 1;
      else hi = mid;
    }
    const p = track[lo];
    return p && Math.abs(p.t - t) < 0.05 ? p.c : null;
  }

  async function listen() {
    await engine.ensure();
    const target = state.target;
    const lead = 1.2;
    const t0 = engine.ctx.currentTime + lead;
    if (state.level === 'ref' && state.ref && !state.full && target.source) {
      engine.play(state.ref.buffer, { offset: target.source.t0, duration: target.dur, when: t0, throughSpace: false });
      setCue('The original recording. Your ribbon is moved to your note.');
    } else {
      engine.guide(target, state.tonic, t0);
      setCue('Listen to the shape. Follow the ring along the ribbon.');
    }
    lane.setTrack([]);
    startRun({ t0, end: target.dur + 0.4, view: () => ({ guide: true }), done: () => setCue('Now it\'s your turn.') });
  }

  async function sing() {
    if (state.micState === 'blocked') {
      $('mic-note').hidden = false;
      setCue('The microphone isn\'t available here. Upload a take instead.');
      return;
    }
    try {
      await engine.startMic();
      state.micState = 'ok';
    } catch (e) {
      micBlocked(e);
      setCue('We couldn\'t use the microphone. Upload a take instead.');
      return;
    }
    const target = state.target;
    const tolerance = tol();
    engine.setMonitoring(state.monitor && state.headphones);
    const rec = engine.startRecording();
    const recStart = engine.ctx.currentTime;
    const t0 = recStart + 3;
    const track = [];
    const smoother = new P.Smoother(5);
    let live = null, want = null, since = 0, shown = null;
    lane.setTrack(track);
    setCue('Get ready…');
    startRun({
      t0,
      end: target.dur + 0.8,
      frame(now) {
        const r = engine.readMic();
        const hz = smoother.push(r.freq && r.clarity > 0.75 ? r.freq : null);
        const c = hz ? P.hzToCents(hz, state.tonic) : null;
        meter($('voice-meter'), r.rms);
        live = c;
        if (now >= -0.3) track.push({ t: now, c, rms: r.rms });
        const tc = C.targetAt(target, now);
        let w = null;
        if (now >= 0 && Number.isNaN(tc)) w = 'rest';
        else if (!Number.isNaN(tc) && c != null) w = C.cueFor(P.foldCents(c - tc), tolerance);
        if (w !== want) {
          want = w;
          since = now;
        }
        if (now - since > 0.25 && shown !== want) {
          shown = want;
          setCue(CUES[want] || '');
        }
      },
      view: (now) => ({ live: now >= -0.3 ? live : null, cue: shown, countdown: now < 0 ? Math.ceil(-now) : null }),
      async done() {
        setCue('Listening back…');
        const buffer = rec ? await rec.stop() : null;
        finishTake({ track, buffer, bufferOffset: t0 - recStart, label: 'Your take' });
      },
      cleanup() {
        engine.setMonitoring(false);
        if (rec) rec.stop();
      },
    });
  }

  function firstSteady(frames) {
    let run = 0;
    for (let i = 0; i < frames.length; i++) {
      run = frames[i].hz ? run + 1 : 0;
      if (run >= 12) return frames[i - 11].t;
    }
    return null;
  }

  async function uploadTake(file) {
    stopRun();
    await engine.ensure();
    try {
      setCue('Listening to your recording…');
      const buffer = await engine.decode(await file.arrayBuffer());
      const frames = await P.extractContour(A.Engine.mono(buffer), buffer.sampleRate, {
        onProgress: (p) => setCue(`Listening to your recording… ${Math.round(p * 100)}%`),
      });
      const first = firstSteady(frames);
      if (first == null) throw new Error('no voice');
      const offset = first - state.target.firstVoiced;
      const track = frames.map((f) => ({ t: f.t - offset, c: f.hz ? P.hzToCents(f.hz, state.tonic) : null }));
      finishTake({ track, buffer, bufferOffset: offset, label: 'Your uploaded take' });
      replay(true);
    } catch (e) {
      setCue('We couldn\'t find singing in that file. Try a clearer recording of this line.');
    }
  }

  async function demo() {
    stopRun();
    await engine.ensure();
    setCue('Preparing the demo voice…');
    const target = state.target;
    const buffer = await engine.renderVoice(C.demoContour(target), target.step, state.tonic);
    const frames = await P.extractContour(buffer.getChannelData(0), buffer.sampleRate, {
      onProgress: (p) => setCue(`Preparing the demo voice… ${Math.round(p * 100)}%`),
    });
    const track = frames.map((f) => ({ t: f.t, c: f.hz ? P.hzToCents(f.hz, state.tonic) : null }));
    finishTake({ track, buffer, bufferOffset: 0, label: 'Demo: a synthetic learner', demo: true });
    replay(true);
  }

  function finishTake(take) {
    take.analysis = C.analyzeTake(state.target, take.track, { tol: tol() });
    take.feedback = C.feedback(take.analysis, { level: state.level });
    state.take = take;
    lane.mode = 'overview';
    lane.setTrack(take.track);
    lane.setState({});
    lane.draw();
    renderReflection();
    setCue(take.demo ? 'This is how feedback looks. Now try it yourself.' : 'Here is your line. Read the reflection below.');
  }

  async function replay(throughSpace) {
    const take = state.take;
    if (!take || !take.buffer) return;
    await engine.ensure();
    const lead = 0.5, startLane = -0.4;
    let offset = startLane + take.bufferOffset;
    let when = engine.ctx.currentTime + lead;
    if (offset < 0) {
      when -= offset;
      offset = 0;
    }
    const t0 = engine.ctx.currentTime + lead - startLane;
    engine.play(take.buffer, { offset, when, throughSpace });
    lane.setTrack(take.track);
    startRun({ t0, end: state.target.dur + 0.6, view: (now) => ({ live: liveAt(take.track, now) }) });
    setCue(throughSpace ? `Replaying in the ${engine.space.label || 'chosen'} space.` : 'Replaying your dry voice.');
  }

  $('btn-listen').addEventListener('click', listen);
  $('btn-sing').addEventListener('click', sing);
  $('btn-demo').addEventListener('click', demo);
  $('take-file').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) uploadTake(f);
  });
  $('replay-space').addEventListener('click', () => replay(true));
  $('replay-dry').addEventListener('click', () => replay(false));

  // ---------- Practice: reflection ----------
  function heardWord(h) {
    if (h > 0.85) return 'nearly all of the line';
    if (h > 0.6) return 'most of the line';
    if (h > 0.3) return 'about half of the line';
    return 'only a little of the line';
  }

  function renderReflection() {
    const t = state.take;
    $('reflection').hidden = !t;
    if (!t) return;
    $('take-label').textContent = t.label;
    $('fb-well').textContent = t.feedback.well;
    $('fb-next').textContent = t.feedback.next;
    $('fb-heard').textContent = heardWord(t.analysis.heard);
    const rows = $('fb-rows');
    rows.textContent = '';
    for (const part of t.analysis.parts) {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = part.name;
      const d = document.createElement('td');
      const dir = document.createElement('td');
      if (part.heard < 0.3) {
        d.textContent = '–';
        dir.textContent = 'not heard';
      } else {
        const info = C.describeDev(part.meanDev, part.meanAbs, t.analysis.tol);
        d.textContent = `${info.size} cents`;
        dir.textContent = info.dir;
      }
      tr.append(th, d, dir);
      rows.append(tr);
    }
    const comfy = $('mark-comfy');
    comfy.hidden = state.full || t.demo;
    const on = state.comfy.has(state.phraseId);
    comfy.setAttribute('aria-pressed', String(on));
    comfy.textContent = on ? 'Marked comfortable ✓' : 'This line feels comfortable';
    $('replay-space').disabled = $('replay-dry').disabled = !t.buffer;
  }

  $('mark-comfy').addEventListener('click', () => {
    const id = state.phraseId;
    if (state.comfy.has(id)) state.comfy.delete(id);
    else state.comfy.add(id);
    store.set('comfy', [...state.comfy]);
    renderReflection();
    renderPhrases();
  });
  $('delete-take').addEventListener('click', () => {
    state.take = null;
    lane.setTrack([]);
    lane.draw();
    renderReflection();
    setCue('Take deleted.');
  });

  // ---------- Practice: level, band, lines ----------
  document.querySelectorAll('input[name="level"]').forEach((r) => {
    r.checked = r.value === state.level;
    r.addEventListener('change', () => {
      state.level = r.value;
      if (r.value !== 'ref') store.set('level', r.value);
      refreshTarget();
    });
  });
  document.querySelectorAll('input[name="band"]').forEach((r) => {
    r.checked = r.value === state.band;
    r.addEventListener('change', () => {
      state.band = r.value;
      store.set('band', r.value);
      lane.tol = tol();
      if (state.take) {
        finishTake(state.take);
      } else lane.draw();
    });
  });
  $('fajr-toggle').checked = state.fajr;
  $('fajr-toggle').addEventListener('change', (e) => {
    state.fajr = e.target.checked;
    store.set('fajr', state.fajr);
    if (!state.fajr && K.phraseById(state.phraseId).fajrOnly) state.phraseId = 'takbir-open';
    refreshTarget();
  });
  $('full-adhan').addEventListener('click', () => {
    state.full = true;
    refreshTarget();
  });

  // ---------- Space ----------
  const SLIDERS = [
    ['sp-size', 'decay', (v) => v.toFixed(1) + ' s'],
    ['sp-wet', 'wet', (v) => Math.round(v * 100) + '%'],
    ['sp-echo', 'echo', (v) => Math.round(v * 100) + '%'],
    ['sp-time', 'echoTime', (v) => Math.round(v * 1000) + ' ms'],
    ['sp-rep', 'repeats', (v) => Math.round(v * 100) + '%'],
  ];
  function syncSliders() {
    for (const [id, key, fmt] of SLIDERS) {
      $(id).value = String(engine.space[key]);
      $(id + '-v').textContent = fmt(engine.space[key]);
    }
  }
  function renderSpaces() {
    const box = $('space-chips');
    box.textContent = '';
    for (const [id, sp] of Object.entries(A.SPACES)) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'space';
      input.id = 'space-' + id;
      input.value = id;
      input.checked = id === state.spaceId;
      input.addEventListener('change', () => {
        state.spaceId = id;
        store.set('space', id);
        engine.setSpace(Object.assign({}, sp));
        $('space-about').textContent = sp.about;
        syncSliders();
      });
      const span = document.createElement('span');
      span.textContent = sp.label;
      label.append(input, span);
      box.append(label);
    }
    $('space-about').textContent = (A.SPACES[state.spaceId] || A.SPACES.masjid).about;
    syncSliders();
  }
  for (const [id, key, fmt] of SLIDERS) {
    $(id).addEventListener('input', (e) => {
      const v = Number(e.target.value);
      engine.setSpace({ [key]: v });
      $(id + '-v').textContent = fmt(v);
      $('space-about').textContent = 'Adjusted by you.';
    });
  }

  function updateMonitorNote() {
    const note = $('monitor-note');
    if (state.monitor && !state.headphones) {
      note.hidden = false;
      note.textContent = 'Put on headphones and tick "I\'m wearing headphones" on the Your note step. Live listening stays off until then, to avoid feedback.';
      return;
    }
    const ms = engine.latencyMs();
    note.hidden = !state.monitor;
    note.textContent = ms == null ? '' : `Output delay here is about ${ms} ms. Under 20 ms feels natural; phone browsers are often slower.`;
  }
  $('monitor').addEventListener('change', async (e) => {
    state.monitor = e.target.checked;
    if (state.monitor) await engine.ensure();
    updateMonitorNote();
  });

  // ---------- Reference recording ----------
  $('ref-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const status = $('ref-status');
    try {
      await engine.ensure();
      status.textContent = 'Reading the recording…';
      const buffer = await engine.decode(await file.arrayBuffer());
      const frames = await P.extractContour(A.Engine.mono(buffer), buffer.sampleRate, {
        hop: buffer.duration > 60 ? 0.02 : 0.01,
        onProgress: (p) => (status.textContent = `Tracing the melody… ${Math.round(p * 100)}%`),
      });
      const segs = P.segmentPhrases(frames, { minGap: 0.6, minLen: 1.0 });
      const tonicHz = P.estimateTonic(frames);
      if (!segs.length || !tonicHz) throw new Error('no phrases');
      state.ref = { buffer, frames, segs, tonicHz, shift: 0, nudge: {}, name: file.name };
      $('level-ref').disabled = false;
      $('level-ref').checked = true;
      state.level = 'ref';
      const expected = K.adhanOrder(state.fajr).length;
      status.textContent =
        `Found ${segs.length} ${segs.length === 1 ? 'line' : 'lines'} in "${file.name}". A full adhan has ${expected}. ` +
        (segs.length === expected ? 'Hayya matched them in order.' : 'Hayya matched them in order; use Earlier and Later to fix any line that is off.');
      refreshTarget();
    } catch (err) {
      status.textContent = 'We couldn\'t trace a melody in that file. Try a clear recording with pauses between lines.';
    }
  });

  function renderRef() {
    const box = $('ref-controls');
    if (!state.ref) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const idx = refIndexFor(state.phraseId);
    $('ref-part').textContent = state.full ? 'Full adhan uses every part in order.' : `This line uses part ${idx + 1} of ${state.ref.segs.length}.`;
    $('ref-prev').disabled = $('ref-next').disabled = state.full;
    $('ref-shift').textContent = `${state.ref.shift > 0 ? '+' : ''}${state.ref.shift} semitones`;
    if (state.level === 'ref' && state.target) {
      const vals = Array.from(state.target.cents).filter((c) => !Number.isNaN(c));
      const hi = Math.max(...vals), lo = Math.min(...vals);
      $('ref-range').textContent = `This line spans about ${Math.round((hi - lo) / 100)} semitones, up to ${Math.max(0, Math.round(hi / 100))} above your home note.`;
    } else $('ref-range').textContent = 'Choose "My recording" above to practise with it.';
  }
  const nudge = (d) => {
    const id = state.phraseId;
    state.ref.nudge[id] = (state.ref.nudge[id] || 0) + d;
    refreshTarget();
  };
  $('ref-prev').addEventListener('click', () => nudge(-1));
  $('ref-next').addEventListener('click', () => nudge(1));
  $('ref-down').addEventListener('click', () => {
    state.ref.shift -= 1;
    refreshTarget();
  });
  $('ref-up').addEventListener('click', () => {
    state.ref.shift += 1;
    refreshTarget();
  });
  $('ref-clear').addEventListener('click', () => {
    state.ref = null;
    $('level-ref').disabled = true;
    if (state.level === 'ref') {
      state.level = 'simple';
      $('level-simple').checked = true;
    }
    $('ref-status').textContent = 'Recording removed.';
    refreshTarget();
  });

  $('end-session').addEventListener('click', () => show('close'));

  // ---------- 4. Close ----------
  function renderClose() {
    const c = K.CLOSING;
    $('close-ar').textContent = c.ayah.arabic;
    $('close-meaning').textContent = c.ayah.meaning;
    $('close-src').textContent = c.ayah.source;
    $('dua-ar').textContent = c.duaAfterAdhan.arabic;
    $('dua-meaning').textContent = c.duaAfterAdhan.meaning;
    $('dua-src').textContent = c.duaAfterAdhan.source;
    const box = $('step-chips');
    box.textContent = '';
    const chosen = store.get('nextStep', 'home');
    for (const s of c.steps) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'next-step';
      input.id = 'next-' + s.id;
      input.checked = s.id === chosen;
      input.addEventListener('change', () => {
        store.set('nextStep', s.id);
        $('step-text').textContent = s.text;
      });
      const span = document.createElement('span');
      span.textContent = s.label;
      label.append(input, span);
      box.append(label);
    }
    $('step-text').textContent = (c.steps.find((s) => s.id === chosen) || c.steps[0]).text;
    $('gave-text').textContent = '';
  }
  function report(gave) {
    const log = store.get('reports', []);
    log.push({ date: new Date().toISOString().slice(0, 10), gave });
    store.set('reports', log.slice(-100));
    $('gave-text').textContent = gave
      ? 'Noted, privately. May Allah accept it from you and from everyone who answered your call.'
      : 'That\'s fine. The next prayer is a new chance, and the walls are a fine first audience.';
  }
  $('gave-yes').addEventListener('click', () => report(true));
  $('gave-no').addEventListener('click', () => report(false));
  $('restart').addEventListener('click', () => {
    showReminder(true);
    show('intention');
  });

  // ---------- Theme changes redraw the lane ----------
  const recolor = () => {
    lane.readColors();
    lane.draw();
  };
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', recolor);
  } catch (e) { /* older browsers */ }
  new MutationObserver(recolor).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(recolor);

  // ---------- Start ----------
  if (state.micState === 'blocked') $('mic-note').hidden = false;
  setTonic(state.tonic);
  renderSpaces();
  showReminder(true);
  refreshTarget();

  // Deep link to a step for demos and testing: #note, #practice, #close.
  const hash = (location.hash || '').slice(1);
  if (SCREENS.includes(hash)) show(hash);

  // Test hook: exposes internals for the automated browser check only.
  window.__hayya = { state, engine, lane, show, refreshTarget };
})();
