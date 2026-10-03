/*
 * End-to-end browser check for the Hayya prototype.
 *
 * Serves the prototype, opens it in Chromium with a fake microphone that
 * holds a steady 147 Hz voice, and walks the main flow:
 * home note → live take → demo voice → uploaded take → close, plus a
 * phone-width layout check and a "no microphone" fallback check.
 *
 * Usage (needs Playwright):
 *   node test/browser-check.js [screenshot-dir]
 * Set CHROMIUM_PATH to use a specific Chromium build.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { makeStandIn } = require('./standin.js');
const { prepareReference } = require('../tools/prepare-reference.js');

const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || null;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wav': 'audio/wav' };

function writeVoiceWav(file, f0, seconds) {
  const sr = 48000, n = sr * seconds;
  const data = Buffer.alloc(n * 2);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const f = f0 * Math.pow(2, (8 * Math.sin(2 * Math.PI * 5 * (i / sr))) / 1200);
    ph += (2 * Math.PI * f) / sr;
    let v = 0;
    for (let h = 1; h <= 6; h++) v += Math.sin(ph * h) / h;
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v * 0.28)) * 32767), i * 2);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8);
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(sr, 24); head.writeUInt32LE(sr * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([head, data]));
}

function serve(refDir) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split(/[?#]/)[0]);
      const base = refDir && url.startsWith('/reference/') ? refDir : ROOT;
      const p = path.join(base, base === ROOT ? url : url.slice('/reference/'.length));
      if (!p.startsWith(base) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
        res.writeHead(404);
        return res.end();
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(res);
    });
    server.listen(0, () => resolve(server));
  });
}

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
}

(async () => {
  const wav = path.join(os.tmpdir(), 'hayya-fake-voice.wav');
  writeVoiceWav(wav, 146.83, 24);

  // A synthetic stand-in recording goes through the real preparation
  // script, so the Recorded level is exercised end to end.
  const standIn = path.join(os.tmpdir(), 'hayya-standin.wav');
  const refDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hayya-ref-'));
  const expected = makeStandIn(standIn);
  const manifest = await prepareReference({ input: standIn, out: refDir, title: 'Synthetic stand-in', license: 'test only' });
  const offBy = Math.max(...manifest.lines.map((l, k) => Math.abs(l.dur - (expected[k].t1 - expected[k].t0 + 1.2))));
  check('preparation finds all 12 lines of a recording', manifest.lines.length === 12 && offBy < 0.15, `worst length error ${offBy.toFixed(2)} s`);
  check('preparation finds the recording\'s home note', Math.abs(1200 * Math.log2(manifest.tonicHz / 196)) < 30, `${manifest.tonicHz} Hz vs 196 Hz`);

  const server = await serve(refDir);
  const url = `http://localhost:${server.address().port}/index.html`;
  const launch = (args) => chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args });
  const shot = (page, name, full) => OUT && page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: !!full });

  const browser = await launch([
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${wav}`,
    '--autoplay-policy=no-user-gesture-required',
  ]);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['microphone'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await shot(page, '01-intention', true);

  await page.click('#begin');
  await page.click('#note-listen');
  await page.waitForTimeout(4200);
  const home = parseInt(await page.textContent('#home-note'), 10);
  check('home note found from the voice', Math.abs(home - 147) <= 2, `${home} Hz`);
  await page.click('#to-practice');
  await shot(page, '02-practice', true);

  await page.check('#level-steady', { force: true });
  await page.click('#btn-sing');
  const dur = await page.evaluate(() => window.__hayya.state.target.dur);
  await page.waitForSelector('#reflection:not([hidden])', { timeout: (dur + 10) * 1000 });
  const live = await page.evaluate(() => window.__hayya.state.take);
  check('live take follows the pattern', live.analysis.inBand > 0.9, `in band ${live.analysis.inBand.toFixed(2)}`);
  check('live take is recorded for replay', await page.evaluate(() => !!window.__hayya.state.take.buffer));
  await shot(page, '03-live-take', true);

  await page.check('#level-simple', { force: true });
  await page.click('#btn-demo');
  await page.waitForSelector('#reflection:not([hidden])', { timeout: 30000 });
  await page.waitForFunction(() => !window.__hayya.state.run, null, { timeout: 30000 });
  const next = await page.textContent('#fb-next');
  check('demo voice gets a specific tip', /ending drifted/.test(next), next);
  await shot(page, '04-demo', true);

  await page.check('#level-steady', { force: true });
  await page.setInputFiles('#take-file', wav);
  await page.waitForSelector('#reflection:not([hidden])', { timeout: 30000 });
  const up = await page.evaluate(() => window.__hayya.state.take.analysis.inBand);
  check('uploaded take is analysed', up > 0.9, `in band ${up.toFixed(2)}`);

  // Recorded adhan: Listen plays the real clip, as recorded and at my note.
  await page.evaluate(() => window.__hayya.show('practice'));
  await page.waitForFunction(() => !document.getElementById('level-rec').disabled, null, { timeout: 10000 });
  await page.check('#level-rec', { force: true });
  check('Listen says it plays the adhan', /Listen to the adhan/.test(await page.textContent('#btn-listen')));
  await page.click('#btn-listen');
  await page.waitForFunction(() => window.__hayya.state.run, null, { timeout: 15000 });
  let heard = await page.evaluate(() => window.__hayya.lastListen());
  check('Listen plays the recorded voice, not a hum', heard.kind === 'voice' && heard.parts.length === 1 && Math.abs(heard.parts[0].seconds - manifest.lines[0].dur) < 0.05, JSON.stringify(heard.parts));
  await page.click('#btn-stop');

  await page.check('#pitch-mine', { force: true });
  await page.click('#btn-listen');
  await page.waitForFunction(() => window.__hayya.state.run, null, { timeout: 30000 });
  heard = await page.evaluate(() => window.__hayya.lastListen());
  const wantCents = ((1200 * Math.log2(home / manifest.tonicHz) + 600) % 1200 + 1200) % 1200 - 600;
  check('At my note moves the voice to the home note', Math.abs(heard.parts[0].cents - wantCents) < 30, `${Math.round(heard.parts[0].cents)} cents, wanted about ${Math.round(wantCents)}`);
  const ratio = await page.evaluate(async () => {
    const H = window.Hayya, st = window.__hayya.state;
    const line = st.rec.line('takbir-open', 1);
    const med = async (buf) => {
      const fr = await H.pitch.extractContour(buf.getChannelData(0), buf.sampleRate);
      return H.pitch.median(fr.filter((f) => f.hz).map((f) => f.hz));
    };
    const shiftCents = H.reference.shiftToNote(st.rec.tonicHz, st.tonic);
    return { got: 1200 * Math.log2((await med(await st.rec.clipAt(line, shiftCents))) / (await med(await st.rec.clip(line)))), want: shiftCents };
  });
  check('the moved voice really sounds at the new pitch', Math.abs(ratio.got - ratio.want) < 15, `${ratio.got.toFixed(0)} vs ${ratio.want.toFixed(0)} cents`);
  await page.click('#btn-stop');
  await shot(page, '05-recorded', true);

  await page.click('#full-adhan');
  await page.click('#btn-listen');
  await page.waitForFunction(() => window.__hayya.state.run, null, { timeout: 60000 });
  heard = await page.evaluate(() => ({ l: window.__hayya.lastListen(), starts: window.__hayya.state.target.starts }));
  check('full adhan plays all 12 recorded lines in order', heard.l.parts.length === 12 && heard.l.parts.every((p, k) => p.seconds && Math.abs(p.at - heard.starts[k]) < 1e-6));
  await page.click('#btn-stop');

  await page.evaluate(() => window.__hayya.show('close'));
  await page.click('#gave-yes');
  check('close screen notes the real adhan privately', /Noted, privately/.test(await page.textContent('#gave-text')));
  check('no page errors', errors.length === 0, errors.join('; '));

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await phone.newPage();
  await p2.goto(url + '#practice');
  await p2.waitForTimeout(500);
  const overflow = await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('no sideways scroll at phone width', overflow <= 0, `${overflow}px`);
  await p2.emulateMedia({ colorScheme: 'dark' });
  await shot(p2, '06-phone-dark', true);
  await browser.close();

  const plain = await launch([]);
  const p3 = await (await plain.newContext()).newPage();
  await p3.route('**/reference/manifest.json', (r) => r.fulfill({ status: 404, body: '' }));
  await p3.goto(url + '#practice');
  await p3.waitForTimeout(500);
  check('without a recording, Recorded is off and says why', (await p3.isDisabled('#level-rec')) && /no recording has been added/.test(await p3.textContent('#rec-status')));
  await p3.check('#level-simple', { force: true });
  check('hum levels say they are a hum', /hum guide/.test(await p3.textContent('#btn-listen')));
  await p3.click('#btn-sing');
  await p3.waitForTimeout(1500);
  check('without a microphone the upload option is offered', await p3.isVisible('#mic-note'));
  await plain.close();

  server.close();
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
