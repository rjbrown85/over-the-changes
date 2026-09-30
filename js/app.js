/* Over the Changes: one screen. A progression loops on piano; you sing scales or licks over it, place licks on the
   changes, move them, and drill them. Theory (chord scales, landing, lock spots) is Vocal Licks' theory.js. */
(function () {
  "use strict";
  const T = window.VL.theory, D = window.VL.data, A = window.OTC_AUDIO, B = window.OTC_BAND, mod = T.mod;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  /* ---------- settings ---------- */
  const DEF = { prog: "axis", key: 7, style: "pop", feels: {}, drums: true, lead: "piano", bars: 1, src: "licks", pattern: "five", drill: "same", mode: "listen", loops: 4, tool: "licks", grid: .25, noteLen: 1,
    tempo: 70, lo: 52, hi: 72, approach: "key", click: true, synth: false, shelf: "blocks" };
  const S = Object.assign({}, DEF, store.get("otc-settings", {}));
  const saveS = () => store.set("otc-settings", S);

  /* ---------- licks: her five blocks, plus the Vocal Licks licks and runs that land on a chord tone ---------- */
  const velOf = (r, j, n) => r.vel ? r.vel[j] : (j === 0 ? .9 : j === n - 1 ? .75 : .8);
  const RIFFS = (() => {
    const blocks = D.ORDER.map(k => ({ id: k, name: D.BLOCKS[k].name, kind: "pent", steps: D.SETS.minor.blocks[k].n, beats: D.SETS.minor.blocks[k].b,
      vel: D.SETS.minor.blocks[k].v, c: D.BLOCKS[k].c, on: D.BLOCKS[k].on, desc: `${D.BLOCKS[k].rhythm}. ${D.BLOCKS[k].tip}` }));
    const mk = v => ({ id: v.id, name: v.changesName || v.name, kind: v.kind, steps: v.steps, beats: v.beats, vel: null, c: v.c, on: /blue/.test(v.c) ? "#fff" : "var(--ink)", desc: v.desc });
    const licks = D.VOCAB.filter(v => v.land && v.cat !== "run").map(mk);
    const runs = D.VOCAB.filter(v => v.land && v.cat === "run").map(mk);
    return { blocks, licks, runs, all: blocks.concat(licks, runs) };
  })();
  const riffById = id => RIFFS.all.find(r => r.id === id) || null;

  /* ---------- scale patterns (Scales mode) ---------- */
  const PATTERNS = {
    five: { name: "Five-note scale", c: "var(--green)", desc: "1 2 3 4 5 4 3 2 in eighth notes on each chord's own scale, starting on the chord's root." },
    pent: { name: "Pentatonic", c: "var(--blue)", desc: "Up and down the pentatonic that fits each chord, starting on a chord tone." },
    arp: { name: "Arpeggio", c: "var(--orange)", desc: "Chord tones only: root, 3rd, 5th, 7th, and back down. Trains your ear to hear where the chord lives." },
    guide: { name: "Guide tones", c: "var(--pink)", desc: "Hold the 3rd, then the 7th, of each chord (the root when the chord has no 7th). The 3rd and 7th are the notes that name the chord." }
  };

  /* ---------- progressions: the Vocal Licks 51 plus your own ---------- */
  const TONS = ["major", "minor", "dorian", "mixolydian", "blues"];
  const validProg = c => { try { c.chords.forEach(T.parseNumeral); return c.chords.length >= 2 && c.chords.length <= 8 && TONS.includes(c.tonality); } catch (e) { return false; } };
  let customs = store.get("otc-custom-progs", []).filter(validProg);
  function mergeCustoms() {
    for (let i = D.PROGRESSIONS.length - 1; i >= 0; i--) if (D.PROGRESSIONS[i].custom) D.PROGRESSIONS.splice(i, 1);
    customs.forEach(c => D.PROGRESSIONS.push(Object.assign({ group: "My progressions", custom: true, note: "Your own progression.", src: null }, c)));
  }
  mergeCustoms();
  const saveCustoms = () => store.set("otc-custom-progs", customs);
  const progObj = () => D.PROGRESSIONS.find(p => p.id === S.prog) || D.PROGRESSIONS[0];
  /* each progression remembers its own feel; until you pick one it gets a feel that suits its era */
  function defaultFeel(p) {
    if (p.tonality === "blues") return "blues";
    return { "Pop & R&B": "neosoul", "Rock & blues": "rock", "'50s classics": "rockroll", "'60s classics": "pop", "'70s classics": "pop" }[p.group] || "pads";
  }
  const feelFor = p => (B.FEELS[S.feels[p.id]] ? S.feels[p.id] : defaultFeel(p));
  const syncFeel = () => { S.style = feelFor(progObj()); };

  /* ---------- arrangements: a working copy per progression, plus saved ones ---------- */
  let work = store.get("otc-work", {}), saved = store.get("otc-saved", []);
  if (typeof work !== "object" || Array.isArray(work) || !work) work = {};
  if (!Array.isArray(saved)) saved = [];
  /* your own notes, per progression: {beat, dur, midi} */
  let notesWork = store.get("otc-notes", {});
  if (typeof notesWork !== "object" || Array.isArray(notesWork) || !notesWork) notesWork = {};
  const persist = () => { store.set("otc-work", work); store.set("otc-saved", saved); store.set("otc-notes", notesWork); };
  const items = () => (work[S.prog] = (work[S.prog] || []).filter(it => riffById(it.rid)));
  const setItems = arr => { work[S.prog] = arr; persist(); };
  const okNote = n => n && isFinite(n.beat) && isFinite(n.dur) && isFinite(n.midi) && n.dur > 0;
  const myNotes = () => (notesWork[S.prog] = (notesWork[S.prog] || []).filter(okNote));
  const setMyNotes = arr => { notesWork[S.prog] = arr; persist(); };
  const cloneItems = arr => arr.map(i => Object.assign({}, i, i.skip ? { skip: i.skip.slice() } : {}));
  const cloneNotes = arr => arr.map(n => ({ beat: n.beat, dur: n.dur, midi: n.midi }));
  let undoStack = [], undoProg = null;
  function snap() {
    if (undoProg !== S.prog) { undoStack = []; undoProg = S.prog; }
    undoStack.push({ items: cloneItems(items()), notes: cloneNotes(myNotes()) }); if (undoStack.length > 60) undoStack.shift();
  }
  function undo() {
    const prev = undoStack.pop(); if (!prev) return;
    work[S.prog] = prev.items; notesWork[S.prog] = prev.notes; persist();
    selItem = null; selNote = null; changed(true);
  }
  /* a starter so the first view shows what the lane does */
  const needSeed = !store.get("otc-seeded", false) && !work[S.prog];

  /* ---------- names ---------- */
  const flats = C => T.keyUsesFlats(S.key, C.prog.tonality);
  const cs = (ch, pc, fl) => T.spellRel(ch.root, T.spell(ch.root, fl), pc, ch.fam === "dim" || ch.fam === "hdim");
  const pitch = (m, fl) => T.spell(m, fl) + (Math.floor(m / 12) - 1);
  function homeName(h, fl) {
    if (h.kind === "arp") return `${T.spell(h.minorRoot, fl)} chord tones`;
    if (h.kind === "blues") return `${T.spell(h.minorRoot, fl)} blues scale`;
    return `${T.spell(h.minorRoot, fl)} minor pentatonic`;
  }
  const lenLabel = b => b === 2 ? "½ bar" : b === 4 ? "1 bar" : b === 8 ? "2 bars" : `${b} beats`;
  const numerals = prog => prog.chords.map(x => T.parseNumeral(x).text).join(" – ");

  /* ---------- compute one loop ---------- */
  const WALK = [0, 1, 2, 1, 0, -1, -2, -1];
  const SHIFT = [0, .5, 1, 1.5];
  function ctxNow() {
    return T.loopContext(progObj(), { key: S.key, style: B.SOUNDS[S.style].q, approach: S.approach, flavor: "sweet", lo: S.lo, hi: S.hi, bars: S.bars });
  }
  function placeLicks(ctx, p) {
    const its = items().slice().sort((a, b) => a.start - b.start);
    const off = S.drill === "walk" ? WALK[p % WALK.length] : 0;
    const sh = S.drill === "shift" ? SHIFT[p % SHIFT.length] : 0;
    const out = []; let skipped = 0;
    its.forEach(it => {
      const r = riffById(it.rid), prev = out[out.length - 1], start = it.start + sh;
      const prevLast = prev && start - prev.span[1] <= .5 + 1e-6 && start >= prev.span[1] - 1e-6 ? prev.lastMidi : null;
      const pl = T.placeItem(r, start, ctx, prevLast, (it.nudge || 0) + off);
      if (!pl) { skipped++; return; }
      const span = T.riffSpan(pl);
      if (prev && span[0] < prev.span[1] - 1e-6) { skipped++; return; }
      out.push({ item: it, riff: r, c: r.c, on: r.on, rank: pl.rank, target: pl.target, landChord: pl.landChord, span, lastMidi: pl.lastMidi,
        chain: prevLast != null && Math.abs(pl.first - prevLast) <= 2, nudgeMin: pl.nudgeMin, nudgeMax: pl.nudgeMax,
        notes: pl.notes.map((n, j) => Object.assign({}, n, { j, muted: !!(it.skip && it.skip.includes(j)), vel: velOf(r, j, pl.notes.length) })) });
    });
    return { placed: out, skipped, off, sh };
  }
  /* chord tones without the 9, 11, and 13 */
  const arpPcs = ch => [...new Set(T.QUAL[ch.q].filter(x => x < 12).map(x => mod(ch.root + x)))];
  /* the 3rd and the 7th (the 6th on a 6 or dim7 chord); a triad gets the 3rd and the root */
  function guideTones(ch, info) {
    const find = ivs => { for (const iv of ivs) { const t = info.targets.find(x => x.iv === iv); if (t) return t; } return null; };
    const third = find([4, 3]) || info.targets[0], sev = find([10, 11, 9]) || find([0]) || info.targets[1] || third;
    return [third, sev];
  }
  function placeScales(ctx) {
    const pat = PATTERNS[S.pattern] || PATTERNS.five, placed = [];
    let prevLast = null;
    ctx.chords.forEach((ch, i) => {
      const beats = ctx.beats[i], t0 = ctx.starts[i], info = ctx.infos[i];
      let notes = null;
      if (S.pattern === "guide") {
        const tg = guideTones(ch, info);
        const n = beats >= 4 ? 2 : 1, d = beats / n;
        notes = []; let ref = prevLast != null ? prevLast : ctx.center;
        for (let k = 0; k < n; k++) {
          const pc = tg[k % tg.length].pc;
          let best = null;
          for (let m = ctx.lo; m <= ctx.hi; m++) if (mod(m) === pc && (best === null || Math.abs(m - ref) + Math.abs(m - ctx.center) * .3 < Math.abs(best - ref) + Math.abs(best - ctx.center) * .3)) best = m;
          if (best === null) continue;
          notes.push({ beat: t0 + k * d, dur: d, midi: best, vel: .78, last: k === n - 1 });
          ref = best;
        }
      } else {
        const pcs = S.pattern === "five" ? info.modePcs : S.pattern === "arp" ? arpPcs(ch) : (S.approach === "key" ? ctx.keyHome : ctx.homes[i]).pcs;
        const lad = T.ladder(pcs, ctx.lo, ctx.hi), count = Math.max(1, Math.round(beats * 2));
        const tops = []; for (let top = Math.min(4, Math.max(1, Math.round(beats))); top >= 1; top--) tops.push(top);
        // first try to start on the root (a chord tone for the pentatonic), shrinking the run if the range is tight; then anything
        for (const strict of [true, false]) for (const top of tops) {
          if (notes) break;
          let best = null;
          for (let j = 0; j + top < lad.length; j++) {
            const pc = mod(lad[j]);
            if (strict && (S.pattern === "pent" ? !ch.pcs.includes(pc) : pc !== ch.root)) continue;
            const pen = pc === ch.root ? 0 : ch.pcs.includes(pc) ? (S.pattern === "pent" ? 1 : 6) : 12;
            const mean = (lad[j] + lad[j + top]) / 2;
            const sc = pen + Math.abs(mean - ctx.center) + (prevLast != null ? Math.abs(lad[j] - prevLast) * .3 : 0);
            if (!best || sc < best.sc) best = { sc, j };
          }
          if (!best) continue;
          const period = 2 * top;
          notes = [];
          for (let k = 0; k < count; k++) {
            const pos = k % period, idx = pos <= top ? pos : period - pos;
            notes.push({ beat: t0 + k * .5, dur: .5, midi: lad[best.j + idx], vel: k % 2 ? .72 : .82, last: k === count - 1 });
          }
        }
      }
      if (!notes || !notes.length) return;
      prevLast = notes[notes.length - 1].midi;
      const L = notes[notes.length - 1];
      placed.push({ riff: { name: pat.name }, c: pat.c, on: "var(--ink)", notes, span: [notes[0].beat, L.beat + L.dur], lastMidi: prevLast, chordIndex: i });
    });
    return { placed, skipped: 0 };
  }
  function compute(p) {
    const ctx = ctxNow(), prog = progObj();
    const r = S.src === "scales" ? placeScales(ctx) : placeLicks(ctx, p || 0);
    r.mine = S.src === "scales" ? [] : myNotes().filter(n => n.beat < ctx.loopBeats - 1e-6)
      .map(n => ({ beat: n.beat, dur: Math.min(n.dur, ctx.loopBeats - n.beat), midi: n.midi, vel: .82, own: true, ref: n }));
    let i = 0; r.placed.forEach(pl => pl.notes.forEach(n => { n.i = i++; })); r.mine.forEach(n => { n.i = i++; });
    const C = Object.assign({ ctx, prog, p: p || 0 }, r);
    C.fl = flats(C);
    return C;
  }

  /* ---------- state for drawing ---------- */
  let lastC = null, laneC = null, cur = 0;
  let selRid = null, selItem = null, selNote = null, preview = null, drag = null, ndrag = null, spotCache = [], geom = null, fillMsg = null;
  const SPOT_H = 34, HEAD = 32;
  const ROW = () => (matchMedia("(pointer:coarse)").matches ? 17 : 14);   // one row per half step
  const writing = () => S.src === "licks" && S.tool === "notes";

  /* ---------- the changes panel ---------- */
  function drawProgPanel(C) {
    const { prog, ctx, fl } = C;
    $("#progLine").textContent = `${numerals(prog)} in ${T.spell(S.key, fl)} ${T.TONALITY[prog.tonality].label}`;
    const src = prog.src ? ` Source: <a href="${esc(prog.src.u)}" target="_blank" rel="noopener">${esc(prog.src.t)}</a>.` : "";
    $("#progNote").innerHTML = `${esc(prog.note || "")}${src}`;
    $("#feelNote").textContent = `${B.FEELS[S.style].name}: ${B.FEELS[S.style].blurb}`;
    $("#pbEdit").hidden = !prog.custom;
    const cards = $("#cards"); cards.innerHTML = "";
    ctx.chords.forEach((ch, i) => {
      const info = ctx.infos[i];
      const card = document.createElement("button");
      card.type = "button"; card.className = "ccard";
      card.setAttribute("aria-label", `${T.chordName(ch, fl)}. Tap to hear it.`);
      const b = ctx.beats[i];
      card.innerHTML = `<span class="cnum">${esc(ch.num.text)}${b !== 4 ? `<small>${lenLabel(b)}</small>` : ""}</span><span class="csym">${esc(T.chordName(ch, fl))}</span>
        <span class="cmode">${esc(T.spell(ch.root, fl))} ${esc(info.modeName)}</span>
        <span class="crow"><b>Sing</b> ${esc(singText(C, i))}</span>
        <span class="crow"><b>Land</b> ${info.targets.slice(0, 3).map(t => `${esc(cs(ch, t.pc, fl))}<sup>${t.label}</sup>`).join(" · ")}</span>
        ${info.avoid.length ? `<span class="crow"><b>Don't hold</b> ${info.avoid.map(a => `${esc(cs(ch, a.pc, fl))}<sup>${a.label}</sup>`).join(" · ")}</span>` : ""}`;
      card.onclick = () => { cur = i; markStatic(i); audition(i); };
      cards.appendChild(card);
    });
    markStatic(Math.min(cur, ctx.n - 1));
  }
  function singText(C, i) {
    const { ctx, fl } = C, ch = ctx.chords[i], info = ctx.infos[i];
    if (S.src === "scales") {
      if (S.pattern === "five") return `${T.spell(ch.root, fl)} ${info.modeName}`;
      if (S.pattern === "arp") return `${T.chordName(ch, fl)} chord tones`;
      if (S.pattern === "guide") return guideTones(ch, info).map(t => `${cs(ch, t.pc, fl)} (${t.label})`).join(" then ");
    }
    return homeName(S.approach === "key" ? ctx.keyHome : ctx.homes[i], fl);
  }
  function mapSet(C, i) {
    const { ctx } = C, ch = ctx.chords[i], info = ctx.infos[i];
    if (S.src === "scales" && S.pattern === "five") return info.modePcs;
    if (S.src === "scales" && S.pattern === "arp") return arpPcs(ch);
    if (S.src === "scales" && S.pattern === "guide") return guideTones(ch, info).map(t => t.pc);
    return (S.approach === "key" ? ctx.keyHome : ctx.homes[i]).pcs;
  }
  function drawMap(C, i) {
    if (!C || i < 0) return;
    const { ctx, fl } = C, info = ctx.infos[i], ch = ctx.chords[i], set = mapSet(C, i);
    const el = $("#kbd"); el.innerHTML = "";
    const lo = S.lo, hi = S.hi, blk = [1, 3, 6, 8, 10];
    const whites = []; for (let m = lo; m <= hi; m++) if (!blk.includes(mod(m))) whites.push(m);
    const w = 100 / whites.length;
    const tset = info.targets.slice(0, 3).map(t => t.pc), aset = info.avoid.map(a => a.pc);
    const cls = m => { const pc = mod(m), c = []; if (set.includes(pc)) c.push("in"); if (tset.includes(pc)) c.push("tgt"); if (aset.includes(pc)) c.push("avd"); return c.join(" "); };
    whites.forEach(m => { const k = document.createElement("div"); k.className = "wk " + cls(m); k.innerHTML = `<span>${T.spell(m, fl)}</span>`; el.appendChild(k); });
    for (let m = lo; m <= hi; m++) {
      if (!blk.includes(mod(m))) continue;
      const idx = whites.indexOf(m - 1); if (idx < 0) continue;
      const k = document.createElement("div"); k.className = "bk " + cls(m);
      k.style.left = ((idx + 1) * w - w * .32) + "%"; k.style.width = (w * .64) + "%";
      k.innerHTML = `<span>${T.spell(m, fl)}</span>`; el.appendChild(k);
    }
    $("#mapTitle").textContent = `${T.chordName(ch, fl)}: sing ${singText(C, i)}. Your range, ${pitch(lo, fl)} to ${pitch(hi, fl)}.`;
  }
  function markStatic(i) {
    document.querySelectorAll("#cards .ccard").forEach((c, k) => c.classList.toggle("sel", k === i));
    drawMap(lastC, i);
  }
  function markChord(i) {
    document.querySelectorAll("#cards .ccard").forEach((c, k) => c.classList.toggle("now", k === i));
    document.querySelectorAll("#lane .lchord").forEach((c, k) => c.classList.toggle("now", k === i));
    if (i >= 0) { cur = i; markStatic(i); }
  }
  function audition(i) {
    if (A.isRunning()) return;
    const C = lastC, ch = C.ctx.chords[i], tl = A.timeline();
    const v = B.voicings([ch], S.style)[0];
    tl.note(0, B.bassOf(ch.root), 2.4, .5); tl.notes(0, v, 2.4, .42, .02); tl.end = 2.6;
    A.run(tl, { test: true });
    setStatus(T.chordName(ch, C.fl), `${T.spell(ch.root, C.fl)} ${C.ctx.infos[i].modeName}`);
  }

  /* ---------- the lane: a piano roll, one row per half step, with a keyboard on the left ---------- */
  const BLACK = [1, 3, 6, 8, 10];
  function laneGeom(C) {
    const wrap = $("#laneWrap"), avail = wrap.clientWidth - 2, row = ROW();
    const px = Math.max(30, avail > 0 ? avail / C.ctx.loopBeats : 30);
    const bottom = S.src === "licks" && !writing() ? SPOT_H : 0;
    return { px, lo: S.lo, hi: S.hi, row, bottom, H: HEAD + (S.hi - S.lo + 1) * row + bottom };
  }
  const rowTop = m => HEAD + (geom.hi - m) * geom.row;
  function placeBrick(el, nt) {
    el.style.left = (nt.beat * geom.px + 1) + "px"; el.style.width = Math.max(7, nt.dur * geom.px - 2) + "px";
    el.style.top = (rowTop(nt.midi) + 1) + "px"; el.style.height = (geom.row - 2) + "px";
  }
  function drawKeys(fl) {
    const k = $("#keys"); k.innerHTML = ""; k.style.height = geom.H + "px";
    const head = document.createElement("div"); head.className = "khead"; head.style.height = HEAD + "px"; k.appendChild(head);
    for (let m = geom.hi; m >= geom.lo; m--) {
      const b = document.createElement("button"); b.type = "button";
      const blk = BLACK.includes(mod(m));
      b.className = "key " + (blk ? "kb" : "kw") + (mod(m) === 0 ? " kc" : "");
      b.style.height = geom.row + "px";
      b.textContent = blk ? "" : (mod(m) === 0 ? pitch(m, fl) : T.spell(m, fl));
      b.setAttribute("aria-label", pitch(m, fl)); b.title = pitch(m, fl);
      b.onclick = () => hearNote(m);
      k.appendChild(b);
    }
  }
  function drawLane(C) {
    laneC = C;
    const lane = $("#lane"); lane.innerHTML = "";
    geom = laneGeom(C);
    const { px, row } = geom, { ctx, fl } = C, licks = S.src === "licks", write = writing();
    lane.style.width = (ctx.loopBeats * px) + "px"; lane.style.height = geom.H + "px";
    lane.classList.toggle("writing", write);
    lane.style.setProperty("--row", row + "px"); lane.style.setProperty("--head", HEAD + "px");
    drawKeys(fl);
    // black-key rows and C lines
    for (let m = geom.hi; m >= geom.lo; m--) {
      if (!BLACK.includes(mod(m)) && mod(m) !== 0) continue;
      const r = document.createElement("div"); r.className = BLACK.includes(mod(m)) ? "lrow blk" : "lrow cline";
      r.style.top = rowTop(m) + "px"; r.style.height = row + "px"; lane.appendChild(r);
    }
    ctx.chords.forEach((ch, i) => {
      const seg = document.createElement("div"); seg.className = "lchord";
      seg.style.left = (ctx.starts[i] * px) + "px"; seg.style.width = (ctx.beats[i] * px) + "px";
      seg.innerHTML = `<span>${esc(T.chordName(ch, fl))}</span>`;
      lane.appendChild(seg);
      for (let k = 1; k < ctx.beats[i]; k++) { const bt = document.createElement("div"); bt.className = "lbeat"; bt.style.left = ((ctx.starts[i] + k) * px) + "px"; lane.appendChild(bt); }
      // while writing, tint the rows: chord tones pink, the rest of the scale blue
      if (write) {
        const set = mapSet(C, i), tones = arpPcs(ch);
        for (let m = geom.lo; m <= geom.hi; m++) {
          const pc = mod(m), tone = tones.includes(pc);
          if (!tone && !set.includes(pc)) continue;
          const t = document.createElement("div"); t.className = "tint " + (tone ? "tone" : "scale");
          t.style.left = (ctx.starts[i] * px) + "px"; t.style.width = (ctx.beats[i] * px) + "px";
          t.style.top = rowTop(m) + "px"; t.style.height = row + "px"; lane.appendChild(t);
        }
      }
    });
    C.placed.forEach(pl => pl.notes.forEach(nt => {
      const b = document.createElement("div");
      b.className = "brick lk" + (nt.last ? " last" : "") + (nt.alt ? " alt" : "") + (nt.muted ? " muted" : "") + (pl.item && pl.item === selItem ? " picked" : "");
      b.dataset.i = nt.i;
      b.style.setProperty("--c", pl.c); b.style.setProperty("--on", pl.on);
      placeBrick(b, nt);
      b.textContent = nt.dur * px > 22 ? T.spell(nt.midi, fl) : "";
      b.title = pitch(nt.midi, fl) + (nt.muted ? " (muted: tap to bring it back)" : nt.last ? " (landing note)" : "");
      if (write && pl.item) {
        b.setAttribute("role", "button"); b.tabIndex = 0;
        b.setAttribute("aria-label", `${pl.riff.name} note ${pitch(nt.midi, fl)}. ${nt.muted ? "Muted. Activate to bring it back." : "Activate to mute it."}`);
        b.onclick = () => toggleMute(pl.item, nt.j);
        b.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleMute(pl.item, nt.j); } };
      }
      lane.appendChild(b);
    }));
    (C.mine || []).forEach(nt => {
      const b = document.createElement("div");
      b.className = "brick own" + (nt.ref === selNote ? " picked" : "");
      b.dataset.i = nt.i; b.dataset.own = myNotes().indexOf(nt.ref);
      placeBrick(b, nt);
      b.textContent = nt.dur * px > 22 ? T.spell(nt.midi, fl) : "";
      b.title = `${pitch(nt.midi, fl)}, your note`;
      if (write) { b.tabIndex = 0; b.setAttribute("role", "button"); b.setAttribute("aria-label", `Your note ${pitch(nt.midi, fl)} at ${fmtBeat(nt.beat)}, ${fmtLen(nt.dur)}. Arrow keys move it, Shift plus arrows changes its length, Delete removes it.`); }
      const hdl = document.createElement("i"); hdl.className = "rs"; b.appendChild(hdl);
      lane.appendChild(b);
    });
    const ph = document.createElement("div"); ph.className = "playhead"; ph.id = "playhead"; ph.hidden = !A.isRunning(); lane.appendChild(ph);
    if (!licks || write) return;
    C.placed.forEach(pl => {
      const lo = Math.min(...pl.notes.map(n => n.midi)), hi = Math.max(...pl.notes.map(n => n.midi));
      const h = document.createElement("button"); h.type = "button"; h.className = "grab" + (pl.item === selItem ? " sel" : "");
      h.style.left = (pl.span[0] * px - 2) + "px"; h.style.width = ((pl.span[1] - pl.span[0]) * px + 4) + "px";
      h.style.top = (rowTop(hi) - 3) + "px"; h.style.height = ((hi - lo + 1) * row + 6) + "px";
      h.setAttribute("aria-label", `${pl.riff.name} at ${fmtBeat(pl.span[0])}, ${landText(C, pl)}. Arrow keys move it, Delete removes it.`);
      h.onpointerdown = e => startItemDrag(e, pl.item);
      h.onkeydown = e => itemKey(e, pl.item);
      h.onclick = () => { selItem = pl.item; selRid = null; selNote = null; refresh(); focusGrab(pl.item); };
      lane.appendChild(h);
    });
    if (C === lastC) drawSpots(C);
  }
  const fmtLen = d => ({ .25: "a sixteenth", .5: "an eighth", 1: "one beat", 2: "two beats", 4: "a whole bar" }[d] || `${+d.toFixed(2)} beats`);
  const fmtBeat = b => { const bar = Math.floor(b / 4) + 1, bt = b % 4 + 1; return `bar ${bar}, beat ${Number.isInteger(bt) ? bt : bt.toFixed(1)}`; };
  function landText(C, pl) {
    if (!pl.target) return "";
    const lc = C.ctx.chords[pl.landChord];
    return `lands on ${cs(lc, pl.target.pc, C.fl)} (the ${pl.target.label === "R" ? "root" : pl.target.label}) of ${T.chordName(lc, C.fl)}${pl.rank === "gold" ? " right on the change" : ""}`;
  }
  function focusGrab(it) {
    const i = lastC.placed.findIndex(p => p.item === it);
    const g = document.querySelectorAll("#lane .grab")[i]; if (g) g.focus({ preventScroll: true });
  }
  const occupiedExcept = (C, except) => C.placed.filter(p => p.item !== except).map(p => ({ start: p.span[0], end: p.span[1], lastMidi: p.lastMidi }));
  function drawSpots(C) {
    const lane = $("#lane");
    lane.querySelectorAll(".spotrow,.ghost").forEach(e => e.remove());
    const rid = drag ? drag.rid : selRid;
    spotCache = [];
    const row = document.createElement("div"); row.className = "spotrow"; row.style.height = SPOT_H + "px";
    lane.appendChild(row);
    if (!rid) { row.innerHTML = `<span class="spothint">Pick a lick from the shelf to see where it fits.</span>`; return; }
    const r = riffById(rid);
    spotCache = T.lockSpots(r, C.ctx, occupiedExcept(C, drag ? drag.item : null));
    if (!spotCache.length) { row.innerHTML = `<span class="spothint">No free spot fits ${esc(r.name)}. Remove a lick or try 2 bars per chord.</span>`; return; }
    spotCache.forEach(sp => {
      const d = document.createElement("button"); d.type = "button"; d.className = "spot " + sp.rank;
      d.style.left = (sp.start * geom.px - 7) + "px";
      d.setAttribute("aria-label", `Place ${r.name} at ${fmtBeat(sp.start)}, ${landText(C, sp.best)}`);
      d.title = d.getAttribute("aria-label");
      d.onmouseenter = d.onfocus = () => showGhost(sp, r);
      d.onmouseleave = d.onblur = () => { if (!drag) clearGhost(); };
      d.onclick = () => placeAt(r.id, sp.start, null);
      row.appendChild(d);
    });
  }
  function showGhost(sp, r) {
    clearGhost(); preview = sp;
    const lane = $("#lane");
    sp.best.notes.forEach(nt => {
      const g = document.createElement("div"); g.className = "brick ghost";
      g.style.setProperty("--c", r.c); g.style.left = (nt.beat * geom.px + 1) + "px"; g.style.width = Math.max(8, nt.dur * geom.px - 2) + "px";
      placeBrick(g, nt); g.textContent = nt.dur * geom.px > 22 ? T.spell(nt.midi, lastC.fl) : "";
      lane.appendChild(g);
    });
    lane.querySelectorAll(".spot").forEach(d => d.classList.toggle("on", Math.abs(parseFloat(d.style.left) - (sp.start * geom.px - 7)) < .5));
  }
  function clearGhost() { preview = null; document.querySelectorAll("#lane .ghost").forEach(e => e.remove()); document.querySelectorAll("#lane .spot.on").forEach(d => d.classList.remove("on")); }
  function placeAt(rid, start, moving) {
    snap();
    const arr = items().filter(it => it !== moving);
    const it = moving ? Object.assign(moving, { start, nudge: 0 }) : { rid, start, nudge: 0 };
    arr.push(it); setItems(arr);
    selItem = it; if (moving) selRid = null; preview = null;
    changed(true);
    focusGrab(it);
  }
  /* dragging from the shelf or along the lane */
  function startShelfDrag(e, rid) {
    if (e.button !== undefined && e.button !== 0) return;
    drag = { rid, item: null, moved: false, x0: e.clientX, y0: e.clientY };
    bindDragDoc();
  }
  function startItemDrag(e, it) {
    if (e.button !== undefined && e.button !== 0) return;
    drag = { rid: it.rid, item: it, moved: false, x0: e.clientX, y0: e.clientY };
    bindDragDoc();
  }
  function bindDragDoc() {
    document.addEventListener("pointermove", onDragMove);
    document.addEventListener("pointerup", onDragEnd, { once: true });
    document.addEventListener("pointercancel", onDragEnd, { once: true });
  }
  function onDragMove(e) {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
    if (!drag.moved) {
      drag.moved = true; document.body.classList.add("dragging");
      if (!drag.item) { selRid = drag.rid; selItem = null; drawShelf(); } else { selItem = drag.item; }
      drawSpots(lastC);
    }
    const rect = $("#lane").getBoundingClientRect();
    const inside = e.clientX >= rect.left - 20 && e.clientX <= rect.right + 20 && e.clientY >= rect.top - 40 && e.clientY <= rect.bottom + 40;
    if (!inside || !spotCache.length) { clearGhost(); return; }
    const r = riffById(drag.rid), lead = r.beats.reduce((a, b) => a + b, 0) / 2;
    const beat = (e.clientX - rect.left) / geom.px - lead;
    let best = null;
    spotCache.forEach(sp => { const d = Math.abs(sp.start - beat); if (d <= 2.5 && (!best || d < best.d)) best = { d, sp }; });
    if (best) showGhost(best.sp, r); else clearGhost();
  }
  function onDragEnd() {
    document.removeEventListener("pointermove", onDragMove);
    document.body.classList.remove("dragging");
    const d = drag; drag = null;
    if (!d) return;
    if (d.moved && preview) { placeAt(d.rid, preview.start, d.item); return; }
    preview = null;
    if (d.moved) refresh();
  }
  /* moving a placed lick */
  function itemKey(e, it) {
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeItem(it); return; }
    if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); nudge(it, e.key === "ArrowUp" ? 1 : -1); return; }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); moveTime(it, e.key === "ArrowRight" ? 1 : -1); }
  }
  function moveTime(it, dir) {
    const spots = T.lockSpots(riffById(it.rid), lastC.ctx, occupiedExcept(lastC, it));
    const nx = dir > 0 ? spots.find(s => s.start > it.start + 1e-6) : spots.slice().reverse().find(s => s.start < it.start - 1e-6);
    if (nx) placeAt(it.rid, nx.start, it);
    else { fillMsg = dir > 0 ? "That's as late as it fits." : "That's as early as it fits."; refresh(); }
  }
  function nudge(it, d) {
    const pl = lastC.placed.find(p => p.item === it); if (!pl) return;
    const nv = Math.max(pl.nudgeMin, Math.min(pl.nudgeMax, (it.nudge || 0) + d));
    if (nv === (it.nudge || 0)) { fillMsg = d > 0 ? "That's the highest it fits in your range." : "That's the lowest it fits in your range."; refresh(); return; }
    snap(); it.nudge = nv; setItems(items()); changed(true); focusGrab(it);
  }
  function removeItem(it) { snap(); setItems(items().filter(x => x !== it)); selItem = null; changed(true); }
  function fillEvery(rid) {
    const r = riffById(rid); snap();
    const lead = r.beats.reduce((a, b) => a + b, 0) - r.beats[r.beats.length - 1];
    let C = compute(0); const bounds = C.ctx.starts.slice(1).concat([C.ctx.loopBeats]);
    let added = 0;
    bounds.forEach(bd => {
      C = compute(0);
      const want = bd - lead, spots = T.lockSpots(r, C.ctx, occupiedExcept(C, null));
      let best = null;
      spots.forEach(sp => {
        const d = want - sp.start; if (d < -1e-6 || d > 2) return;
        const score = d + (sp.rank === "gold" ? 0 : .75);
        if (!best || score < best.score) best = { score, sp };
      });
      if (best) { setItems(items().concat([{ rid, start: best.sp.start, nudge: 0 }])); added++; }
    });
    selItem = null;
    fillMsg = added ? `Added ${r.name} ${added} time${added > 1 ? "s" : ""}, landing on each chord change it fits.` : `${r.name} has no free spot left. Clear some licks or try 2 bars per chord.`;
    changed(true);
  }

  /* ---------- writing your own notes ---------- */
  const LENS = [[.25, "1/16"], [.5, "1/8"], [1, "Quarter"], [2, "Half"], [4, "Whole"]];
  const GRIDS = [[.25, "1/16"], [.5, "1/8"], [1 / 3, "Triplet"], [1, "Beat"]];
  const snapTo = (x, g) => Math.round(x / g + 1e-6) * g;
  const floorTo = (x, g) => Math.floor(x / g + 1e-6) * g;
  function hearNote(m) {
    if (playing) return;
    const tl = A.timeline(); tl.note(0, m, .55, .8, S.lead); tl.end = .7;
    A.run(tl, { test: true });
  }
  function toggleMute(it, j) {
    snap();
    const sk = (it.skip || []).slice(), k = sk.indexOf(j);
    if (k >= 0) sk.splice(k, 1); else sk.push(j);
    it.skip = sk; setItems(items());
    fillMsg = k >= 0 ? "Note brought back." : "Note muted. Tap it again to bring it back.";
    changed(true);
  }
  function unlockLick(it) {
    const pl = lastC.placed.find(p => p.item === it); if (!pl) return;
    snap();
    const add = pl.notes.filter(n => !n.muted).map(n => ({ beat: n.beat, dur: n.dur, midi: n.midi }));
    setMyNotes(myNotes().concat(add)); setItems(items().filter(x => x !== it));
    selItem = null; selNote = null; S.tool = "notes";
    fillMsg = `${pl.riff.name} is now ${add.length} of your notes. Drag them, stretch them, or delete them.`;
    changed(true);
  }
  function laneDown(e) {
    if (!writing() || (e.button !== undefined && e.button !== 0)) return;
    if (e.target.closest(".brick.lk")) return;           // lick notes: a tap mutes them (their own click handler)
    const lane = $("#lane"), r = lane.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (y < HEAD) return;
    const loopB = lastC.ctx.loopBeats, own = e.target.closest(".brick.own");
    if (own || e.pointerType !== "touch") e.preventDefault();
    if (own) {
      const n = myNotes()[+own.dataset.own]; if (!n) return;
      const br = own.getBoundingClientRect(), size = e.clientX > br.right - Math.min(12, br.width / 3);
      snap(); selNote = n; selItem = null;
      ndrag = { note: n, el: own, mode: size ? "size" : "move", x0: e.clientX, y0: e.clientY, beat0: n.beat, midi0: n.midi, dur0: n.dur, moved: false };
    } else {
      const beat = floorTo(x / geom.px, S.grid), midi = geom.hi - Math.floor((y - HEAD) / geom.row);
      if (midi < geom.lo || midi > geom.hi || beat >= loopB - 1e-6) return;
      // on a touch screen a drag on empty space scrolls the roll, so a note goes in only on a clean tap
      if (e.pointerType === "touch") {
        const x0 = e.clientX, y0 = e.clientY;
        const up = ev => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 8) addNoteAt(beat, midi); };
        document.addEventListener("pointerup", up, { once: true });
        return;
      }
      snap();
      const n = { beat: +beat.toFixed(4), dur: +Math.min(S.noteLen, loopB - beat).toFixed(4), midi };
      setMyNotes(myNotes().concat([n])); selNote = n; selItem = null;
      hearNote(midi);
      drawLane(lastC = compute(0));
      const el = [...document.querySelectorAll("#lane .brick.own")].find(b => myNotes()[+b.dataset.own] === n);
      ndrag = { note: n, el, mode: "new", x0: e.clientX, y0: e.clientY, beat0: n.beat, midi0: midi, dur0: n.dur, moved: false };
    }
    document.body.classList.add("drawing");
    document.addEventListener("pointermove", noteMove);
    document.addEventListener("pointerup", noteUp, { once: true });
    document.addEventListener("pointercancel", noteUp, { once: true });
  }
  function addNoteAt(beat, midi) {
    const loopB = lastC.ctx.loopBeats; snap();
    const n = { beat: +beat.toFixed(4), dur: +Math.min(S.noteLen, loopB - beat).toFixed(4), midi };
    setMyNotes(myNotes().concat([n])); selNote = n; selItem = null; hearNote(midi); changed(true);
  }
  function noteMove(e) {
    const d = ndrag; if (!d) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    d.moved = true;
    const loopB = lastC.ctx.loopBeats, n = d.note, g = S.grid;
    if (d.mode === "size" || d.mode === "new") {
      const base = d.mode === "new" ? 0 : d.dur0;
      n.dur = +Math.max(g, Math.min(loopB - n.beat, snapTo(base + dx / geom.px, g) || g)).toFixed(4);
    } else {
      n.beat = +Math.max(0, Math.min(loopB - n.dur, snapTo(d.beat0 + dx / geom.px, g))).toFixed(4);
      const m = Math.max(geom.lo, Math.min(geom.hi, d.midi0 - Math.round(dy / geom.row)));
      if (m !== n.midi) { n.midi = m; hearNote(m); }
    }
    if (d.el) { placeBrick(d.el, n); d.el.firstChild && d.el.firstChild.nodeType === 3 && (d.el.firstChild.nodeValue = n.dur * geom.px > 22 ? T.spell(n.midi, lastC.fl) : ""); }
  }
  function noteUp() {
    document.removeEventListener("pointermove", noteMove);
    document.body.classList.remove("drawing");
    const d = ndrag; ndrag = null; if (!d) return;
    if (!d.moved && d.mode === "move") { undoStack.pop(); hearNote(d.note.midi); refresh(); return; }
    if (!d.moved && d.mode === "size") { undoStack.pop(); refresh(); return; }
    setMyNotes(myNotes()); changed(true);
  }
  function editNote(fn) {
    const n = selNote; if (!n || !myNotes().includes(n)) return;
    snap(); fn(n, lastC.ctx.loopBeats);
    n.beat = +n.beat.toFixed(4); n.dur = +n.dur.toFixed(4);
    setMyNotes(myNotes()); changed(true);
  }
  const noteUpDown = d => editNote(n => { n.midi = Math.max(S.lo, Math.min(S.hi, n.midi + d)); hearNote(n.midi); });
  const noteLeftRight = d => editNote((n, L) => { n.beat = Math.max(0, Math.min(L - n.dur, n.beat + d * S.grid)); });
  const noteLen = d => editNote((n, L) => { n.dur = Math.max(S.grid, Math.min(L - n.beat, n.dur + d * S.grid)); });
  function deleteNote() {
    if (!selNote) return;
    snap(); setMyNotes(myNotes().filter(x => x !== selNote)); selNote = null; changed(true);
  }
  function noteKeys(e) {
    if (!writing() || !selNote || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    const k = e.key;
    if (k === "Delete" || k === "Backspace") { e.preventDefault(); deleteNote(); }
    else if (k === "ArrowUp" || k === "ArrowDown") { e.preventDefault(); noteUpDown(k === "ArrowUp" ? 1 : -1); }
    else if (k === "ArrowLeft" || k === "ArrowRight") { e.preventDefault(); (e.shiftKey ? noteLen : noteLeftRight)(k === "ArrowRight" ? 1 : -1); }
  }

  /* ---------- what you sing panel ---------- */
  function drawShelf() {
    document.querySelectorAll(".stab").forEach(b => b.setAttribute("aria-pressed", b.dataset.shelf === S.shelf));
    const list = RIFFS[S.shelf] || RIFFS.blocks, box = $("#shelfChips"); box.innerHTML = "";
    list.forEach(r => {
      const b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.textContent = r.name; b.dataset.rid = r.id;
      b.style.setProperty("--c", r.c); b.style.setProperty("--on", /blue/.test(r.c) ? "#fff" : "var(--ink)"); b.setAttribute("aria-pressed", r.id === selRid);
      b.onclick = () => { selRid = selRid === r.id ? null : r.id; selItem = null; refresh(); };
      b.onpointerdown = e => startShelfDrag(e, r.id);
      box.appendChild(b);
    });
    const pick = selRid ? riffById(selRid) : null;
    $("#lickDesc").textContent = pick ? `${pick.name}: ${pick.desc}` : "";
    $("#aFill").disabled = !pick;
    $("#aFill").textContent = pick ? `Put ${pick.name} on every chord` : "Every chord";
    if (undoProg !== S.prog) { undoStack = []; undoProg = S.prog; }
    $("#aUndo").disabled = !undoStack.length;
    $("#aClear").disabled = !items().length && !myNotes().length;
    let hint;
    if (fillMsg) { hint = fillMsg; fillMsg = null; }
    else if (writing()) hint = "Tap an empty spot to add a note, or drag to draw a longer one. Drag a note to move it, drag its right edge to stretch it. Tap a lick's note to mute it. Tap the keys on the left to hear a pitch.";
    else if (pick) hint = `${pick.name} is picked. Tap a dot under the lane to place it (it stays picked), or drag it in. Gold dots land on the 3rd or 7th right on a chord change.`;
    else if (items().length) hint = "Tap a lick in the lane to select it, then move it. Or drag it to a new spot.";
    else hint = "Pick a lick from the shelf. Dots appear under the lane wherever it fits.";
    $("#aHint").textContent = hint;
  }
  function drawPractice(C) {
    document.querySelectorAll(".segb[data-src]").forEach(b => b.setAttribute("aria-pressed", b.dataset.src === S.src));
    document.querySelectorAll(".segb[data-tool]").forEach(b => b.setAttribute("aria-pressed", b.dataset.tool === S.tool));
    const scales = S.src === "scales", write = writing();
    $("#shelfBox").hidden = write; $("#notesBox").hidden = !write; $("#aFill").hidden = write;
    $("#toolHint").textContent = write ? "Write your own melody on the roll. Pink rows are chord tones, blue rows are the rest of the scale." : "Drop licks from the shelf onto the changes.";
    const chipRow = (id, list, cur, set) => {
      const box = $(id); box.innerHTML = "";
      list.forEach(([v, label]) => {
        const b = document.createElement("button"); b.type = "button"; b.className = "chip plain"; b.textContent = label;
        b.setAttribute("aria-pressed", Math.abs(cur - v) < 1e-6); b.onclick = () => { set(v); saveS(); drawPractice(lastC); };
        box.appendChild(b);
      });
    };
    chipRow("#lenChips", LENS, S.noteLen, v => { S.noteLen = v; });
    chipRow("#gridChips", GRIDS, S.grid, v => { S.grid = v; });
    $("#scalesBox").hidden = !scales; $("#licksBox").hidden = scales; $("#savedBox").hidden = scales; $("#drillWrap").hidden = scales;
    const pc = $("#patChips"); pc.innerHTML = "";
    Object.keys(PATTERNS).forEach(k => {
      const b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.textContent = PATTERNS[k].name;
      b.style.setProperty("--c", PATTERNS[k].c); b.style.setProperty("--on", /blue/.test(PATTERNS[k].c) ? "#fff" : "var(--ink)"); b.setAttribute("aria-pressed", S.pattern === k);
      b.onclick = () => { S.pattern = k; changed(true); };
      pc.appendChild(b);
    });
    $("#patHint").textContent = PATTERNS[S.pattern].desc;
    drawShelf();
    // selection tools
    const pl = !scales && !write && selItem ? C.placed.find(p => p.item === selItem) : null;
    $("#selTools").hidden = !pl;
    const sn = write && selNote && myNotes().includes(selNote) ? selNote : null;
    $("#noteTools").hidden = !sn;
    if (sn) $("#noteText").textContent = `Your note: ${pitch(sn.midi, C.fl)} at ${fmtBeat(sn.beat)}, ${fmtLen(sn.dur)} long. Arrow keys move it; Shift and the arrows change its length.`;
    if (pl) {
      $("#selText").textContent = `${pl.riff.name} at ${fmtBeat(pl.span[0])}, ${landText(C, pl)}${pl.chain ? ", linked to the lick before it" : ""}.`;
      $("#mUp").disabled = (selItem.nudge || 0) >= pl.nudgeMax; $("#mDown").disabled = (selItem.nudge || 0) <= pl.nudgeMin;
    }
    // lane note
    let note;
    if (scales) note = `${PATTERNS[S.pattern].name} on all ${C.ctx.n} chords.`;
    else if (!C.placed.length && !C.mine.length) note = write ? "Nothing on the roll yet. Tap anywhere to add a note." : "No licks placed yet.";
    else {
      const parts = [];
      if (C.placed.length) {
        const g = C.placed.filter(p => p.rank === "gold").length, ch = C.placed.filter(p => p.chain).length;
        parts.push(`${C.placed.length} lick${C.placed.length > 1 ? "s" : ""}`, `${g} land${g === 1 ? "s" : ""} on a change`);
        if (ch) parts.push(`${ch} linked`);
        const mu = C.placed.reduce((a, p) => a + p.notes.filter(n => n.muted).length, 0);
        if (mu) parts.push(`${mu} note${mu > 1 ? "s" : ""} muted`);
      }
      if (C.mine.length) parts.push(`${C.mine.length} of your own note${C.mine.length > 1 ? "s" : ""}`);
      note = parts.join(" · ");
      if (C.skipped) note += ` · ${C.skipped} lick${C.skipped > 1 ? "s" : ""} no longer fit these settings`;
    }
    $("#laneNote").textContent = note;
    // drill note
    const DN = {
      same: "Every loop plays the same thing. Move licks yourself with Earlier, Later, and the step buttons.",
      walk: "Each loop moves every lick one scale step: up, up, back, down, down, back. The rhythm stays; the starting note and the landing note change. Your own notes stay where you wrote them.",
      shift: "Each loop starts every lick half a beat later, up to a beat and a half, then resets. A lick that runs past the end of the loop sits that loop out. Your own notes stay where you wrote them."
    };
    const MN = { listen: "", along: " The melody plays softly under you.", call: " Call and response: the melody plays one loop, then you sing the next loop alone.", band: " Only the band plays, so the notes are all yours." };
    $("#drillNote").textContent = ((scales ? "" : DN[S.drill]) + MN[S.mode]).trim();
    drawSaved();
  }
  function drawSaved() {
    const sel = $("#sList");
    sel.innerHTML = saved.length ? saved.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("") : `<option value="">Nothing saved yet</option>`;
    $("#sLoad").disabled = $("#sDelete").disabled = !saved.length;
  }

  /* ---------- draw everything ---------- */
  function draw() {
    const C = lastC = compute(0);
    drawProgPanel(C);
    drawLane(C);
    drawPractice(C);
    syncControls();
  }
  function refresh() { if (lastC) { drawLane(lastC); drawPractice(lastC); } }
  /* anything that changes the music: redraw, save, and restart the loop if it's playing */
  function changed(restart) {
    saveS(); draw();
    if (restart && A.isRunning() && playing) startPlay();
  }

  /* ---------- controls ---------- */
  function buildProgSelect() {
    const ORDER = ["Pop & R&B", "Rock & blues", "'50s classics", "'60s classics", "'70s classics", "My progressions"];
    const groups = []; D.PROGRESSIONS.forEach(p => { if (!groups.includes(p.group)) groups.push(p.group); });
    groups.sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
    $("#progSel").innerHTML = groups.map(g => `<optgroup label="${esc(g)}">${D.PROGRESSIONS.filter(p => p.group === g).map(p =>
      `<option value="${esc(p.id)}">${esc(p.name)} · ${esc(p.chords.length > 5 ? p.chords.length + " chords" : p.chords.map(c => T.parseNumeral(c).text).join("–"))}</option>`).join("")}</optgroup>`).join("");
  }
  function buildControls() {
    buildProgSelect();
    $("#keySel").innerHTML = T.KEYNAMES.map((k, i) => `<option value="${i}">${k}</option>`).join("");
    $("#soundSel").innerHTML = B.ORDER.map(k => `<option value="${k}">${B.FEELS[k].name}</option>`).join("");
    const nm = m => T.SHARP[mod(m)].replace("#", "♯") + (Math.floor(m / 12) - 1);
    let lo = ""; for (let m = 36; m <= 67; m++) lo += `<option value="${m}">${nm(m)}</option>`;
    let hi = ""; for (let m = 55; m <= 88; m++) hi += `<option value="${m}">${nm(m)}</option>`;
    $("#loSel").innerHTML = lo; $("#hiSel").innerHTML = hi;
    const bind = (id, key, num, after) => $(id).addEventListener("change", e => {
      const v = e.target.value; S[key] = num ? +v : v;
      if (after) after();
      changed(true);
    });
    bind("#progSel", "prog", false, () => { selItem = null; cur = 0; $("#pbPanel").hidden = true; syncFeel(); });
    bind("#keySel", "key", true); bind("#soundSel", "style", false, () => { S.feels[S.prog] = S.style; }); bind("#barsSel", "bars", true);
    $("#drumSel").onchange = e => { S.drums = e.target.value === "1"; changed(true); };
    bind("#leadSel", "lead");
    bind("#modeSel", "mode"); bind("#drillSel", "drill"); bind("#loopsSel", "loops", true);
    bind("#apSel", "approach");
    bind("#loSel", "lo", true, () => { if (S.hi - S.lo < 12) S.hi = Math.min(88, S.lo + 12); });
    bind("#hiSel", "hi", true, () => { if (S.hi - S.lo < 12) S.lo = Math.max(36, S.hi - 12); });
    $("#clickSel").onchange = e => { S.click = e.target.value === "1"; changed(true); };
    $("#synthSel").onchange = e => { S.synth = e.target.value === "1"; A.useSynth = S.synth; saveS(); A.status(); };
    document.querySelectorAll(".segb[data-src]").forEach(b => b.onclick = () => { S.src = b.dataset.src; selItem = null; selNote = null; changed(true); });
    document.querySelectorAll(".segb[data-tool]").forEach(b => b.onclick = () => { S.tool = b.dataset.tool; selItem = null; selNote = null; selRid = null; saveS(); draw(); });
    $("#lane").addEventListener("pointerdown", laneDown);
    document.addEventListener("keydown", noteKeys);
    $("#nUp").onclick = () => noteUpDown(1); $("#nDown").onclick = () => noteUpDown(-1);
    $("#nLeft").onclick = () => noteLeftRight(-1); $("#nRight").onclick = () => noteLeftRight(1);
    $("#nShort").onclick = () => noteLen(-1); $("#nLong").onclick = () => noteLen(1);
    $("#nDel").onclick = deleteNote;
    $("#mUnlock").onclick = () => selItem && unlockLick(selItem);
    document.querySelectorAll(".stab").forEach(b => b.onclick = () => { S.shelf = b.dataset.shelf; saveS(); drawShelf(); });
    $("#aFill").onclick = () => selRid && fillEvery(selRid);
    $("#aUndo").onclick = undo;
    let armed = false;
    $("#aClear").onclick = e => {
      const b = e.currentTarget;
      if (!armed) { armed = true; b.textContent = "Tap again to clear"; setTimeout(() => { armed = false; b.textContent = "Clear"; }, 3000); return; }
      armed = false; b.textContent = "Clear"; snap(); setItems([]); setMyNotes([]); selItem = null; selNote = null; changed(true);
    };
    $("#mUp").onclick = () => selItem && nudge(selItem, 1);
    $("#mDown").onclick = () => selItem && nudge(selItem, -1);
    $("#mLeft").onclick = () => selItem && moveTime(selItem, -1);
    $("#mRight").onclick = () => selItem && moveTime(selItem, 1);
    $("#mRemove").onclick = () => selItem && removeItem(selItem);
    $("#sSave").onclick = saveArrangement;
    $("#sLoad").onclick = () => { const s = saved.find(x => x.id === $("#sList").value); if (s) loadArrangement(s); };
    $("#sDelete").onclick = () => { saved = saved.filter(x => x.id !== $("#sList").value); persist(); drawSaved(); };
    // tempo
    const setTempo = t => { S.tempo = Math.max(40, Math.min(140, Math.round(t))); changed(true); };
    $("#tempo").oninput = e => { $("#tempoVal").textContent = e.target.value; };
    $("#tempo").onchange = e => setTempo(+e.target.value);
    $("#tDown").onclick = () => setTempo(S.tempo - 5);
    $("#tUp").onclick = () => setTempo(S.tempo + 5);
    $("#play").onclick = () => { if (playing) stopPlay(); else startPlay(); };
    $("#soundTest").onclick = () => { stopPlay(); A.test(); setStatus("Sound check", A.status().ready && !S.synth ? "Grand piano" : "Simple synth"); };
    $("#pianoRetry").onclick = () => A.loadPiano();
    document.addEventListener("keydown", e => {
      if (e.code === "Space" && !/INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName)) { e.preventDefault(); $("#play").click(); }
      if (e.key === "Escape" && selRid) { selRid = null; refresh(); }
    });
    let rt = null;
    window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (lastC) drawLane(laneC && playing ? laneC : lastC); }, 150); });
  }
  function syncControls() {
    const set = (id, v) => { const el = $(id); if (el && document.activeElement !== el) el.value = String(v); };
    set("#progSel", S.prog); set("#keySel", S.key); set("#soundSel", S.style); set("#barsSel", S.bars);
    set("#modeSel", S.mode); set("#drillSel", S.drill); set("#loopsSel", S.loops); set("#apSel", S.approach);
    set("#loSel", S.lo); set("#hiSel", S.hi); set("#clickSel", S.click ? 1 : 0); set("#synthSel", S.synth ? 1 : 0);
    set("#drumSel", S.drums ? 1 : 0); set("#leadSel", S.lead);
    $("#drumWrap").hidden = !B.hasDrums(S.style);
    set("#tempo", S.tempo); $("#tempoVal").textContent = S.tempo;
  }
  function saveArrangement() {
    const its = items(), mine = myNotes();
    if (!its.length && !mine.length) { $("#sName").value = ""; $("#sName").placeholder = "Place a lick first"; return; }
    const C = lastC;
    const name = ($("#sName").value || "").trim() || `${C.prog.name} in ${T.KEYNAMES[S.key]}, ${(its.length ? its.map(i => riffById(i.rid).name).filter((v, i, a) => a.indexOf(v) === i).slice(0, 2).join(" + ") : "my melody")}`;
    saved.unshift({ id: String(Date.now()), name, prog: S.prog, key: S.key, style: S.style, approach: S.approach, bars: S.bars, items: its.map(i => Object.assign({ rid: i.rid, start: i.start, nudge: i.nudge || 0 }, i.skip && i.skip.length ? { skip: i.skip.slice() } : {})), notes: cloneNotes(mine) });
    saved = saved.slice(0, 60); persist(); $("#sName").value = ""; $("#sName").placeholder = "Saved. Name the next one"; drawSaved();
  }
  function loadArrangement(s) {
    if (!D.PROGRESSIONS.some(p => p.id === s.prog)) { $("#sName").placeholder = "That progression was deleted"; return; }
    Object.assign(S, { prog: s.prog, key: s.key, approach: s.approach, bars: s.bars, src: "licks" });
    const st = s.style === "rnb" ? "neosoul" : s.style; if (B.FEELS[st]) S.feels[s.prog] = st; syncFeel();
    snap(); work[s.prog] = cloneItems(s.items || []); notesWork[s.prog] = cloneNotes((s.notes || []).filter(okNote)); persist();
    selItem = null; cur = 0; changed(true);
  }

  /* ---------- playback ---------- */
  let playing = false, ph = null, raf = 0;
  function setStatus(main, detail, yours) {
    $("#stMain").textContent = main; $("#stDetail").textContent = detail || "";
    document.querySelector(".status").classList.toggle("yours", !!yours);
  }
  function hit(i, on) { const b = document.querySelector(`#lane .brick[data-i="${i}"]`); if (b) b.classList.toggle("hit", on); }
  function clearHits() { document.querySelectorAll("#lane .brick.hit").forEach(b => b.classList.remove("hit")); }
  function tick() {
    const el = $("#playhead");
    if (ph && el && laneC) {
      const f = Math.min(1, (performance.now() - ph.t) / ph.dur);
      el.hidden = false; el.style.transform = `translateX(${f * laneC.ctx.loopBeats * geom.px}px)`;
    }
    raf = requestAnimationFrame(tick);
  }
  function detailFor(C, i, p, loops) {
    const ch = C.ctx.chords[i], info = C.ctx.infos[i], fl = C.fl;
    const lp = loops ? `Loop ${p + 1} of ${loops}` : `Loop ${p + 1}`;
    const land = info.targets.slice(0, 2).map(t => `${cs(ch, t.pc, fl)} (${t.label})`).join(" or ");
    return `${lp} · ${T.chordName(ch, fl)} · ${S.src === "scales" ? singText(C, i) : "land on " + land}`;
  }
  function loopLabel(C) {
    if (S.src !== "licks" || S.drill === "same") return null;
    if (S.drill === "walk") return C.off === 0 ? "This loop: where you put them." : `This loop: ${Math.abs(C.off)} step${Math.abs(C.off) > 1 ? "s" : ""} ${C.off > 0 ? "up" : "down"}.`;
    return C.sh === 0 ? "This loop: where you put them." : `This loop: ${C.sh === .5 ? "half a beat" : C.sh === 1 ? "one beat" : "a beat and a half"} later${C.skipped ? `, ${C.skipped} sitting out` : ""}.`;
  }
  function startPlay() {
    const C0 = compute(0), ctx = C0.ctx, b = 60 / S.tempo, tl = A.timeline();
    const loops = S.loops || 0, n = loops || 64;
    const vo = B.voicings(ctx.chords, S.style);
    for (let k = 0; k < 4; k++) { tl.click(k * b, k === 0 ? 1 : 0); const kk = k; tl.ui(k * b, () => setStatus("Count-in", `${kk + 1} of 4 · ${C0.prog.name}, ${S.tempo} bpm`)); }
    const t0 = 4 * b, varies = S.src === "licks" && S.drill !== "same";
    const feel = B.FEELS[S.style], drums = S.drums && B.hasDrums(S.style);
    const sw = x => { const i = Math.floor(x / 4) * 4; return i + B.swingT(x - i, feel.swing); };   // swing the melody with the band
    for (let p = 0; p < n; p++) {
      const base = t0 + p * ctx.loopBeats * b;
      const Cp = varies ? compute(p) : C0;
      const pass = S.mode === "listen" || S.mode === "along" || (S.mode === "call" && p % 2 === 0);
      const yours = S.mode === "band" || (S.mode === "call" && p % 2 === 1);
      const main = yours ? "Your turn" : S.mode === "along" ? "Sing along" : S.mode === "call" ? "Listen" : "Sing with it";
      tl.ui(base, () => {
        if (Cp !== laneC) { drawLane(Cp); }
        ph = { t: performance.now(), dur: ctx.loopBeats * b * 1000 };
        const ll = loopLabel(Cp); if (ll) $("#laneNote").textContent = ll;
      });
      if (drums) B.drums(tl, base, ctx.loopBeats, S.style, b);
      ctx.chords.forEach((ch, i) => {
        B.comp(tl, base + ctx.starts[i] * b, ctx.beats[i], ch, ctx.chords[(i + 1) % ctx.n], S.style, b, vo[i]);
        if (S.click && !drums) for (let k = 0; k < ctx.beats[i]; k++) { const beat = ctx.starts[i] + k; tl.click(base + beat * b, beat === 0 ? 2 : beat % 4 === 0 ? 1 : 0); }
        tl.ui(base + ctx.starts[i] * b, () => { markChord(i); setStatus(main, detailFor(Cp, i, p, loops), yours); });
      });
      if (pass) Cp.placed.map(pl => pl.notes).concat([Cp.mine || []]).forEach(ns => ns.forEach(nt => {
        if (nt.muted) return;
        const s0 = sw(nt.beat), s1 = sw(nt.beat + nt.dur), t = base + s0 * b, d = (s1 - s0) * b;
        tl.note(t, nt.midi, d * .92, nt.vel * (S.mode === "along" ? .5 : 1) * (S.lead === "piano" ? 1 : .9), S.lead);
        tl.ui(t, () => hit(nt.i, true)); tl.ui(t + d * .85, () => hit(nt.i, false));
      }));
    }
    const tagT = t0 + n * ctx.loopBeats * b;
    B.comp(tl, tagT, 4, ctx.chords[0], ctx.chords[0], S.style, b, vo[0]);
    tl.ui(tagT, () => { ph = null; $("#playhead").hidden = true; markChord(0); setStatus("Home", `${T.chordName(ctx.chords[0], C0.fl)} to finish`); });
    tl.end = tagT + 4 * b;
    playing = true; setPlayBtn(true);
    A.run(tl, {
      lock: true,
      waiting: () => setStatus("Starting sound…", "If nothing plays, tap the screen once, or turn off Silent mode."),
      done: () => endPlay("Done", `${n} loop${n > 1 ? "s" : ""} of ${C0.prog.name}. Press Play to go again.`),
      cancel: (user, why) => { if (user) endPlay("Stopped", why || "Press Play to start again."); }
    });
  }
  function endPlay(main, detail) {
    playing = false; ph = null; setPlayBtn(false); clearHits(); markChord(-1);
    if (lastC && laneC !== lastC) drawLane(lastC);
    const el = $("#playhead"); if (el) el.hidden = true;
    if (lastC) drawPractice(lastC);
    setStatus(main, detail);
  }
  function stopPlay() { if (A.isRunning()) A.stop(true); if (playing) endPlay("Stopped", "Press Play to start again."); }
  function setPlayBtn(on) { const b = $("#play"); b.textContent = on ? "■ Stop" : "▶ Play"; b.classList.toggle("stop", on); b.setAttribute("aria-label", on ? "Stop" : "Play the loop"); }

  /* ---------- make my own ---------- */
  const PALETTE = {
    major: { key: ["I", "ii", "iii", "IV", "V", "vi", "vii°"], more: ["V7", "II", "III", "VI", "bIII", "bVI", "bVII", "iv", "i"] },
    minor: { key: ["i", "ii°", "bIII", "iv", "v", "bVI", "bVII"], more: ["V", "V7", "IV", "bII", "I"] },
    dorian: { key: ["i", "ii", "bIII", "IV", "v", "vi°", "bVII"], more: ["V", "V7", "iv", "bVI"] },
    mixolydian: { key: ["I", "ii", "iii°", "IV", "v", "vi", "bVII"], more: ["V", "V7", "iv", "bIII", "bVI"] },
    blues: { key: ["I7", "IV7", "V7"], more: ["I", "IV", "V", "bIII", "bVI", "bVII", "i", "iv", "ii", "vi"] }
  };
  const STARTERS = { major: ["I", "vi", "IV", "V"], minor: ["i", "bVI", "bIII", "bVII"], dorian: ["i", "IV", "i", "bVII"], mixolydian: ["I", "bVII", "IV", "I"], blues: ["I7", "IV7", "I7", "V7"] };
  let pb = null;
  function letterName(num, ton) {
    const n = T.parseNumeral(num), ch = T.realize(n, S.key, ton, B.SOUNDS[S.style].q);
    return T.chordName(ch, T.keyUsesFlats(S.key, ton));
  }
  function openBuilder(prog) {
    pb = prog ? { id: prog.id, name: prog.name, tonality: prog.tonality, chords: prog.chords.slice(), beats: (prog.beats || prog.chords.map(() => 4)).slice() }
      : { id: null, name: "", tonality: "major", chords: STARTERS.major.slice(), beats: [4, 4, 4, 4] };
    $("#pbName").value = pb.name; $("#pbTon").value = pb.tonality;
    $("#pbRemove").hidden = !pb.id; $("#pbPanel").hidden = false;
    drawBuilder();
    $("#pbPanel").scrollIntoView({ block: "nearest" });
  }
  function drawBuilder() {
    if (!pb) return;
    const pal = PALETTE[pb.tonality], ol = $("#pbSlots"); ol.innerHTML = "";
    pb.chords.forEach((c, i) => {
      const li = document.createElement("li");
      const all = pal.key.concat(pal.more), extra = all.includes(c) ? [] : [c];
      const opt = n => `<option value="${esc(n)}"${n === c ? " selected" : ""}>${esc(T.parseNumeral(n).text)} (${esc(letterName(n, pb.tonality))})</option>`;
      li.innerHTML = `<b>Chord ${i + 1}</b>
        <select aria-label="Chord ${i + 1}" id="pbc${i}"><optgroup label="In the key">${pal.key.map(opt).join("")}</optgroup><optgroup label="Borrowed and other">${pal.more.concat(extra).map(opt).join("")}</optgroup></select>
        <select aria-label="Chord ${i + 1} length" id="pbl${i}">${[2, 4, 8].map(b => `<option value="${b}"${pb.beats[i] === b ? " selected" : ""}>${lenLabel(b)}</option>`).join("")}</select>`;
      li.querySelector(`#pbc${i}`).onchange = e => { pb.chords[i] = e.target.value; drawPreview(); };
      li.querySelector(`#pbl${i}`).onchange = e => { pb.beats[i] = +e.target.value; drawPreview(); };
      ol.appendChild(li);
    });
    $("#pbAdd").disabled = pb.chords.length >= 8; $("#pbDel").disabled = pb.chords.length <= 2;
    drawPreview();
  }
  function drawPreview() {
    const fl = T.keyUsesFlats(S.key, pb.tonality), bars = pb.beats.reduce((a, b) => a + b, 0) / 4;
    $("#pbPreview").textContent = `${pb.chords.map(c => T.parseNumeral(c).text).join(" – ")}  ·  ${pb.chords.map(c => letterName(c, pb.tonality)).join(" – ")} in ${T.spell(S.key, fl)} ${T.TONALITY[pb.tonality].label}  ·  ${bars} bar${bars === 1 ? "" : "s"} per loop`;
  }
  function hearBuilder() {
    stopPlay();
    const b = 60 / S.tempo, tl = A.timeline();
    const chords = pb.chords.map(n => T.realize(T.parseNumeral(n), S.key, pb.tonality, B.SOUNDS[S.style].q));
    const vo = B.voicings(chords, S.style);
    let t = 0;
    chords.forEach((ch, i) => { B.comp(tl, t, pb.beats[i], ch, chords[(i + 1) % chords.length], S.style, b, vo[i]); t += pb.beats[i] * b; });
    tl.end = t;
    A.run(tl, { test: true });
    setStatus("Your progression", pb.chords.map(c => letterName(c, pb.tonality)).join(" – "));
  }
  function bindBuilder() {
    $("#pbNew").onclick = () => openBuilder(null);
    $("#pbEdit").onclick = () => openBuilder(progObj());
    $("#pbClose").onclick = () => { pb = null; $("#pbPanel").hidden = true; };
    $("#pbName").oninput = e => { if (pb) pb.name = e.target.value; };
    $("#pbTon").onchange = e => { const ton = e.target.value; pb.chords = pb.chords.map((c, i) => STARTERS[ton][i % 4]); pb.tonality = ton; drawBuilder(); };
    $("#pbAdd").onclick = () => { if (pb.chords.length < 8) { pb.chords.push(PALETTE[pb.tonality].key[0]); pb.beats.push(4); drawBuilder(); } };
    $("#pbDel").onclick = () => { if (pb.chords.length > 2) { pb.chords.pop(); pb.beats.pop(); drawBuilder(); } };
    $("#pbHear").onclick = hearBuilder;
    $("#pbSave").onclick = () => {
      const id = pb.id || "my-" + Date.now();
      const name = pb.name.trim() || `My ${pb.chords.map(c => T.parseNumeral(c).text).join("–")}`;
      const rec = { id, name, chords: pb.chords.slice(), tonality: pb.tonality };
      if (pb.beats.some(x => x !== 4)) rec.beats = pb.beats.slice();
      const i = customs.findIndex(c => c.id === id);
      if (i >= 0) customs[i] = rec; else customs.push(rec);
      if (pb.id) { delete work[id]; persist(); }
      saveCustoms(); mergeCustoms(); buildProgSelect();
      pb = null; $("#pbPanel").hidden = true;
      S.prog = id; cur = 0; selItem = null; changed(true);
    };
    let rmArmed = false;
    $("#pbRemove").onclick = e => {
      const b = e.currentTarget;
      if (!rmArmed) { rmArmed = true; b.textContent = "Tap again to delete"; setTimeout(() => { rmArmed = false; b.textContent = "Delete"; }, 3000); return; }
      rmArmed = false; b.textContent = "Delete";
      customs = customs.filter(c => c.id !== pb.id); delete work[pb.id]; persist();
      saveCustoms(); mergeCustoms(); buildProgSelect();
      if (S.prog === pb.id) S.prog = "axis";
      pb = null; $("#pbPanel").hidden = true; cur = 0; selItem = null; changed(true);
    };
  }

  /* ---------- moving your stuff between devices ---------- */
  function bindBackup() {
    const msg = t => { $("#bkMsg").textContent = t; };
    $("#bkCopy").onclick = () => {
      const txt = JSON.stringify({ app: "over-the-changes", v: 2, customs, saved, work, notes: notesWork });
      $("#bkText").value = txt;
      const sel = () => { $("#bkText").focus(); $("#bkText").select(); msg("Selected. Copy it with your keyboard or the Copy menu."); };
      try { navigator.clipboard.writeText(txt).then(() => msg("Copied."), sel); } catch (e) { sel(); }
    };
    $("#bkAdd").onclick = () => {
      let d; try { d = JSON.parse($("#bkText").value); } catch (e) { msg("That text isn't a backup from this app. Paste the whole thing you copied."); return; }
      if (!d || d.app !== "over-the-changes") { msg("That text isn't a backup from this app."); return; }
      let np = 0, ns = 0;
      (d.customs || []).filter(validProg).forEach(c => { const i = customs.findIndex(x => x.id === c.id); if (i >= 0) customs[i] = c; else { customs.push(c); np++; } });
      (d.saved || []).forEach(s => { if (s && (s.items || s.notes) && !saved.some(x => x.id === s.id)) { s.items = s.items || []; saved.push(s); ns++; } });
      Object.keys(d.work || {}).forEach(k => { if (!work[k] || !work[k].length) work[k] = d.work[k]; });
      Object.keys(d.notes || {}).forEach(k => { if (Array.isArray(d.notes[k]) && (!notesWork[k] || !notesWork[k].length)) notesWork[k] = d.notes[k].filter(okNote); });
      saveCustoms(); persist(); mergeCustoms(); buildProgSelect();
      msg(`Added ${np} progression${np === 1 ? "" : "s"} and ${ns} saved arrangement${ns === 1 ? "" : "s"}.`);
      changed(false);
    };
  }

  /* ---------- start ---------- */
  function validate() {
    if (!D.PROGRESSIONS.some(p => p.id === S.prog)) S.prog = "axis";
    if (typeof S.feels !== "object" || !S.feels || Array.isArray(S.feels)) S.feels = {};
    if (S.style === "rnb") { S.feels[S.prog] = S.feels[S.prog] || "neosoul"; }
    Object.keys(S.feels).forEach(k => { if (S.feels[k] === "rnb") S.feels[k] = "neosoul"; if (!B.FEELS[S.feels[k]]) delete S.feels[k]; });
    if (!["piano", "lead", "soft"].includes(S.lead)) S.lead = "piano";
    if (!["licks", "notes"].includes(S.tool)) S.tool = "licks";
    if (!GRIDS.some(g => Math.abs(g[0] - S.grid) < 1e-6)) S.grid = .25;
    if (!LENS.some(g => Math.abs(g[0] - S.noteLen) < 1e-6)) S.noteLen = 1;
    syncFeel();
    if (!PATTERNS[S.pattern]) S.pattern = "five";
    if (!["scales", "licks"].includes(S.src)) S.src = "licks";
    if (!RIFFS[S.shelf]) S.shelf = "blocks";
    S.key = mod(+S.key || 0); S.bars = S.bars === 2 ? 2 : 1;
    S.lo = Math.max(36, Math.min(67, +S.lo || 52)); S.hi = Math.max(55, Math.min(88, +S.hi || 72));
    if (S.hi - S.lo < 12) S.hi = S.lo + 12;
    S.tempo = Math.max(40, Math.min(140, +S.tempo || 70));
  }
  A.onStatus = s => {
    $("#soundStatus").textContent = s.text;
    $("#pianoRetry").hidden = !s.failed || s.loading;
    const chip = $("#sndChip");
    chip.textContent = S.synth ? "Synth" : s.ready ? "Piano" : s.failed ? "Synth" : `Piano ${s.pct}%`;
    chip.className = "snd " + (S.synth ? "wait" : s.ready ? "ok" : s.failed ? "bad" : "wait");
  };
  validate();
  A.useSynth = S.synth;
  buildControls(); bindBuilder(); bindBackup();
  if (needSeed) { fillEvery("qdt"); undoStack = []; fillMsg = null; store.set("otc-seeded", true); }
  draw();
  setStatus("Ready", `${progObj().name} in ${T.KEYNAMES[S.key]}. Press Play or the space bar.`);
  A.loadPiano();
  tick();
  /* for tests */
  window.OTC = { S, compute, RIFFS, PATTERNS, items, placeLicks, ctxNow, myNotes };
})();
