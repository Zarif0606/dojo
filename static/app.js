// Dojo frontend. Plain JS, no build step.
const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const OUTCOMES = { agreed: "You got to yes", walked_away: "They walked away", ended: "Ended politely, with no result" };
const DIFF_TEXT = { 1: "Friendly and patient.", 2: "A little guarded, with soft objections.", 3: "Realistic: guarded, with real objections.", 4: "Skeptical, and interrupts when you ramble.", 5: "Brutal: stacked objections, and every claim gets tested." };
const STANCE_TEXT = { soften: "They’re warming up", hold: "They’re holding firm", harden: "They’re getting firmer" };
const state = { config: null, worlds: [], world: null, scenarioId: null, personaId: null, difficulty: 3, session: null, busy: false, building: false, face: null, lastReport: null, meters: [] };

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `Request failed (${res.status})`);
  return data;
}
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function countUp(el, to, { from = 0, decimals = 0, ms = 700 } = {}) {
  const final = decimals ? Number(to).toFixed(decimals) : String(Math.round(to));
  if (reducedMotion() || !isFinite(to) || from === to) { el.textContent = final; return; }
  const t0 = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - t0) / ms), v = from + (to - from) * (1 - Math.pow(1 - t, 3));
    el.textContent = t < 1 ? v.toFixed(decimals) : final;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function enter(view) { view.classList.add("entering"); clearTimeout(view._enter); view._enter = setTimeout(() => view.classList.remove("entering"), 2500); }
function toast(msg, ms = 5000) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), ms); }

function show(view) {
  if (state.session && view !== "session" && !confirm("Leave this conversation? It won’t be coached.")) return;
  if (view !== "session") { state.session = null; abortListening(); stopSpeaking(); state.face?.destroy(); state.face = null; }
  Sfx.quiet = view === "session"; document.body.classList.toggle("fit", view === "session"); // no hover or click ticks while the microphone could be listening
  const swap = () => { document.querySelectorAll(".view").forEach((v) => (v.hidden = v.id !== `view-${view}`)); enter($(`#view-${view}`)); };
  if (document.startViewTransition && !reducedMotion() && document.visibilityState === "visible") document.startViewTransition(swap); else swap();
  document.querySelectorAll(".navlink").forEach((n) => n.classList.toggle("active", n.dataset.go === view));
  if (view === "progress") loadProgress();
  if (view === "help") Help.open(); else Help.stop();
  $("#nav-world").hidden = !state.world;
  window.scrollTo(0, 0);
}
document.addEventListener("click", (e) => { const g = e.target.closest("[data-go]"); if (g) { e.preventDefault(); show(g.dataset.go); } });

// ---------- WORLDS: type your line of work, watch the world get built, enter it ----------
async function init() {
  try { state.config = await api("/api/config"); }
  catch (e) { toast("Can’t reach the server: " + e.message); return; }
  $("#provider").textContent = state.config.provider === "nebius" ? "Nemotron on Nebius" : state.config.provider === "mock" ? "Test mode" : "Local model";
  $("#examples").innerHTML = state.config.examples.map((x) => `<button type="button">${esc(x)}</button>`).join("");
  $("#examples").onclick = (e) => { const b = e.target.closest("button"); if (b) { $("#line").value = b.textContent; $("#line").focus(); } };
  $("#builder").onsubmit = (e) => { e.preventDefault(); buildWorld($("#line").value.trim(), $("#product").value.trim()); };
  $("#worlds").onclick = (e) => { const b = e.target.closest(".wcard"); if (b) openWorld(b.dataset.id); };
  $("#scenarios").onclick = (e) => { const b = e.target.closest(".scenario"); if (b && b.dataset.s) selectScenario(b.dataset.s); };
  $("#personas").onclick = (e) => { const b = e.target.closest(".persona"); if (b && b.dataset.id) selectPersona(b.dataset.id, true); };
  $("#difficulty").oninput = (e) => setDifficulty(+e.target.value);
  $("#about-wrap").hidden = !state.config.research;
  setDifficulty(3); enter($("#view-start"));
  if (!SpeechRec) toast("Voice input needs Chrome or Edge. You can still type your lines.", 8000);
  heroCast();
  await loadWorlds();
  show("start");
}
// The start screen shows what the product is: three live characters whose moods change on their own.
function heroCast() {
  const el = $("#hero-cast"); if (!el || el.childElementCount) return;
  const looks = [
    { skin: "tan", hairStyle: "bob", hairColor: "black", facialHair: "none", glasses: "round", lines: 1, clothes: "#4f6f8f" },
    { skin: "fair", hairStyle: "balding", hairColor: "grey", facialHair: "mustache", glasses: "none", lines: 2, clothes: "#3f4f3f" },
    { skin: "deep", hairStyle: "curly", hairColor: "darkbrown", facialHair: "stubble", glasses: "square", lines: 0, clothes: "#7a3b2e" },
  ];
  // Who says what, in which mood. Each line is something a real person in a sales conversation would say.
  const script = [[0, "skeptical", "Is this a scam?"], [1, "annoyed", "I’m busy right now."], [2, "interested", "Go on, I’m listening."], [0, "thinking", "What would it cost me?"],
                  [1, "confused", "Can you say that in plain English?"], [2, "happy", "Fine. Thursday at four."], [0, "happy", "Okay, you’ve convinced me."]];
  el.innerHTML = looks.map((_, i) => `<figure class="hc hc${i}"><div class="hcface"></div></figure>`).join("") + `<p class="hcbar"><span class="hcmood"></span><span class="hcline"></span></p>`;
  const figs = [...el.querySelectorAll(".hc")], faces = figs.map((f, i) => Faces.mount(f.querySelector(".hcface"), looks[i]));
  const mood = $(".hcmood", el), line = $(".hcline", el);
  const say = (k) => {
    const [who, m, t] = script[k % script.length];
    figs.forEach((f, i) => f.classList.toggle("on", i === who));
    faces.forEach((f, i) => { if (i !== who) f.setMood("neutral"); });
    faces[who].setMood(m); mood.textContent = m; line.textContent = `“${t}”`;
  };
  say(0);
  if (reducedMotion()) return;
  let k = 0; setInterval(() => { if (!document.hidden && !$("#view-start").hidden) say(++k); }, 3200);
}
async function loadWorlds() {
  try { state.worlds = await api("/api/worlds"); } catch { state.worlds = []; }
  const card = (w) => `
    <button class="wcard" data-id="${esc(w.id)}">
      <span class="wfaces" aria-hidden="true">${(w.faces || []).map((a) => `<i>${Faces.svg(a)}</i>`).join("")}</span>
      <strong>${esc(w.title)}</strong><span>${esc(w.tagline)}</span>
      <span class="wmeta">${w.scenarios} situations · ${w.people} ${esc(w.other_side || "people")}${w.plays ? ` · ${w.plays} played` : ""}</span>
    </button>`;
  $("#worlds").innerHTML = state.worlds.filter((w) => w.builtin).map(card).join("");
  const mine = state.worlds.filter((w) => !w.builtin);
  $("#custom-worlds-wrap").hidden = !mine.length; $("#custom-worlds").innerHTML = mine.map(card).join("");
}
async function openWorld(id) {
  try { const w = await api(`/api/worlds/${encodeURIComponent(id)}`); setWorld(w, true); show("world"); }
  catch (e) { toast(e.message); }
}
const STEP_LABELS = { research: "Researching the field", plan: "Designing situations, objections, scoring", cast: "Casting the people", cached: "Loading the saved world" };
// While a world builds, one coaching tip at a time keeps the wait useful.
const TIPS = ["Ask a question before you pitch. People open up to curiosity.", "The first ten seconds decide most calls. Open with them, not you.", "Silence after a question is not a problem. Let them answer.",
  "Name the objection out loud before they do, and it loses its power.", "Specific beats clever: one real number is worth ten adjectives.", "End every talk with a clear next step, not “let me know”."];
let tipTimer = null, tipI = 0;
function startTips() { tipI = Math.floor(Math.random() * TIPS.length); showTip(); clearInterval(tipTimer); tipTimer = setInterval(() => { tipI = (tipI + 1) % TIPS.length; showTip(); }, 4500); }
function stopTips() { clearInterval(tipTimer); tipTimer = null; $("#btip")?.remove(); }
function showTip() { const t = $("#btip"); if (t) { t.textContent = "Tip: " + TIPS[tipI]; t.classList.remove("in"); void t.offsetWidth; t.classList.add("in"); } }
function renderSteps(active, done = []) {
  const keys = (state.config.research ? ["research"] : []).concat(["plan", "cast"]);
  $("#buildstate").innerHTML = keys.map((k) => `<div class="bstep ${done.includes(k) ? "ok" : k === active ? "on" : ""}"><i></i>${STEP_LABELS[k]}</div>`).join("") + (state.building ? `<p class="btip" id="btip"></p>` : ""); if (state.building) showTip();
}
function skeletons(w) {
  $("#scenarios").innerHTML = Array.from({ length: 3 }, () => `<div class="scenario skel"></div>`).join("");
  $("#personas").innerHTML = Array.from({ length: 5 }, () => `<div class="persona skel"></div>`).join("");
  $("#w-objections").innerHTML = ""; $("#w-rubric").innerHTML = ""; $("#cast-count").textContent = "";
}
// A finished world, or the plan part of one that is still being cast.
function setWorld(w, complete) {
  state.world = w; state.scenarioId = null; state.personaId = null;
  $("#nav-world").hidden = false; $("#other-side").textContent = w.other_side || "people"; if (complete) $("#w-product").value = w.product || "";
  $("#w-line").textContent = w.builtin ? "Ready-made world" : `Built for: “${w.line || ""}”`;
  $("#w-title").textContent = w.title; $("#w-tagline").textContent = w.tagline;
  $("#w-you").textContent = `You play ${w.you_are}.${w.setting ? " " + w.setting : ""}`;
  $("#scenarios").innerHTML = w.scenarios.map((s) => `<button class="scenario" data-s="${esc(s.id)}" aria-pressed="false"><strong>${esc(s.label)}</strong><span>${esc(s.desc)}</span></button>`).join("");
  $("#w-objections").innerHTML = (w.objections || []).map((o) => `<span class="chip-note say">“${esc(o)}”</span>`).join("") || `<span class="muted">Nothing listed.</span>`;
  const live = new Set(w.live_meters || []);
  $("#w-rubric").innerHTML = (w.rubric || []).map((r) => `<li><b>${esc(r.label)}${live.has(r.id) ? `<span class="live">live</span>` : ""}</b>${r.what ? `<span>${esc(r.what)}</span>` : ""}</li>`).join("")
    + ((w.pitfalls || []).length ? `<ul class="pitfalls">${w.pitfalls.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "");
  if (complete) { renderPeople(w.personas); finishWorld(); }
  else { $("#personas").innerHTML = (w.buyers || Array.from({ length: 5 })).map((_, i) => `<div class="persona skel" data-slot="${i}"></div>`).join(""); $("#cast-count").textContent = ""; }
  $("#btn-start").disabled = !complete;
}
function personaCard(p) {
  return `<button class="persona" data-id="${esc(p.id)}" data-sc="${esc(p.scenario)}" aria-pressed="false">
    <span class="pface" aria-hidden="true">${Faces.svg(p.appearance)}</span>
    <span class="ptext"><span class="who">${esc(p.name)}, ${p.age}</span><span class="biz">${esc(p.role)}</span>
      <span class="traits">${esc(p.personality)}</span>
      <span class="dots" title="Suggested difficulty ${p.suggested_difficulty}">${"●".repeat(p.suggested_difficulty)}${"○".repeat(5 - p.suggested_difficulty)}</span><span class="accent">${esc(ACCENTS[p.accent] || "")}</span></span>
  </button>`;
}
function renderPeople(list) { $("#personas").innerHTML = list.map(personaCard).join(""); $("#cast-count").textContent = `${list.length} people`; }
function finishWorld() {
  const w = state.world, first = w.personas[0];
  $("#btn-start").disabled = false; $("#start-hint").textContent = `Pick a situation and a person, then start talking. You are ${state.world.you_are}.`;
  selectPersona(first.id, true); setDifficulty(first.suggested_difficulty);
}
function selectScenario(k) {
  state.scenarioId = k;
  document.querySelectorAll("#scenarios .scenario").forEach((b) => b.setAttribute("aria-pressed", b.dataset.s === k));
  const sc = state.world.scenarios.find((s) => s.id === k);
  $("#skill-line").textContent = sc ? `You’ll practise: ${sc.skills}.` : "";
  document.querySelectorAll("#personas .persona").forEach((b) => (b.style.opacity = b.dataset.sc === k ? "" : ".6"));
  const cur = state.world.personas?.find((p) => p.id === state.personaId);
  if (cur && cur.scenario !== k) { const m = state.world.personas.find((p) => p.scenario === k); if (m) selectPersona(m.id, false); }
}
function selectPersona(id, followScenario) {
  state.personaId = id;
  document.querySelectorAll("#personas .persona").forEach((b) => b.setAttribute("aria-pressed", b.dataset.id === id));
  const p = state.world.personas.find((x) => x.id === id);
  if (p && followScenario) { selectScenario(p.scenario); setDifficulty(p.suggested_difficulty); }
}
function setDifficulty(n) { state.difficulty = n; $("#difficulty").value = n; $("#diff-val").textContent = n; $("#diff-desc").textContent = DIFF_TEXT[n]; }
$("#btn-start").onclick = () => startSession();

// Build a world from one line, streaming the progress: plan first, then the people appear one by one as they are cast.
async function buildWorld(line, product = "") {
  if (line.length < 3) { toast("Describe a job or a situation first, for example a nervous first-time car buyer."); $("#line").focus(); return; }
  if (state.building) return;
  state.building = true; $("#btn-build").disabled = true; $("#build-hint").textContent = ""; Sfx.start(); Sfx.loop(true); startTips();
  state.world = { line, product, title: line, tagline: "", you_are: "", setting: "", scenarios: [], objections: [], rubric: [], personas: [] }; $("#w-product").value = product;
  $("#w-line").textContent = `Building for: “${line}”`; $("#other-side").textContent = "people"; $("#w-title").textContent = "One moment…"; $("#w-tagline").textContent = ""; $("#w-you").textContent = "";
  $("#nav-world").hidden = false; skeletons(); renderSteps(state.config.research ? "research" : "plan"); $("#btn-start").disabled = true; $("#start-hint").textContent = "Building your world…";
  show("world"); $("#view-world").classList.add("building");
  const done = [], people = [];
  let finished = null, failed = null;
  const handle = (ev) => {
    if (ev.type === "stage") { Sfx.stage(); if (ev.stage === "cached") { renderSteps("cast", ["plan"]); } else { const keys = ["research", "plan", "cast"]; renderSteps(ev.stage, keys.slice(0, keys.indexOf(ev.stage))); } }
    else if (ev.type === "world") { setWorld(ev.world, false); renderSteps("cast", ["research", "plan"]); }
    else if (ev.type === "persona") {
      people[ev.index] = ev.persona; Sfx.pop(people.filter(Boolean).length);
      const slot = document.querySelector(`#personas [data-slot="${ev.index}"]`);
      if (slot) slot.outerHTML = personaCard(ev.persona); else $("#personas").insertAdjacentHTML("beforeend", personaCard(ev.persona));
      const k = people.filter(Boolean).length; $("#cast-count").textContent = `${k} of ${state.world.buyers?.length || 5} cast`;
    } else if (ev.type === "done") finished = ev.world;
    else if (ev.type === "error") throw new Error(ev.message);
  };
  try {
    const res = await fetch("/api/worlds/build", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ line, product: product || null }) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `Request failed (${res.status})`);
    const reader = res.body.getReader(), dec = new TextDecoder();
    let acc = "";
    for (;;) {
      const { done: d, value } = await reader.read();
      if (d) break;
      acc += dec.decode(value, { stream: true });
      let i;
      while ((i = acc.indexOf("\n")) >= 0) { const l = acc.slice(0, i).trim(); acc = acc.slice(i + 1); if (l) handle(JSON.parse(l)); }
    }
  } catch (e) { failed = e; }
  state.building = false; Sfx.loop(false); stopTips(); $("#btn-build").disabled = false; $("#view-world").classList.remove("building");
  if (finished) {
    Sfx.done();
    state.world = finished; renderSteps("", ["research", "plan", "cast"]); renderPeople(finished.personas); finishWorld(); loadWorlds();
    $("#buildstate").insertAdjacentHTML("beforeend", `<div class="bstep ok"><i></i>Your world is ready</div>`);
  } else {
    $("#build-hint").textContent = failed ? failed.message : "That didn’t finish. Try again.";
    Sfx.error(); toast(failed ? failed.message : "That didn’t finish. Try again.", 8000); state.world = null; $("#nav-world").hidden = true; show("start");
  }
}

// ---------- VOICE ----------
// Speech in: Chrome’s Web Speech API, tap to start, auto-sends after a pause (or tap again). Speech out: browser voices,
// one accent per persona (see `accent` in data/build_personas.py).
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
const ACCENTS = { "en-CA": "Canadian", "en-US": "American", "en-GB": "British", "en-AU": "Australian", "en-NZ": "New Zealand", "en-IE": "Irish", "en-IN": "Indian", "en-ZA": "South African", "en-scotland": "Scottish" };
const ACCENT_CHAIN = { "en-CA": ["en-CA", "en-US"], "en-US": ["en-US", "en-CA"], "en-GB": ["en-GB", "en-IE"], "en-AU": ["en-AU", "en-NZ"], "en-NZ": ["en-NZ", "en-AU"], "en-IE": ["en-IE", "en-GB"], "en-IN": ["en-IN"], "en-ZA": ["en-ZA", "en-GB"], "en-scotland": ["en-scotland", "en-GB"] };
const F_NAMES = /samantha|karen|moira|tessa|victoria|zira|female|serena|fiona|allison|ava|susan|kate|veena|isha|catherine|hazel|linda|heera|eva|natasha|clara|libby|sonia|neerja|emily|jenny|aria|leah|mia|nicky|stephanie|amelie|joana|zoe|ayesha|nova/i;
const M_NAMES = /daniel|alex|fred|oliver|tom|rishi|arthur|lee|gordon|aaron|david|mark|george|james|richard|ravi|sean|ryan|guy|brian|prabhat|liam|connor|mitchell|luke|male|evan|jorge|reed|rocko|ralph|eddy|whisper|albert|bruce/i;
const pref = (k, d) => { try { return JSON.parse(localStorage.getItem("hq." + k)) ?? d; } catch { return d; } };
const setPref = (k, v) => { try { localStorage.setItem("hq." + k, JSON.stringify(v)); } catch {} };
state.handsFree = pref("handsFree", true); state.pauseMs = pref("pauseMs", 900);
let handsFreeTimer = 0;
let rec = null, listening = false, finishing = false, heard = "", finalText = "", talkStart = 0, silenceTimer = 0, stopTimer = 0, recErr = null, voices = [];
const loadVoices = () => (voices = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang)));
speechSynthesis.onvoiceschanged = loadVoices; loadVoices();

const hashOf = (id) => [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
function accentOf(v) {
  const l = v.lang.replace("_", "-").toLowerCase();
  if (l.includes("scotland") || /fiona/i.test(v.name)) return "en-scotland";
  const m = l.match(/^en-([a-z]{2})/);
  return m ? "en-" + m[1].toUpperCase() : "en-US";
}
// Rank the installed voices: premium / natural / neural ones sound far better than the old compact ones, and the
// novelty voices (Bells, Zarvox...) are never used.
const NOVELTY = /bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|superstar|trinoids|whisper|zarvox|albert|fred|junior|kathy|ralph/i;
const quality = (v) => (/premium|enhanced|natural|neural|siri/i.test(v.name) ? 4 : 0) + (/online|google|microsoft/i.test(v.name) ? 2 : 0) + (v.localService ? 1 : 0) - (/compact/i.test(v.name) ? 2 : 0);
function topQuality(list) { const q = Math.max(...list.map(quality)); return list.filter((v) => quality(v) === q); }
// Find the best installed voice: right accent and gender first, then nearby accents, then anything.
function pickVoice(p) {
  const want = p.accent || "en-CA", h = hashOf(p.id), re = p.gender === "f" ? F_NAMES : M_NAMES, other = p.gender === "f" ? M_NAMES : F_NAMES;
  const pool = voices.filter((v) => !NOVELTY.test(v.name)), all = pool.length ? pool : voices;
  const ofGender = (list) => list.filter((v) => re.test(v.name) && !(other.test(v.name) && !re.test(v.name)));
  const chain = ACCENT_CHAIN[want] || [want];
  const stages = [];
  chain.forEach((a) => stages.push(ofGender(all.filter((v) => accentOf(v) === a))));
  stages.push(ofGender(all));
  chain.forEach((a) => stages.push(all.filter((v) => accentOf(v) === a)));
  stages.push(all);
  const list = stages.find((l) => l.length);
  const best = list ? topQuality(list) : [];
  const v = best.length ? best[h % best.length] : null;
  return { voice: v, exact: !!v && accentOf(v) === want };
}
function voiceInfo(p) {
  if (state.config?.voice === "kokoro" && !state.ttsDown) return { label: /^en-(GB|IE|AU|NZ|ZA|IN|scotland)/.test(p.accent) ? "British" : "American", exact: true, name: "Kokoro" };
  const { voice, exact } = pickVoice(p), label = ACCENTS[p.accent] || "";
  return { label, exact, name: voice?.name || "default voice" };
}
// The realistic neural voice (Kokoro, free, runs on this computer) when it is installed; otherwise the browser’s own voices.
async function fetchTts(text, mood) {
  const res = await fetch(`/api/sessions/${state.session.id}/tts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, mood }) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `error ${res.status}`);
  return res.blob();
}
function ttsFailed(e) {
  if (!state.ttsWarned) { state.ttsWarned = true; toast(`The realistic voice is unavailable (${e.message}). Using the browser voice.`, 9000); }
  if (/installed|rejected|configured/i.test(e.message)) state.ttsDown = true;
}
// ---- speaking: one sentence at a time, in a voice that matches each character’s accent ----
let curAudio = null, speakDone = null, speakToken = 0, activeKick = null;
function stopSpeaking() {
  speakToken++; speechSynthesis.cancel();
  if (curAudio) { curAudio.pause(); curAudio = null; }
  const d = speakDone; speakDone = null; d?.();
  activeKick?.();
}
const splitSentences = (t) => (t.match(/[^.!?…]+[.!?…]*["')\]]*\s*/g) || [t]).map((x) => x.trim()).filter(Boolean);
// A speaker plays sentences in order. Audio for the next sentence is fetched while the current one plays, so there are no gaps,
// and speech can begin on the first sentence while the AI is still writing the rest.
function makeSpeaker(p, getMood, onStart) {
  stopSpeaking();
  const token = speakToken, items = [], useTts = state.config?.voice === "kokoro" && !state.ttsDown;
  let closed = false, wake = null, started = false;
  const kick = () => { const w = wake; wake = null; w?.(); };
  activeKick = kick;
  const startOnce = () => { if (!started) { started = true; onStart?.(); } };
  const done = (async () => {
    for (let i = 0; ; i++) {
      while (i >= items.length) {
        if (closed) return;
        await new Promise((r) => (wake = r));
        if (token !== speakToken) return;
      }
      if (token !== speakToken) return;
      const it = items[i];
      if (it.audio) {
        const blob = await it.audio;
        if (token !== speakToken) return;
        if (blob) { await playBlob(blob, startOnce); continue; }
      }
      await speakBrowser(it.text, p, startOnce); // browser voice (also the per-sentence fallback)
    }
  })();
  return {
    add(text, mood) {
      if (token !== speakToken) return; // interrupted: don’t fetch audio nobody will hear
      const it = { text, audio: useTts ? fetchTts(text, mood).catch((e) => { ttsFailed(e); return null; }) : null };
      items.push(it); kick();
    },
    finish() { closed = true; kick(); return done; },
  };
}
async function speak(text, p, onStart, mood = "neutral") {
  const sp = makeSpeaker(p, () => mood, onStart);
  splitSentences(text).forEach((t) => sp.add(t));
  return sp.finish();
}
function playBlob(blob, onStart) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob), a = new Audio(url);
    const finish = () => { URL.revokeObjectURL(url); if (curAudio === a) curAudio = null; resolve(); };
    curAudio = a; speakDone = finish; a.onended = a.onerror = finish; a.onplaying = () => onStart?.();
    a.play().catch(finish);
  });
}
function speakBrowser(text, p, onStart) {
  return new Promise((resolve) => {
    const { voice } = pickVoice(p), h = hashOf(p.id);
    // Voices that several people share still sound different: age, personality and a per-persona nudge change the delivery.
    let rate = /rushed|terse|busy|fast|blunt/.test(p.personality) ? 1.1 : /nostalgic|cautious|kind|gentle|careful|wary|tired/.test(p.personality) ? 0.92 : 1.0;
    rate *= p.age >= 70 ? 0.9 : p.age >= 60 ? 0.95 : 1;
    rate += (((h >>> 7) % 7) - 3) * 0.018;
    let pitch = (p.gender === "f" ? 1.08 : 0.9) + (((h >>> 3) % 9) - 4) * 0.025;
    if (p.age >= 65) pitch -= 0.04;
    const q = /\?\s*$/.test(text);
    const u = new SpeechSynthesisUtterance(text);
    if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = (p.accent || "en-CA").replace("scotland", "GB");
    u.rate = Math.max(0.7, Math.min(1.25, rate + (q ? -0.02 : 0)));
    u.pitch = Math.max(0.6, Math.min(1.4, pitch + (q ? 0.06 : 0)));
    let fin = false; const end = () => { if (!fin) { fin = true; if (speakDone === end) speakDone = null; resolve(); } };
    u.onstart = () => onStart?.(); u.onend = u.onerror = end; speakDone = end;
    speechSynthesis.speak(u);
    setTimeout(() => onStart?.(), 400);
    setTimeout(end, 3000 + text.length * 90); // safety net if onend never fires
  });
}
function setMic(mode) {
  const mic = $("#mic"), st = $("#status");
  mic.classList.toggle("live", mode === "live"); mic.disabled = mode === "busy"; mic.setAttribute("aria-pressed", mode === "live");
  mic.setAttribute("aria-label", mode === "live" ? "Stop and send" : "Tap to talk");
  st.textContent = {
    idle: SpeechRec ? (state.handsFree ? "Tap the mic or press space if it isn’t listening." : "Tap the mic or press the space bar, then talk.") : "Voice input needs Chrome or Edge. Type your line below.",
    live: "Listening… just talk. It sends when you pause.",
    busy: "They’re responding…",
    speaking: "They’re talking. Tap the mic to interrupt.",
  }[mode];
}
// Mic loudness meter: a rough stand-in for vocal energy and variety (monotone detection).
let audio = null, levels = [], meterRaf = 0;
async function initAudio() {
  if (audio && audio.stream.getAudioTracks().some((t) => t.readyState === "live")) return audio;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const ctx = new AudioContext(), src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser();
    an.fftSize = 1024; src.connect(an); audio = { ctx, an, stream, buf: new Float32Array(an.fftSize) };
    return audio;
  } catch (e) { audio = null; return { error: e.name }; }
}
function meterLoop() {
  if (!audio || !listening) { $("#meter-fill").style.width = "0"; return; }
  audio.an.getFloatTimeDomainData(audio.buf);
  let sum = 0; for (const v of audio.buf) sum += v * v;
  const rms = Math.sqrt(sum / audio.buf.length);
  if (rms > 0.012) levels.push(rms); // ignore silence between words
  $("#meter-fill").style.width = Math.min(100, (rms / 0.15) * 100) + "%";
  meterRaf = requestAnimationFrame(meterLoop);
}
function voiceStats() {
  if (levels.length < 10) return {};
  const mean = levels.reduce((a, b) => a + b, 0) / levels.length;
  const sd = Math.sqrt(levels.reduce((a, b) => a + (b - mean) ** 2, 0) / levels.length);
  return { energy: Math.min(100, (mean / 0.15) * 100), variety: (sd / mean) * 100 };
}
const MIC_ERRORS = {
  "not-allowed": "The microphone is blocked. Click the lock icon in the address bar, allow Microphone, then try again.",
  "service-not-allowed": "Speech recognition is blocked for this page. Allow the microphone in the address bar and try again.",
  "audio-capture": "No microphone was found. Plug one in or check System Settings > Sound > Input.",
  "network": "Chrome’s speech recognition needs an internet connection and couldn’t reach it. You can still type your line.",
  "language-not-supported": "This browser can’t recognise that language. You can still type your line.",
  NotAllowedError: "The microphone is blocked. Click the lock icon in the address bar, allow Microphone, then try again.",
  NotFoundError: "No microphone was found. Plug one in or check System Settings > Sound > Input.",
  NotReadableError: "Another app is using the microphone. Close it and try again.",
};
async function startListening() {
  if (!state.session || state.busy || listening) return;
  if (!SpeechRec) { toast("Voice input needs Chrome or Edge. You can still type your lines.", 6000); $("#typed").focus(); return; }
  stopSpeaking(); state.face?.setSpeaking(false);
  listening = true; finishing = false; recErr = null; heard = ""; finalText = ""; levels = []; talkStart = performance.now(); liveReset();
  $("#interim").textContent = ""; setMic("live");
  // Ask for the microphone first so the permission prompt can’t cut the recognition short.
  const a = await initAudio();
  if (!listening) return; // tapped again while the permission prompt was open
  if (a.error && /^(NotAllowed|NotFound|NotReadable)/.test(a.error)) { micFail(a.error); return; }
  if (!a.error) { a.ctx.resume(); cancelAnimationFrame(meterRaf); meterLoop(); }
  rec = new SpeechRec();
  rec.lang = /^en/i.test(navigator.language) ? navigator.language : "en-CA"; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalText += e.results[i][0].transcript + " "; else interim += e.results[i][0].transcript;
    }
    heard = (finalText + interim).trim(); $("#interim").textContent = heard; liveReact(heard);
    clearTimeout(silenceTimer); if (heard) silenceTimer = setTimeout(stopListening, state.pauseMs); // send after a short pause
  };
  rec.onerror = (e) => { if (e.error !== "aborted") recErr = e.error; };
  rec.onend = () => { // Chrome ends the session by itself on silence; keep going while the user is still talking
    if (listening && !recErr) { try { rec.start(); return; } catch {} }
    finishListening();
  };
  try { rec.start(); } catch (e) { micFail("audio-capture"); }
}
function micFail(code) { abortListening(); toast(MIC_ERRORS[code] || `The microphone failed (${code}). You can still type your line.`, 9000); setMic("idle"); }
function stopListening() {
  if (!listening) return;
  listening = false; clearTimeout(silenceTimer);
  try { rec.stop(); } catch { finishListening(); return; }
  clearTimeout(stopTimer); stopTimer = setTimeout(finishListening, 1500); // if onend never fires
}
function autoListen(delay = 450) {
  clearTimeout(handsFreeTimer);
  if (!state.handsFree || !state.session || !SpeechRec) return;
  handsFreeTimer = setTimeout(() => { if (state.handsFree && state.session && !state.busy && !listening && !$("#view-session").hidden) startListening(); }, delay);
}
function abortListening() {
  clearTimeout(handsFreeTimer); listening = false; finishing = true; clearTimeout(silenceTimer); clearTimeout(stopTimer); cancelAnimationFrame(meterRaf);
  $("#meter-fill").style.width = "0"; $("#interim").textContent = "";
  if (rec) { rec.onend = rec.onerror = rec.onresult = null; try { rec.abort(); } catch {} }
}
function finishListening() {
  if (finishing) return; finishing = true; listening = false;
  clearTimeout(silenceTimer); clearTimeout(stopTimer); cancelAnimationFrame(meterRaf); $("#meter-fill").style.width = "0"; state.face?.setListening?.(false);
  const text = heard.trim(), secs = (performance.now() - talkStart) / 1000;
  $("#interim").textContent = "";
  if (recErr && recErr !== "no-speech" && !text) { state.handsFree = false; $("#handsfree").checked = false; toast(MIC_ERRORS[recErr] || `Speech recognition failed (${recErr}). You can still type your line.`, 9000); setMic("idle"); return; }
  if (!text) {
    if (state.handsFree && state.session && !state.busy) { setMic("idle"); autoListen(600); return; } // nobody spoke yet: keep listening quietly
    toast("I didn’t catch anything. Check your mic and try again, or type your line.", 5000); setMic("idle"); return;
  }
  sendLine(text, secs, voiceStats());
}
const mic = $("#mic");
mic.addEventListener("click", () => (listening ? stopListening() : startListening()));
document.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || $("#view-session").hidden) return;
  const t = document.activeElement?.tagName;
  if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return;
  e.preventDefault(); if (!e.repeat) (listening ? stopListening() : startListening());
});
document.addEventListener("keyup", (e) => { if (e.code === "Space" && !$("#view-session").hidden) e.preventDefault(); });
$("#handsfree").checked = state.handsFree; $("#pause").value = String(state.pauseMs);
$("#handsfree").onchange = (e) => {
  state.handsFree = e.target.checked; setPref("handsFree", state.handsFree);
  if (state.handsFree) { if (!state.busy && !listening) autoListen(100); } else { clearTimeout(handsFreeTimer); if (listening) { abortListening(); setMic("idle"); } }
  if (!listening) setMic(state.busy ? "busy" : "idle");
};
$("#pause").onchange = (e) => { state.pauseMs = +e.target.value; setPref("pauseMs", state.pauseMs); };
$("#typebox").onsubmit = (e) => { e.preventDefault(); const t = $("#typed").value.trim(); if (t && !state.busy) { if (listening) abortListening(); $("#typed").value = ""; sendLine(t, t.split(/\s+/).length / 2.5); } };

// ---------- SESSION ----------
function addLine(role, text, cls = "") {
  const d = document.createElement("div"); d.className = `line ${role} ${cls}`; d.textContent = text;
  $("#transcript").appendChild(d); $("#transcript").scrollTop = 1e9; return d;
}
function resetDirector(meters) {
  state.meters = meters;
  $("#director").innerHTML = meters.map((m) => `<div class="dmeter" title="${esc(m.what || "")}"><span>${esc(m.label)}</span><div class="track"><div class="fill" data-k="${esc(m.id)}" style="transform:scaleX(0)"></div></div></div>`).join("")
    + `<p class="dstance" id="dstance">Watching how you open…</p>`;
}
// The director model scores your last line on this world’s skills and decides how the character reacts. Show it live.
function updateDirector(ev) {
  for (const [k, v] of Object.entries(ev.meters || {})) {
    const el = document.querySelector(`#director .fill[data-k="${CSS.escape(k)}"]`);
    if (el) { el.style.transform = `scaleX(${v / 5})`; el.className = "fill " + (v <= 2 ? "low" : v >= 4 ? "high" : ""); }
  }
  $("#dstance").textContent = `${STANCE_TEXT[ev.stance] || ""}${ev.note ? ` · ${ev.note}` : ""}`;
}
async function loadModelStats() {
  try {
    const s = await api("/api/model-stats"), names = { planner: "Planner", caster: "Caster", persona: "Persona", director: "Director", coach: "Coach" };
    const rows = Object.entries(s.roles).map(([role, r]) => `<li><b>${names[role]}</b> <code>${esc((r.model || "").split("/").pop())}</code>${r.first_token_s != null ? ` · ${r.first_token_s}s to first word` : ""}${r.tok_per_s ? ` · ${r.tok_per_s} tok/s` : ""} · ${r.calls} calls</li>`).join("");
    $("#hood-list").innerHTML = rows || "<li>No calls yet.</li>";
  } catch { /* the numbers are a nice extra; ignore failures */ }
}
// The scene around the face reacts too: it glows while the character talks and takes on a tint for their mood.
function decorateFace(f) {
  const wrap = $(".scene-wrap"), speak = f.setSpeaking.bind(f), mood = f.setMood.bind(f);
  f.setSpeaking = (v) => { speak(v); wrap.classList.toggle("talking", !!v); };
  f.setMood = (m, ...rest) => { mood(m, ...rest); wrap.dataset.mood = m; };
  wrap.classList.remove("talking"); delete wrap.dataset.mood;
  return f;
}
// The opening card: bars close in, the place and the moment fade up with your goal, then the scene opens.
function playIntro(sc, w) {
  const c = $("#cine"), ms = reducedMotion() ? 2500 : 7000;
  $("#cine-moment").textContent = sc.moment || ""; $("#cine-place").textContent = sc.place || w.title; $("#cine-goal").textContent = sc.objective ? `Your goal: ${sc.objective}` : `You are ${w.you_are}.`;
  $("#cine-dots").hidden = true; c.className = "cine on";
  $("#cine-skip").hidden = false;
  return new Promise((res) => { let done = false; const end = () => { if (done) return; done = true; c.classList.add("gone"); $("#cine-skip").hidden = true; setTimeout(() => { c.className = "cine"; res(); }, 700); }; c.onclick = end; setTimeout(end, ms); });
}
// The closing card while the coach reads the call: the result, then the report.
function playOutro(outcome, first) {
  const c = $("#cine"), title = { agreed: "Deal closed", walked_away: "They walked away", ended: "Conversation over" }[outcome] || "Scene complete";
  $("#cine-moment").textContent = "Scene complete"; $("#cine-place").textContent = title; $("#cine-goal").textContent = `The coach is reviewing your call with ${first}…`; $("#cine-dots").hidden = false;
  c.className = `cine on outro ${outcome || ""}`; c.onclick = null;
  return { min: new Promise((r) => setTimeout(r, reducedMotion() ? 400 : 2400)), hide: () => { c.classList.add("gone"); setTimeout(() => (c.className = "cine"), 700); } };
}
// While you are still talking, the prospect reacts: a nod, a frown, leaning in, glancing away.
const REACT_TEXT = { nod: "nods", shake: "shakes their head", brow: "raises an eyebrow", lean: "leans in", impatient: "glances away" };
const lv = { last: 0, words: 0, n: 0, busy: false, started: 0, impatient: false };
function liveReset() { Object.assign(lv, { last: 0, words: 0, n: 0, busy: false, started: performance.now(), impatient: false }); }
function showReact(text) { const chip = $("#react-chip"); chip.textContent = `${state.session.persona.name.split(" ")[0]} ${text}`; chip.classList.add("show"); clearTimeout(chip._t); chip._t = setTimeout(() => chip.classList.remove("show"), 1800); }
function liveReact(text) {
  const session = state.session, f = state.face; if (!session || !f || state.busy) return;
  const now = performance.now(), words = text.trim().split(/\s+/).length; f.setListening?.(true);
  if (!lv.impatient && now - lv.started > 14000) { lv.impatient = true; f.react?.("impatient"); showReact(REACT_TEXT.impatient); return; } // talking for a long time without a pause
  if (lv.busy || now - lv.last < 1700 || words < 5 || words - lv.words < 4 || lv.n >= 4) return;
  lv.busy = true; lv.last = now; lv.n++; lv.words = words;
  api(`/api/sessions/${session.id}/react`, { method: "POST", body: { text } }).then((r) => {
    if (state.session !== session) return;
    if (r.mood) f.setMood(r.mood);
    if (r.reaction && r.reaction !== "none") { f.react?.(r.reaction); showReact(REACT_TEXT[r.reaction]); }
  }).catch(() => {}).finally(() => { lv.busy = false; });
}
async function startSession() {
  const w = state.world, p = w.personas.find((x) => x.id === state.personaId), sc = w.scenarios.find((s) => s.id === state.scenarioId);
  if (!p || !sc) { toast("Pick a situation and a person first."); return; }
  show("session");
  const vi = voiceInfo(p);
  if (state.config?.voice === "kokoro") fetch("/api/voice/warm", { method: "POST" }).catch(() => {}); // load the neural voice now, so the first line isn’t slow
  if (state.config?.voice !== "kokoro" && !state.voiceHinted && !voices.some((v) => quality(v) >= 4)) {
    state.voiceHinted = true;
    toast("These are your computer’s basic voices. For nicer ones, install Premium voices in System Settings > Accessibility > Spoken Content.", 9000);
  }
  $("#s-name").textContent = `${p.name}, ${p.role}`;
  $("#s-meta").textContent = `${w.title} · ${sc.label} · difficulty ${state.difficulty} · ${p.personality} · ${vi.label} accent`;
  $("#scene").innerHTML = Scenes.svg(sc.scene); $("#scene-wrap").classList.toggle("flat", !Figure.supported); $("#scene-tag").textContent = sc.place || Scenes.name(sc.scene);
  $("#s-note").innerHTML = ""; $("#transcript").innerHTML = ""; syncUndo(); $("#lat").textContent = ""; $("#btn-end").classList.remove("pulse"); $("#react-chip").classList.remove("show");
  const live = (w.live_meters || []).map((id) => (w.rubric || []).find((r) => r.id === id)).filter(Boolean);
  resetDirector(live.length ? live : [{ id: "clarity", label: "Clarity" }]);
  state.busy = true; setMic("busy");
  state.face?.destroy();
  state.face = decorateFace(Figure.supported ? Figure.mount($("#face"), p.appearance, { scene: sc.scene, visual: sc.visual, age: p.age, gender: p.gender, name: p.name }) : Faces.mount($("#face"), p.appearance)); state.face.setThinking(false);
  Sfx.start(); const first = p.name.split(" ")[0];
  // film-style opening card, then the prospect arrives while the first reply is being written
  const arriving = playIntro(sc, w).then(() => { addLine("event", Scenes.arrival(sc.scene, first)); return state.face.enter?.(); });
  const wait = addLine("event", "…");
  try {
    const about = $("#about").value.trim();
    const r = await api("/api/sessions", { method: "POST", body: { world_id: w.id, scenario: sc.id, persona_id: p.id, difficulty: state.difficulty, about: about || null, product: $("#w-product").value.trim() || null } });
    wait.remove(); state.session = { id: r.id, persona: p, scenario: sc.id, scenarioScene: sc.scene, difficulty: state.difficulty };
    const chips = [r.memory ? `<span class="chip-note" title="The coach saved this after your last conversation">Remembers: ${esc(r.memory)}</span>` : "", r.research ? `<span class="chip-note" title="Found with Tavily search">Researched: ${esc(r.research.slice(0, 120))}…</span>` : ""];
    $("#s-note").innerHTML = chips.join("");
    await arriving; // the prospect finishes arriving before they speak
    await ownerSays(r.reply, r.outcome, r.mood);
  } catch (e) { wait.textContent = e.message; state.session = null; state.face?.setThinking(false); }
  finally { state.busy = false; if (state.session) setMic("idle"); }
  loadModelStats();
}
async function ownerSays(text, outcome, mood) {
  const f = state.face, session = state.session;
  f?.setThinking(false); f?.setMood(outcome === "walked_away" ? "annoyed" : outcome === "agreed" ? "happy" : mood || "neutral");
  addLine("owner", text); setMic("speaking");
  await speak(text, session.persona, () => f?.setSpeaking(true), mood || "neutral");
  f?.setSpeaking(false);
  if (outcome) setTimeout(() => state.face === f && (f.leave ? f.leave(outcome) : outcome === "walked_away" && f.fadeOut()), 600);
  if (outcome) { session.outcome = outcome; $("#btn-end").classList.add("pulse"); }
  if (outcome) addLine("event", `${Scenes.exit(session.scenarioScene || "office", session.persona.name.split(" ")[0], outcome)} ${OUTCOMES[outcome]}. Press End to get your coaching.`);
  if (!state.busy) setMic("idle");
  if (!outcome && state.session === session) autoListen();
}
// The reply streams in sentence by sentence: the first sentence is spoken while the model is still writing the rest.
async function sendLine(text, secs) {
  if (!state.session) return;
  const session = state.session, f = state.face, t0 = performance.now();
  addLine("agent", text); state.busy = true; setMic("busy"); syncUndo(); $("#lat").textContent = "";
  const dots = addLine("owner", "…", "thinking");
  f?.setThinking(true);
  let line = null, sp = null, mood = "neutral", outcome = null, failed = null;
  const handle = (ev) => {
    if (state.session !== session) return;
    if (ev.type === "director") updateDirector(ev);
    else if (ev.type === "mood") { mood = ev.mood; f?.setThinking(false); f?.setMood(mood); }
    else if (ev.type === "sentence") {
      sp ||= makeSpeaker(session.persona, () => mood, () => { f?.setSpeaking(true); $("#lat").textContent = `Replied in ${((performance.now() - t0) / 1000).toFixed(1)}s`; });
      if (!line) { dots.remove(); line = addLine("owner", ""); setMic("speaking"); }
      line.textContent += (line.textContent ? " " : "") + ev.text; $("#transcript").scrollTop = 1e9;
      sp.add(ev.text, mood);
    } else if (ev.type === "done") { outcome = ev.outcome; mood = ev.mood; }
    else if (ev.type === "error") throw new Error(ev.message);
  };
  try {
    const res = await fetch(`/api/sessions/${session.id}/turn-stream`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, seconds: secs }) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `Request failed (${res.status})`);
    const reader = res.body.getReader(), dec = new TextDecoder();
    let acc = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      acc += dec.decode(value, { stream: true });
      let i;
      while ((i = acc.indexOf("\n")) >= 0) { const l = acc.slice(0, i).trim(); acc = acc.slice(i + 1); if (l) handle(JSON.parse(l)); }
    }
  } catch (e) { failed = e; }
  state.busy = false; dots.remove();
  if (state.session !== session) { sp?.finish(); return; }
  if (outcome) f?.setMood(outcome === "walked_away" ? "annoyed" : outcome === "agreed" ? "happy" : mood);
  await sp?.finish();
  f?.setThinking(false); f?.setSpeaking(false);
  loadModelStats();
  if (state.session !== session) return;
  if (failed) addLine("event", failed.message);
  if (outcome) setTimeout(() => state.face === f && (f.leave ? f.leave(outcome) : outcome === "walked_away" && f.fadeOut()), 600);
  if (outcome) { session.outcome = outcome; $("#btn-end").classList.add("pulse"); }
  if (outcome) addLine("event", `${Scenes.exit(session.scenarioScene || "office", session.persona.name.split(" ")[0], outcome)} ${OUTCOMES[outcome]}. Press End to get your coaching.`);
  if (!state.busy) setMic("idle");
  syncUndo();
  if (!outcome && !failed) autoListen();
}
// Undo: take back your last line and their reply, and get your words back in the box to say it differently.
function syncUndo() { const b = $("#btn-undo"); if (b) b.disabled = !state.session || state.busy || !!state.session.outcome || !document.querySelector("#transcript .line.agent"); }
$("#btn-undo").onclick = async () => {
  const session = state.session; if (!session || state.busy || session.outcome) return;
  state.busy = true; syncUndo(); stopSpeaking(); abortListening();
  try {
    const r = await api(`/api/sessions/${session.id}/undo`, { method: "POST" });
    if (state.session !== session) return;
    const lines = [...document.querySelectorAll("#transcript .line")], at = lines.map((l) => l.classList.contains("agent")).lastIndexOf(true);
    if (at >= 0) lines.slice(at).forEach((l) => l.remove());
    if (r.director) updateDirector({ ...r.director }); else { updateDirector({ meters: Object.fromEntries((state.meters || []).map((m) => [m.id, 0])), stance: "hold" }); $("#dstance").textContent = "Watching how you open…"; }
    state.face?.setMood(r.mood || "neutral"); state.face?.setThinking(false); state.face?.setSpeaking(false);
    $("#typed").value = r.text; $("#typed").focus(); $("#lat").textContent = ""; Sfx.pop(0);
  } catch (e) { toast(e.message); }
  state.busy = false; setMic("idle"); syncUndo();
};
$("#btn-end").onclick = async () => {
  if (!state.session || state.busy) return;
  const sess = state.session, outro = playOutro(sess.outcome, sess.persona.name.split(" ")[0]);
  stopSpeaking(); abortListening(); state.busy = true; setMic("busy"); Sfx.end();
  $("#btn-end").disabled = true; $("#btn-end").textContent = "Coaching…"; $("#btn-end").classList.remove("pulse");
  try {
    const [r] = await Promise.all([api(`/api/sessions/${sess.id}/end`, { method: "POST" }), outro.min]);
    state.session = null; outro.hide(); renderReport(r); show("report"); loadModelStats(); setTimeout(() => Sfx.done(), 300);
  } catch (e) { outro.hide(); toast(e.message); if (/discarded/.test(e.message)) { state.session = null; show("start"); } }
  finally { state.busy = false; $("#btn-end").disabled = false; $("#btn-end").textContent = "End and get coaching"; setMic("idle"); }
};

// ---------- REPORT ----------
function bars(scores, labels) {
  return Object.entries(scores).map(([k, v], i) => `<div class="bar" style="--i:${i}"><span>${esc(labels[k] || k)}</span><div class="track"><div class="fill ${v <= 4 ? "low" : v >= 8 ? "high" : ""}" style="width:${v * 10}%"></div></div><b>${v}</b></div>`).join("");
}
function renderReport(s) {
  state.lastReport = s;
  const fb = s.feedback || {}, labels = s.labels || {};
  $("#r-title").textContent = `${s.scenario_label || s.scenario} with ${s.persona_name}`;
  $("#r-meta").textContent = `${s.world_title || ""} · difficulty ${s.difficulty} · ${new Date(s.created_at).toLocaleString()}`;
  $("#r-outcome").textContent = OUTCOMES[s.outcome] || "You ended the conversation";
  $("#r-outcome").className = "outcome " + (s.outcome || "");
  $("#r-summary").textContent = fb.summary || "";
  countUp($("#r-overall"), s.overall, { decimals: 1, ms: 900 });
  const seen = Object.fromEntries(Object.entries(s.scores || {}).filter(([k]) => !(fb.not_shown || []).includes(k)));
  $("#r-scores").innerHTML = bars(seen, labels) + ((fb.not_shown || []).length ? `<p class="muted">Not shown this time: ${(fb.not_shown).map((k) => esc(labels[k] || k)).join(", ")}. Not counted in your score.</p>` : "");
  const da = fb.director_averages || {}, ml = s.meter_labels || {};
  $("#r-director").innerHTML = Object.keys(da).length ? Object.entries(da).map(([k, v]) => `<div class="bar"><span>${esc(ml[k] || labels[k] || k)}</span><div class="track"><div class="fill ${v <= 2 ? "low" : v >= 4 ? "high" : ""}" style="width:${v * 20}%"></div></div><b>${v}</b></div>`).join("") + `<p class="hint">How the character’s director scored your lines as you talked (out of 5).</p>` : `<p class="empty">No live scores for this session.</p>`;
  $("#r-strengths").innerHTML = (fb.strengths || []).map((x) => `<li>${esc(x)}</li>`).join("");
  $("#r-fixes").innerHTML = (fb.fixes || []).map((x) => `<li>${esc(x)}</li>`).join("");
  $("#r-lines").innerHTML = (fb.better_lines || []).map((l, i) => `<div class="lineswap"><p>${esc(l.moment)}</p><q>${esc(l.instead)}</q><button class="btn replaybtn" type="button" data-i="${i}">See how they’d respond</button><div class="replay" hidden></div></div>`).join("") || `<p class="empty">No suggestions this time.</p>`;
  $("#r-plan").innerHTML = (fb.practice_plan || []).map((x) => `<li>${esc(x)}</li>`).join("");
  $("#r-memory").textContent = fb.memory_note ? `Next time, they’ll remember: ${fb.memory_note}` : "";
  $("#r-transcript").innerHTML = (s.transcript || []).map((t) => `<div class="line ${t.role === "user" ? "agent" : "owner"}">${esc(t.content)}</div>`).join("");
}
$("#btn-again").onclick = async () => {
  const s = state.lastReport;
  try { const w = await api(`/api/worlds/${encodeURIComponent(s.world_id || "general")}`); setWorld(w, true); selectPersona(s.persona_id, false); selectScenario(s.scenario); setDifficulty(s.difficulty); startSession(); }
  catch (e) { toast(e.message); }
};

// ---------- PROGRESS ----------
function lineChart(el, values, max) {
  if (values.length < 2) { el.innerHTML = `<p class="empty">Do at least two conversations to see a trend.</p>`; return; }
  const W = 600, H = 180, P = 28, mx = max ?? Math.max(...values, 1);
  const x = (i) => P + (i * (W - P * 2)) / (values.length - 1), y = (v) => H - P - (v / mx) * (H - P * 2);
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Score trend">
    <line class="axis" x1="${P}" y1="${H - P}" x2="${W - P}" y2="${H - P}"/><text x="2" y="${y(mx) + 4}">${mx}</text><text x="2" y="${H - P + 4}">0</text>
    <polyline class="ln" pathLength="1" points="${pts}"/>${values.map((v, i) => `<circle class="pt" style="animation-delay:${0.5 + (i / values.length) * 0.7}s" cx="${x(i)}" cy="${y(v)}" r="3.5"><title>${v}</title></circle>`).join("")}</svg>`;
}
async function loadProgress() {
  const [st, hist] = await Promise.all([api("/api/stats"), api("/api/sessions")]);
  const gain = st.first_score != null ? (st.latest_score - st.first_score) : null;
  $("#stats").innerHTML = `<div><strong>${st.total_sessions}</strong><span>conversations</span></div><div><strong>${st.streak_days}</strong><span>day streak</span></div>`
    + (gain != null ? `<div><strong>${gain >= 0 ? "+" : ""}${gain.toFixed(1)}</strong><span>since your first${st.world_title ? " in " + esc(st.world_title) : ""}</span></div>` : "");
  lineChart($("#chart-overall"), [...hist].reverse().map((s) => s.overall), 10);
  $("#p-averages").innerHTML = st.weakest ? bars(st.recent_averages, st.labels || {}) + `<p class="hint">${esc(st.world_title || "")}. Weakest lately: ${esc((st.labels || {})[st.weakest] || st.weakest)}.</p>` : `<p class="empty">Nothing yet.</p>`;
  $("#history").innerHTML = hist.map((s) => `<button class="hrow" data-id="${s.id}"><span>${esc(new Date(s.created_at).toLocaleDateString())}</span><span>${esc(s.world_title)} · ${esc(s.scenario_label)} · ${esc(s.persona_name)}</span><span>${esc(OUTCOMES[s.outcome] || "")}</span><b>${s.overall}</b></button>`).join("") || `<p class="empty">No conversations yet. Build a world and start one.</p>`;
}
$("#history").onclick = async (e) => { const b = e.target.closest(".hrow"); if (b) { renderReport(await api(`/api/sessions/${b.dataset.id}`)); show("report"); } };

const soundBtn = $("#sound");
soundBtn.setAttribute("aria-pressed", String(Sfx.enabled));
soundBtn.onclick = () => { Sfx.set(!Sfx.enabled); soundBtn.setAttribute("aria-pressed", String(Sfx.enabled)); toast(Sfx.enabled ? "Sound effects on" : "Sound effects off", 1800); };
state.ready = init();

// Say the situation instead of typing it: tap the mic to start, tap again to stop. It keeps listening through pauses
// (Chrome ends recognition after silence, so it restarts itself) and never builds until you press Build.
(() => {
  const btn = $("#line-mic"), input = $("#line"); if (!btn) return;
  if (!SpeechRec) { btn.hidden = true; return; }
  let r = null, active = false, base = "";
  const hint = (t) => { $("#build-hint").textContent = t; };
  const render = (interim) => { input.value = (base + " " + interim).trim().slice(0, 200); };
  function begin() {
    r = new SpeechRec(); r.lang = /^en/i.test(navigator.language) ? navigator.language : "en-CA"; r.continuous = true; r.interimResults = true;
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) { if (e.results[i].isFinal) base = (base + " " + e.results[i][0].transcript).trim(); else interim += e.results[i][0].transcript; }
      render(interim);
    };
    r.onerror = (e) => {
      if (/not-allowed|service-not-allowed/.test(e.error)) { active = false; hint("Microphone is blocked. Allow it in the browser, or type instead."); }
      else if (e.error !== "no-speech" && e.error !== "aborted") { active = false; hint("Voice didn’t work. You can type instead."); }
    };
    r.onend = () => { if (active) { try { begin(); } catch { active = false; paint(); } } else paint(); };
    r.start();
  }
  function paint() { btn.setAttribute("aria-pressed", String(active)); btn.classList.toggle("on", active); }
  btn.onclick = () => {
    if (active) { active = false; try { r?.stop(); } catch { /* already stopped */ } paint(); hint(input.value.trim().length >= 3 ? "Press Build my world when you’re happy with it." : ""); return; }
    base = input.value.trim(); active = true; paint(); hint("Listening… describe the situation, then tap the mic again to stop.");
    try { begin(); } catch { active = false; paint(); }
  };
  $("#builder").addEventListener("submit", () => { active = false; try { r?.stop(); } catch { /* already stopped */ } paint(); });
})();

// One click to a live call: a ready-made world, its first situation and first person, straight into the session.
$("#btn-quick")?.addEventListener("click", async () => {
  const b = $("#btn-quick"); if (b.disabled) return; b.disabled = true;
  try {
    setWorld(await api("/api/worlds/ready-insurance"), true);
    const w = state.world; if (!w?.personas?.length) return;
    const p = w.personas[0]; selectPersona(p.id, true); await startSession();
  } catch (e) { toast(e.message || "That didn’t start. Try a profession below."); } finally { b.disabled = false; }
});

// "What would have happened": the customer answers the coach's better line, side by side with the real call.
$("#r-lines").addEventListener("click", async (e) => {
  const b = e.target.closest(".replaybtn"); if (!b || b.disabled) return;
  const box = b.parentElement.querySelector(".replay"); b.disabled = true; b.textContent = "Nemotron is replaying it…";
  try {
    const r = await api(`/api/sessions/${state.lastReport.id}/replay`, { method: "POST", body: { index: +b.dataset.i } });
    box.innerHTML = `<div class="rp was"><small>What happened</small><p><b>You:</b> ${esc(r.you_said)}</p>${r.they_said ? `<p><b>${esc(r.name)}:</b> ${esc(r.they_said)}</p>` : ""}</div>
      <div class="rp now"><small>With the better line</small><p><b>You:</b> ${esc(r.better)}</p><p><b>${esc(r.name)}:</b> ${esc(r.they_would_say)}</p></div>`;
    box.hidden = false; b.hidden = true; Sfx.pop(2);
  } catch (err) { b.disabled = false; b.textContent = "See how they’d respond"; toast(err.message); }
});
