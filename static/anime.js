// The scene and the person, drawn as 2D anime-style SVG: cell-shaded character with big glossy eyes, manga mood symbols and drawn body language,
// in front of a soft-focus illustrated set built from the scene design Nemotron wrote (sky, palette, props).
// Same API as before: mount(el, appearance, opts) -> { setMood, setThinking, setSpeaking, setListening, react, enter, leave, fadeOut, reset, destroy }.
const Figure = (() => {
  const SKIN = { fair: "#fbdcc8", light: "#f5c9a6", olive: "#e0b182", medium: "#cc9262", tan: "#b07548", brown: "#8d5a38", deep: "#64402b" };
  const HAIR = { black: "#2b2330", darkbrown: "#4a3128", brown: "#74482f", auburn: "#a4492b", blonde: "#e6c26e", grey: "#b4b4bd", white: "#ece9ee" };
  const EYES = ["#3f7fc4", "#4f9a62", "#8a5a2b", "#7a58b0", "#2f9a9a", "#b2563f"];
  const INK = "#2a1f2d";
  const SKY = { day: ["#6fc3f5", "#e3f4ff"], golden: ["#f6a15a", "#ffe6b8"], dusk: ["#39367a", "#f2896b"], night: ["#0a0f2e", "#2a3a72"], dawn: ["#7f90d8", "#ffcdb0"], overcast: ["#9aa7b4", "#e1e6ea"] };
  const BASE = { office: ["#d8cdb7", "#8d7a63", "#3f6f8f", "#fff1d6", ["window", "desk", "plant", "shelf"]], door: ["#c9b79c", "#7a6a58", "#b5523b", "#ffd9a0", ["plant", "lamp", "banner"]],
    shop: ["#e4dccb", "#9a8f80", "#d0a63b", "#fff4dc", ["shelf", "counter", "poster", "shelf"]], phone: ["#cfd6df", "#8a8f98", "#5b7fa6", "#f4f7ff", ["window", "shelf", "plant"]],
    home: ["#e6d5bd", "#a47c59", "#a8553b", "#ffe2b5", ["sofa", "lamp", "plant", "rug", "poster"]], cafe: ["#d9c2a1", "#6f5846", "#8a4b2e", "#ffd9a8", ["window", "table", "chair", "lamp"]],
    clinic: ["#e6eee9", "#b5c4c0", "#3f8f86", "#f2fbff", ["cabinet", "screen", "plant", "poster"]], outdoors: ["#cfe6c4", "#7aa064", "#3f7a4f", "#fff6d8", ["tree", "house", "tree"]] };
  const defaultVisual = (kind) => { const b = BASE[kind] || BASE.office; return { sky: "day", palette: { wall: b[0], floor: b[1], accent: b[2], light: b[3] }, props: b[4].map((t, i) => ({ type: t, x: [-0.8, 0.8, -0.3, 0.5, 0][i % 5], z: 0.25 + 0.15 * (i % 3), scale: 1, color: b[2] })) }; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const hex = (h) => { h = h.replace("#", ""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
  const sh = (h, k) => "#" + hex(h).map((c) => clamp(Math.round(c * k), 0, 255).toString(16).padStart(2, "0")).join("");
  const mix = (a, b, t) => "#" + hex(a).map((c, i) => Math.round(c + (hex(b)[i] - c) * t).toString(16).padStart(2, "0")).join("");
  const R = (x, y, w, h, f, extra = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}" ${extra}/>`;
  const O = `stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"`; // the line art

  // ---------- the set: layered, soft focus ----------
  const PROPS = { // each prop is drawn with its base centre at (0,0), growing upward
    window: (c, s, ctx) => `<g transform="scale(${s})"><rect x="-95" y="-300" width="190" height="230" rx="4" fill="url(#sky)" ${O}/>${ctx.sun ? `<circle cx="40" cy="-215" r="34" fill="${ctx.sun}" opacity=".85" filter="url(#glow)"/>` : ""}<path d="M-95 -140 L95 -140 M0 -300 L0 -70" ${O} fill="none"/><rect x="-108" y="-72" width="216" height="12" rx="3" fill="${sh(c, 1.25)}" ${O}/></g>`,
    door: (c, s) => `<g transform="scale(${s})"><rect x="-62" y="-262" width="124" height="262" rx="3" fill="${sh(c, 0.78)}" ${O}/><rect x="-50" y="-250" width="100" height="238" fill="${c}" ${O}/><rect x="-36" y="-232" width="72" height="92" fill="${sh(c, 1.12)}" opacity=".6"/><rect x="-36" y="-120" width="72" height="92" fill="${sh(c, 1.12)}" opacity=".6"/><circle cx="34" cy="-120" r="6" fill="#f3d88a" ${O}/></g>`,
    sofa: (c, s) => `<g transform="scale(${s})"><rect x="-150" y="-110" width="300" height="70" rx="22" fill="${sh(c, 0.85)}" ${O}/><rect x="-170" y="-85" width="46" height="85" rx="18" fill="${sh(c, 0.75)}" ${O}/><rect x="124" y="-85" width="46" height="85" rx="18" fill="${sh(c, 0.75)}" ${O}/><rect x="-128" y="-72" width="256" height="48" rx="14" fill="${c}" ${O}/><path d="M0 -72 L0 -24" ${O}/><rect x="-120" y="-26" width="240" height="10" fill="${sh(c, 0.6)}"/></g>`,
    lamp: (c, s, ctx) => `<g transform="scale(${s})"><circle cx="0" cy="-232" r="70" fill="${ctx.light}" opacity=".35" filter="url(#glow)"/><rect x="-3" y="-215" width="6" height="215" fill="${INK}"/><ellipse cx="0" cy="-2" rx="34" ry="8" fill="${INK}"/><path d="M-32 -222 L32 -222 L20 -264 L-20 -264 Z" fill="${ctx.light}" ${O}/></g>`,
    plant: (c, s) => `<g transform="scale(${s})"><path d="M-26 -50 L26 -50 L20 0 L-20 0 Z" fill="#c26b44" ${O}/>${[-60, -30, 0, 30, 60].map((a, i) => `<ellipse cx="0" cy="-95" rx="14" ry="50" fill="${["#4f9a5c", "#3f8650", "#63b36d"][i % 3]}" transform="rotate(${a} 0 -50)" ${O}/>`).join("")}</g>`,
    shelf: (c, s) => `<g transform="scale(${s})"><rect x="-70" y="-250" width="140" height="250" rx="3" fill="#8a6a4a" ${O}/>${[0, 1, 2, 3].map((i) => `<rect x="-62" y="${-60 - i * 58}" width="124" height="6" fill="#b08a62"/>${[0, 1, 2].map((j) => `<rect x="${-52 + j * 38}" y="${-96 - i * 58}" width="26" height="${34 + ((i + j) % 2) * 6}" rx="2" fill="${[c, "#f1ece0", sh(c, 0.6), "#d9c9a8"][(i + j) % 4]}" ${O}/>`).join("")}`).join("")}</g>`,
    desk: (c, s, ctx) => `<g transform="scale(${s})"><rect x="-120" y="-90" width="240" height="14" rx="3" fill="#8b6b4a" ${O}/><rect x="-110" y="-76" width="10" height="76" fill="#5a4531"/><rect x="100" y="-76" width="10" height="76" fill="#5a4531"/><rect x="-44" y="-170" width="88" height="62" rx="4" fill="#20242a" ${O}/><rect x="-38" y="-164" width="76" height="50" fill="${ctx.light}" opacity=".9"/><rect x="-8" y="-108" width="16" height="18" fill="#20242a"/></g>`,
    counter: (c, s) => `<g transform="scale(${s})"><rect x="-170" y="-120" width="340" height="120" rx="4" fill="${c}" ${O}/><rect x="-178" y="-132" width="356" height="16" rx="4" fill="#f1ece0" ${O}/><rect x="60" y="-172" width="60" height="40" rx="5" fill="#20242a" ${O}/></g>`,
    car: (c, s) => `<g transform="scale(${s})"><path d="M-190 -40 C-190 -80 -170 -88 -140 -92 L-90 -142 C-80 -154 -64 -156 -50 -156 L50 -156 C70 -156 82 -150 94 -138 L130 -94 C166 -90 190 -80 190 -40 Z" fill="${c}" ${O}/><path d="M-82 -134 L-52 -146 L-8 -146 L-8 -98 L-100 -98 Z M6 -146 L56 -146 L90 -112 L90 -98 L6 -98 Z" fill="#a9d4ec" ${O}/><path d="M-190 -62 L190 -62" stroke="${sh(c, 0.7)}" stroke-width="3" fill="none"/>${[-110, 112].map((x) => `<circle cx="${x}" cy="-30" r="34" fill="#1d1c22" ${O}/><circle cx="${x}" cy="-30" r="17" fill="#c9ccd4"/>`).join("")}<ellipse cx="184" cy="-66" rx="9" ry="6" fill="#fff6c4" filter="url(#glow)"/></g>`,
    house: (c, s) => `<g transform="scale(${s})"><rect x="-130" y="-170" width="260" height="170" fill="${c}" ${O}/><path d="M-160 -170 L0 -270 L160 -170 Z" fill="${sh(c, 0.55)}" ${O}/><rect x="-26" y="-98" width="52" height="98" fill="#5a3a2a" ${O}/>${[-80, 80].map((x) => `<rect x="${x - 24}" y="-130" width="48" height="52" fill="#bfe3f5" ${O}/>`).join("")}</g>`,
    poster: (c, s) => `<g transform="scale(${s})"><rect x="-48" y="-170" width="96" height="130" fill="#2b2b2b" ${O}/><rect x="-40" y="-162" width="80" height="114" fill="${c}"/><circle cx="0" cy="-118" r="22" fill="#f1ece0" opacity=".85"/><rect x="-28" y="-80" width="56" height="8" fill="#f1ece0" opacity=".85"/></g>`,
    table: (c, s) => `<g transform="scale(${s})"><ellipse cx="0" cy="-92" rx="70" ry="16" fill="${sh(c, 0.95)}" ${O}/><rect x="-5" y="-92" width="10" height="88" fill="#2a2622"/><ellipse cx="0" cy="-3" rx="34" ry="7" fill="#2a2622"/></g>`,
    chair: (c, s) => `<g transform="scale(${s})"><rect x="-32" y="-94" width="64" height="10" rx="3" fill="${c}" ${O}/><rect x="-32" y="-160" width="64" height="66" rx="5" fill="${sh(c, 0.9)}" ${O}/><rect x="-28" y="-84" width="6" height="84" fill="#2a2622"/><rect x="22" y="-84" width="6" height="84" fill="#2a2622"/></g>`,
    screen: (c, s) => `<g transform="scale(${s})"><rect x="-4" y="-130" width="8" height="130" fill="#2a2622"/><rect x="-80" y="-232" width="160" height="96" rx="6" fill="#15181d" ${O}/><rect x="-72" y="-224" width="144" height="80" fill="${sh(c, 1.25)}" opacity=".95"/></g>`,
    tree: (c, s) => `<g transform="scale(${s})"><rect x="-12" y="-150" width="24" height="150" fill="#6b4a2f" ${O}/><circle cx="0" cy="-200" r="72" fill="#4f9a5c" ${O}/><circle cx="-42" cy="-160" r="46" fill="#5fae6a" ${O}/><circle cx="46" cy="-170" r="50" fill="#439052" ${O}/></g>`,
    banner: (c, s) => `<g transform="scale(${s})"><rect x="-32" y="-260" width="64" height="170" fill="${c}" ${O}/><rect x="-40" y="-266" width="80" height="8" fill="#2a2622"/><circle cx="0" cy="-205" r="16" fill="#f1ece0" opacity=".9"/></g>`,
    rug: (c, s) => `<g transform="scale(${s})"><ellipse cx="0" cy="-6" rx="150" ry="22" fill="${c}" ${O}/><ellipse cx="0" cy="-6" rx="108" ry="14" fill="${sh(c, 1.25)}"/></g>`,
    cabinet: (c, s) => `<g transform="scale(${s})"><rect x="-52" y="-240" width="104" height="240" rx="3" fill="${sh(c, 1.1)}" ${O}/><path d="M0 -240 L0 0" ${O}/><rect x="-14" y="-124" width="6" height="30" fill="#d8d8d8"/><rect x="8" y="-124" width="6" height="30" fill="#d8d8d8"/></g>`,
  };
  const WALL_PROPS = new Set(["window", "door", "poster", "banner", "screen"]);

  // The front of a house, whole: this is what you see when you walk up to knock. The windows are big and shiny, so window cleaning has something to clean.
  function exterior(V, P, sk, ctx) {
    const cx = 330, wall = P.wall, roof = sh(P.accent, 0.62), grass = mix(P.floor, "#5aa05a", 0.55), win = (x, y, w, h, i) => `<g><rect x="${x - 7}" y="${y - 7}" width="${w + 14}" height="${h + 14}" rx="3" fill="#f4efe4" ${O}/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#sky)"/><path d="M${x + w * 0.15} ${y + h} L${x + w * 0.55} ${y} L${x + w * 0.75} ${y} L${x + w * 0.35} ${y + h}Z" fill="#fff" opacity=".3"/><path d="M${x} ${y + h / 2} L${x + w} ${y + h / 2} M${x + w / 2} ${y} L${x + w / 2} ${y + h}" ${O} fill="none"/><path class="glint" d="M${x + 6} ${y + h - 6} L${x + 26} ${y + 6}" stroke="#fff" stroke-width="7" opacity="0" style="animation-delay:${i * 1.3}s"/><path d="M${x - 7} ${y + h + 7} L${x + w + 7} ${y + h + 7}" stroke="${INK}" stroke-width="5"/></g>`;
    let s = `<rect x="-400" y="388" width="1800" height="260" fill="${grass}"/><path d="M-400 400 C100 392 700 392 1400 404 L1400 420 L-400 420Z" fill="${sh(grass, 0.88)}"/>`;
    s += `<path d="M${cx - 38} 420 L${cx + 38} 420 L${cx + 120} 560 L${cx - 120} 560Z" fill="${mix(P.floor, "#ffffff", 0.4)}" ${O}/>`;
    s += `<rect x="${cx - 265}" y="180" width="530" height="240" fill="${wall}" ${O}/>` + Array.from({ length: 16 }, (_, i) => `<path d="M${cx - 265} ${194 + i * 14} L${cx + 265} ${194 + i * 14}" stroke="${sh(wall, 0.8)}" stroke-width="1.4" opacity=".5"/>`).join("");
    s += `<path d="M${cx - 300} 186 L${cx} 56 L${cx + 300} 186Z" fill="${roof}" ${O}/><path d="M${cx - 260} 180 L${cx} 76 L${cx + 260} 180" stroke="${sh(roof, 1.25)}" stroke-width="3" fill="none" opacity=".6"/><rect x="${cx + 120}" y="64" width="40" height="70" fill="${sh(wall, 0.7)}" ${O}/>`;
    s += win(cx - 215, 246, 112, 96, 0) + win(cx + 103, 246, 112, 96, 1) + win(cx - 28, 94, 56, 50, 2);
    s += `<rect x="${cx - 52}" y="262" width="104" height="160" fill="#5a3a2a" ${O}/><rect x="${cx - 44}" y="270" width="88" height="152" fill="#ffd98f" opacity=".85"/>`; // the warm light inside, seen when the door opens
    s += `<g id="hdoor"><rect x="${cx - 52}" y="262" width="104" height="160" fill="${P.accent}" ${O}/><rect x="${cx - 38}" y="276" width="76" height="58" fill="${sh(P.accent, 1.15)}" opacity=".7"/><rect x="${cx - 38}" y="346" width="76" height="62" fill="${sh(P.accent, 1.15)}" opacity=".7"/><circle cx="${cx + 36}" cy="344" r="6" fill="#f3d88a" ${O}/></g>`;
    s += `<path d="M${cx - 76} 262 L${cx} 232 L${cx + 76} 262Z" fill="${roof}" ${O}/><rect x="${cx - 76}" y="262" width="12" height="160" fill="#f4efe4" ${O}/><rect x="${cx + 64}" y="262" width="12" height="160" fill="#f4efe4" ${O}/>`;
    s += `<circle cx="${cx - 66}" cy="258" r="30" fill="${ctx.light}" opacity=".35" filter="url(#glow)"/><rect x="${cx - 69}" y="250" width="7" height="12" fill="${ctx.light}" ${O}/>`;
    s += [0, 1, 2].map((i) => `<rect x="${cx - 70 - i * 6}" y="${422 + i * 12}" width="${140 + i * 12}" height="12" fill="#cfc8bb" ${O}/>`).join("");
    s += [-1, 1].flatMap((d) => [0, 1, 2].map((i) => `<circle cx="${cx + d * (150 + i * 34)}" cy="${414 - (i % 2) * 6}" r="${26 - i * 3}" fill="${["#4f9a5c", "#5fae6a", "#439052"][i]}" ${O}/>`)).join("") + `<circle cx="${cx - 160}" cy="400" r="4" fill="#ff7aa8"/><circle cx="${cx + 190}" cy="408" r="4" fill="#ffd36b"/>`;
    s += `<g transform="translate(${cx + 330} 440)"><rect x="-3" y="-60" width="6" height="60" fill="#5a4531"/><rect x="-20" y="-82" width="40" height="26" rx="4" fill="${P.accent}" ${O}/></g>`;
    for (const pr of V.props) { const f = { tree: [-70, 410, 1.15], car: [830, 470, 0.78], plant: [cx + 96, 424, 0.9], lamp: [cx - 180, 420, 0.8], banner: null }[pr.type]; if (f && PROPS[pr.type]) s += `<g transform="translate(${f[0]} ${f[1]}) scale(${f[2]})">${PROPS[pr.type](pr.color || P.accent, 1, ctx)}</g>`; }
    return s;
  }

  function background(V, kind) {
    const P = V.palette, sk = SKY[V.sky] || SKY.day, outdoor = kind === "outdoors", night = V.sky === "night";
    const sun = { golden: "#ffd9a0", dusk: "#ffb38a", dawn: "#ffe0c4", day: "#fff6d6" }[V.sky] || null, horizon = 345;
    let s = `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sk[0]}"/><stop offset="1" stop-color="${sk[1]}"/></linearGradient>
      <linearGradient id="wallg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${sh(P.wall, 0.9)}"/><stop offset=".5" stop-color="${P.wall}"/><stop offset="1" stop-color="${sh(P.wall, 0.86)}"/></linearGradient>
      <linearGradient id="floorg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sh(P.floor, 1.12)}"/><stop offset="1" stop-color="${sh(P.floor, 0.8)}"/></linearGradient>
      <radialGradient id="vig" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#1a1030" stop-opacity=".55"/></radialGradient>
      <radialGradient id="bloom" cx=".2" cy=".15" r=".8"><stop offset="0" stop-color="${P.light}" stop-opacity=".5"/><stop offset="1" stop-color="${P.light}" stop-opacity="0"/></radialGradient>
      <filter id="dof" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="${kind === "door" ? 1.1 : kind === "phone" ? 7 : 2.2}"/></filter><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter></defs>`;
    s += `<g id="bg" filter="url(#dof)">${R(-400, -200, 1800, 900, "url(#sky)")}`;
    if (night) s += Array.from({ length: 40 }, (_, i) => `<circle cx="${(i * 137) % 1400 - 200}" cy="${(i * 71) % 300}" r="${1 + (i % 3) * 0.6}" fill="#fff" opacity="${0.5 + (i % 4) * 0.12}"/>`).join("");
    else s += `<ellipse cx="220" cy="90" rx="170" ry="34" fill="#fff" opacity=".55" filter="url(#glow)"/><ellipse cx="780" cy="60" rx="210" ry="30" fill="#fff" opacity=".45" filter="url(#glow)"/>`;
    if (outdoor || kind === "door") { s += `<path d="M-300 ${horizon} C-100 ${horizon - 110} 120 ${horizon - 40} 320 ${horizon - 90} C520 ${horizon - 140} 720 ${horizon - 40} 1300 ${horizon - 100} L1300 ${horizon + 20} L-300 ${horizon + 20}Z" fill="${mix(P.accent, sk[1], 0.4)}" opacity=".8"/>`; }
    if (kind !== "door") {
      if (!outdoor) s += R(-400, -200, 1800, horizon + 200, "url(#wallg)") + R(-400, horizon - 14, 1800, 14, sh(P.wall, 0.72)) + R(-400, 190, 1800, 8, P.accent, 'opacity=".75"');
      s += `<rect x="-400" y="${horizon}" width="1800" height="400" fill="url(#floorg)"/>`;
      for (let i = 1; i < 8; i++) s += `<path d="M-400 ${horizon + i * i * 3.4} L1400 ${horizon + i * i * 3.4}" stroke="${sh(P.floor, 0.7)}" stroke-width="1.2" opacity=".35"/>`;
    }
    const ctx = { sun, light: P.light };
    if (kind === "door") s += exterior(V, P, sk, ctx);
    const items = kind === "door" ? [] : [...V.props].sort((a, b) => (WALL_PROPS.has(a.type) ? -1 : a.z) - (WALL_PROPS.has(b.type) ? -1 : b.z));
    for (const pr of items) { const make = PROPS[pr.type]; if (!make) continue; const wall = WALL_PROPS.has(pr.type), x = 500 + pr.x * 430, persp = wall ? 1 : 0.72 + pr.z * 0.5, y = wall ? (pr.type === "window" || pr.type === "screen" ? horizon + 10 : horizon - 8) : horizon + 14 + pr.z * 150;
      s += `<g transform="translate(${x} ${y}) scale(${persp})" ${wall ? "" : `filter="drop-shadow(0 6px 4px rgba(0,0,0,.18))"`}>${make(pr.color || P.accent, pr.scale || 1, ctx)}</g>`; }
    s += `</g>`;
    s += `<rect x="-400" y="-200" width="1800" height="900" fill="url(#bloom)"/>`;
    s += Array.from({ length: 14 }, (_, i) => `<circle class="mote" cx="${(i * 97) % 1000}" cy="${(i * 53) % 520}" r="${2 + (i % 4)}" fill="${P.light}" opacity=".35" style="animation-delay:${-i * 0.9}s"/>`).join("");
    return s;
  }

  // ---------- the person ----------
  function person(a, opts) {
    const skin = SKIN[a.skin] || SKIN.light, hair = HAIR[a.hairColor] || HAIR.black, cl = a.clothes || "#4f6f8f", eye = EYES[(a.skin + a.hairStyle + (opts.age || 0)).length % EYES.length];
    const f = opts.gender === "f" || /bob|long|bun|ponytail/.test(a.hairStyle), sd = sh(skin, 0.86), hd = sh(hair, 0.72), hl = mix(hair, "#ffffff", 0.35), cd = sh(cl, 0.75), st = a.hairStyle;
    const sleeve = (d) => `<path d="${d}" fill="${cl}" ${O}/>`, hand = (x, y, r = 22) => `<g transform="translate(${x} ${y})"><circle r="${r}" fill="${skin}" ${O}/><path d="M${-r * 0.5} ${-r * 0.2} L${-r * 0.5} ${r * 0.5} M0 ${-r * 0.3} L0 ${r * 0.6} M${r * 0.5} ${-r * 0.2} L${r * 0.5} ${r * 0.5}" stroke="${sd}" stroke-width="2" fill="none"/></g>`;
    const arms = {
      down: `${sleeve("M318 575 C310 500 318 450 352 425 L388 450 C372 480 368 520 372 575Z")}${sleeve("M682 575 C690 500 682 450 648 425 L612 450 C628 480 632 520 628 575Z")}`,
      crossed: `${sleeve("M338 540 C340 505 380 488 470 484 L610 468 C640 466 652 500 630 514 L470 540 C420 548 370 566 338 540Z")}${sleeve("M662 540 C660 505 620 488 530 484 L390 468 C360 466 348 500 370 514 L530 540 C580 548 630 566 662 540Z")}${hand(626, 486)}${hand(374, 486)}`,
      chin: `${sleeve("M370 560 C372 520 400 506 470 506 L620 506 C640 506 640 540 620 548 L470 556 C430 560 396 566 370 560Z")}${sleeve("M640 575 C650 510 640 440 560 380 L590 352 C670 420 690 520 686 575Z")}${hand(572, 362, 24)}`,
      shrug: `${sleeve("M330 575 C300 520 296 470 312 440 L350 452 C346 480 356 520 372 575Z")}${sleeve("M670 575 C700 520 704 470 688 440 L650 452 C654 480 644 520 628 575Z")}${hand(300, 418, 25)}${hand(700, 418, 25)}`,
      open: `${sleeve("M330 575 C296 540 270 510 262 478 L300 462 C316 490 346 520 372 575Z")}${sleeve("M670 575 C704 540 730 510 738 478 L700 462 C684 490 654 520 628 575Z")}${hand(268, 458, 25)}${hand(732, 458, 25)}`,
      talk: `${sleeve("M318 575 C310 500 318 450 352 425 L388 450 C372 480 368 520 372 575Z")}${sleeve("M650 575 C690 500 690 440 650 392 L690 372 C730 430 730 520 686 575Z")}${hand(668, 366, 25)}`,
      shake: `${sleeve("M318 575 C310 500 318 450 352 425 L388 450 C372 480 368 520 372 575Z")}${sleeve("M660 575 C680 520 660 470 560 452 L574 420 C700 444 740 520 690 575Z")}${hand(556, 436, 25)}`,
    };
    const torso = `<path d="M300 575 C300 470 360 420 440 404 L560 404 C640 420 700 470 700 575Z" fill="${cl}" ${O}/><path d="M440 404 L500 470 L560 404 Z" fill="${skin}" ${O}/><path d="M440 404 L470 420 L500 470 L450 430Z M560 404 L530 420 L500 470 L550 430Z" fill="${mix(cl, "#ffffff", 0.22)}" ${O}/><path d="M300 575 C300 520 320 470 352 440 C340 490 340 540 346 575Z" fill="${cd}" opacity=".55"/><path d="M640 450 C680 480 698 520 700 575 L664 575 C668 530 660 490 640 450Z" fill="${cd}" opacity=".35"/>`;
    const face = `<path d="M-80 -34 C-84 46 -54 102 0 120 C54 102 84 46 80 -34 C74 -112 -74 -112 -80 -34Z" fill="${skin}" ${O}/><path d="M-80 -4 C-74 54 -48 96 0 112 C-24 96 -50 60 -58 14Z" fill="${sd}" opacity=".5"/>`;
    const ears = [-1, 1].map((s) => `<ellipse cx="${s * 82}" cy="6" rx="12" ry="18" fill="${skin}" ${O}/>`).join("");
    const eyeG = (s) => `<g class="eye${s < 0 ? "L" : "R"}" transform="translate(${s * 38} 10)"><ellipse rx="25" ry="29" fill="#fff" ${O}/><g class="iris"><ellipse rx="19" ry="26" fill="${eye}"/><ellipse rx="19" ry="26" fill="url(#irisg)" opacity=".7"/><ellipse rx="9" ry="14" fill="${INK}"/><circle cx="-7" cy="-10" r="7" fill="#fff"/><circle cx="7" cy="9" r="3.4" fill="#fff" opacity=".9"/><circle class="spark" cx="8" cy="-12" r="2.6" fill="#fff"/></g>
      <rect class="lid" x="-30" y="-34" width="60" height="0" fill="${skin}"/><path class="lash" d="M-28 -24 Q0 -38 28 -24 L34 ${s < 0 ? -30 : -30}" stroke="${INK}" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M-22 26 Q0 32 22 26" stroke="${INK}" stroke-width="1.6" fill="none" opacity=".5"/></g>`;
    const brow = (s) => `<g class="brow${s < 0 ? "L" : "R"}" transform="translate(${s * 38} -40)"><path d="M-24 3 Q0 -9 26 0" stroke="${hair === HAIR.blonde || hair === HAIR.white ? hd : hair}" stroke-width="7" fill="none" stroke-linecap="round"/></g>`;
    const fh = { mustache: `<path d="M-26 66 Q-12 58 0 64 Q12 58 26 66 Q12 74 0 70 Q-12 74 -26 66Z" fill="${hair}" ${O}/>`, goatee: `<path d="M-26 66 Q-12 58 0 64 Q12 58 26 66 Q12 74 0 70 Q-12 74 -26 66Z" fill="${hair}" ${O}/><path d="M-12 100 Q0 126 12 100 Q0 108 -12 100Z" fill="${hair}" ${O}/>`,
      beard: `<path d="M-80 20 C-72 100 -40 128 0 134 C40 128 72 100 80 20 C62 64 30 74 0 70 C-30 74 -62 64 -80 20Z" fill="${hair}" ${O}/>`, stubble: `<path d="M-68 56 C-58 102 -34 120 0 124 C34 120 58 102 68 56 C50 86 26 94 0 92 C-26 94 -50 86 -68 56Z" fill="${hair}" opacity=".2"/>` }[a.facialHair] || "";
    const gl = a.glasses === "round" ? [-1, 1].map((s) => `<circle cx="${s * 38}" cy="10" r="31" fill="#fff" fill-opacity=".12" stroke="${INK}" stroke-width="4"/>`).join("") + `<path d="M-8 6 Q0 -2 8 6" stroke="${INK}" stroke-width="4" fill="none"/>`
      : a.glasses === "square" ? [-1, 1].map((s) => `<rect x="${s * 38 - 32}" y="-18" width="64" height="52" rx="10" fill="#fff" fill-opacity=".12" stroke="${INK}" stroke-width="4"/>`).join("") + `<path d="M-6 4 L6 4" stroke="${INK}" stroke-width="4"/>` : "";
    const cap = (d = 0) => `<path d="M-90 -14 C-104 -150 104 -150 90 -14 C84 -54 58 -84 0 -88 C-58 -84 -84 -54 -90 -14Z" fill="${hair}" ${O} transform="translate(0 ${d})"/>`;
    const bangs = `<path d="M-92 -12 C-98 -130 98 -130 92 -12 C86 -52 66 -62 44 -58 C36 -40 20 -72 4 -70 C-8 -56 -22 -68 -44 -58 C-70 -50 -84 -36 -92 -12Z" fill="${hair}" ${O}/><path d="M-60 -84 Q0 -108 60 -84 Q0 -96 -60 -84Z" fill="${hl}" opacity=".7"/><path d="M-30 -62 Q-20 -40 -34 -22 M10 -66 Q14 -44 4 -26 M40 -58 Q48 -40 40 -24" stroke="${hd}" stroke-width="2" fill="none"/>`;
    const hairBack = { long: `<path d="M-104 -40 C-130 100 -112 250 -80 320 L80 320 C112 250 130 100 104 -40Z" fill="${hair}" ${O}/><path d="M-90 40 C-92 120 -84 200 -70 260" stroke="${hl}" stroke-width="5" fill="none" opacity=".5"/>`, bob: `<path d="M-100 -30 C-116 56 -104 116 -72 138 L72 138 C104 116 116 56 100 -30Z" fill="${hair}" ${O}/>`,
      ponytail: `<path d="M56 -92 C150 -70 170 60 118 170 C112 90 92 20 60 -34Z" fill="${hair}" ${O}/>`, bun: `<circle cx="0" cy="-138" r="34" fill="${hair}" ${O}/><circle cx="-10" cy="-148" r="9" fill="${hl}" opacity=".7"/>` }[st] || "";
    const hairFront = st === "balding" ? [-1, 1].map((s) => `<path d="M${s * 84} -30 C${s * 100} -16 ${s * 96} 18 ${s * 84} 22 C${s * 76} 0 ${s * 74} -20 ${s * 84} -30Z" fill="${hair}" ${O}/>`).join("") + `<ellipse cx="-24" cy="-76" rx="26" ry="9" fill="#fff" opacity=".35"/>`
      : st === "bald" ? `<ellipse cx="-24" cy="-76" rx="26" ry="9" fill="#fff" opacity=".35"/>` : st === "buzz" ? `<g opacity=".6">${cap()}</g>` : st === "curly" ? cap() + Array.from({ length: 13 }, (_, i) => { const an = Math.PI + (i / 12) * Math.PI; return `<circle cx="${Math.cos(an) * 94}" cy="${Math.sin(an) * 70 - 36}" r="24" fill="${hair}" ${O}/>`; }).join("") + bangs
      : st === "sidepart" ? cap() + `<path d="M-92 -12 C-102 -134 98 -134 92 -12 C80 -60 30 -88 -26 -62 C-60 -46 -84 -34 -92 -12Z" fill="${hair}" ${O}/><path d="M-40 -96 Q0 -112 52 -92 Q0 -102 -40 -96Z" fill="${hl}" opacity=".7"/>` : bangs;
    const fx = `<g class="fx fx-happy"><path class="tw" d="M104 -80 l5 -14 l5 14 l14 5 l-14 5 l-5 14 l-5 -14 l-14 -5Z" fill="#ffe36b"/><path class="tw" style="animation-delay:.5s" d="M-120 -30 l4 -11 l4 11 l11 4 l-11 4 l-4 11 l-4 -11 l-11 -4Z" fill="#ffe36b"/></g>
      <g class="fx fx-annoyed" transform="translate(84 -92)"><g class="vein" stroke="#e5483c" stroke-width="5" fill="none" stroke-linecap="round"><path d="M-12 -4 Q-4 -4 -4 -12 M12 -4 Q4 -4 4 -12 M-12 4 Q-4 4 -4 12 M12 4 Q4 4 4 12"/></g></g>
      <g class="fx fx-confused"><path class="drop" d="M98 -30 C98 -44 108 -52 108 -52 C108 -52 118 -44 118 -30 C118 -22 98 -22 98 -30Z" fill="#9fd8ff" ${O}/><text x="-120" y="-70" font-size="46" font-weight="700" fill="${INK}" font-family="Georgia,serif">?</text></g>
      <g class="fx fx-skeptical"><path class="drop" d="M92 -66 C92 -80 102 -88 102 -88 C102 -88 112 -80 112 -66 C112 -58 92 -58 92 -66Z" fill="#9fd8ff" ${O}/></g>
      <g class="fx fx-thinking"><circle cx="104" cy="-96" r="7" fill="${INK}"/><circle cx="128" cy="-112" r="9" fill="${INK}"/><circle cx="156" cy="-132" r="11" fill="${INK}"/></g>
      <g class="fx fx-surprise"><text x="96" y="-84" font-size="54" font-weight="800" fill="#ff6b5b" font-family="Georgia,serif">!</text></g>`;
    const head = `<g id="head" transform="translate(500 250)">${hairBack}<path d="M-26 90 L-26 150 L26 150 L26 90Z" fill="${sd}" ${O}/>${ears}${face}<ellipse class="blush" cx="-52" cy="48" rx="20" ry="11" fill="#ff8d9a" opacity=".25"/><ellipse class="blush" cx="52" cy="48" rx="20" ry="11" fill="#ff8d9a" opacity=".25"/>
      <path d="M-4 50 Q0 56 5 50" stroke="${sh(skin, 0.7)}" stroke-width="2.4" fill="none" stroke-linecap="round"/>${eyeG(-1)}${eyeG(1)}${brow(-1)}${brow(1)}
      <path id="mouth" d="" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>${fh}${gl}${hairFront}${fx}</g>`;
    return `<defs><radialGradient id="irisg" cx=".5" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".25"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient></defs>
      <g id="char"><g id="body">${torso}<g class="arm" data-a="down">${arms.down}</g>${["crossed", "chin", "shrug", "open", "talk", "shake"].map((k) => `<g class="arm" data-a="${k}" opacity="0">${arms[k]}</g>`).join("")}</g>${head}</g>`;
  }

  function mount(el, a, opts = {}) {
    el.innerHTML = ""; el.classList.add("fig");
    const kind = opts.scene || "office", V = opts.visual || defaultVisual(kind), phone = kind === "phone", name = opts.name || "Caller";
    const ui = phone ? `<g id="phoneui"><defs><clipPath id="pclip"><circle cx="500" cy="240" r="158"/></clipPath></defs>${[0, 1, 2].map((i) => `<circle class="ring" cx="500" cy="240" r="166" style="animation-delay:${i * 0.7}s"/>`).join("")}<circle cx="500" cy="240" r="166" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="4"/>
      <text id="plabel" x="500" y="40" text-anchor="middle" font-size="24" fill="#fff" opacity=".9" letter-spacing="3">INCOMING CALL</text><text x="500" y="448" text-anchor="middle" font-size="30" fill="#fff" font-family="Instrument Serif, Georgia, serif">${name.replace(/[<&]/g, "")}</text>
      <text id="timer" x="500" y="476" text-anchor="middle" font-size="18" fill="#fff" opacity=".75"> </text><g id="hang" transform="translate(500 523)"><circle r="21" fill="#e5483c"/><path d="M-11 4 C-4 -4 4 -4 11 4 L7 8 L2 5 L-2 5 L-7 8Z" fill="#fff"/></g></g>` : "";
    el.innerHTML = `<svg class="anime ${phone ? "phone" : ""}" viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g id="cam">${background(V, kind)}</g>${phone ? `<rect x="-400" y="-200" width="1800" height="900" fill="#120d22" opacity=".5"/>` : ""}${ui}<g id="actorclip" ${phone ? 'clip-path="url(#pclip)"' : ""}><g id="actor" ${phone ? 'transform="translate(0 -22) translate(500 250) scale(.78) translate(-500 -250)"' : ""}>${person(a, opts)}</g></g><rect x="-400" y="-200" width="1800" height="900" fill="url(#vig)"/></svg>`;
    const svg = el.querySelector("svg"), q = (s) => svg.querySelector(s), qa = (s) => [...svg.querySelectorAll(s)];
    const head = q("#head"), char = q("#char"), cam = q("#cam"), mouth = q("#mouth"), irises = qa(".iris"), lids = qa(".lid"), lashes = qa(".lash"), brows = { L: q(".browL"), R: q(".browR") }, blush = qa(".blush"), arms = qa(".arm"), hdoor = q("#hdoor"), timer = q("#timer"), plabel = q("#plabel");
    const FACE = { neutral: { bi: 0, by: 0, e: 1, s: 0.15, gx: 0, gy: 0 }, interested: { bi: -0.1, by: 0.014, e: 1.1, s: 0.45, gx: 0, gy: 0 }, happy: { bi: -0.06, by: 0.01, e: 0.78, s: 1, gx: 0, gy: 0 }, skeptical: { bi: 0.16, by: 0, e: 0.72, s: -0.1, gx: 0.5, gy: 0 }, annoyed: { bi: 0.32, by: -0.012, e: 0.62, s: -0.55, gx: 0, gy: 0 }, confused: { bi: -0.22, by: 0.016, e: 1.08, s: -0.2, gx: 0.3, gy: 0.3 }, thinking: { bi: 0, by: 0.012, e: 0.95, s: 0, gx: 0.7, gy: 0.6 } };
    // body language: head tilt (deg), nudge, lean (scale), and which drawn arms are visible
    const POSE = { neutral: { rz: 0, tx: 0, lean: 1, arm: "down" }, interested: { rz: 3, tx: 0, lean: 1.045, arm: "down" }, happy: { rz: 4, tx: 0, lean: 1.02, arm: "open" }, skeptical: { rz: -6, tx: -4, lean: 0.99, arm: "crossed" },
      annoyed: { rz: -3, tx: 10, lean: 0.975, arm: "crossed" }, confused: { rz: 9, tx: 0, lean: 1, arm: "shrug" }, thinking: { rz: -5, tx: 0, lean: 1, arm: "chin" } };
    const st = { rz: 0, tx: 0, lean: 1, hy: 0, bi: 0, by: 0, e: 1, s: 0.15, gx: 0, gy: 0 }, op = Object.fromEntries(["down", "crossed", "chin", "shrug", "open", "talk", "shake"].map((k) => [k, k === "down" ? 1 : 0]));
    let mood = "neutral", forced = null, speaking = false, listening = false, mouthO = 0, mouthT = 0, nextSyl = 0, blinkAt = performance.now() + 2500, blinkS = -1, dead = false, raf = 0, last = performance.now(), t = 0;
    let ox = 0, ex = 0, ey = 0, es = 1, ofade = 1, walk = 0, push = 1, kick = null, shakeHands = 0, doorOpen = kind === "door" ? 0 : 1, px = 0, connected = 0;
    const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches, base = phone ? 0 : 190; // in person, the prospect stands to the right so the whole place stays in view
    if (kind === "door") ofade = 0;

    function frame(now) {
      if (dead) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      const k = still() ? 1 : 1 - Math.exp(-dt * 6), kf = still() ? 1 : 1 - Math.exp(-dt * 11), m = forced || mood, P = POSE[m] || POSE.neutral, F = FACE[m] || FACE.neutral;
      for (const key of ["rz", "tx", "lean"]) st[key] += (P[key] - st[key]) * k; for (const key of ["bi", "by", "e", "s", "gx", "gy"]) st[key] += (F[key] - st[key]) * kf;
      const want = shakeHands ? "shake" : speaking && !/skeptical|annoyed|thinking/.test(m) && Math.sin(t * 2.3) > 0.2 ? "talk" : P.arm;
      for (const key in op) op[key] += ((key === want ? 1 : 0) - op[key]) * k; arms.forEach((g) => g.setAttribute("opacity", op[g.dataset.a].toFixed(3)));
      let dy = 0, dx = 0, rz = 0, sc = 1, wide = 0, surprise = 0;
      if (kick) { const u = (now - kick.t) / (kick.k === "impatient" ? 2200 : 1100); if (u >= 1) kick = null; else { const d = 1 - u;
        if (kick.k === "nod") dy = 14 * Math.sin(u * Math.PI * 4) * d; else if (kick.k === "shake") dx = 12 * Math.sin(u * Math.PI * 5) * d; else if (kick.k === "brow") { wide = 0.35 * Math.sin(u * Math.PI); surprise = Math.sin(u * Math.PI); }
        else if (kick.k === "lean") sc = 1 + 0.05 * Math.sin(u * Math.PI); else if (kick.k === "impatient") { dx = -18 * Math.sin(u * Math.PI); rz = -4 * Math.sin(u * Math.PI); } } }
      const br = still() ? 0 : Math.sin(t * 1.7) * 2.2, sway = still() ? 0 : Math.sin(t * 0.7) * 1.4, bob = walk ? Math.abs(Math.sin(walk)) * 10 : 0, listen = listening && !still() ? Math.sin(t * 1.3) * 2.5 : 0;
      char.setAttribute("transform", `translate(${base + ox + st.tx + ex} ${bob + ey}) translate(500 575) scale(${st.lean * sc * es}) translate(-500 -575)`); char.setAttribute("opacity", ofade.toFixed(3));
      head.setAttribute("transform", `translate(${500 + dx + (still() ? 0 : sway)} ${250 + dy + br + listen}) rotate(${st.rz + rz + sway * 0.6} 0 90)`);
      if (!still() && blinkS < 0 && now > blinkAt) blinkS = now; let bl = 1; if (blinkS >= 0) { const u = (now - blinkS) / 160; if (u >= 1) { blinkS = -1; blinkAt = now + 2200 + Math.random() * 3600; } else bl = Math.abs(1 - 2 * u) * 0.94 + 0.06; }
      const open = clamp((st.e + wide) * bl, 0.04, 1.2), cover = (1 - Math.min(1, open)) * 56, gaze = (kick?.k === "impatient" ? -1 : st.gx);
      lids.forEach((l) => l.setAttribute("height", cover.toFixed(1))); lashes.forEach((l) => l.setAttribute("transform", `translate(0 ${(cover * 0.9).toFixed(1)})`));
      irises.forEach((i) => i.setAttribute("transform", `translate(${(gaze * 6).toFixed(1)} ${(-st.gy * 6).toFixed(1)}) scale(${(open > 1 ? 1.06 : 1)})`));
      for (const s of ["L", "R"]) brows[s].setAttribute("transform", `translate(${(s === "L" ? -38 : 38)} ${(-40 - (st.by + (wide ? 0.014 : 0)) * 900).toFixed(1)}) rotate(${((s === "L" ? 1 : -1) * st.bi * 55).toFixed(1)})`);
      blush.forEach((b) => b.setAttribute("opacity", (0.2 + Math.max(0, st.s) * 0.35).toFixed(2)));
      if (speaking) { if (still()) mouthT = 0.4; else if (now > nextSyl) { mouthT = Math.random() < 0.2 ? 0.05 : 0.25 + Math.random() * 0.75; nextSyl = now + 80 + Math.random() * 70; } } else mouthT = 0;
      mouthO += (mouthT - mouthO) * (still() ? 1 : 1 - Math.exp(-dt * 26));
      const sm = st.s, w = 15 + Math.max(0, sm) * 5, cy = 82 - sm * 3, o = mouthO * 24;
      mouth.setAttribute("d", `M${-w} ${cy} Q0 ${cy + sm * 12 + 1} ${w} ${cy} ${o > 1.5 ? `Q0 ${cy + o + 6 + Math.max(0, sm) * 4} ${-w} ${cy}Z` : ""}`); mouth.setAttribute("fill", o > 1.5 ? "#7a2a30" : "none");
      svg.dataset.mood = m; svg.classList.toggle("surprise", surprise > 0.3); svg.classList.toggle("speaking", speaking);
      if (phone && connected) { const sec = Math.floor((now - connected) / 1000); timer.textContent = `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`; }
      const c = still() ? 1 : ease(1 - push), z = phone ? 1 : 1 + (1 - c) * 0.1; cam.setAttribute("transform", `translate(${500 - 500 * z - px * 12} ${280 - 280 * z}) scale(${z})`);
      if (hdoor) hdoor.setAttribute("transform", `translate(278 0) scale(${Math.max(0.05, 1 - doorOpen * 0.93)} 1) translate(-278 0)`);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    el.addEventListener("pointermove", (e) => { const r = el.getBoundingClientRect(); px = (e.clientX - r.left) / r.width - 0.5; });
    const tween = (fn, ms) => new Promise((res) => { if (still()) { fn(1); return res(); } const s0 = performance.now(); const step = (n) => { const u = Math.min(1, (n - s0) / ms); fn(u); u < 1 && !dead ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); });
    return {
      setMood(x) { mood = FACE[x] ? x : "neutral"; }, setThinking(on) { forced = on ? "thinking" : null; }, setSpeaking(on) { speaking = !!on; }, setListening(on) { listening = !!on; },
      react(kindOf) { kick = { k: kindOf, t: performance.now() }; }, fadeOut() { ofade = 0; }, reset() { ofade = 1; mood = "neutral"; forced = null; speaking = false; },
      destroy() { dead = true; cancelAnimationFrame(raf); el.classList.remove("fig"); el.innerHTML = ""; },
      // The prospect arrives: comes out of the front door, answers the phone, or walks into the place, while the camera pushes in.
      async enter() {
        const cam0 = tween((u) => { push = 1 - u; }, 2800);
        if (kind === "door") { await sleep(500); await tween((u) => { doorOpen = ease(u); }, 1100); await tween((u) => { const e = ease(u); ex = -360 * (1 - e); ey = -150 * (1 - e); es = 0.3 + 0.7 * e; ofade = clamp(u * 3, 0, 1); }, 1500); ex = ey = 0; es = 1; ofade = 1; await cam0; return; }
        if (phone) { ofade = 0; await sleep(1700); plabel.textContent = "CONNECTED"; connected = performance.now(); await tween((u) => { ofade = u; }, 600); await cam0; return; }
        ofade = 1; ox = 700; walk = 0.01; await tween((u) => { ox = 700 * (1 - ease(u)); walk += 0.2; }, 1700); walk = 0; ox = 0; mood = "happy"; await sleep(550); mood = "neutral"; await cam0;
      },
      // They leave: shut the door, hang up, walk off, or shake your hand.
      async leave(outcome) {
        if (outcome === "agreed") { mood = "happy"; shakeHands = 1; await sleep(1800); shakeHands = 0; return; }
        if (outcome === "walked_away") mood = "annoyed";
        await sleep(500);
        if (kind === "door") { await tween((u) => { const e = ease(u); ex = -360 * e; ey = -150 * e; es = 1 - 0.7 * e; ofade = 1 - clamp(u * 1.4, 0, 1); }, 1200); await tween((u) => { doorOpen = 1 - ease(u); }, 800); return; }
        if (phone) { plabel.textContent = "CALL ENDED"; await tween((u) => { ofade = 1 - u; }, 600); return; }
        walk = 0.01; await tween((u) => { ox = 700 * ease(u); walk += 0.2; ofade = 1 - ease(u) * 0.9; }, 1700); ofade = 0; walk = 0;
      },
    };
  }
  return { supported: true, mount, defaultVisual };
})();
