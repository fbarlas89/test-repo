# Hayya: adhan confidence coach

A private, intention-first practice coach that helps ordinary Muslim men give the adhan correctly and beautifully in their own voice, without inviting riyāʾ (showing off).

- **Product brief:** [`docs/product-brief.md`](docs/product-brief.md) covers the refined concept, design principles, gaps, neighbouring problems, competitors, metrics and open decisions.
- **Prototype:** [`prototype/`](prototype/) is a working web app: live pitch lane, reverb and echo, a demo voice, and upload-your-own practice.

## Try the prototype

The microphone needs `localhost` or HTTPS.

```sh
cd prototype
python3 -m http.server 8080
# open http://localhost:8080 in Chrome, Edge, Firefox or Safari
```

Wear headphones if you want to hear yourself live with reverb.

**Other ways to open it:**
- **GitHub Pages:** in the repo's *Settings → Pages*, deploy from this branch and the `/ (root)` folder. The app will be at `<pages-url>/prototype/`.
- **Shareable preview page:** the preview sandbox blocks the microphone. There, record yourself with a voice-memo app and use **Upload a take**, or use **Watch a demo**.

## What's in it

| Step | What happens |
|---|---|
| 1. Intention | A rotating reminder, with its source, before each session. No likes, followers, scores or sharing anywhere in the app. |
| 2. Your note | Hold "Allāh" for three seconds, or choose by ear. Every pattern is moved to this home note, so it fits any voice. |
| 3. Practice | Seven lines of the adhan (eight at Fajr). Each has Arabic, transliteration, meaning, pronunciation tips and a breath note. Listen, then sing along the pitch lane. After each take you get written feedback: one thing that went well, one thing to try. |
| 4. Close | Qurʾān 2:127, a real-world next step, a private "did you give a real adhan?" check-in, and the duʿāʾ after the adhan. |

**Practice options:**
- **Levels:**
  - **Steady** and **Simple** play a hummed guide to the melody. There are no words; you say them.
  - **Recorded** plays a real muezzin, line by line, with the ribbon traced from the same voice. It needs a recording to be added (see below).
  - **My recording** does the same with an adhan you upload.
- **Original pitch / At my note:** on the two recorded levels, hear the voice as sung, or moved to your home note (by the nearest octave, never more than 6 semitones) with its timing unchanged.
- **Band:** Gentle, Normal or Precise, which sets how close counts as on the pattern.
- **Spaces:** Dry, Home, Musallā, Masjid or Grand dome, with adjustable reverb and echo.
- **Learn from a recording:** upload an adhan you have the right to use. Hayya traces its melody, splits it into lines and moves it to your note.

## How it works

```
mic ─▶ YIN pitch detector (dry signal, ~16 kHz) ─▶ cents from your home note
    │                                                  │
    │                                  fold octaves, compare with target ─▶ lane + cue
    └─▶ (headphones) ─▶ reverb + echo ─▶ your ears
```

- `js/pitch.js`: YIN pitch detection, smoothing, cents maths, offline contour extraction, phrase segmentation.
- `js/content.js`: the adhan lines, pronunciation notes, reminders, illustrative patterns (draft content).
- `js/coach.js`: builds target contours, compares takes, and writes feedback in words.
- `js/audio.js`: Web Audio graph (convolution reverb, feedback echo, limiter), hummed guide synth, microphone, recording.
- `js/shift.js`: pitch shifter that keeps timing (WSOLA time-stretch plus resampling), used for "At my note".
- `js/reference.js`: loads the prepared recording and serves each line, as recorded or moved to your note.
- `tools/prepare-reference.js`: turns any adhan recording into per-line clips and a traced melody.
- `js/viz.js`: the pitch-lane canvas.
- `js/app.js`: screen flow and state.

There are no dependencies and no build step. Preferences are kept in `localStorage` on the device. Takes live in memory only.

## Tests

```sh
cd prototype
npm test                 # 39 unit tests: pitch accuracy, pitch shifting, coach logic, recording prep, content
npm run check:browser    # end-to-end in Chromium with a fake microphone (needs Playwright)
```

## Adding the real adhan recording

The **Recorded** level stays off until `prototype/reference/` holds a prepared recording. Preparing one is a single command. It works the same for a free recording now and a teacher's recording later.

```sh
cd prototype
# 1. Get a recording you have the right to use, e.g. the public-domain (CC0) one on Wikimedia Commons:
curl -L -o beautiful-adhan.ogg "https://commons.wikimedia.org/wiki/Special:FilePath/Beautiful_adhan.ogg"

# 2. Split it into lines, trace the melody, and write reference/ (needs Playwright)
node tools/prepare-reference.js beautiful-adhan.ogg \
  --title "Beautiful adhan" --credit "Wikimedia Commons" --license "CC0 1.0" \
  --source "https://commons.wikimedia.org/wiki/File:Beautiful_adhan.ogg"
```

The script:
- prints one row per line, with its start time and length
- writes one clip per line plus `reference/manifest.json`, which holds the credit, the licence, the recording's home note and each line's traced melody.

**Check the result by ear.** Play each line in the app. If a line is split wrongly, re-run with `--segments "start-end,start-end,..."`, giving seconds for each of the 12 lines. Add `--fajr` if the recording includes *aṣ-ṣalātu khayrun mina-n-nawm*.

**Recording a teacher or muezzin.** These make the line splitting and pitch tracing work best:
- a quiet room, with the phone about 30 cm away
- no added reverb or echo, because Hayya adds the room
- a clear pause between lines
- one full adhan, plus the Fajr line separately if wanted

## Content status

**Draft.** Pronunciation notes, reminders and hadith citations need review by a qualified teacher or scholar before any release. The practice melodies are illustrative. They are not recordings or transcriptions of any muezzin.
