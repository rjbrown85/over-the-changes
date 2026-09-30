/* Over the Changes band: chord voicings and the two accompaniment feels (from Vocal Licks' Changes chapter). */
(function () {
  const T = window.VL.theory, mod = T.mod;
  const B = window.OTC_BAND = {};

  /* the two sounds. q = which Vocal Licks style picks the chord qualities */
  B.SOUNDS = {
    pads: { name: "Piano pads", q: "pop", voicing: "triad", blurb: "Each chord held for its full length with the root in the bass. Easiest to hear your pitch against." },
    rnb: { name: "R&B keys", q: "rnb", voicing: "rootless", blurb: "9th chords without the root and a laid-back bass line. Closer to a real track." }
  };

  function voiceTones(ch, sound) {
    const iv = T.QUAL[ch.q].map(x => mod(x));
    let set = [...new Set(iv)];
    if (sound.voicing === "rootless" && set.length > 3) set = set.filter(x => x !== 0);
    if (set.length > 4 && set.includes(7)) set = set.filter(x => x !== 7);
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
  B.voicings = function (chords, soundId) {
    const sound = B.SOUNDS[soundId]; let prev = null;
    return chords.map(ch => (prev = voice(voiceTones(ch, sound), prev)));
  };
  B.bassOf = pc => 40 + mod(pc - 4);

  /* [beat, length, velocity(, bass kind)] per 4/4 bar */
  const RNB = {
    c: [[0, 2.3, .34], [2.75, 1.1, .26]],
    b: [[0, 1.4, .55, "r"], [1.75, .25, .35, "o"], [2.5, 1, .45, "r"], [3.75, .25, .4, "a"]]
  };
  /* comp one chord of `beats` beats starting at t0 (seconds); b = seconds per beat */
  B.comp = function (tl, t0, beats, ch, next, soundId, b, voicing) {
    const bassR = B.bassOf(ch.root), nextR = B.bassOf(next.root);
    if (soundId === "pads") {
      tl.note(t0, bassR, beats * b * .97, .5);
      tl.notes(t0, voicing, beats * b * .97, .36, .015);
      return;
    }
    for (let bar = 0; bar < beats; bar += 4) {
      const len = Math.min(4, beats - bar), last = bar + 4 >= beats;
      RNB.c.forEach(([x, d, v]) => { if (x < len) tl.notes(t0 + (bar + x) * b, voicing, Math.min(d, len - x) * b, v, .012); });
      RNB.b.forEach(([x, d, v, k]) => {
        if (x >= len) return;
        const m = k === "r" ? bassR : k === "o" ? bassR + 12 : last ? nextR - 1 : bassR + 7;
        tl.note(t0 + (bar + x) * b, m, Math.min(d, len - x) * b, v);
      });
    }
  };
})();
