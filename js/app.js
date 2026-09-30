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
  const DEF = { prog: "axis", key: 7, style: "pads", bars: 1, src: "licks", pattern: "five", drill: "same", mode: "listen", loops: 4,
    tempo: 70, lo: 52, hi: 72, approach: "key", click: true, synth: false, shelf: "blocks" };
  const S = Object.assign({}, DEF, store.get("otc-settings", {}));
  const saveS = () => store.set("otc-settings", S);

  /* ---------- licks: her five blocks, plus the Vocal Licks licks and runs that land on a chord tone ---------- */
  const velOf = (r, j, n) => r.vel ? r.vel[j] : (j === 0 ? .9 : j === n - 1 ? .75 : .8);
  const RIFFS = (() => {
    const blocks = D.ORDER.map(k => ({ id: k, name: D.BLOCKS[k].name, kind: "pent", steps: D.SETS.minor.blocks[k].n, beats: D.SETS.minor.blocks[k].b,
      vel: D.SETS.minor.blocks[k].v, c: D.BLOCKS[k].c, on: D.BLOCKS[k].on, desc: `${D.BLOCKS[k].rhythm}. ${D.BLOCKS[k].tip}` }));
    const mk = v => ({ id: v.id, name: v.changesName || v.name, kind: v.kind, steps: v.steps, beats: v.beats, vel: null, c: v.c, on: "var(--ink)", desc: v.desc });
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

  /* ---------- arrangements: a working copy per progression, plus saved ones ---------- */
  let work = store.get("otc-work", {}), saved = store.get("otc-saved", []);
  if (typeof work !== "object" || Array.isArray(work) || !work) work = {};
  if (!Array.isArray(saved)) saved = [];
  const persist = () => { store.set("otc-work", work); store.set("otc-saved", saved); };
  const items = () => (work[S.prog] = (work[S.prog] || []).filter(it => riffById(it.rid)));
  const setItems = arr => { work[S.prog] = arr; persist(); };
  let undoStack = [], undoProg = null;
  function snap() {
    if (undoProg !== S.prog) { undoStack = []; undoProg = S.prog; }
    undoStack.push(items().map(i => Object.assign({}, i))); if (undoStack.length > 50) undoStack.shift();
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
        notes: pl.notes.map((n, j) => Object.assign({}, n, { vel: velOf(r, j, pl.notes.length) })) });
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
    let i = 0; r.placed.forEach(pl => pl.notes.forEach(n => { n.i = i++; }));
    const C = Object.assign({ ctx, prog, p: p || 0 }, r);
    C.fl = flats(C);
    return C;
  }

  /* ---------- state for drawing ---------- */
  let lastC = null, laneC = null, cur = 0;
  let selRid = null, selItem = null, preview = null, drag = null, spotCache = [], geom = null, fillMsg = null;
  const STEP = 6, SPOT_H = 32, HEAD = 30;

  /* ---------- the changes panel ---------- */
  function drawProgPanel(C) {
    const { prog, ctx, fl } = C;
    $("#progLine").textContent = `${numerals(prog)} in ${T.spell(S.key, fl)} ${T.TONALITY[prog.tonality].label}`;
    const src = prog.src ? ` Source: <a href="${esc(prog.src.u)}" target="_blank" rel="noopener">${esc(prog.src.t)}</a>.` : "";
    $("#progNote").innerHTML = `${esc(prog.note || "")}${src} <span class="hint">${esc(B.SOUNDS[S.style].blurb)}</span>`;
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

  /* ---------- the lane ---------- */
  function laneGeom(C) {
    const wrap = $("#laneWrap"), avail = wrap.clientWidth - 4;
    const px = Math.max(28, avail > 0 ? avail / C.ctx.loopBeats : 28);
    const bottom = S.src === "licks" ? SPOT_H : 0;
    return { px, lo: S.lo, bottom, H: HEAD + (S.hi - S.lo) * STEP + 28 + bottom };
  }
  const brickBottom = m => ((m - geom.lo) * STEP + 4 + geom.bottom) + "px";
  function drawLane(C) {
    laneC = C;
    const lane = $("#lane"); lane.innerHTML = "";
    geom = laneGeom(C);
    const { px } = geom, { ctx, fl } = C, licks = S.src === "licks";
    lane.style.width = (ctx.loopBeats * px) + "px"; lane.style.height = geom.H + "px";
    ctx.chords.forEach((ch, i) => {
      const seg = document.createElement("div"); seg.className = "lchord";
      seg.style.left = (ctx.starts[i] * px) + "px"; seg.style.width = (ctx.beats[i] * px) + "px";
      seg.innerHTML = `<span>${esc(T.chordName(ch, fl))}</span>`;
      lane.appendChild(seg);
      for (let k = 1; k < ctx.beats[i]; k++) { const bt = document.createElement("div"); bt.className = "lbeat"; bt.style.left = ((ctx.starts[i] + k) * px) + "px"; lane.appendChild(bt); }
    });
    C.placed.forEach(pl => pl.notes.forEach(nt => {
      const b = document.createElement("div");
      b.className = "brick" + (nt.last ? " last" : "") + (nt.alt ? " alt" : "") + (pl.item && pl.item === selItem ? " picked" : "");
      b.dataset.i = nt.i;
      b.style.setProperty("--c", pl.c); b.style.setProperty("--on", pl.on);
      b.style.left = (nt.beat * px + 1) + "px"; b.style.width = Math.max(8, nt.dur * px - 2) + "px";
      b.style.bottom = brickBottom(nt.midi);
      b.textContent = nt.dur * px > 20 ? T.spell(nt.midi, fl) : "";
      b.title = pitch(nt.midi, fl) + (nt.last ? " (landing note)" : "");
      lane.appendChild(b);
    }));
    const ph = document.createElement("div"); ph.className = "playhead"; ph.id = "playhead"; ph.hidden = !A.isRunning(); lane.appendChild(ph);
    if (!licks) return;
    C.placed.forEach(pl => {
      const lo = Math.min(...pl.notes.map(n => n.midi)), hi = Math.max(...pl.notes.map(n => n.midi));
      const h = document.createElement("button"); h.type = "button"; h.className = "grab" + (pl.item === selItem ? " sel" : "");
      h.style.left = (pl.span[0] * px - 2) + "px"; h.style.width = ((pl.span[1] - pl.span[0]) * px + 4) + "px";
      h.style.bottom = ((lo - geom.lo) * STEP + geom.bottom) + "px"; h.style.height = ((hi - lo) * STEP + 30) + "px";
      h.setAttribute("aria-label", `${pl.riff.name} at ${fmtBeat(pl.span[0])}, ${landText(C, pl)}. Arrow keys move it, Delete removes it.`);
      h.onpointerdown = e => startItemDrag(e, pl.item);
      h.onkeydown = e => itemKey(e, pl.item);
      h.onclick = () => { selItem = pl.item; selRid = null; refresh(); focusGrab(pl.item); };
      lane.appendChild(h);
    });
    if (C === lastC) drawSpots(C);
  }
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
      g.style.bottom = brickBottom(nt.midi); g.textContent = nt.dur * geom.px > 20 ? T.spell(nt.midi, lastC.fl) : "";
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

  /* ---------- what you sing panel ---------- */
  function drawShelf() {
    document.querySelectorAll(".stab").forEach(b => b.setAttribute("aria-pressed", b.dataset.shelf === S.shelf));
    const list = RIFFS[S.shelf] || RIFFS.blocks, box = $("#shelfChips"); box.innerHTML = "";
    list.forEach(r => {
      const b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.textContent = r.name; b.dataset.rid = r.id;
      b.style.setProperty("--c", r.c); b.setAttribute("aria-pressed", r.id === selRid);
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
    $("#aClear").disabled = !items().length;
    let hint;
    if (fillMsg) { hint = fillMsg; fillMsg = null; }
    else if (pick) hint = `${pick.name} is picked. Tap a dot under the lane to place it (it stays picked), or drag it in. Gold dots land on the 3rd or 7th right on a chord change.`;
    else if (items().length) hint = "Tap a lick in the lane to select it, then move it. Or drag it to a new spot.";
    else hint = "Pick a lick from the shelf. Dots appear under the lane wherever it fits.";
    $("#aHint").textContent = hint;
  }
  function drawPractice(C) {
    document.querySelectorAll(".segb").forEach(b => b.setAttribute("aria-pressed", b.dataset.src === S.src));
    const scales = S.src === "scales";
    $("#scalesBox").hidden = !scales; $("#licksBox").hidden = scales; $("#savedBox").hidden = scales; $("#drillWrap").hidden = scales;
    const pc = $("#patChips"); pc.innerHTML = "";
    Object.keys(PATTERNS).forEach(k => {
      const b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.textContent = PATTERNS[k].name;
      b.style.setProperty("--c", PATTERNS[k].c); b.setAttribute("aria-pressed", S.pattern === k);
      b.onclick = () => { S.pattern = k; changed(true); };
      pc.appendChild(b);
    });
    $("#patHint").textContent = PATTERNS[S.pattern].desc;
    drawShelf();
    // selection tools
    const pl = !scales && selItem ? C.placed.find(p => p.item === selItem) : null;
    $("#selTools").hidden = !pl;
    if (pl) {
      $("#selText").textContent = `${pl.riff.name} at ${fmtBeat(pl.span[0])}, ${landText(C, pl)}${pl.chain ? ", linked to the lick before it" : ""}.`;
      $("#mUp").disabled = (selItem.nudge || 0) >= pl.nudgeMax; $("#mDown").disabled = (selItem.nudge || 0) <= pl.nudgeMin;
    }
    // lane note
    let note;
    if (scales) note = `${PATTERNS[S.pattern].name} on all ${C.ctx.n} chords.`;
    else if (!C.placed.length) note = "No licks placed yet.";
    else {
      const g = C.placed.filter(p => p.rank === "gold").length, ch = C.placed.filter(p => p.chain).length;
      note = `${C.placed.length} lick${C.placed.length > 1 ? "s" : ""} · ${g} land${g === 1 ? "s" : ""} on a change${ch ? ` · ${ch} linked` : ""}`;
      if (C.skipped) note += ` · ${C.skipped} no longer fit${C.skipped > 1 ? "" : "s"} these settings`;
    }
    $("#laneNote").textContent = note;
    // drill note
    const DN = {
      same: "Every loop plays the same thing. Move licks yourself with Earlier, Later, and the step buttons.",
      walk: "Each loop moves every lick one scale step: up, up, back, down, down, back. The rhythm stays; the starting note and the landing note change.",
      shift: "Each loop starts every lick half a beat later, up to a beat and a half, then resets. A lick that runs past the end of the loop sits that loop out."
    };
    const MN = { listen: "", along: " The piano plays the notes softly under you.", call: " Call and response: the piano plays a loop, then you sing the next loop alone.", band: " The piano plays only the chords, so the notes are all yours." };
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
    $("#soundSel").innerHTML = Object.keys(B.SOUNDS).map(k => `<option value="${k}">${B.SOUNDS[k].name}</option>`).join("");
    const nm = m => T.SHARP[mod(m)].replace("#", "♯") + (Math.floor(m / 12) - 1);
    let lo = ""; for (let m = 36; m <= 67; m++) lo += `<option value="${m}">${nm(m)}</option>`;
    let hi = ""; for (let m = 55; m <= 88; m++) hi += `<option value="${m}">${nm(m)}</option>`;
    $("#loSel").innerHTML = lo; $("#hiSel").innerHTML = hi;
    const bind = (id, key, num, after) => $(id).addEventListener("change", e => {
      const v = e.target.value; S[key] = num ? +v : v;
      if (after) after();
      changed(true);
    });
    bind("#progSel", "prog", false, () => { selItem = null; cur = 0; $("#pbPanel").hidden = true; });
    bind("#keySel", "key", true); bind("#soundSel", "style"); bind("#barsSel", "bars", true);
    bind("#modeSel", "mode"); bind("#drillSel", "drill"); bind("#loopsSel", "loops", true);
    bind("#apSel", "approach");
    bind("#loSel", "lo", true, () => { if (S.hi - S.lo < 12) S.hi = Math.min(88, S.lo + 12); });
    bind("#hiSel", "hi", true, () => { if (S.hi - S.lo < 12) S.lo = Math.max(36, S.hi - 12); });
    $("#clickSel").onchange = e => { S.click = e.target.value === "1"; changed(true); };
    $("#synthSel").onchange = e => { S.synth = e.target.value === "1"; A.useSynth = S.synth; saveS(); A.status(); };
    document.querySelectorAll(".segb").forEach(b => b.onclick = () => { S.src = b.dataset.src; selItem = null; changed(true); });
    document.querySelectorAll(".stab").forEach(b => b.onclick = () => { S.shelf = b.dataset.shelf; saveS(); drawShelf(); });
    $("#aFill").onclick = () => selRid && fillEvery(selRid);
    $("#aUndo").onclick = () => { const prev = undoStack.pop(); if (prev) { setItems(prev); selItem = null; changed(true); } };
    let armed = false;
    $("#aClear").onclick = e => {
      const b = e.currentTarget;
      if (!armed) { armed = true; b.textContent = "Tap again to clear"; setTimeout(() => { armed = false; b.textContent = "Clear"; }, 3000); return; }
      armed = false; b.textContent = "Clear"; snap(); setItems([]); selItem = null; changed(true);
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
    set("#tempo", S.tempo); $("#tempoVal").textContent = S.tempo;
  }
  function saveArrangement() {
    const its = items();
    if (!its.length) { $("#sName").value = ""; $("#sName").placeholder = "Place a lick first"; return; }
    const C = lastC;
    const name = ($("#sName").value || "").trim() || `${C.prog.name} in ${T.KEYNAMES[S.key]}, ${its.map(i => riffById(i.rid).name).filter((v, i, a) => a.indexOf(v) === i).slice(0, 2).join(" + ")}`;
    saved.unshift({ id: String(Date.now()), name, prog: S.prog, key: S.key, style: S.style, approach: S.approach, bars: S.bars, items: its.map(i => ({ rid: i.rid, start: i.start, nudge: i.nudge || 0 })) });
    saved = saved.slice(0, 60); persist(); $("#sName").value = ""; $("#sName").placeholder = "Saved. Name the next one"; drawSaved();
  }
  function loadArrangement(s) {
    if (!D.PROGRESSIONS.some(p => p.id === s.prog)) { $("#sName").placeholder = "That progression was deleted"; return; }
    Object.assign(S, { prog: s.prog, key: s.key, style: s.style, approach: s.approach, bars: s.bars, src: "licks" });
    snap(); work[s.prog] = s.items.map(i => Object.assign({}, i)); persist();
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
      ctx.chords.forEach((ch, i) => {
        B.comp(tl, base + ctx.starts[i] * b, ctx.beats[i], ch, ctx.chords[(i + 1) % ctx.n], S.style, b, vo[i]);
        if (S.click) for (let k = 0; k < ctx.beats[i]; k++) { const beat = ctx.starts[i] + k; tl.click(base + beat * b, beat === 0 ? 2 : beat % 4 === 0 ? 1 : 0); }
        tl.ui(base + ctx.starts[i] * b, () => { markChord(i); setStatus(main, detailFor(Cp, i, p, loops), yours); });
      });
      if (pass) Cp.placed.forEach(pl => pl.notes.forEach(nt => {
        const t = base + nt.beat * b;
        tl.note(t, nt.midi, nt.dur * b * .92, nt.vel * (S.mode === "along" ? .5 : 1));
        tl.ui(t, () => hit(nt.i, true)); tl.ui(t + nt.dur * b * .85, () => hit(nt.i, false));
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
      const txt = JSON.stringify({ app: "over-the-changes", v: 1, customs, saved, work });
      $("#bkText").value = txt;
      const sel = () => { $("#bkText").focus(); $("#bkText").select(); msg("Selected. Copy it with your keyboard or the Copy menu."); };
      try { navigator.clipboard.writeText(txt).then(() => msg("Copied."), sel); } catch (e) { sel(); }
    };
    $("#bkAdd").onclick = () => {
      let d; try { d = JSON.parse($("#bkText").value); } catch (e) { msg("That text isn't a backup from this app. Paste the whole thing you copied."); return; }
      if (!d || d.app !== "over-the-changes") { msg("That text isn't a backup from this app."); return; }
      let np = 0, ns = 0;
      (d.customs || []).filter(validProg).forEach(c => { const i = customs.findIndex(x => x.id === c.id); if (i >= 0) customs[i] = c; else { customs.push(c); np++; } });
      (d.saved || []).forEach(s => { if (s && s.items && !saved.some(x => x.id === s.id)) { saved.push(s); ns++; } });
      Object.keys(d.work || {}).forEach(k => { if (!work[k] || !work[k].length) work[k] = d.work[k]; });
      saveCustoms(); persist(); mergeCustoms(); buildProgSelect();
      msg(`Added ${np} progression${np === 1 ? "" : "s"} and ${ns} saved arrangement${ns === 1 ? "" : "s"}.`);
      changed(false);
    };
  }

  /* ---------- start ---------- */
  function validate() {
    if (!D.PROGRESSIONS.some(p => p.id === S.prog)) S.prog = "axis";
    if (!B.SOUNDS[S.style]) S.style = "pads";
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
  window.OTC = { S, compute, RIFFS, PATTERNS, items, placeLicks, ctxNow };
})();
