// Natural voice in the browser. Kokoro (open source, 82M parameters) runs on the visitor's own GPU through WebGPU, so the hosted
// demo gets a realistic voice with no server and no cost. Needs Chrome or Edge with WebGPU; anywhere else the browser voices are used.
// The model (163 MB) downloads once and is then cached by the browser.
const webTts = (() => {
  const LIB = "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm", MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
  // Same voice pools as app/tts_local.py: (region, gender, age band)
  const VOICES = {
    "us-f-young": ["af_bella", "af_heart", "af_jessica", "af_nova", "af_sky", "af_river"],
    "us-f-old": ["af_nicole", "af_sarah", "af_heart", "af_kore"],
    "us-m-young": ["am_adam", "am_liam", "am_echo", "am_eric"],
    "us-m-old": ["am_michael", "am_fenrir", "am_onyx", "am_puck"],
    "gb-f-young": ["bf_lily", "bf_isabella", "bf_emma"],
    "gb-f-old": ["bf_emma", "bf_alice", "bf_isabella"],
    "gb-m-young": ["bm_daniel", "bm_fable", "bm_lewis"],
    "gb-m-old": ["bm_george", "bm_lewis", "bm_fable"],
  };
  const BRITISH = ["en-GB", "en-IE", "en-scotland", "en-AU", "en-NZ", "en-ZA", "en-IN"];
  const hash = (id) => [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const voiceFor = (p) => {
    const pool = VOICES[`${BRITISH.includes(p.accent || "en-CA") ? "gb" : "us"}-${p.gender === "f" ? "f" : "m"}-${p.age >= 58 ? "old" : "young"}`];
    return pool[hash(p.id) % pool.length];
  };
  const speedFor = (p, mood) => {
    let s = p.age >= 70 ? 0.92 : p.age >= 60 ? 0.96 : 1;
    if (/rushed|terse|busy|blunt/.test(p.personality || "")) s += 0.08;
    s += { annoyed: 0.04, happy: 0.02, thinking: -0.04, confused: -0.03 }[mood] || 0;
    return Math.round(Math.max(0.8, Math.min(1.2, s)) * 100) / 100;
  };
  const speakable = (t) => t.replace(/\*/g, "").replace(/\s*[—–]\s*/g, ", ").replace(/(\d)\s*%/g, "$1 percent").replace(/&/g, " and ").replace(/’/g, "'");

  let supported = false, phase = "idle", engine = null, loading = null, chain = Promise.resolve(), onStatus = () => {};
  const set = (ph, extra) => { phase = ph; onStatus({ phase: ph, ...extra }); };

  async function init() {
    try {
      const ad = await navigator.gpu?.requestAdapter();
      supported = !!ad && ad.features.has("shader-f16") && !navigator.connection?.saveData;
    } catch { supported = false; }
    return supported;
  }
  function load() {
    if (!supported || loading) return loading;
    set("loading", { pct: 0 });
    loading = (async () => {
      try {
        const { KokoroTTS } = await import(LIB);
        engine = await KokoroTTS.from_pretrained(MODEL, {
          dtype: "fp16", device: "webgpu",
          progress_callback: (p) => { if (p.status === "progress" && /\.onnx$/.test(p.file || "")) set("loading", { pct: Math.round(p.progress || 0) }); },
        });
        set("ready");
      } catch (e) { engine = null; set("failed", { error: String(e?.message || e) }); }
    })();
    return loading;
  }
  // Wav audio for one line, or null if the voice isn't ready within waitMs (the caller then uses the browser voice).
  async function synth(text, p, mood, waitMs = 8000) {
    if (!supported || phase === "failed") return null;
    load();
    if (!engine) await Promise.race([loading, new Promise((r) => setTimeout(r, waitMs))]);
    if (!engine) return null;
    const job = chain.then(async () => {
      const a = await engine.generate(speakable(text).slice(0, 900), { voice: voiceFor(p), speed: speedFor(p, mood) });
      return a.toBlob();
    });
    chain = job.catch(() => {});
    return job.catch(() => null);
  }
  return {
    init, load, synth,
    set onStatus(f) { onStatus = f; },
    get supported() { return supported; },
    get ready() { return phase === "ready"; },
    get failed() { return phase === "failed"; },
  };
})();
