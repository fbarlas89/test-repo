# Hayya: product brief

*Working name, from* Ḥayya ʿala-ṣ-ṣalāh, *"come to prayer". It points at the prayer, not at the caller.*

Status: concept refined, working prototype built (see `prototype/`). Content is a draft pending scholarly review.

---

## The problem

Many Muslim men would like to give the adhan but hold back. They don't trust their voice, they can't tell tones apart, or they've never been taught. Today they learn from YouTube, or by copying the Makkah and Madinah muezzins, whose patterns everyone recognises.

Three things make this harder than "learn to sing":

- **Most of them will never have a trained voice.** The product has to work for ordinary voices, and has to build confidence rather than measure talent.
- **It is worship, not performance.** The adhan is for Allah's pleasure. Anything that invites riyāʾ (showing off), ujb (self-admiration) or competition works against the purpose.
- **The finish line is outside the app.** Success means a real adhan at a real prayer, not a good session in the app.

## The concept

**A private, ikhlāṣ-first coach that takes an ordinary man from "I could never" to giving his first real adhan, correctly and beautifully, in his own voice range.**

The core loop runs line by line:

1. **Listen.** See the meaning and a pronunciation tip, then hear the guide melody.
2. **Your turn.** Sing along a live pitch lane that shows where you are, where the pattern is, and whether to go a little higher or lower.
3. **Reflect.** Get one thing that went well and one thing to try, with no score.
4. **Put it together.** Join the lines into a full adhan.

**Levels put correctness before beauty:**

1. Words and pronunciation on one steady note
2. Timing: madd lengths and where to breathe
3. A simple melody
4. A maqam pattern, e.g. Hijaz
5. Ornaments

**Real-world pathway:** at home alone → for your family's prayer → a small musallā or workplace prayer room → the masjid.

## Design principles (ikhlāṣ-first)

| Principle | In the product |
|---|---|
| Intention before practice | Each session opens with a short niyyah moment and a rotating reminder with its source. One example is Bukhārī 609: the shepherd who raises his voice in the desert, where whatever hears it will testify for him. |
| No audience inside the app | No public profiles, followers, likes, leaderboards or share-to-social buttons. Sharing, when it comes, goes only one-to-one to a chosen teacher. |
| No vanity scoring | Feedback is written in words: one thing that went well, one thing to try. A private "details" view shows how far off each part was in cents. Nothing is ranked, given a percentage, or shared. |
| Praise points to Allah | "Alhamdulillah, steady takbīr." Never "You sound amazing!" (feeds ujb), never "Your voice is off" (shames). |
| Learn a pattern, not a persona | "A pattern the ummah recognises," never "sound like Sheikh X". |
| Private by default | Audio is processed on the device, and recordings stay in memory only. |
| Success happens off-app | Each session ends with a duʿāʾ and a real-world next step. The user can privately note whether they gave a real adhan. |

## Gaps in the original idea, and how we close them

1. **An absolute-pitch target would defeat the confidence goal.** This is the most important gap. If the target is the muezzin's *actual* notes, most men (especially basses) will fail. **Hayya moves every pattern to the user's own comfortable "home note"**, found at onboarding in three seconds. "Where you are vs. where to be" is then about intervals (the shape of the melody), not notes, and singing the right shape an octave away still counts.
2. **Maqam uses microtones.** Bayati, Rast, Saba and Sikah contain roughly quarter-tone steps, so Western tuners and piano note names would call correct singing wrong. Hayya measures in cents from the user's home note and labels scale degrees (1, ♭2, 3…), never note names.
3. **Pronunciation matters more than melody.** Known errors include:
   - lengthening the first "A" of *Allāhu akbar*, which turns it into a question
   - "akbār", which is a different word (a drum)
   - dropping the "u" of *Allāhu*
   - stretching vowels until the letters change

   Scholars differ on melodic adhan (talḥīn). The common ground is that beautifying is fine as long as letters and meaning are not distorted. So every line carries pronunciation notes, and **a qualified reviewer must sign off** on content, reminders and citations.
4. **Variants.** Fajr adds *aṣ-ṣalātu khayrun mina-n-nawm*. Madhabs differ on tarjīʿ and on the iqāmah, and the Shia adhan has additional phrases. The prototype covers the standard Sunni adhan with a Fajr toggle, and the content model treats variants as configuration.
5. **Reference audio rights and imitation ethics.** Haramain recordings are managed by the Haramain authority, and the muezzins are living people. The prototype uses illustrative patterns plus "upload a recording you have the right to use". Production needs licensed or teacher-recorded references.
6. **Reverb and echo are right, but need care:**
   - Hearing yourself live needs headphones (to avoid feedback) and low latency, which is weaker in phone browsers.
   - Pitch is checked on the dry voice while the user hears the wet one, so the room never hides a note.
   - An honest "Dry" option is always there.
   - Spaces are named after rooms (Home, Musallā, Masjid, Grand dome), never after muezzins.
7. **The last mile.** Confidence in the app does not automatically carry over to the masjid microphone. The app needs a pathway, microphone technique, and help with nerves.
8. **Projection, breath and vocal health.** Bilal was chosen for a voice that carried (Abū Dāwūd 499). Each line has a breath tip, patterns stay within a safe range, and Fajr gets a warm-up.
9. **Meaning builds sincerity.** Every line shows the Arabic, a transliteration and a translation.
10. **Anti-riyāʾ is in tension with growth and monetisation.** Viral loops are off the table, so growth has to come through masjids, imams, institutions and word of mouth. Hadith favour a muezzin who takes no wage for the adhan itself (Abū Dāwūd 531). Charging for *training* is different, but institution-sponsored, waqf or donation models deserve serious consideration.
11. **Privacy.** Voice is sensitive data. Default to on-device processing with no uploads, and make any analytics opt-in and aggregated.

## Neighbouring problems (adjacent opportunities)

| Opportunity | Why it's close |
|---|---|
| **Masjid sound systems** | A lot of "bad adhan" is really a PA problem: clipping, harsh EQ, too much reverb, poor mic technique. A PA setup guide and preset recommender would be a B2B offer to masjids. |
| **Iqāmah** | Shorter, faster, a different style. Cheap to add. |
| **Leading ṣalāh / Qurʾān aloud** | The same shy man often avoids leading Maghrib or ʿIshāʾ at home or work. Same engine (pitch + maqam + tajwīd), bigger market, higher sensitivity. |
| **"First adhan" moments** | A new father giving the adhan in his newborn's ear, a widely practised custom. A son learning from his father. Suggests a family edition. |
| **Reverts and new Muslims** | Words, meaning and pronunciation, for the adhan and for ṣalāh in general. |
| **Responding to the adhan** | The Sunnah is to repeat after the muezzin (Bukhārī 611), then make the duʿāʾ. It works for everyone, including women and children, and it doubles as a call-and-response practice drill. |
| **Muezzin rosters** | Many masjids lack consistent volunteers, especially for Fajr. A private coordination tool, not a showcase. |
| **Khuṭbah voice** | A projection, pacing and nerves coach for khaṭībs. |

**Possible pivot:** from an "adhan coach" to a "voice of the masjid" platform (adhan, iqāmah, recitation in ṣalāh, PA setup) that masjids use to train volunteers.

## Competitive landscape

| Player | What it does | Gap Hayya fills |
|---|---|---|
| [Saif Voice Academy](https://saifvoice.com/) | Web practice studio: pitch curve over a master reference, accuracy score, human review, $9.99/month | Closest competitor. Scores and trends; not built around intention or the user's own range |
| [Ulum Al-Azhar](https://ulumalazhar.com/course/adhan-training-course-with-maqamat/), [Quranic Sphere](https://quranicsphere.com/adhan-learning-course-muslim-call-to-prayer/), [Understand Quran](https://understandquran.com/azan-workshop/) | Human-taught adhan courses | No live visual feedback between lessons |
| YouTube maqam playlists | Passive listening | No feedback at all |
| [Qtone](https://github.com/doctorhy/Qtone-web) | Quarter-tone tuner | Not adhan-specific, no patterns |
| Prayer apps (e.g. Muslim Pro) | Play famous adhans | Don't teach |

**Where Hayya differentiates:**
- ikhlāṣ-first design
- moving every pattern to your own voice
- correctness-first levels
- room-aware reverb
- the real-world pathway

## Success metrics (non-vanity)

- **North star:** real-world adhans given. Self-reported privately, and only ever aggregated.
- **Leading indicators:**
  - home-note setup completion
  - lines the user marks "comfortable" (self-assessed, not scored)
  - a weekly before/after confidence rating ("How confident would you feel giving adhan tomorrow?", 1–5)
  - week-4 retention
- **Guardrails:**
  - Never optimise for shares or time in app.
  - Telemetry is opt-in.
  - Audio is never uploaded.

## What the prototype demonstrates

A zero-dependency web app. It runs live in a phone browser when hosted, and works through file upload on the shareable preview page.

- **Intention:** a rotating reminder with its source.
- **Home note:** hold "Allāh" for three seconds, or choose by ear. Every pattern then fits that note.
- **Seven lines of the adhan** (eight at Fajr), each with Arabic, transliteration, meaning, pronunciation tips and a breath note.
- **Levels:**
  - Steady note and Simple melody, each with a hummed guide.
  - **Recorded adhan:** a real muezzin, line by line, with the ribbon traced from the same voice.
  - **My recording:** an adhan you upload.
- **Original pitch / At my note:** on recorded voices, hear the muezzin as sung, or moved to your home note with the timing unchanged.
- **A live pitch lane:**
  - a gold ribbon for the pattern, with a tolerance band
  - your voice as a green (on) or orange (off) line
  - "a little higher / lower / hold it" cues
  - scale-degree labels
- **Reflection in words** after every take (one well, one to try), plus a private details view in cents.
- **Spaces:** Dry, Home, Musallā, Masjid, Grand dome, with adjustable reverb and echo. Live monitoring requires headphones; replays can be heard dry or with the space.
- **Demo voice:** a synthetic learner shows the whole loop without a microphone.
- **Learn from a recording:** upload an adhan you have the right to use. Hayya traces its melody, splits it into lines, and moves it to your note.
- **Full adhan run-through** with breath markers.
- **Close:** Qurʾān 2:127, a next-step prompt, a private "did you give a real adhan?" check-in, and the duʿāʾ after the adhan.

## Prototype test plan (10–15 target users)

- **H1:** a pitch lane moved to your own note raises confidence more than audio-only practice (measured by the before/after confidence rating).
- **H2:** reverb monitoring raises confidence without hurting accuracy (compare take accuracy dry vs. with space).
- **H3:** niyyah prompts feel sincere, not preachy (interview).
- **H4:** users understand the "shape, not notes" idea without explanation (task-based test).

## Open decisions

- Choose a scholarly reviewer, and decide which madhab variants to support first.
- Reference audio: license Haramain recordings, commission teacher recordings (the easiest path), or both.
- Business model: subscription, institution-sponsored, or waqf/donation.
- Automatic pronunciation checks. Arabic phoneme recognition is research-grade; for now the prototype uses guidance text.
- A native app for low-latency live monitoring.
- Timing of the masjid PA module (possible B2B wedge).

## Sources

- [Saif Voice Academy](https://saifvoice.com/)
- [Ulum Al-Azhar: Adhan training course with maqamat](https://ulumalazhar.com/course/adhan-training-course-with-maqamat/)
- [SeekersGuidance: the vowelling of "akbar" in the adhan](https://seekersguidance.org/answers/hanafi-fiqh/the-vowelling-of-the-word-akbar-in-the-call-to-prayer-adhan/)
- [SeekersGuidance: reciting with maqamat](https://seekersguidance.org/answers/halal-and-haram/what-is-the-ruling-on-reciting-the-quran-with-scales-maqamat/)
- [Research on the performance of adhan in Turkish maqam tradition (PDF)](https://isamveri.org/pdfdrg/D03601/2024_69/2024_69_SAGER.pdf)
- [Qtone microtonal tuner](https://github.com/doctorhy/Qtone-web)
