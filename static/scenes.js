// Scene backdrops: the setting the conversation happens in, drawn as inline SVG behind the character's face.
// The world generator picks one per situation (office, door, shop, phone, home, cafe, clinic, outdoors).
// Colours come from CSS variables, so every scene works in light and dark mode.
const Scenes = (() => {
  const W = 400, H = 250;
  const S = {
    office: (h) => `
      <rect class="a" x="0" y="168" width="${W}" height="82"/>
      <rect class="b" x="30" y="30" width="110" height="120" rx="4"/>
      ${[0, 1, 2, 3, 4, 5, 6].map((i) => `<rect class="c" x="36" y="${38 + i * 16}" width="98" height="9" rx="2"/>`).join("")}
      <rect class="glow" x="30" y="30" width="110" height="120" rx="4" style="fill:${h}"/>
      <rect class="c" x="262" y="150" width="108" height="14" rx="3"/><rect class="c" x="274" y="164" width="8" height="52"/><rect class="c" x="350" y="164" width="8" height="52"/>
      <path class="d" d="M330 148 q-14 -26 0 -44 q14 18 0 44z"/><path class="d" d="M330 148 q-26 -10 -30 -34 q22 6 30 34z"/><rect class="b" x="322" y="146" width="16" height="12" rx="2"/>`,
    door: (h) => `
      <rect class="a" x="0" y="190" width="${W}" height="60"/>
      <rect class="b" x="118" y="14" width="164" height="190" rx="3"/><rect class="c" x="132" y="28" width="136" height="164" rx="2"/>
      <rect class="b" x="148" y="44" width="40" height="54" rx="2"/><rect class="b" x="212" y="44" width="40" height="54" rx="2"/>
      <circle class="d" cx="252" cy="130" r="6"/><rect class="glow" x="118" y="14" width="164" height="190" rx="3" style="fill:${h}"/>
      <rect class="b" x="150" y="206" width="100" height="14" rx="3"/><circle class="d" cx="300" cy="46" r="9"/>`,
    shop: (h) => `
      <rect class="a" x="0" y="176" width="${W}" height="74"/>
      <rect class="b" x="24" y="40" width="352" height="6"/><rect class="b" x="24" y="92" width="352" height="6"/><rect class="b" x="24" y="144" width="352" height="6"/>
      ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<rect class="c" x="${34 + i * 43}" y="${i % 2 ? 62 : 56}" width="30" height="${i % 2 ? 30 : 36}" rx="2"/><rect class="c" x="${40 + i * 43}" y="${i % 3 ? 114 : 108}" width="26" height="${i % 3 ? 30 : 36}" rx="2"/>`).join("")}
      <rect class="glow" x="0" y="0" width="${W}" height="176" style="fill:${h}"/><rect class="b" x="0" y="196" width="${W}" height="16"/>`,
    phone: (h) => `
      <rect class="glow" x="0" y="0" width="${W}" height="${H}" style="fill:${h}"/>
      ${[40, 74, 108, 142].map((r, i) => `<circle class="ring r${i}" cx="200" cy="120" r="${r + 30}"/>`).join("")}
      <g transform="translate(330 38)"><rect class="b" x="0" y="0" width="38" height="64" rx="8"/><rect class="c" x="5" y="9" width="28" height="40" rx="2"/><circle class="d" cx="19" cy="56" r="3"/></g>`,
    home: (h) => `
      <rect class="a" x="0" y="190" width="${W}" height="60"/>
      <rect class="b" x="40" y="116" width="180" height="76" rx="14"/><rect class="c" x="30" y="136" width="34" height="56" rx="12"/><rect class="c" x="206" y="136" width="34" height="56" rx="12"/>
      <rect class="b" x="276" y="40" width="64" height="80" rx="3"/><rect class="c" x="284" y="48" width="48" height="64" rx="2"/>
      <rect class="d" x="318" y="132" width="5" height="58"/><path class="d" d="M302 134 h38 l-8 -26 h-22z"/><ellipse class="glow" cx="321" cy="124" rx="60" ry="46" style="fill:${h}"/>`,
    cafe: (h) => `
      <rect class="a" x="0" y="184" width="${W}" height="66"/>
      <rect class="b" x="40" y="46" width="320" height="118" rx="4"/><rect class="glow" x="40" y="46" width="320" height="118" rx="4" style="fill:${h}"/>
      ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<rect class="${i % 2 ? "c" : "d"}" x="${40 + i * 40}" y="22" width="40" height="22"/>`).join("")}
      <rect class="b" x="240" y="170" width="116" height="10" rx="3"/><rect class="c" x="256" y="148" width="22" height="22" rx="3"/><path class="d" d="M280 154 q10 0 10 8 q0 8 -10 8"/>
      <path class="ring r1" d="M262 140 q-6 -10 0 -16 M268 140 q-6 -10 0 -16"/>`,
    clinic: (h) => `
      <rect class="a" x="0" y="184" width="${W}" height="66"/>
      <rect class="b" x="24" y="16" width="120" height="168"/>${[0, 1, 2, 3, 4, 5].map((i) => `<path class="c" d="M${24 + i * 20} 16 q10 90 0 168 h-8 q10 -78 0 -168z"/>`).join("")}
      <g transform="translate(300 60)"><rect class="d" x="-8" y="-26" width="16" height="52" rx="3"/><rect class="d" x="-26" y="-8" width="52" height="16" rx="3"/></g>
      <rect class="glow" x="0" y="0" width="${W}" height="${H}" style="fill:${h}"/><rect class="b" x="190" y="150" width="190" height="8" rx="3"/><rect class="b" x="196" y="158" width="6" height="40"/><rect class="b" x="368" y="158" width="6" height="40"/>`,
    outdoors: (h) => `
      <rect class="glow" x="0" y="0" width="${W}" height="${H}" style="fill:${h}"/><circle class="d" cx="320" cy="62" r="26"/>
      <path class="b" d="M0 170 Q70 100 150 150 T300 140 T400 160 V250 H0Z"/><path class="a" d="M0 200 Q100 150 210 190 T400 190 V250 H0Z"/>
      <path class="c" d="M70 78 q10 -14 26 -4 q12 -10 26 2 q16 0 10 14 h-70 q-6 -8 8 -12z"/>`,
  };
  const HUE = { office: "#d9b36a", door: "#e0a070", shop: "#d9c07a", phone: "#7fa6c9", home: "#e0a37a", cafe: "#d9a56a", clinic: "#8fc0b8", outdoors: "#9fc7e0" };
  const NAMES = { office: "In the office", door: "At the door", shop: "In the shop", phone: "On the phone", home: "At home", cafe: "Over coffee", clinic: "In the clinic", outdoors: "Out and about" };
  function svg(kind) {
    const k = S[kind] ? kind : "office";
    return `<svg class="scene-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${NAMES[k]}">${S[k](HUE[k])}</svg>`;
  }
  // One line that sets the scene when they arrive, and one when they go.
  const ARRIVE = { door: "You knock. {n} opens the door.", phone: "Ringing… {n} picks up.", shop: "{n} walks up to you.", office: "{n} steps in and takes a seat.", home: "{n} welcomes you in.", cafe: "{n} joins your table.", clinic: "{n} looks up as you approach.", outdoors: "{n} stops to talk to you." };
  const LEAVE = { door: "{n} closes the door.", phone: "{n} hangs up.", shop: "{n} walks away.", office: "{n} gets up and leaves.", home: "{n} shows you out.", cafe: "{n} gets up and leaves.", clinic: "{n} turns away.", outdoors: "{n} walks off." };
  const arrival = (k, n) => (ARRIVE[k] || ARRIVE.office).replace("{n}", n);
  const exit = (k, n, outcome) => (outcome === "agreed" ? `${n} puts out a hand. You shake on it.` : (LEAVE[k] || LEAVE.office).replace("{n}", n));
  return { svg, arrival, exit, name: (k) => NAMES[k] || NAMES.office };
})();
