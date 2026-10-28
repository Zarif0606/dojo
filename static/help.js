// The guided tour: seven animated scenes, a spoken narrator and word-by-word captions.
// Audio and captions come from static/narration/ (made by scripts/make_narration.py). Without audio the captions still advance on a timer.
const Help = (() => {
  const $h = (s) => document.querySelector(s), look = (skin, hairStyle, hairColor, facialHair, glasses, clothes) => ({ skin, hairStyle, hairColor, facialHair, glasses, lines: 1, clothes });
  const CAST = [look("tan", "bob", "black", "none", "round", "#4f6f8f"), look("fair", "balding", "grey", "mustache", "none", "#3f4f3f"), look("deep", "curly", "darkbrown", "stubble", "square", "#7a3b2e"),
                look("light", "long", "blonde", "none", "none", "#7a5a8a"), look("olive", "short", "brown", "beard", "none", "#2b2b3a")];
  const NAMES = ["Lani", "Walter", "Marcus", "Hannah", "Omar"], RUB = ["Trust", "Discovery", "Objections", "Next step", "Honesty"];
  const face = (i) => `<span class="hface">${Faces.svg(CAST[i])}</span>`;
  // One scene per step. Each returns markup; CSS animations start when .go is added, and `after` runs timed extras (live faces, counters).
  const SCENES = [
    () => ({ html: `<div class="hs"><div class="fake-in"><span class="typed">a nervous first-time car buyer</span><i class="caret"></i></div><div class="fake-btn">Build my world</div><div class="cur"></div></div>` }),
    () => ({ html: `<div class="hs col"><div class="badges"><span>Planner · Nemotron Ultra</span><span>Casters × 5 · Nemotron Nano</span></div>
        <div class="cast">${CAST.map((_, i) => `<figure style="--d:${1.3 + i * 0.5}s">${face(i)}<figcaption>${NAMES[i]}</figcaption></figure>`).join("")}</div>
        <div class="chips">${RUB.map((r, i) => `<span style="--d:${3.6 + i * 0.3}s">${r}</span>`).join("")}</div></div>` }),
    () => ({ html: `<div class="hs scene"><div class="bg">${Scenes.svg("door")}</div><div class="door"></div><div class="who">${face(0)}</div><div class="bubble"><span class="typed2">“Yeah? We’re not buying anything today.”</span></div><div class="nar">You knock. Lani opens the door.</div></div>` }),
    () => ({ html: `<div class="hs col"><div class="micbig"><svg viewBox="0 0 24 24"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.93V21h2v-2.07A7 7 0 0 0 19 12h-2Z"/></svg></div>
        <div class="wave">${Array.from({ length: 24 }, (_, i) => `<i style="--i:${i}"></i>`).join("")}</div><div class="said"><span class="typed2">“Hi, I help homeowners cut their power bill.”</span></div></div>` }),
    () => ({ html: `<div class="hs"><div class="live"><div class="lf"></div><span class="mood">neutral</span></div><div class="meters">${["Trust", "Clarity", "Next step"].map((m, i) => `<div class="m"><b>${m}</b><div class="tr"><div class="fl" style="--to:${[0.85, 0.7, 0.9][i]};--d:${0.8 + i * 0.5}s"></div></div></div>`).join("")}<p class="stance">They’re holding firm</p></div></div>`,
      after(root, add) {
        const f = Faces.mount(root.querySelector(".lf"), CAST[1]), set = (t, m, s) => add(setTimeout(() => { f.setMood(m); root.querySelector(".mood").textContent = m; root.querySelector(".stance").textContent = s; }, t));
        set(300, "skeptical", "They’re holding firm"); set(3000, "interested", "They’re warming up"); set(6500, "happy", "They’re ready to book"); add(() => f.destroy());
      } }),
    () => ({ html: `<div class="hs col"><div class="rep"><div class="score"><b>0.0</b><span>/10</span></div><div class="rbars">${["Trust", "Discovery", "Objections"].map((m, i) => `<div class="m"><b>${m}</b><div class="tr"><div class="fl" style="--to:${[0.8, 0.6, 0.75][i]};--d:${0.7 + i * 0.3}s"></div></div></div>`).join("")}</div></div>
        <div class="steal"><small>Line to steal</small>“With a $300 bill, most neighbours save around half. Let’s confirm your exact number with a free roof check.”</div></div>`,
      after(root, add) { const b = root.querySelector(".score b"), t0 = performance.now(); const tick = () => { const u = Math.min(1, (performance.now() - t0) / 1600); b.textContent = (7.8 * (1 - Math.pow(1 - u, 3))).toFixed(1); if (u < 1) add(requestAnimationFrame(tick)); }; tick(); } }),
    () => ({ html: `<div class="hs col"><div class="tips">${[["Use headphones", "so the mic doesn’t hear them"], ["Chrome or Edge", "for voice input"], ["Speaker button", "turns interface sounds on or off"]].map(([a, b], i) => `<div style="--d:${0.3 + i * 0.4}s"><b>${a}</b><span>${b}</span></div>`).join("")}</div><button class="btn primary big" data-go="start">Build my world</button></div>` }),
  ];

  let guide = null, i = 0, playing = false, audio = null, raf = 0, timers = [], cleanups = [], caps = true, narr = true, t0 = 0, dur = 8, words = [], weights = [];
  const add = (x) => { if (typeof x === "function") cleanups.push(x); else timers.push(x); };
  const clear = () => { timers.forEach(clearTimeout); timers = []; cleanups.forEach((f) => f()); cleanups = []; cancelAnimationFrame(raf); if (audio) { audio.onended = audio.onerror = null; audio.pause(); audio = null; } };
  const pref = (k, d) => { try { return JSON.parse(localStorage.getItem("dojo.help." + k)) ?? d; } catch { return d; } };
  const store = (k, v) => { try { localStorage.setItem("dojo.help." + k, JSON.stringify(v)); } catch { /* storage can be blocked */ } };

  function render(n) {
    clear(); i = n; const s = guide[n], sc = SCENES[n](), stage = $h("#help-stage");
    stage.className = "help-stage"; stage.innerHTML = sc.html; void stage.offsetWidth; stage.classList.add("go");
    $h("#help-title").textContent = `${n + 1}. ${s.title}`;
    words = s.text.split(" "); const total = words.reduce((a, w) => a + w.length + 1, 0); let acc = 0; weights = words.map((w) => (acc += w.length + 1) / total);
    $h("#help-cap").innerHTML = words.map((w, k) => `<span data-k="${k}">${w.replace(/[&<>]/g, "")}</span>`).join(" ");
    document.querySelectorAll("#help-dots button").forEach((b, k) => { b.classList.toggle("on", k === n); b.classList.toggle("done", k < n); b.setAttribute("aria-current", k === n); });
    $h("#hp-back").disabled = n === 0; $h("#hp-next").disabled = n === guide.length - 1; dur = s.duration; t0 = performance.now();
    sc.after?.(stage, add);
  }
  function highlight() {
    const p = audio && audio.duration ? audio.currentTime / audio.duration : Math.min(1, (performance.now() - t0) / 1000 / dur);
    let k = weights.findIndex((w) => w >= p); if (k < 0) k = words.length - 1;
    $h("#help-cap").querySelectorAll("span").forEach((sp, j) => sp.classList.toggle("said", j < k || p >= 1)); $h("#help-cap").querySelectorAll("span")[k]?.classList.add("now");
    if (playing) raf = requestAnimationFrame(highlight);
  }
  function play() {
    clear(); const n = i, s = guide[n];
    render(n); // restart the scene so animation and voice begin together
    playing = true; $h("#hp-play").textContent = "Pause"; $h("#hp-play").setAttribute("aria-label", "Pause the guide");
    const finish = () => { if (!playing) return; if (n < guide.length - 1) { render(n + 1); play(); } else { playing = false; $h("#hp-play").textContent = "Replay"; $h("#help-cap").querySelectorAll("span").forEach((x) => x.classList.add("said")); } };
    if (narr) { audio = new Audio(s.file); audio.onended = finish; audio.onerror = () => { audio = null; add(setTimeout(finish, s.duration * 1000)); }; audio.play().catch(() => { audio = null; add(setTimeout(finish, s.duration * 1000)); }); }
    else add(setTimeout(finish, s.duration * 1000));
    t0 = performance.now(); highlight();
  }
  function pause() { playing = false; audio?.pause(); cancelAnimationFrame(raf); $h("#hp-play").textContent = "Play"; $h("#hp-play").setAttribute("aria-label", "Play the guide"); }
  const go = (n) => { const was = playing; pause(); render(Math.max(0, Math.min(guide.length - 1, n))); if (was) play(); };

  async function open() {
    if (!guide) { try { guide = await (await fetch("/static/narration/guide.json")).json(); } catch { $h("#help-cap").textContent = "The guide could not be loaded."; return; } build(); }
    caps = pref("caps", true); narr = pref("narr", true); sync(); render(0); pause(); $h("#hp-play").textContent = "Play the guide";
  }
  function sync() { $h("#help-cap").hidden = !caps; $h("#hp-cc").setAttribute("aria-pressed", caps); $h("#hp-snd").setAttribute("aria-pressed", narr); }
  function build() {
    $h("#help-dots").innerHTML = guide.map((g, k) => `<button aria-label="Step ${k + 1}: ${g.title}" title="${g.title}"></button>`).join("");
    $h("#help-dots").onclick = (e) => { const b = e.target.closest("button"); if (b) go([...b.parentNode.children].indexOf(b)); };
    $h("#hp-play").onclick = () => (playing ? pause() : (i === guide.length - 1 && $h("#hp-play").textContent === "Replay" && render(0), play()));
    $h("#hp-back").onclick = () => go(i - 1); $h("#hp-next").onclick = () => go(i + 1);
    $h("#hp-cc").onclick = () => { caps = !caps; store("caps", caps); sync(); };
    $h("#hp-snd").onclick = () => { narr = !narr; store("narr", narr); sync(); if (playing) { const k = i; pause(); render(k); play(); } };
  }
  function stop() { pause(); clear(); }
  document.addEventListener("keydown", (e) => {
    if ($h("#view-help")?.hidden !== false || !guide || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
    if (e.code === "ArrowRight") go(i + 1); else if (e.code === "ArrowLeft") go(i - 1); else if (e.code === "Space" && document.activeElement?.tagName !== "BUTTON") { e.preventDefault(); $h("#hp-play").click(); }
  });
  return { open, stop };
})();
