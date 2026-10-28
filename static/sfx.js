// Interface sounds, synthesized with the Web Audio API: no audio files, nothing to download, nothing copyrighted.
// Rules: every sound has a visual twin, there is a visible mute button, hover ticks are tiny, and nothing plays while the
// microphone could be listening (the session view) except the start and end cues.
const Sfx = (() => {
  const KEY = "dojo.sound";
  let ctx = null, master = null, unlocked = false, lastHover = 0;
  const played = {}; // how many times each cue fired (used by tests, which never make real sound)
  const read = () => { try { return localStorage.getItem(KEY) !== "off"; } catch { return true; } };
  const api = { enabled: read(), quiet: false, played };

  function audio() {
    if (!api.enabled || !unlocked || document.hidden || navigator.webdriver) return null; // webdriver: automated browsers stay silent
    try {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        const comp = ctx.createDynamicsCompressor(); master = ctx.createGain(); master.gain.value = 0.7;
        master.connect(comp); comp.connect(ctx.destination);
      }
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    } catch { return null; }
  }
  // A pitched blip with a fast attack and an exponential fade, so it never clicks at the end.
  function tone(c, f, { to = f, dur = 0.12, gain = 0.1, type = "sine", delay = 0 } = {}) {
    const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (to !== f) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  // A short filtered noise burst: sounds like a tick or a soft click, which a sine wave cannot.
  function tick(c, { freq = 3200, dur = 0.012, gain = 0.05, q = 1.2, delay = 0 } = {}) {
    const t = c.currentTime + delay, n = Math.max(1, Math.floor(c.sampleRate * dur)), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf; f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q; g.gain.value = gain;
    s.connect(f); f.connect(g); g.connect(master); s.start(t);
  }
  const cues = {
    hover: (c) => { tick(c, { freq: 4200, dur: 0.014, gain: 0.09, q: 2 }); tone(c, 1320 + Math.random() * 180, { to: 1760, dur: 0.045, gain: 0.03, type: "triangle" }); },
    click: (c) => { tick(c, { freq: 1700, dur: 0.016, gain: 0.1 }); tone(c, 240, { to: 130, dur: 0.07, gain: 0.05 }); },
    pop: (c, i = 0) => tone(c, 520 + i * 70, { to: 880 + i * 70, dur: 0.09, gain: 0.07, type: "triangle" }),
    stage: (c) => { tone(c, 330, { dur: 0.14, gain: 0.07, type: "triangle" }); tone(c, 494, { dur: 0.18, gain: 0.06, type: "triangle", delay: 0.07 }); },
    start: (c) => { tone(c, 196, { to: 440, dur: 0.22, gain: 0.07 }); tick(c, { freq: 2200, dur: 0.02, gain: 0.05 }); },
    end: (c) => { tone(c, 392, { dur: 0.16, gain: 0.07 }); tone(c, 262, { dur: 0.28, gain: 0.07, delay: 0.1 }); },
    done: (c) => [523, 659, 784, 1047].forEach((f, i) => tone(c, f, { dur: 0.42, gain: 0.07, delay: i * 0.07 })),
    error: (c) => { tone(c, 170, { to: 120, dur: 0.18, gain: 0.08, type: "triangle" }); },
  };
  // Cues that must stay silent while the microphone could be open.
  const QUIET_BLOCKED = new Set(["hover", "click", "pop", "stage"]);
  function play(name, arg) {
    if (!api.enabled || (api.quiet && QUIET_BLOCKED.has(name))) return;
    played[name] = (played[name] || 0) + 1;
    const c = audio(); if (c) cues[name](c, arg);
  }
  for (const k of Object.keys(cues)) api[k] = (arg) => play(k, arg);
  api.hover = () => { const n = performance.now(); if (n - lastHover < 45) return; lastHover = n; play("hover"); };
  // The loading intermission: a soft synthesized loop (Am, F, C, G; pluck arpeggio, bass, hats) that plays while a world builds.
  // Same rules as every other sound: off when muted, silent in automated browsers, never loud.
  const loop = (() => {
    const CH = [[110, 131, 165], [87.3, 110, 131], [131, 165, 196], [98, 123, 147]], ARP = [0, 1, 2, 1, 2, 1, 0, 2], STEP = 60 / 104 / 2;
    let timer = null, bus = null, next = 0, step = 0, stopAt = 0;
    const note = (c, f, t, { dur = 0.3, gain = 0.05, type = "triangle", lp = 2400 } = {}) => {
      const o = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter();
      o.type = type; o.frequency.value = f; fl.type = "lowpass"; fl.frequency.value = lp;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(fl); fl.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
    };
    const hat = (c, t) => {
      const n = Math.floor(c.sampleRate * 0.03), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 4);
      const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = buf; f.type = "highpass"; f.frequency.value = 7000; g.gain.value = 0.18; s.connect(f); f.connect(g); g.connect(bus); s.start(t);
    };
    const pump = () => {
      const c = audio(); if (!c || !bus) return;
      if (next < c.currentTime) next = c.currentTime + 0.05;
      while (next < c.currentTime + 0.25) {
        const bar = Math.floor(step / 8) % CH.length, i = step % 8, ch = CH[bar];
        note(c, ch[ARP[i]] * 2, next, { dur: 0.34, gain: 0.05 });
        if (i === 0 || i === 4) note(c, ch[0] / (i ? 1 : 2), next, { dur: 0.5, gain: i ? 0.05 : 0.08, type: "sine", lp: 600 });
        if (i % 2) hat(c, next);
        next += STEP; step++;
      }
    };
    return (on) => {
      if (!on) {
        if (!bus) return;
        const c = ctx, b = bus; clearInterval(timer); timer = null; bus = null;
        if (c) { b.gain.cancelScheduledValues(c.currentTime); b.gain.setValueAtTime(b.gain.value, c.currentTime); b.gain.linearRampToValueAtTime(0.0001, c.currentTime + 0.6); setTimeout(() => b.disconnect(), 700); }
        return;
      }
      if (bus || !api.enabled) return;
      const c = audio(); if (!c) return;
      bus = c.createGain(); bus.gain.setValueAtTime(0.0001, c.currentTime); bus.gain.linearRampToValueAtTime(0.5, c.currentTime + 1); bus.connect(master);
      played.loop = (played.loop || 0) + 1; next = 0; step = 0; timer = setInterval(pump, 30); clearTimeout(stopAt); stopAt = setTimeout(() => loop(false), 120000);
    };
  })();
  api.loop = loop;
  api.set = (on) => { api.enabled = on; if (!on) loop(false); try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* storage can be blocked */ } if (on) { unlocked = true; play("click"); } };

  // Browsers only allow sound after a user gesture.
  const unlock = () => { unlocked = true; };
  addEventListener("pointerdown", unlock, { capture: true, once: true }); addEventListener("keydown", unlock, { capture: true, once: true });

  // Delegated hover and press sounds on interactive things (mouse only, never touch).
  const TARGET = "button:not(:disabled):not(#mic), .wcard, .scenario, .persona, .navlink, .brand, summary";
  let lastEl = null;
  document.addEventListener("pointerover", (e) => {
    if (e.pointerType !== "mouse") return;
    const t = e.target.closest?.(TARGET);
    if (!t || t === lastEl || t.contains(e.relatedTarget)) return;
    lastEl = t; api.hover();
  });
  document.addEventListener("pointerout", (e) => { if (!e.relatedTarget) lastEl = null; });
  document.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse" && e.target.closest?.(TARGET) && !e.target.closest("#sound")) play("click"); });
  return api;
})();
