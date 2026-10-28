// Illustrated owner faces. Inline SVG, no images or libraries.
// Faces.svg(appearance)        -> static markup (used on the persona cards)
// Faces.mount(el, appearance)  -> live face with moods, blinking, breathing and lip movement
// Every face has the same structure; only skin, hair, facial hair, glasses, age lines and clothes vary.
const Faces = (() => {
  const SKIN = { fair: "#f6d8c3", light: "#efc4a0", olive: "#d8a878", medium: "#c48a5e", tan: "#a8683f", brown: "#86512f", deep: "#5d3a25" };
  const HAIR = { black: "#1d1a19", darkbrown: "#3a2a20", brown: "#5c3b26", auburn: "#8a3f24", blonde: "#d7b46a", grey: "#a8a8a8", white: "#e8e6e1" };
  const INK = "#2a1a18";

  // Expression targets. bi: inner brow tilt (+ = inner ends down/angry, - = inner ends up/worried);
  // bly/bry: left/right brow height offset; eye: eyelid openness; px/py: gaze; m*: mouth.
  const MOODS = {
    neutral:    { bi: 0,  bly: 0,  bry: 0,  eye: 1,    px: 0, py: 0,  mw: 13, mcl: -0.5, mcr: -0.5, mu: 0,  ml: 0 },
    interested: { bi: -4, bly: -4, bry: -4, eye: 1.1,  px: 0, py: 0,  mw: 13, mcl: -2,   mcr: -2,   mu: -1, ml: 2 },
    happy:      { bi: -2, bly: -2, bry: -2, eye: 0.72, px: 0, py: 0,  mw: 19, mcl: -6,   mcr: -6,   mu: 0,  ml: 9 },
    skeptical:  { bi: 6,  bly: 3,  bry: -8, eye: 0.8,  px: 3, py: 0,  mw: 12, mcl: 1,    mcr: -3,   mu: 0,  ml: 0 },
    annoyed:    { bi: 16, bly: 2,  bry: 2,  eye: 0.62, px: 0, py: 0,  mw: 13, mcl: 4,    mcr: 4,    mu: 0,  ml: 0 },
    confused:   { bi: -12, bly: -3, bry: -6, eye: 1.05, px: 2, py: -2, mw: 10, mcl: 3,    mcr: -2,   mu: -2, ml: 2 },
    thinking:   { bi: 0,  bly: -5, bry: 1,  eye: 0.95, px: 4, py: -4, mw: 8,  mcl: 0,    mcr: -1.5, mu: 0,  ml: 0 },
  };
  const KEYS = Object.keys(MOODS.neutral);

  const shade = (hex, amt) => {
    const n = parseInt(hex.slice(1), 16), f = (c) => Math.max(0, Math.min(255, Math.round(c * (1 + amt))));
    return "#" + [n >> 16, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, "0")).join("");
  };
  const num = (v) => Math.round(v * 100) / 100;

  // ---- geometry that changes with the mood ----
  const EYE = { l: [78, 92], r: [122, 92] }, BROW = { l: [78, 74], r: [122, 74] }, MOUTH = [100, 132];
  const browT = (side, p) => {
    const [x, y] = BROW[side], tilt = side === "l" ? p.bi : -p.bi, dy = side === "l" ? p.bly : p.bry;
    return `translate(${x} ${num(y + dy)}) rotate(${num(tilt)})`;
  };
  const eyeT = (side, p, blink = 1) => `translate(${EYE[side][0]} ${EYE[side][1]}) scale(1 ${num(Math.max(0.06, p.eye * blink))})`;
  const mouthD = (p, open = 0) => {
    const [cx, cy] = MOUTH, lx = cx - p.mw, rx = cx + p.mw;
    const u = cy + p.mu - open * 2, l = cy + p.ml + open * 17;
    return `M${lx} ${num(cy + p.mcl)} Q${cx} ${num(u)} ${rx} ${num(cy + p.mcr)} Q${cx} ${num(l)} ${lx} ${num(cy + p.mcl)}Z`;
  };
  const mouthFill = (p, open = 0) => Math.max(0, Math.min(1, (p.ml + open * 17 - p.mu) / 5));

  // ---- static parts ----
  function hair(style, c) {
    const cap = `<path d="M50 92 C44 38 82 26 102 27 C128 28 158 42 150 92 C146 70 134 57 100 55 C66 57 54 70 50 92Z" fill="${c}"/>`;
    const sweep = `<path d="M50 92 C42 38 84 25 106 27 C134 30 158 46 150 92 C147 68 130 58 110 57 C90 58 70 62 61 76 C57 82 54 88 50 92Z" fill="${c}"/>`;
    switch (style) {
      case "short": return { front: cap };
      case "sidepart": return { front: sweep };
      case "buzz": return { front: `<path d="M51 88 C47 44 82 30 100 30 C120 30 154 44 149 88 C145 68 134 58 100 56 C66 58 55 68 51 88Z" fill="${c}" opacity=".55"/>` };
      case "balding": return { front: `<path d="M50 104 C44 82 52 66 63 62 C61 76 59 90 57 106Z" fill="${c}"/><path d="M150 104 C156 82 148 66 137 62 C139 76 141 90 143 106Z" fill="${c}"/>` };
      case "long": return { back: `<path d="M45 92 C38 38 70 22 100 22 C130 22 162 38 155 92 L160 170 L40 170Z" fill="${c}"/>`, front: sweep };
      case "bob": return { back: `<path d="M45 92 C40 40 72 24 100 24 C128 24 160 40 155 92 L157 140 Q100 152 43 140Z" fill="${c}"/>`, front: sweep };
      case "bun": return { back: `<circle cx="100" cy="21" r="14" fill="${c}"/>`, front: cap };
      case "ponytail": return { back: `<path d="M140 66 Q182 70 172 134 Q164 112 148 100Z" fill="${c}"/>`, front: sweep };
      case "curly": {
        let b = "";
        for (let i = 0; i < 11; i++) { const a = Math.PI * (0.95 - (i / 10) * 0.9) + Math.PI; b += `<circle cx="${num(100 + 50 * Math.cos(a))}" cy="${num(78 + 52 * Math.sin(a))}" r="15" fill="${c}"/>`; }
        return { back: b, front: cap };
      }
      default: return {}; // bald
    }
  }
  function facialHair(kind, c, skin) {
    const must = `<path d="M81 125 Q90 116 100 122 Q110 116 119 125 Q110 129 100 125 Q90 129 81 125Z" fill="${c}"/>`;
    const patch = `<ellipse cx="100" cy="132" rx="17" ry="8" fill="${skin}"/>`;
    switch (kind) {
      case "stubble": return { under: `<path d="M53 108 Q56 148 100 152 Q144 148 147 108 Q140 124 100 125 Q60 124 53 108Z" fill="${c}" opacity=".2"/>`, over: "" };
      case "mustache": return { under: "", over: must };
      case "goatee": return { under: `<path d="M90 141 Q100 160 110 141 Q100 147 90 141Z" fill="${c}"/>`, over: must };
      case "beard": return { under: `<path d="M50 96 Q48 150 100 161 Q152 150 150 96 Q146 120 126 126 Q100 118 74 126 Q54 120 50 96Z" fill="${c}"/>${patch}`, over: must };
      default: return { under: "", over: "" };
    }
  }
  function glasses(kind) {
    if (kind === "round") return `<g fill="rgba(255,255,255,.14)" stroke="#222" stroke-width="2.2"><circle cx="78" cy="92" r="14.5"/><circle cx="122" cy="92" r="14.5"/><path d="M92.5 90 Q100 86 107.5 90" fill="none"/><path d="M63.5 90 L52 88 M136.5 90 L148 88" fill="none"/></g>`;
    if (kind === "square") return `<g fill="rgba(255,255,255,.14)" stroke="#222" stroke-width="2.2"><rect x="63" y="82" width="30" height="21" rx="5"/><rect x="107" y="82" width="30" height="21" rx="5"/><path d="M93 89 Q100 86 107 89" fill="none"/><path d="M63 88 L52 86 M137 88 L148 86" fill="none"/></g>`;
    return "";
  }
  function lines(n, tone) {
    if (!n) return "";
    let s = `<g fill="none" stroke="${tone}" stroke-width="1.6" stroke-linecap="round" opacity=".6"><path d="M82 120 Q77 130 83 141"/><path d="M118 120 Q123 130 117 141"/>`;
    if (n > 1) s += `<path d="M78 66 Q100 62 122 66"/><path d="M82 62 Q100 58 118 62"/><path d="M57 88 L65 90 M57 95 L65 94"/><path d="M143 88 L135 90 M143 95 L135 94"/>`;
    return s + "</g>";
  }

  // Markup for a face with the given mood parameters (all dynamic parts carry data-r so mount() can animate them).
  function svg(a, p = MOODS.neutral) {
    const skin = SKIN[a.skin] || SKIN.light, tone = shade(skin, -0.16), hc = HAIR[a.hairColor] || HAIR.black;
    const h = hair(a.hairStyle, hc), f = facialHair(a.facialHair, hc, skin);
    const clothes = a.clothes || "#3a3a3a", brow = (s) => `<path data-r="brow-${s}" d="M-11 2 Q0 -3 11 2" transform="${browT(s, p)}" fill="none" stroke="${shade(hc, -0.1)}" stroke-width="4" stroke-linecap="round"/>`;
    const eye = (s) => `<g data-r="eye-${s}" transform="${eyeT(s, p)}"><ellipse rx="9.5" ry="8" fill="#fff" stroke="${INK}" stroke-width="1.6"/><circle data-r="iris-${s}" cx="${num(p.px)}" cy="${num(p.py)}" r="4.6" fill="${INK}"/></g>`;
    return `<svg class="face-svg" viewBox="22 18 156 156" role="img" aria-label="Illustrated face of the business owner" xmlns="http://www.w3.org/2000/svg"><g class="face-all">
      ${h.back || ""}
      <path d="M14 200 Q18 168 64 158 L136 158 Q182 168 186 200Z" fill="${clothes}"/>
      <path d="M86 158 L100 176 L114 158Z" fill="${shade(clothes, 0.35)}"/>
      <rect x="84" y="132" width="32" height="34" rx="10" fill="${tone}"/>
      <ellipse cx="50" cy="96" rx="7" ry="10" fill="${skin}"/><ellipse cx="150" cy="96" rx="7" ry="10" fill="${skin}"/>
      <ellipse cx="100" cy="92" rx="50" ry="58" fill="${skin}"/>
      ${f.under}${h.front || ""}${lines(a.lines, tone)}
      <path d="M100 98 L96 113 Q100 117 105 113" fill="none" stroke="${tone}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path data-r="mouth" d="${mouthD(p)}" fill="#4a1f1f" fill-opacity="${num(mouthFill(p))}" stroke="#7a3b35" stroke-width="2.4" stroke-linejoin="round"/>
      ${f.over}${eye("l")}${eye("r")}${brow("l")}${brow("r")}${glasses(a.glasses)}
    </g></svg>`;
  }

  // ---- live face ----
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  function mount(el, a) {
    el.innerHTML = svg(a);
    const q = (n) => el.querySelector(`[data-r="${n}"]`);
    const R = { bl: q("brow-l"), br: q("brow-r"), el: q("eye-l"), er: q("eye-r"), il: q("iris-l"), ir: q("iris-r"), mouth: q("mouth") };
    const cur = { ...MOODS.neutral }, tgt = { ...MOODS.neutral };
    let mood = "neutral", forced = null, speaking = false, mouthOpen = 0, mouthTarget = 0, nextSyl = 0;
    let blinkAt = performance.now() + 2000 + Math.random() * 2500, blinkStart = -1, last = performance.now(), raf = 0, dead = false;

    function frame(now) {
      if (dead) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const still = reduced(), k = still ? 1 : 1 - Math.exp(-dt * 11);
      const goal = MOODS[forced || mood];
      for (const key of KEYS) { tgt[key] = goal[key]; cur[key] += (tgt[key] - cur[key]) * k; }
      // lip movement while the owner is talking: a new random mouth shape every ~110ms
      if (speaking) {
        if (still) mouthTarget = 0.35;
        else if (now > nextSyl) { mouthTarget = Math.random() < 0.2 ? 0.05 : 0.25 + Math.random() * 0.75; nextSyl = now + 80 + Math.random() * 70; }
      } else mouthTarget = 0;
      mouthOpen += (mouthTarget - mouthOpen) * (still ? 1 : 1 - Math.exp(-dt * 26));
      // blink every few seconds at random intervals
      let blink = 1;
      if (!still) {
        if (blinkStart < 0 && now > blinkAt) blinkStart = now;
        if (blinkStart >= 0) {
          const t = (now - blinkStart) / 150;
          if (t >= 1) { blinkStart = -1; blinkAt = now + 2200 + Math.random() * 3800; }
          else blink = Math.abs(1 - 2 * t) * 0.94 + 0.06;
        }
      }
      R.bl.setAttribute("transform", browT("l", cur)); R.br.setAttribute("transform", browT("r", cur));
      R.el.setAttribute("transform", eyeT("l", cur, blink)); R.er.setAttribute("transform", eyeT("r", cur, blink));
      for (const i of [R.il, R.ir]) { i.setAttribute("cx", num(cur.px)); i.setAttribute("cy", num(cur.py)); }
      R.mouth.setAttribute("d", mouthD(cur, mouthOpen)); R.mouth.setAttribute("fill-opacity", num(mouthFill(cur, mouthOpen)));
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    el.classList.add("face-live");
    return {
      setMood(m) { mood = MOODS[m] ? m : "neutral"; },
      setThinking(on) { forced = on ? "thinking" : null; },
      setSpeaking(on) { speaking = !!on; },
      fadeOut() { el.classList.add("face-gone"); },
      reset() { el.classList.remove("face-gone"); mood = "neutral"; forced = null; speaking = false; },
      destroy() { dead = true; cancelAnimationFrame(raf); el.classList.remove("face-live", "face-gone"); },
    };
  }

  return { svg: (a) => svg(a), mount, moods: Object.keys(MOODS) };
})();
