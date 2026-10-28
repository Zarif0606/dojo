// Pointer effects: a soft spotlight that follows the cursor over cards, and a little parallax on the scene.
// Mouse only, and skipped entirely for reduced motion. Everything is a CSS variable, so no layout work happens per move.
(() => {
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const SPOT = ".wcard, .scenario, .persona, .panel, .director";
  let raf = 0, ev = null;
  document.addEventListener("pointermove", (e) => {
    ev = e;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const t = ev.target.closest?.(SPOT);
      if (t) {
        const r = t.getBoundingClientRect();
        t.style.setProperty("--mx", `${ev.clientX - r.left}px`); t.style.setProperty("--my", `${ev.clientY - r.top}px`);
      }
      const w = ev.target.closest?.(".scene-wrap");
      if (w) {
        const r = w.getBoundingClientRect();
        w.style.setProperty("--px", ((ev.clientX - r.left) / r.width - 0.5).toFixed(3)); w.style.setProperty("--py", ((ev.clientY - r.top) / r.height - 0.5).toFixed(3));
      }
    });
  }, { passive: true });
  document.addEventListener("pointerout", (e) => {
    const w = e.target.closest?.(".scene-wrap");
    if (w && !w.contains(e.relatedTarget)) { w.style.setProperty("--px", "0"); w.style.setProperty("--py", "0"); }
  });
})();
