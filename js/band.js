/* Over the Changes band: chord voicings, feels (comping rhythm, bass line, drums), and swing.
   Voicing code comes from Vocal Licks' Changes chapter. */
(function () {
  const T = window.VL.theory, mod = T.mod;
  const B = window.OTC_BAND = {};

  /* q = which Vocal Licks style picks the chord qualities; voicing = triad | rootless | shell;
     swing = 0 (straight), 8 (swung eighths), 16 (lightly swung sixteenths) */
  B.FEELS = {
    pads:     { name: "Piano pads",    q: "pop",    voicing: "triad",    swing: 0,  drums: false, blurb: "Each chord held for its full length with the root in the bass. Easiest to hear your pitch against." },
    pop:      { name: "Pop",           q: "pop",    voicing: "triad",    swing: 0,  drums: true,  blurb: "Half-note chords with a push into beat 3, a simple bass line, and a backbeat." },
    rock:     { name: "Rock",          q: "rock",   voicing: "triad",    swing: 0,  drums: true,  blurb: "Plain triads pumped in straight eighth notes over a driving root bass." },
    rockroll: { name: "Rock and roll", q: "blues",  voicing: "triad",    swing: 8,  drums: true,  blurb: "1950s shuffle: a boogie bass line walking up and back, offbeat piano stabs, and a snare backbeat." },
    blues:    { name: "Blues shuffle", q: "blues",  voicing: "triad",    swing: 8,  drums: true,  blurb: "Every major chord becomes a dominant 7, with a triplet shuffle and a walking blues bass." },
    neosoul:  { name: "Neo soul",      q: "rnb",    voicing: "rootless", swing: 16, drums: true,  blurb: "Rootless 9th chords, lazy sixteenth-note pushes, and a behind-the-beat groove." },
    neojazz:  { name: "Neo jazz",      q: "gospel", voicing: "rootless", swing: 0,  drums: true,  blurb: "Wide 9, 11, and 13 chords in syncopated stabs over a broken-beat groove. Straight sixteenths, modern jazz colors." },
    jazz:     { name: "Jazz swing",    q: "jazz",   voicing: "shell",    swing: 8,  drums: true,  blurb: "Two-note shells (3rd and 7th) in a Charleston rhythm, a walking bass, and a swing ride cymbal." },
    gospel:   { name: "Gospel",        q: "gospel", voicing: "rootless", swing: 0,  drums: true,  blurb: "Big 9, 11, and 13 chords with bass walk-ups into each change." },
    bossa:    { name: "Bossa nova",    q: "jazz",   voicing: "shell",    swing: 0,  drums: true,  blurb: "Brazilian syncopation: chord stabs off the beat, a root-and-fifth bass, and a rim-click clave." },
    ballad:   { name: "Ballad",        q: "rnb",    voicing: "rootless", swing: 0,  drums: false, blurb: "Slow broken chords in eighth notes over a held bass. Room to sing long notes." }
  };
  B.SOUNDS = B.FEELS;   // older name
  B.ORDER = ["pads", "ballad", "pop", "rock", "rockroll", "blues", "neosoul", "neojazz", "jazz", "gospel", "bossa"];

  /* ---------- voicings ---------- */
  function voiceTones(ch, feel) {
    const iv = T.QUAL[ch.q].map(x => mod(x));
    let set = [...new Set(iv)];
    const has = x => set.includes(x);
    if (feel.voicing === "rootless" && set.length > 3) set = set.filter(x => x !== 0);
    if (feel.voicing === "shell") {
      const third = has(4) ? 4 : has(3) ? 3 : null, sev = has(11) ? 11 : has(10) ? 10 : has(9) ? 9 : null;
      set = [third, sev].filter(x => x !== null); if (set.length < 2) set = [0, 7].concat(third !== null ? [third] : []);
    }
    if (set.length > 4 && has(7)) set = set.filter(x => x !== 7);
    if (set.length > 4) set = set.slice(0, 4);
    return set.map(x => mod(ch.root + x));
  }
  function voice(pcs, prev) {
    let best = null;
    for (let r = 0; r < pcs.length; r++) {
      const rot = pcs.slice(r).concat(pcs.slice(0, r));
      for (const L of [50, 53, 56]) {
        const out = [];
        rot.forEach((pc, i) => { let x = i === 0 ? L : out[i - 1] + 1; while (mod(x) !== pc) x++; out.push(x); });
        if (out[out.length - 1] > 76) continue;
        const mean = out.reduce((a, b) => a + b, 0) / out.length;
        let cost = Math.abs(mean - 62) * 0.4;
        if (prev) { const pm = prev.reduce((a, b) => a + b, 0) / prev.length; cost += Math.abs(mean - pm) * 1.2; }
        if (!best || cost < best.cost) best = { cost, out };
      }
    }
    return best.out;
  }
  B.voicings = function (chords, feelId) {
    const feel = B.FEELS[feelId] || B.FEELS.pads; let prev = null;
    return chords.map(ch => (prev = voice(voiceTones(ch, feel), prev)));
  };
  B.bassOf = pc => 40 + mod(pc - 4);

  /* ---------- swing: move offbeats later ---------- */
  B.swingT = function (x, swing) {
    if (!swing) return x;
    const i = Math.floor(x + 1e-9), f = x - i;
    if (swing === 8) {
      if (Math.abs(f - .5) < 1e-6) return i + 2 / 3;
      if (Math.abs(f - .25) < 1e-6) return i + 1 / 3;       // sixteenths inside a shuffle ride the triplet grid
      if (Math.abs(f - .75) < 1e-6) return i + 5 / 6;
      return x;
    }
    if (swing === 16) {
      if (Math.abs(f - .25) < 1e-6) return i + .29;
      if (Math.abs(f - .75) < 1e-6) return i + .79;
    }
    return x;
  };

  /* ---------- comping patterns, per 4/4 bar ----------
     chord hits: [beat, length, velocity]
     bass hits:  [beat, length, velocity, kind]  kind: r root, o octave, 5 fifth, 3 third, 6 sixth, b7 flat 7, a approach (half step into next root on the last bar), w whole step into next root */
  const PAT = {
    pop: { c: [[0, 1.9, .36], [1.5, .45, .22], [2, 1.9, .32]], b: [[0, 1.5, .55, "r"], [1.5, .5, .4, "r"], [2, 1, .45, "r"], [3.5, .5, .4, "5"]] },
    rock: { c: [[0, .45, .42], [.5, .4, .26], [1, .45, .32], [1.5, .4, .26], [2, .45, .38], [2.5, .4, .26], [3, .45, .32], [3.5, .4, .26]],
      b: [[0, .45, .55, "r"], [.5, .45, .42, "r"], [1, .45, .45, "r"], [1.5, .45, .42, "r"], [2, .45, .5, "r"], [2.5, .45, .42, "r"], [3, .45, .45, "r"], [3.5, .45, .42, "5"]] },
    rockroll: { c: [[.5, .3, .3], [1.5, .3, .34], [2.5, .3, .3], [3.5, .3, .34]],
      b: [[0, .45, .55, "r"], [.5, .45, .42, "3"], [1, .45, .5, "5"], [1.5, .45, .42, "6"], [2, .45, .5, "b7"], [2.5, .45, .42, "6"], [3, .45, .5, "5"], [3.5, .45, .42, "3"]] },
    blues: { c: [[0, .6, .32], [1.5, .3, .26], [2, .6, .3], [3.5, .3, .26]],
      b: [[0, .45, .5, "r"], [.5, .45, .4, "3"], [1, .45, .45, "5"], [1.5, .45, .4, "6"], [2, .45, .45, "b7"], [2.5, .45, .4, "6"], [3, .45, .45, "5"], [3.5, .45, .4, "3"]] },
    neosoul: { c: [[0, 1.6, .34], [1.75, .5, .24], [2.5, 1, .3], [3.75, .25, .22]], b: [[0, 1.4, .55, "r"], [1.75, .25, .35, "o"], [2.5, .9, .45, "r"], [3.5, .25, .32, "5"], [3.75, .25, .4, "a"]] },
    neojazz: { c: [[0, .7, .34], [1.5, .4, .26], [2.25, .35, .24], [2.75, .9, .3], [3.75, .25, .22]], b: [[0, 1.2, .55, "r"], [1.5, .5, .4, "5"], [2.75, .6, .45, "r"], [3.5, .5, .4, "a"]] },
    jazz: { c: [[0, .9, .32], [1.5, .4, .28], [3.5, .35, .2]], b: [[0, .9, .5, "r"], [1, .9, .42, "3"], [2, .9, .45, "5"], [3, .9, .42, "a"]] },
    gospel: { c: [[0, 1.4, .4], [1.5, .45, .3], [2, 1.4, .36], [3.5, .45, .3]], b: [[0, 1.5, .58, "r"], [2, .9, .45, "r"], [3, .45, .42, "w"], [3.5, .45, .42, "a"]] },
    bossa: { c: [[0, .45, .3], [1.5, .45, .28], [2.5, .45, .26], [3, .45, .24]], b: [[0, 1.4, .5, "r"], [1.5, .45, .4, "5"], [2, 1.4, .48, "r"], [3.5, .45, .4, "5"]] }
  };
  function bassNote(kind, bassR, nextR, third, lastBar) {
    if (kind === "r") return bassR;
    if (kind === "o") return bassR + 12;
    if (kind === "5") return bassR + 7;
    if (kind === "3") return bassR + third;
    if (kind === "6") return bassR + 9;
    if (kind === "b7") return bassR + 10;
    if (kind === "a") return lastBar ? (nextR > bassR ? nextR - 1 : nextR + 1) : bassR + 7;
    if (kind === "w") return lastBar ? nextR - 2 : bassR + 5;
    return bassR;
  }
  /* comp one chord of `beats` beats starting at t0 (seconds); b = seconds per beat */
  B.comp = function (tl, t0, beats, ch, next, feelId, b, voicing) {
    const feel = B.FEELS[feelId] || B.FEELS.pads;
    const bassR = B.bassOf(ch.root), nextR = B.bassOf(next.root);
    const third = T.QUAL[ch.q].includes(3) ? 3 : 4;
    const sw = x => B.swingT(x, feel.swing);
    if (feelId === "pads") {
      tl.note(t0, bassR, beats * b * .97, .5);
      tl.notes(t0, voicing, beats * b * .97, .36, .015);
      return;
    }
    if (feelId === "ballad") {
      tl.note(t0, bassR, beats * b * .97, .48);
      const arp = voicing.concat([voicing[0] + 12]);
      const seq = [0, 1, 2, 3, 2, 1, 0, 1];
      for (let k = 0; k < beats * 2; k++) {
        const m = arp[seq[k % seq.length] % arp.length];
        tl.note(t0 + k * .5 * b, m, Math.min(1.2, beats - k * .5) * b, k % 2 ? .24 : .3);
      }
      return;
    }
    const pat = PAT[feelId];
    for (let bar = 0; bar < beats; bar += 4) {
      const len = Math.min(4, beats - bar), last = bar + 4 >= beats;
      pat.c.forEach(([x, d, v]) => { if (x < len - 1e-6) tl.notes(t0 + (bar + sw(x)) * b, voicing, Math.min(d, len - x) * b, v, .012); });
      pat.b.forEach(([x, d, v, k]) => {
        if (x >= len - 1e-6) return;
        // in a short (2-beat) chord, the last bass note before the change still leads into the next root
        const lastHit = last && x + d >= len - .6;
        tl.note(t0 + (bar + sw(x)) * b, bassNote(lastHit && k !== "r" && k !== "o" ? "a" : k, bassR, nextR, third, last), Math.min(d, len - x) * b, v);
      });
    }
  };

  /* ---------- drums ----------
     [beat, drum, velocity] per 4/4 bar. k kick, s snare, r rim, h closed hat, o open hat, y ride, f hat foot */
  const DR = {
    pop: [[0, "k", .9], [1, "s", .7], [2, "k", .85], [2.5, "k", .5], [3, "s", .7]].concat([0, .5, 1, 1.5, 2, 2.5, 3, 3.5].map(x => [x, "h", x % 1 ? .35 : .5])),
    rock: [[0, "k", 1], [1, "s", .85], [2, "k", .9], [2.5, "k", .7], [3, "s", .85]].concat([0, .5, 1, 1.5, 2, 2.5, 3, 3.5].map(x => [x, "h", x % 1 ? .4 : .55])),
    rockroll: [[0, "k", .9], [1, "s", .75], [2, "k", .85], [3, "s", .8]].concat([0, .5, 1, 1.5, 2, 2.5, 3, 3.5].map(x => [x, "h", x % 1 ? .3 : .5])),
    blues: [[0, "k", .85], [1, "s", .65], [2, "k", .8], [3, "s", .7]].concat([0, .5, 1, 1.5, 2, 2.5, 3, 3.5].map(x => [x, "y", x % 1 ? .25 : .4])),
    neosoul: [[0, "k", .9], [1.75, "k", .55], [2.5, "k", .75], [1, "r", .6], [3, "r", .6]].concat([0, .25, .5, .75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75].map(x => [x, "h", x % .5 ? .14 : .3])),
    neojazz: [[0, "k", .85], [2.25, "k", .6], [2.75, "k", .45], [1, "s", .55], [3, "s", .6], [3.75, "s", .2]].concat([0, .5, 1, 1.5, 2, 2.5, 3, 3.5].map(x => [x, "h", x % 1 ? .22 : .32])).concat([[1.5, "o", .2]]),
    jazz: [[0, "y", .45], [1, "y", .5], [1.5, "y", .3], [2, "y", .45], [3, "y", .5], [3.5, "y", .3], [1, "f", .35], [3, "f", .35], [0, "k", .2]],
    gospel: [[0, "k", .95], [1, "s", .8], [2, "k", .85], [2.75, "k", .5], [3, "s", .85]].concat([0, .5, 1, 1.5, 2, 2.5, 3, 3.5].map(x => [x, "h", x % 1 ? .3 : .45])),
    bossa: [[0, "k", .6], [1.5, "k", .45], [2, "k", .6], [3.5, "k", .45], [0, "r", .5], [.75, "r", .45], [1.5, "r", .45], [2.5, "r", .5], [3.25, "r", .45]].concat([0, .5, 1, 1.5, 2, 2.5, 3, 3.5].map(x => [x, "h", .2]))
  };
  B.hasDrums = feelId => !!DR[feelId];
  /* drums for one loop of `beats` beats; a fill-ish crash of energy on the first bar */
  B.drums = function (tl, t0, beats, feelId, b) {
    const feel = B.FEELS[feelId], pat = DR[feelId];
    if (!pat) return;
    for (let bar = 0; bar < beats; bar += 4) {
      const len = Math.min(4, beats - bar);
      pat.forEach(([x, d, v]) => { if (x < len - 1e-6) tl.drum(t0 + (bar + B.swingT(x, feel.swing)) * b, d, v); });
    }
  };
})();
