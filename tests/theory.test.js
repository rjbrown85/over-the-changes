/* Run: node tests/theory.test.js */
const T = require("../js/theory.js");
const D2 = require("../js/data.js");
const { PROGRESSIONS } = D2;
let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL:", msg); } };
const nm = pc => T.SHARP[pc];

/* 1. The D7 question: which minor pentatonics fit a D dominant chord? */
const D7 = { root: 2, q: "7", fam: "dom", pcs: T.pcsOf(2, "7") };
const d7 = T.chordScale(D7, null, "major", 7);
ok(d7.mode === "mixolydian", "D7 in G is Mixolydian, got " + d7.mode);
const d7homes = d7.homes.map(h => nm(h.minorRoot) + ":" + h.tag);
ok(d7homes.includes("A:Bluesy"), "D7 offers A minor pent (bluesy): " + d7homes);
ok(d7homes.includes("B:Sweet"), "D7 offers B minor pent (sweet): " + d7homes);
ok(!d7.homes.some(h => h.kind === "pent" && h.minorRoot === 4), "D7 does not recommend E minor pent");
ok(d7.avoid.some(a => a.pc === 7), "D7 flags G (the 4th) as a note not to hold");

/* 2. Dm7 gets the whole-step-up Dorian color (E minor pent) */
const Dm7 = { root: 2, q: "m7", fam: "min", pcs: T.pcsOf(2, "m7") };
const dm7 = T.chordScale(Dm7, null, "major", 0);
ok(dm7.mode === "dorian", "Dm7 in C is Dorian");
ok(dm7.homes.some(h => h.minorRoot === 4 && h.tag === "Dorian color"), "Dm7 offers E minor pent as Dorian color");

/* 3. E7 in A minor is Phrygian dominant and the key pentatonic clashes */
const E7 = { root: 4, q: "7", fam: "dom", pcs: T.pcsOf(4, "7") };
const Am = { root: 9, q: "m7", fam: "min", pcs: T.pcsOf(9, "m7") };
const e7 = T.chordScale(E7, Am, "minor", 9);
ok(e7.mode === "phrygdom", "E7 -> Am is Phrygian dominant, got " + e7.mode);
const kh = T.keyHome("minor", 9);
const cl = T.clashes(kh, E7, e7);
ok(cl.some(c => c.pc === 7 && c.hard), "A minor pent's G clashes with E7's G#");

/* 4. Cmaj7: F is the avoid note */
const C = { root: 0, q: "maj7", fam: "maj", pcs: T.pcsOf(0, "maj7") };
const c = T.chordScale(C, null, "major", 0);
ok(c.avoid.some(a => a.pc === 5), "Cmaj7 avoids F");
ok(c.targets[0].pc === 4, "Cmaj7 first target is E (the 3rd)");

/* 4b. Wonderwall in E Dorian: the major IV (A) rubs against the key pentatonic's D */
const ww = PROGRESSIONS.find(p => p.id === "wonderwall");
const wctx = T.loopContext(ww, { key: 4, style: "rock", approach: "key", flavor: "sweet", lo: 50, hi: 72, bars: 1 });
ok(T.chordName(wctx.chords[3]) === "A", "Wonderwall IV in E is A major, got " + T.chordName(wctx.chords[3]));
ok(T.clashes(wctx.keyHome, wctx.chords[3], wctx.infos[3]).some(c => c.pc === 2) && wctx.infos[3].avoid.some(a => a.pc === 2), "Wonderwall: D rubs against A major's C# and is flagged as a note not to hold");
ok(!T.keyUsesFlats(4, "dorian"), "E Dorian spells with sharps");
/* 4c. Scale runs use the full scale: the five-note run over Am in C major includes B and F where it fits */
const five = D2.VOCAB.find(v => v.id === "fivemin");
const axis = PROGRESSIONS.find(p => p.id === "axis");
const actx = T.loopContext(axis, { key: 0, style: "rock", approach: "key", flavor: "sweet", lo: 50, hi: 74, bars: 1 });
const fsp = T.lockSpots({ id: "fivemin", kind: "scale", steps: five.steps, beats: five.beats }, actx, []);
ok(fsp.length > 0, "five-note run finds lock spots over the Axis");
ok(fsp.every(sp => sp.best.notes.every(n => actx.keyScale.includes(T.mod(n.midi)))), "five-note run stays in C major over the Axis in C");

/* 5. Every progression x style x key: homes fit, targets are chord tones, landings land */
const SHAPES = { qd: [0, -1, -2], sl: [-2, -1, 0], qdt: [0, -1, -2, -3], skip: [1, 0, -1, -2, -3] };
let combos = 0, altered = 0, landings = 0;
for (const p of PROGRESSIONS) {
  for (const style of Object.keys(T.STYLES)) {
    for (let key = 0; key < 12; key++) {
      const chords = p.chords.map(n => T.realize(T.parseNumeral(n), key, p.tonality, style));
      chords.forEach((ch, i) => {
        const next = chords[(i + 1) % chords.length];
        const info = T.chordScale(ch, next, p.tonality, key);
        combos++;
        ok(info.homes.length > 0, `${p.id}/${style}/${key}: ${T.chordName(ch)} has a riff home`);
        info.homes.forEach(h => { if (!h.blue) ok(h.pcs.every(pc => info.modePcs.includes(pc)), `${p.id}/${style}: home ${nm(h.minorRoot)} fits ${info.mode}`); });
        info.targets.forEach(t => ok(ch.pcs.includes(t.pc), "targets are chord tones"));
        info.avoid.forEach(a => ok(!ch.pcs.includes(a.pc), "avoid notes are not chord tones"));
        const nextInfo = T.chordScale(next, chords[(i + 2) % chords.length], p.tonality, key);
        for (const approach of ["key", "chord"]) {
          const home = approach === "key" ? T.keyHome(p.tonality, key) : T.pickHome(info, "sweet");
          for (const sh of Object.values(SHAPES)) {
            const r = T.landRiff(sh, home, nextInfo.targets, 50, 72, 60, null);
            landings++;
            ok(!!r, `${p.id}/${style}/${key}: riff lands somewhere`);
            if (!r) continue;
            if (r.altered) altered++;
            ok(next.pcs.includes(T.mod(r.notes[r.notes.length - 1])), `${p.id}: last note is a chord tone of ${T.chordName(next)}`);
            ok(r.notes.every(m => m >= 50 && m <= 72), "riff stays in range");
          }
        }
      });
    }
  }
}

/* 6. Arranger: every lock spot's best placement obeys the per-note rules */
const RIFFS = D2.ORDER.map(k => ({ id: k, kind: "pent", steps: D2.SETS.minor.blocks[k].n, beats: D2.SETS.minor.blocks[k].b }))
  .concat(D2.VOCAB.filter(v => v.land).map(v => ({ id: v.id, kind: v.kind, steps: v.steps, beats: v.beats })));
let spotsTotal = 0, gold = 0, chains = 0;
for (const p of PROGRESSIONS) {
  for (const style of ["rock", "rnb", "blues", "jazz"]) {
    for (const key of [0, 4, 7, 10]) {
      for (const approach of ["key", "chord"]) {
        const ctx = T.loopContext(p, { key, style, approach, flavor: "sweet", lo: 50, hi: 72, bars: 1 });
        for (const r of RIFFS) {
          const spots = T.lockSpots(r, ctx, []);
          spots.forEach(sp => {
            spotsTotal++; if (sp.rank === "gold") gold++;
            const c = sp.best;
            c.notes.forEach(nt => {
              ok(nt.midi >= 50 && nt.midi <= 72, "arranged note in range");
              const ci = T.chordIndexAt(ctx, nt.beat), info = ctx.infos[ci], ch = ctx.chords[ci], pc = T.mod(nt.midi);
              if (nt.last) ok(ch.pcs.includes(pc), `${p.id}: arranged riff ends on a chord tone`);
              else if (nt.dur >= 0.5 && !nt.alt) {
                ok(info.modePcs.includes(pc) || ch.pcs.includes(pc), `${p.id}/${style}: held note fits its chord's mode`);
                ok(!info.avoid.some(a => a.pc === pc), `${p.id}/${style}: held note is not an avoid note`);
              }
            });
          });
        }
        const items = T.suggestChain(RIFFS.filter(r => ["qd", "sl", "qdt", "sw", "skip", "turn"].includes(r.id)), ctx, []);
        let prevEnd = -1, prevLast = null;
        items.sort((a, b) => a.start - b.start).forEach(it => {
          const r = RIFFS.find(x => x.id === it.rid);
          const pl = T.placeItem(r, it.start, ctx, prevLast, 0);
          ok(!!pl, `${p.id}: suggested riff has a placement`);
          if (!pl) return;
          const [a, b] = T.riffSpan(pl);
          ok(a >= prevEnd - 1e-6, `${p.id}/${style}/${approach}: suggested riffs don't overlap`);
          if (prevLast != null && Math.abs(pl.first - prevLast) <= 2 && a - prevEnd <= 1) chains++;
          prevEnd = b; prevLast = pl.lastMidi;
        });
      }
    }
  }
}
console.log(`Arranger: ${spotsTotal} lock spots checked (${gold} gold), ${chains} chained joins in suggestions.`);
console.log(`${checks} checks, ${fails} failures. ${combos} chord contexts, ${landings} landings (${altered} needed a bent last note).`);
process.exit(fails ? 1 : 0);
