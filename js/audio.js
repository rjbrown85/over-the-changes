/* Over the Changes audio: Salamander grand piano (Tone.js), synth fallback, iPad-safe unlock, timeline scheduler.
   The sample loader comes from Range Runner v3: one file at a time, middle of the keyboard first, with retries,
   so a slow connection or one bad file never drops the whole piano to the synth. */
(function () {
  const HAS_TONE = typeof window.Tone !== "undefined";
  const SH = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  const URLS = {}, SMIDI = {};
  for (let m = 21; m <= 108; m += 3) { const nm = SH[m % 12] + (Math.floor(m / 12) - 1); URLS[nm] = nm.replace("#", "s") + ".mp3"; SMIDI[nm] = m; }
  /* the GitHub build sets window.OTC_MIRROR to a second copy of the samples for slow connections */
  const BASES = ["piano/"].concat(window.OTC_MIRROR ? [window.OTC_MIRROR] : []);
  const CORE = Object.keys(URLS).filter(k => SMIDI[k] >= 33 && SMIDI[k] <= 84);
  const PBUF = {};
  const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let ctx = null, master = null, runGain = null, runSampler = null, timers = [], pumpTimer = null, running = null, runToken = 0;
  let pianoReady = false, pianoFailed = !HAS_TONE, pianoLoading = false, unlocked = false, silentEl = null, wakeLock = null;

  const A = window.OTC_AUDIO = { onStatus: null, onStop: null, useSynth: false };
  A.ios = IOS;

  function status() {
    const have = Object.keys(PBUF).length, core = CORE.filter(k => PBUF[k]).length, all = Object.keys(URLS).length;
    const s = {
      ready: pianoReady, failed: pianoFailed, loading: pianoLoading, pct: Math.round(core / CORE.length * 100),
      text: A.useSynth ? "Using the simple synth."
        : pianoReady ? (have < all ? `Grand piano ready (${have} of ${all} samples, the rest are still loading).` : "Grand piano loaded, all 30 samples.")
        : pianoFailed ? (pianoLoading ? "Can't reach the piano files yet, so a simple synth is playing. Still trying." : "The grand piano didn't load, so a simple synth is playing. Check your connection, then tap Retry piano.")
        : `Loading the grand piano: ${core} of ${CORE.length}.`
    };
    if (IOS) s.text += " On iPad or iPhone, tap Test sound once. If it's silent, turn off Silent mode.";
    if (A.onStatus) A.onStatus(s);
    return s;
  }
  A.status = status;

  function decode(ab) {
    const c = Tone.getContext().rawContext;
    return new Promise((res, rej) => { const p = c.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); });
  }
  async function fetchSample(name) {
    for (let attempt = 0; attempt < 4; attempt++) {
      for (const base of BASES) {
        try {
          const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 20000 + attempt * 10000);
          const r = await fetch(base + URLS[name], { signal: ctl.signal }); clearTimeout(to);
          if (!r.ok) throw new Error(r.status);
          return await decode(await r.arrayBuffer());
        } catch (e) { /* try the next copy, then back off */ }
      }
      await new Promise(r => setTimeout(r, 800 * Math.pow(2, attempt)));
    }
    return null;
  }
  A.loadPiano = async function () {
    if (!HAS_TONE || pianoLoading) { status(); return; }
    pianoLoading = true; pianoFailed = false; status();
    const queue = Object.keys(URLS).filter(k => !PBUF[k]).sort((a, b) => Math.abs(SMIDI[a] - 60) - Math.abs(SMIDI[b] - 60));
    const missed = new Set();
    const worker = async () => {
      while (queue.length) {
        const name = queue.shift(), buf = await fetchSample(name);
        if (buf) { PBUF[name] = buf; pianoFailed = false; } else missed.add(name);
        const core = CORE.filter(k => PBUF[k]).length, coreMissed = CORE.filter(k => missed.has(k)).length;
        if (!pianoReady && core + coreMissed === CORE.length && coreMissed <= 2) pianoReady = true;
        if (!Object.keys(PBUF).length && missed.size >= 4) pianoFailed = true;
        status();
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    pianoLoading = false;
    if (!pianoReady && CORE.filter(k => PBUF[k]).length >= 10) pianoReady = true;
    if (!pianoReady) pianoFailed = true;
    status();
  };

  /* ---------- iPad / iPhone ---------- */
  const SILENT = (() => {   // half a second of real silence (a zero-length looping clip spins the CPU on iOS)
    const n = 4000, buf = new Uint8Array(44 + n), dv = new DataView(buf.buffer);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) buf[o + i] = s.charCodeAt(i); };
    w(0, "RIFF"); dv.setUint32(4, 36 + n, true); w(8, "WAVEfmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); w(36, "data"); dv.setUint32(40, n, true);
    buf.fill(128, 44);
    let s = ""; buf.forEach(b => { s += String.fromCharCode(b); });
    return "data:audio/wav;base64," + btoa(s);
  })();
  function iosPlayback() {
    try { if (navigator.audioSession && navigator.audioSession.type !== "playback") navigator.audioSession.type = "playback"; } catch (e) {}
    if (IOS && !navigator.audioSession && !silentEl) {
      try { silentEl = new Audio(SILENT); silentEl.loop = true; silentEl.setAttribute("playsinline", ""); const p = silentEl.play(); if (p && p.catch) p.catch(() => { silentEl = null; }); } catch (e) { silentEl = null; }
    }
  }
  function getCtx() {
    iosPlayback();
    if (!ctx) {
      ctx = HAS_TONE ? Tone.getContext().rawContext : new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = .9; master.connect(ctx.destination);
    }
    if (HAS_TONE) Tone.start().catch(() => {});
    if (ctx.state !== "running") { try { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
    return ctx;
  }
  function unlock() {
    const c = getCtx();
    try { const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch (e) {}
    if (pianoFailed && HAS_TONE && !pianoLoading) A.loadPiano();
    if (c.state === "running") unlocked = true;
  }
  ["touchend", "pointerup", "click", "keydown"].forEach(ev => document.addEventListener(ev, () => { if (!unlocked || !ctx || ctx.state !== "running") unlock(); }, { capture: true, passive: true }));
  const relock = () => { if (ctx && ctx.state !== "running") unlocked = false; };
  document.addEventListener("visibilitychange", relock); window.addEventListener("pageshow", relock);
  document.addEventListener("visibilitychange", () => { if (document.hidden && running) A.stop(true, "Playback stops when the app goes to the background. Press Play to start again."); });

  /* ---------- voices ---------- */
  function makeSampler(out) {
    if (!pianoReady || A.useSynth) return null;
    try {
      const urls = {}; Object.keys(PBUF).forEach(k => { urls[k] = new Tone.ToneAudioBuffer(PBUF[k]); });
      const s = new Tone.Sampler({ urls, release: .8 }); s.volume.value = -3; s.connect(out); return s;
    } catch (e) { return null; }
  }
  function pluck(m, t, dur, vel, out) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), g2 = ctx.createGain();
    o.type = "triangle"; o2.type = "sine"; o.frequency.value = hz(m); o2.frequency.value = hz(m) * 2; g2.gain.value = .25;
    const pk = .26 * vel;
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(pk, t + .012);
    g.gain.exponentialRampToValueAtTime(pk * .45, t + Math.min(dur, .25) + .02); g.gain.setValueAtTime(pk * .45, t + dur + .02);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur + .18);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(out); o.start(t); o2.start(t); o.stop(t + dur + .25); o2.stop(t + dur + .25);
  }
  function play(m, t, dur, vel, out, inst) {
    if (inst === "lead") return lead(m, t, dur, vel, out);
    if (inst === "soft") return soft(m, t, dur, vel, out);
    if (runSampler) runSampler.triggerAttackRelease(Tone.Frequency(m, "midi").toNote(), Math.max(.05, dur), t, Math.max(.05, Math.min(1, vel)));
    else pluck(m, t, dur, vel, out);
  }
  /* synth lead for the melody: two detuned saws through a lowpass that closes after the attack, with a little delayed vibrato */
  function lead(m, t, dur, vel, out) {
    const f = hz(m), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.Q.value = 2.5;
    lp.frequency.setValueAtTime(f * 7, t); lp.frequency.exponentialRampToValueAtTime(Math.max(600, f * 3), t + .18);
    const pk = .11 * Math.max(.3, vel), end = t + Math.max(.06, dur);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(pk, t + .015);
    g.gain.setTargetAtTime(pk * .72, t + .03, .08); g.gain.setValueAtTime(pk * .72, end); g.gain.exponentialRampToValueAtTime(.0001, end + .12);
    const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 5.6;
    vg.gain.setValueAtTime(0, t); vg.gain.setValueAtTime(0, t + .25); vg.gain.linearRampToValueAtTime(f * .006, t + .5);
    vib.connect(vg);
    [-7, 7].forEach(cents => {
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.detune.value = cents;
      vg.connect(o.frequency); o.connect(lp); o.start(t); o.stop(end + .15);
    });
    const sq = ctx.createOscillator(), sg = ctx.createGain(); sq.type = "square"; sq.frequency.value = f / 2; sg.gain.value = .35;
    sq.connect(sg); sg.connect(lp); sq.start(t); sq.stop(end + .15);
    vib.start(t); vib.stop(end + .15);
    lp.connect(g); g.connect(out);
  }
  /* a soft, flute-like synth: sine plus a quiet triangle an octave up, slow attack */
  function soft(m, t, dur, vel, out) {
    const f = hz(m), g = ctx.createGain(), end = t + Math.max(.06, dur), pk = .2 * Math.max(.3, vel);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(pk, t + .04);
    g.gain.setTargetAtTime(pk * .8, t + .06, .1); g.gain.setValueAtTime(pk * .8, end); g.gain.exponentialRampToValueAtTime(.0001, end + .18);
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g2 = ctx.createGain();
    o.type = "sine"; o.frequency.value = f; o2.type = "triangle"; o2.frequency.value = f * 2; g2.gain.value = .12;
    const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 5; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * .004, t + .45);
    vib.connect(vg); vg.connect(o.frequency);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(out);
    [o, o2, vib].forEach(x => { x.start(t); x.stop(end + .22); });
  }
  /* ---------- drums (synthesized) ---------- */
  let noiseBuf = null;
  function noise() {
    if (noiseBuf) return noiseBuf;
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }
  function hit(t, dur, type, freq, q, pk, out) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(pk, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random() * .5); s.stop(t + dur + .02);
  }
  function tone(t, f0, f1, dur, pk, type, out) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type || "sine";
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * .7);
    g.gain.setValueAtTime(pk, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + .02);
  }
  function drum(t, kind, v, out) {
    const L = A.drumLevel * v;
    if (kind === "k") tone(t, 130, 45, .32, .75 * L, "sine", out);
    else if (kind === "s") { hit(t, .17, "bandpass", 1900, .7, .32 * L, out); tone(t, 210, 160, .1, .22 * L, "triangle", out); }
    else if (kind === "r") { tone(t, 1750, 1650, .04, .16 * L, "triangle", out); hit(t, .03, "highpass", 2500, .7, .1 * L, out); }
    else if (kind === "h") hit(t, .045, "highpass", 7500, .7, .14 * L, out);
    else if (kind === "o") hit(t, .28, "highpass", 7000, .7, .1 * L, out);
    else if (kind === "f") hit(t, .05, "bandpass", 5500, 1.2, .08 * L, out);
    else if (kind === "y") { hit(t, .5, "bandpass", 6200, 1.4, .1 * L, out); tone(t, 5200, 5000, .25, .012 * L, "sine", out); }
  }
  A.drumLevel = .7;
  /* woodblock click. level 2: bar one of the loop, 1: other downbeats, 0: the rest */
  function click(t, level, out) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    const f0 = [1245, 1560, 1760][level];
    o.type = "triangle"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * .8, t + .03);
    f.type = "highpass"; f.frequency.value = 500;
    const pk = [.16, .22, .3][level];
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(pk, t + .002); g.gain.exponentialRampToValueAtTime(.0001, t + .05);
    o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + .06);
  }

  /* ---------- timeline ---------- */
  A.timeline = function () {
    const ev = [];
    return {
      ev, end: 0,
      note(t, m, d, v, inst) { ev.push({ t, k: "n", m, d, v, inst }); },
      drum(t, kind, v) { ev.push({ t, k: "d", kind, v }); },
      notes(t, ms, d, v, strum) { ms.forEach((m, i) => ev.push({ t: t + i * (strum || 0), k: "n", m, d, v })); },
      click(t, level) { ev.push({ t, k: "c", a: level || 0 }); },
      ui(t, fn) { ev.push({ t, k: "u", fn }); }
    };
  };
  A.run = function (tl, opts) {
    A.stop(false); getCtx();
    opts = opts || {};
    if (ctx.state !== "running") {
      const tok = ++runToken; running = opts;
      if (opts.waiting) opts.waiting();
      const go = () => { if (tok === runToken) { runToken++; startRun(tl, opts); } };
      Promise.resolve(ctx.resume && ctx.resume()).then(go, go); setTimeout(go, 1500);
      return;
    }
    startRun(tl, opts);
  };
  function startRun(tl, opts) {
    runGain = ctx.createGain(); runGain.connect(master); runSampler = makeSampler(runGain);
    const g = runGain, t0 = ctx.currentTime + .3, evs = tl.ev.slice().sort((a, b) => a.t - b.t);
    running = opts;
    if (opts.lock && navigator.wakeLock) navigator.wakeLock.request("screen").then(w => { wakeLock = w; }, () => {});
    const at = (time, fn) => timers.push(setTimeout(fn, Math.max(0, (time - ctx.currentTime) * 1000)));
    let i = 0;
    const pump = () => {
      if (!runSampler && pianoReady && !A.useSynth) runSampler = makeSampler(g);   // piano finished loading mid-run: switch over
      const horizon = ctx.currentTime + 1.5;
      while (i < evs.length && t0 + evs[i].t < horizon) {
        const e = evs[i++], t = t0 + e.t;
        if (e.k === "n") play(e.m, t, e.d, e.v, g, e.inst); else if (e.k === "d") drum(t, e.kind, e.v, g); else if (e.k === "c") click(t, e.a, g); else if (e.k === "u") at(t, e.fn);
      }
    };
    pump(); pumpTimer = setInterval(pump, 100);
    at(t0 + tl.end + .05, finish);
    if (opts.started) opts.started();
  }
  function releaseWake() { if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; } }
  function finish() {
    clearInterval(pumpTimer); pumpTimer = null; timers = [];
    const o = running; running = null; releaseWake();
    if (runGain) { const g = runGain, s = runSampler; setTimeout(() => { g.disconnect(); if (s) s.dispose(); }, 2500); runGain = null; runSampler = null; }
    if (o && o.done) o.done();
  }
  A.stop = function (user, why) {
    runToken++; clearInterval(pumpTimer); pumpTimer = null; timers.forEach(clearTimeout); timers = []; releaseWake();
    if (runGain && ctx) { const g = runGain, s = runSampler; g.gain.setTargetAtTime(0, ctx.currentTime, .02); setTimeout(() => { g.disconnect(); if (s) s.dispose(); }, 300); runGain = null; runSampler = null; }
    const o = running; running = null;
    if (o && o.cancel) o.cancel(user, why);
  };
  A.isRunning = () => !!running;
  A.test = function () {
    const tl = A.timeline(); [60, 64, 67, 72].forEach((m, i) => tl.note(i * .18, m, 1.2, .8)); tl.end = 1.8;
    A.run(tl, { test: true });
  };
})();
