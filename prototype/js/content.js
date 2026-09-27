/*
 * Hayya: content.
 *
 * DRAFT CONTENT. Every pronunciation note, reminder and citation here must
 * be reviewed by a qualified teacher/scholar before any release. The
 * melodies are illustrative practice patterns written for this prototype;
 * they are not transcriptions of any muezzin.
 *
 * Pitch is always in cents relative to the user's own home note (0), so
 * every pattern fits every voice.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.Hayya = root.Hayya || {}).content = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Pitch spec per syllable: a number (held), or [[fraction, cents], ...]
  // breakpoints for glides and turns. A syllable named '|' is a short rest.
  const g = (...pts) => pts;

  const LEVELS = [
    {
      id: 'steady',
      name: 'One steady note',
      short: 'Steady',
      about: 'Words, timing and breath on your home note. Get the letters right first.',
      degrees: [0],
      labels: ['1'],
    },
    {
      id: 'simple',
      name: 'Simple melody',
      short: 'Simple',
      about: 'A gentle shape within three steps of your home note.',
      degrees: [0, 200, 300, 500],
      labels: ['1', '2', '♭3', '4'],
    },
    {
      id: 'hijaz',
      name: 'Hijaz pattern',
      short: 'Hijaz',
      about: 'An illustrative pattern on the Hijaz jins (1, ♭2, 3, 4), a sound many people know from the Haramain.',
      degrees: [0, 100, 400, 500, 700],
      labels: ['1', '♭2', '3', '4', '5'],
    },
  ];

  const TAKBIR = {
    syl: [
      ['Al', 0.35], ['lā', 1.1], ['hu', 0.35], ['ak', 0.4], ['bar', 1.0],
      ['|', 0.4],
      ['Al', 0.35], ['lā', 1.4], ['hu', 0.35], ['ak', 0.45], ['bar', 1.4],
    ],
    simple: [
      0, g([0, 0], [0.3, 200], [1, 200]), 200, 300, g([0, 200], [0.55, 200], [1, 0]),
      null,
      0, g([0, 200], [0.3, 300], [1, 300]), 200, 200, g([0, 200], [0.5, 200], [1, 0]),
    ],
    hijaz: [
      0, g([0, 0], [0.15, 100], [0.35, 400], [1, 400]), 400, 500, g([0, 400], [0.4, 400], [0.7, 100], [1, 0]),
      null,
      0, g([0, 400], [0.25, 500], [0.6, 500], [0.75, 400], [1, 500]), 400, 400, g([0, 400], [0.35, 100], [1, 0]),
    ],
  };

  const PHRASES = [
    {
      id: 'takbir-open',
      arabic: 'اللهُ أَكْبَرُ، اللهُ أَكْبَرُ',
      translit: 'Allāhu akbar, Allāhu akbar',
      meaning: 'Allah is the Greatest, Allah is the Greatest',
      times: 2,
      timesNote: 'Said twice: four takbīrs in all',
      tips: [
        'Keep the opening "A" of Allāh short. Stretching it ("Āllāh") turns the statement into a question.',
        'Don\'t stretch the "ba" of akbar. "Akbār" is a different word (a drum).',
        'Give the double "l" in Allāh its full weight, and keep the "u" of Allāhu when you join the words.',
      ],
      breath: 'One breath for each pair.',
      ...TAKBIR,
    },
    {
      id: 'shahada-1',
      arabic: 'أَشْهَدُ أَنْ لَا إِلٰهَ إِلَّا اللهُ',
      translit: 'Ashhadu an lā ilāha illā-llāh',
      meaning: 'I bear witness that there is no god but Allah',
      times: 2,
      timesNote: 'Said twice',
      tips: [
        'Keep the "A" of Ashhadu short, for the same reason as Allāh.',
        'Let the "h" in ashhadu be heard. It is an ه, breathed, not swallowed.',
        'The long vowels in lā and illā carry the melody. This is where you lengthen.',
      ],
      breath: 'Breathe before "Ashhadu". Save air for "illā-llāh".',
      syl: [
        ['Ash', 0.35], ['ha', 0.3], ['du', 0.3], ['an', 0.35], ['lā', 1.2],
        ['i', 0.25], ['lā', 0.4], ['ha', 0.35], ['il', 0.35], ['lā', 1.2], ['llāh', 1.3],
      ],
      simple: [
        0, 0, 200, 200, g([0, 200], [0.3, 300], [1, 300]),
        200, 200, 200, 200, g([0, 300], [1, 200]), g([0, 200], [0.5, 200], [1, 0]),
      ],
      hijaz: [
        0, 100, 400, 400, g([0, 400], [0.3, 500], [1, 500]),
        400, 400, 100, 100, g([0, 400], [0.4, 500], [1, 400]), g([0, 100], [0.5, 100], [1, 0]),
      ],
    },
    {
      id: 'shahada-2',
      arabic: 'أَشْهَدُ أَنَّ مُحَمَّدًا رَسُولُ اللهِ',
      translit: 'Ashhadu anna Muḥammadan rasūlu-llāh',
      meaning: 'I bear witness that Muhammad is the Messenger of Allah',
      times: 2,
      timesNote: 'Said twice',
      tips: [
        'Anna has a doubled "n". Hold it for a moment.',
        'The "ḥ" in Muḥammad is a ح, a breathy sound from the throat, and the "m" is doubled.',
        'Lengthen the "sū" of rasūl, then land gently on Allāh.',
      ],
      breath: 'One breath for the whole line.',
      syl: [
        ['Ash', 0.35], ['ha', 0.3], ['du', 0.3], ['an', 0.3], ['na', 0.35], ['Mu', 0.3],
        ['ḥam', 0.4], ['ma', 0.3], ['dan', 0.45], ['ra', 0.3], ['sū', 1.2], ['lu', 0.35], ['llāh', 1.5],
      ],
      simple: [
        0, 0, 200, 200, 200, 300, 300, 200, 200, 200, g([0, 200], [0.3, 300], [1, 300]), 200,
        g([0, 200], [0.5, 200], [1, 0]),
      ],
      hijaz: [
        0, 100, 400, 400, 400, 500, 500, 400, 400, 400, g([0, 500], [0.3, 700], [0.7, 700], [1, 500]), 400,
        g([0, 100], [0.5, 100], [1, 0]),
      ],
    },
    {
      id: 'hayya-salah',
      arabic: 'حَيَّ عَلَى الصَّلَاةِ',
      translit: 'Ḥayya ʿala-ṣ-ṣalāh',
      meaning: 'Come to prayer',
      times: 2,
      timesNote: 'Said twice',
      tips: [
        'Start with a ح, not an English "h". Ḥayya also has a doubled "y".',
        'The ع of ʿalā comes from the throat. Don\'t let it become a plain "a".',
        'The ṣ of ṣalāh is heavy (ص). Stretch its "lā" and stop cleanly on the "h".',
      ],
      breath: 'Short line: breathe, then let the last word bloom.',
      syl: [['Ḥay', 0.45], ['ya', 0.6], ['ʿa', 0.3], ['laṣ', 0.4], ['ṣa', 0.4], ['lāh', 1.8]],
      simple: [200, 300, 200, 200, 200, g([0, 300], [0.4, 300], [0.7, 200], [1, 0])],
      hijaz: [400, 500, 400, 400, 400, g([0, 500], [0.35, 500], [0.6, 400], [0.8, 100], [1, 0])],
    },
    {
      id: 'hayya-falah',
      arabic: 'حَيَّ عَلَى الْفَلَاحِ',
      translit: 'Ḥayya ʿala-l-falāḥ',
      meaning: 'Come to success',
      times: 2,
      timesNote: 'Said twice',
      tips: [
        'Same opening as the last line: a throat ح and a doubled "y".',
        'Finish on a clear ح in falāḥ. Don\'t drop it to "falā".',
      ],
      breath: 'Breathe, then carry the long "lā" all the way to the ḥ.',
      syl: [['Ḥay', 0.45], ['ya', 0.6], ['ʿa', 0.3], ['lal', 0.4], ['fa', 0.4], ['lāḥ', 1.8]],
      simple: [200, 300, 300, 200, 200, g([0, 200], [0.5, 200], [1, 0])],
      hijaz: [400, 500, 500, 400, 400, g([0, 400], [0.4, 400], [0.7, 100], [1, 0])],
    },
    {
      id: 'fajr',
      fajrOnly: true,
      arabic: 'الصَّلَاةُ خَيْرٌ مِنَ النَّوْمِ',
      translit: 'Aṣ-ṣalātu khayrun mina-n-nawm',
      meaning: 'Prayer is better than sleep',
      times: 2,
      timesNote: 'Fajr only, said twice',
      tips: [
        'The "kh" in khayr is a خ, a soft scrape at the back of the mouth.',
        'The "n" doubles into nawm. Close gently on the "m".',
      ],
      breath: 'Before Fajr, warm up with a few gentle hums first.',
      syl: [
        ['Aṣ', 0.35], ['ṣa', 0.3], ['lā', 0.8], ['tu', 0.3], ['khay', 0.5], ['run', 0.35],
        ['mi', 0.3], ['nan', 0.4], ['nawm', 1.6],
      ],
      simple: [0, 200, 300, 200, 300, 200, 200, 200, g([0, 200], [0.5, 200], [1, 0])],
      hijaz: [0, 100, g([0, 400], [1, 500]), 400, 500, 400, 400, 100, g([0, 100], [0.5, 100], [1, 0])],
    },
    {
      id: 'takbir-close',
      arabic: 'اللهُ أَكْبَرُ، اللهُ أَكْبَرُ',
      translit: 'Allāhu akbar, Allāhu akbar',
      meaning: 'Allah is the Greatest, Allah is the Greatest',
      times: 1,
      timesNote: 'Said once, near the end',
      tips: [
        'The same care as the opening: a short first "A", no stretched "ba".',
        'You are near the end. Stay steady and don\'t rush.',
      ],
      breath: 'One breath for the pair.',
      ...TAKBIR,
    },
    {
      id: 'tahlil',
      arabic: 'لَا إِلٰهَ إِلَّا اللهُ',
      translit: 'Lā ilāha illā-llāh',
      meaning: 'There is no god but Allah',
      times: 1,
      timesNote: 'Said once to close the adhan',
      tips: [
        'Lengthen the first lā. It is the negation, said with conviction.',
        'Come home to your note on Allāh, calmly.',
      ],
      breath: 'A full breath. This line comes to rest.',
      syl: [['Lā', 1.2], ['i', 0.3], ['lā', 0.4], ['ha', 0.35], ['il', 0.35], ['lā', 1.0], ['llāh', 1.6]],
      simple: [g([0, 200], [0.3, 300], [1, 300]), 200, 200, 200, 200, 200, g([0, 200], [0.5, 200], [1, 0])],
      hijaz: [g([0, 400], [0.3, 500], [1, 500]), 400, 400, 100, 100, 100, g([0, 100], [0.5, 100], [1, 0])],
    },
  ];

  // Niyyah reminders. Citations are drafts pending scholarly review.
  const REMINDERS = [
    {
      text: 'Actions are only by intentions, and each person will have what they intended.',
      source: 'Ṣaḥīḥ al-Bukhārī 1; Ṣaḥīḥ Muslim 1907',
    },
    {
      text: 'No jinn, human or anything else hears the voice of the muezzin, as far as it reaches, except that it will bear witness for him on the Day of Resurrection.',
      source: 'Ṣaḥīḥ al-Bukhārī 609',
      note: 'Abū Saʿīd said this to a man who loved his sheep and the open desert: raise your voice in the adhan even there. Your first audience may be the trees and the walls.',
    },
    {
      text: 'The muezzins will have the longest necks of all people on the Day of Resurrection.',
      source: 'Ṣaḥīḥ Muslim 387',
    },
    {
      text: 'Among the first to be judged is a man who recited so that people would say "he is a reciter". It was said, and that was all he received.',
      source: 'Ṣaḥīḥ Muslim 1905 (paraphrased)',
      note: 'A beautiful voice is a trust. Ask Allah to keep it for Him.',
    },
    {
      text: 'If people knew what reward lies in the call to prayer and the first row, and found no way to get it except by drawing lots, they would draw lots.',
      source: 'Ṣaḥīḥ al-Bukhārī 615; Ṣaḥīḥ Muslim 437',
    },
    {
      text: 'Go and teach it to Bilāl, for his voice carries further than yours.',
      source: 'Sunan Abī Dāwūd 499',
      note: 'The first muezzin was chosen for a clear, strong voice. Strength and clarity can be trained. Fame was never the measure.',
    },
  ];

  const CLOSING = {
    ayah: {
      arabic: 'رَبَّنَا تَقَبَّلْ مِنَّا ۖ إِنَّكَ أَنتَ السَّمِيعُ الْعَلِيمُ',
      meaning: 'Our Lord, accept this from us. You are the All-Hearing, the All-Knowing.',
      source: 'Al-Baqarah 2:127',
    },
    duaAfterAdhan: {
      arabic:
        'اللَّهُمَّ رَبَّ هَذِهِ الدَّعْوَةِ التَّامَّةِ، وَالصَّلَاةِ الْقَائِمَةِ، آتِ مُحَمَّدًا الْوَسِيلَةَ وَالْفَضِيلَةَ، وَابْعَثْهُ مَقَامًا مَحْمُودًا الَّذِي وَعَدْتَهُ',
      meaning:
        'O Allah, Lord of this perfect call and the prayer about to be established, grant Muhammad al-Wasīlah and virtue, and raise him to the praised station You promised him.',
      source: 'Ṣaḥīḥ al-Bukhārī 614',
    },
    steps: [
      { id: 'home', label: 'At home, alone', text: 'Give the adhan for your next prayer at home, even if only the walls hear it.' },
      { id: 'family', label: 'For my family', text: 'Call your family to the next prayer you pray together.' },
      { id: 'musalla', label: 'A prayer room', text: 'Offer to give the adhan at a musallā, workplace or campus prayer room.' },
      { id: 'masjid', label: 'At the masjid', text: 'Ask the imam if you can give the adhan for a quieter prayer, like ʿAṣr.' },
    ],
  };

  /** Order of lines in a full adhan. */
  function adhanOrder(fajr) {
    const ids = [];
    for (const p of PHRASES) {
      if (p.fajrOnly && !fajr) continue;
      for (let i = 0; i < p.times; i++) ids.push(p.id);
    }
    return ids;
  }

  function phraseById(id) {
    return PHRASES.find((p) => p.id === id);
  }

  return { LEVELS, PHRASES, REMINDERS, CLOSING, adhanOrder, phraseById };
});
