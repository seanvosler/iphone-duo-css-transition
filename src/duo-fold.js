/*! duo-fold v0.1 — iPhone Duo–style fold for two-column layouts. */

const PANES = ['a', 'b', 'c', 'd'];
const M = 140; // padding around each copy so its blur can spill into the dark glass

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const inOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const falloff = (d) => Math.pow(clamp(d), 1.35);
const blurFilter = (px) => (px < 0.05 ? 'none' : `blur(${px.toFixed(2)}px)`);
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function readNumber(cs, name, fallback) {
  const raw = cs.getPropertyValue(name).trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}
function readDuration(cs, name, fallback) {
  const raw = cs.getPropertyValue(name).trim();
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return fallback;
  return raw.endsWith('ms') ? n : n * 1000;
}
function isOpaque(color) {
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return color !== 'transparent' && color !== '';
  const parts = m[1].split(/[ ,/]+/).filter(Boolean);
  return parts.length < 4 || parseFloat(parts[3]) > 0.98;
}
function resolveSurface(el) {
  const own = getComputedStyle(el).getPropertyValue('--duo-surface').trim();
  if (own) return own;
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    const bg = getComputedStyle(n).backgroundColor;
    if (isOpaque(bg)) return bg;
  }
  return '#fff';
}
function roundedPath(P, r) {
  const toward = (a, b, d) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const k = Math.min(d, L / 2) / L;
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  };
  const [p1, p2, p3, p4] = P;
  const a = toward(p2, p1, r), b = toward(p2, p3, r), c = toward(p3, p2, r), d = toward(p3, p4, r);
  const f = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  return `M ${f(p1)} L ${f(a)} Q ${f(p2)} ${f(b)} L ${f(c)} Q ${f(p3)} ${f(d)} L ${f(p4)} Z`;
}

/** Copy a pane for the flap: inert, with canvas pixels, form values and scroll position carried over. */
function copyPane(src) {
  const copy = src.cloneNode(true);
  copy.classList.add('duo-copy');
  copy.inert = true;
  copy.setAttribute('aria-hidden', 'true');
  const srcCanvases = src.querySelectorAll('canvas');
  const dstCanvases = copy.querySelectorAll('canvas');
  srcCanvases.forEach((c, i) => {
    try { dstCanvases[i].getContext('2d').drawImage(c, 0, 0); } catch { /* cross-origin or WebGL: skip */ }
  });
  const srcFields = src.querySelectorAll('input, textarea, select');
  const dstFields = copy.querySelectorAll('input, textarea, select');
  srcFields.forEach((f, i) => {
    const d = dstFields[i];
    if (!d) return;
    if (f.type === 'checkbox' || f.type === 'radio') d.checked = f.checked;
    else if (f.type !== 'file') d.value = f.value;
  });
  return copy;
}

export class DuoFold {
  constructor(el) {
    this.el = el;
    el.duo = this;
    this.t = el.dataset.duoState === 'open' ? 1 : 0;
    this.target = this.t;
    this.raf = 0;
    this.stage = null;
    this.resolvers = [];
    this.applyRest();
    this.ro = new ResizeObserver(() => { if (!this.stage) this.updateShift(); });
    this.ro.observe(el);
    this.bindScrub();
  }

  get mode() { return this.el.dataset.duoMode === 'three' ? 'three' : 'four'; }
  get state() { return this.el.dataset.duoState || 'closed'; }
  get progress() { return this.t; }
  set progress(v) {
    cancelAnimationFrame(this.raf);
    this.buildStage(v >= this.t ? 'open' : 'closed');
    this.t = clamp(v);
    this.target = this.t >= 0.5 ? 1 : 0;
    this.render();
  }

  pane(k) { return this.el.querySelector(`:scope > [data-pane="${k}"]`); }

  open() { return this.animateTo(1); }
  close() { return this.animateTo(0); }
  toggle() { return this.animateTo(this.target >= 0.5 ? 0 : 1); }
  settle() { return this.animateTo(this.t >= 0.5 ? 1 : 0); }

  config() {
    const cs = getComputedStyle(this.el);
    return {
      blur: readNumber(cs, '--duo-blur', 30),
      darken: readNumber(cs, '--duo-darken', 1),
      depth: clamp(readNumber(cs, '--duo-depth', 0.7)),
      lag: clamp(readNumber(cs, '--duo-lag', 0.3), 0, 0.75),
      duration: readDuration(cs, '--duo-duration', 1600),
      quality: Math.round(clamp(readNumber(cs, '--duo-quality', 5), 3, 7)),
      bezel: readNumber(cs, '--duo-bezel', 0),
      radius: readNumber(cs, '--duo-radius', 0),
    };
  }

  measure() {
    const box = this.el.getBoundingClientRect();
    const rel = (p) => {
      if (!p) return null;
      const r = p.getBoundingClientRect();
      return { left: r.left - box.left, top: r.top - box.top, right: r.right - box.left, bottom: r.bottom - box.top, width: r.width, height: r.height };
    };
    const B = rel(this.pane('b')), C = rel(this.pane('c')), D = rel(this.pane('d'));
    if (!B || !C || !D) throw new Error('duo-fold: a .duo container needs panes b, c and d (and a in four-panel mode).');
    const hinge = (C.right + B.left) / 2;
    return { W: box.width, H: box.height, B, C, D, hinge, spanB: B.right - hinge, spanC: hinge - C.left };
  }

  // Timeline -> fold (0..1 of 180deg), blur strength m, geometric lift for darkening.
  curves(t) {
    const { lag } = this.cfg;
    const H = Math.max(0.25, 1 - lag);
    const h = inOut(clamp(t / H));
    const f = lag < 0.005 ? 1 : easeOut(clamp((t - H * 0.8) / (1 - H * 0.8)));
    const showB = h < 0.5;
    const geo = showB ? smooth(2 * h) : smooth(2 * (1 - h));
    const m = showB ? geo : Math.max(geo, 1 - f);
    return { h, m, geo, showB };
  }

  buildStage(to) {
    if (this.stage) return;
    const el = this.el;
    this.cfg = this.config();
    this.geo = this.measure();
    this.hadFocus = el.contains(document.activeElement);
    el.dataset.duoState = 'folding';
    PANES.forEach((k) => { const p = this.pane(k); if (p) p.inert = true; });

    const { quality } = this.cfg;
    this.levels = Array.from({ length: quality }, (_, i) => i / (quality - 1));
    const surface = resolveSurface(el);

    const stage = document.createElement('div');
    stage.className = 'duo-stage';
    stage.setAttribute('aria-hidden', 'true');
    const flap = document.createElement('div');
    flap.className = 'duo-flap';
    const glass = document.createElement('div');
    glass.className = 'duo-flap-glass';
    flap.append(glass);

    const face = (key, dir) => {
      const rect = this.geo[key.toUpperCase()];
      const wrap = document.createElement('div');
      wrap.className = 'duo-face';
      const src = this.pane(key);
      const span = dir > 0 ? this.geo.spanB : this.geo.spanC;
      const layers = this.levels.map((lvl, i) => {
        const lyr = document.createElement('div');
        lyr.className = 'duo-lyr';
        Object.assign(lyr.style, { left: `${rect.left - M}px`, top: `${rect.top - M}px`, width: `${rect.width + 2 * M}px`, height: `${rect.height + 2 * M}px` });
        const flat = document.createElement('div');
        flat.className = 'duo-flat';
        Object.assign(flat.style, { left: `${M}px`, top: `${M}px`, width: `${rect.width}px`, height: `${rect.height}px`, background: surface });
        const copy = copyPane(src);
        flat.append(copy);
        lyr.append(flat);
        if (i > 0) {
          // Each copy fades in between the previous level and its own, measured outward from the hinge.
          const hingeLocal = this.geo.hinge - (rect.left - M);
          const x0 = hingeLocal + dir * this.levels[i - 1] * span;
          const x1 = hingeLocal + dir * lvl * span;
          const Wl = rect.width + 2 * M;
          const g = dir > 0
            ? `linear-gradient(90deg, transparent ${x0}px, #000 ${x1}px)`
            : `linear-gradient(270deg, transparent ${Wl - x0}px, #000 ${Wl - x1}px)`;
          lyr.style.webkitMaskImage = g;
          lyr.style.maskImage = g;
        }
        wrap.append(lyr);
        return { lyr, copy, src };
      });
      return { wrap, layers };
    };
    this.faceB = face('b', 1);
    this.faceC = face('c', -1);
    flap.append(this.faceB.wrap, this.faceC.wrap);

    const darken = document.createElement('div');
    darken.className = 'duo-darken';
    const { W, H } = this.geo;
    Object.assign(darken.style, { left: `${-W}px`, width: `${3 * W}px`, top: `${-H}px`, height: `${3 * H}px` });
    flap.append(darken);

    stage.append(flap);
    el.append(stage);
    // Scroll positions only apply once the copies are in the document.
    [this.faceB, this.faceC].forEach((f) => f.layers.forEach(({ copy, src }) => { copy.scrollTop = src.scrollTop; copy.scrollLeft = src.scrollLeft; }));

    this.stage = stage;
    this.flap = flap;
    this.darken = darken;
    this.emit('duo:start', { to });
  }

  render() {
    if (!this.stage) return;
    const { h, m, geo, showB } = this.curves(this.t);
    const { blur, darken, depth, bezel, radius } = this.cfg;
    const { W, B, C, D, hinge, spanB, spanC } = this.geo;

    // Project the flap: a rigid sheet hinged at the boundary, seen from a fixed eye at distance E.
    // Its length is B's width before 90deg and C's after, which can't be seen at 90deg where it projects to zero.
    const E = W * (8 - 6.4 * depth);
    const th = Math.PI * h, cos = Math.cos(th), sin = Math.sin(th);
    const U = (showB ? spanB : spanC) + bezel;
    const s = E / (E - U * sin);
    const xU = hinge + U * cos * s;
    const rect = showB ? B : C;
    const top = rect.top - bezel, bottom = rect.bottom + bezel, cy = (rect.top + rect.bottom) / 2;
    const P = [[hinge, top], [xU, cy + (top - cy) * s], [xU, cy + (bottom - cy) * s], [hinge, bottom]];
    this.flap.style.clipPath = `path('${roundedPath(P, (radius + bezel) * s)}')`;

    // D stays live: uncover it to the right of the flap.
    const d = this.pane('d');
    d.style.clipPath = showB ? `inset(0 0 0 ${clamp(xU - D.left, 0, D.width).toFixed(1)}px)` : '';

    this.faceB.wrap.hidden = !showB;
    this.faceC.wrap.hidden = showB;
    const face = showB ? this.faceB : this.faceC;
    face.layers.forEach(({ lyr }, i) => { if (i) lyr.style.filter = blurFilter(blur * m * falloff(this.levels[i])); });

    // Darkening grows toward the free edge and reaches black there.
    const span = showB ? spanB : spanC, stops = [];
    for (let k = 0; k <= 10; k++) {
      const dd = k / 10;
      const a = clamp(2 * geo * darken * falloff((dd - 0.2) / 0.8));
      const x = W + hinge + (showB ? 1 : -1) * dd * span; // darken element starts at -W
      stops.push(`rgba(0,0,0,${a.toFixed(3)}) ${(showB ? x : 3 * W - x).toFixed(1)}px`);
    }
    this.darken.style.background = `linear-gradient(${showB ? 90 : 270}deg, ${stops.join(', ')})`;

    this.updateShift(Math.min(hinge, xU));
    this.emit('duo:progress', { progress: this.t, angle: 180 * h });
  }

  updateShift(visibleLeft) {
    const el = this.el;
    if (this.mode !== 'three' || !el.hasAttribute('data-duo-center')) { el.style.removeProperty('--duo-shift'); return; }
    let left = visibleLeft;
    if (left === undefined) {
      try { const g = this.measure(); left = this.t >= 0.5 ? 0 : g.hinge; } catch { return; }
    }
    el.style.setProperty('--duo-shift', `${(-Math.max(0, left) / 2).toFixed(2)}px`);
  }

  teardown() {
    if (this.stage) { this.stage.remove(); this.stage = null; }
    const d = this.pane('d');
    if (d) d.style.clipPath = '';
    this.applyRest();
    if (this.hadFocus) this.moveFocus();
    this.emit('duo:end', { state: this.state });
    this.resolvers.splice(0).forEach((r) => r(this.state));
  }

  applyRest() {
    const open = this.t >= 0.5;
    this.t = open ? 1 : 0;
    this.el.dataset.duoState = open ? 'open' : 'closed';
    PANES.forEach((k) => {
      const p = this.pane(k);
      if (!p) return;
      const shown = open ? (k === 'c' || k === 'd') : (k === 'a' || k === 'b');
      p.inert = !shown;
      if (shown) p.removeAttribute('aria-hidden'); else p.setAttribute('aria-hidden', 'true');
    });
    this.updateShift();
    this.syncToggles();
  }

  moveFocus() {
    const pane = this.pane(this.t >= 0.5 ? 'c' : (this.mode === 'three' ? 'b' : 'a'));
    if (!pane) return;
    const target = pane.querySelector('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])');
    if (target) target.focus({ preventScroll: true });
    else { if (!pane.hasAttribute('tabindex')) pane.setAttribute('tabindex', '-1'); pane.focus({ preventScroll: true }); }
  }

  syncToggles() {
    const id = this.el.id;
    if (!id) return;
    document.querySelectorAll(`[data-duo-toggle="${CSS.escape(id)}"]`).forEach((b) => {
      b.setAttribute('aria-controls', id);
      b.setAttribute('aria-expanded', String(this.t >= 0.5));
    });
  }

  animateTo(to) {
    return new Promise((resolve) => {
      cancelAnimationFrame(this.raf);
      this.target = to;
      this.resolvers.push(resolve);
      if (!this.stage && this.t === to) { this.teardown(); return; }
      if (reducedMotion() || typeof CSS === 'undefined' || !CSS.supports('clip-path', "path('M0 0 L1 1 Z')")) {
        this.emit('duo:start', { to: to ? 'open' : 'closed' });
        if (this.stage) { this.stage.remove(); this.stage = null; }
        this.t = to;
        this.teardown();
        return;
      }
      this.buildStage(to ? 'open' : 'closed');
      const from = this.t;
      const ms = Math.abs(to - from) * this.cfg.duration;
      const start = performance.now();
      const step = (now) => {
        const k = ms ? clamp((now - start) / ms) : 1;
        this.t = from + (to - from) * k;
        this.render();
        if (k < 1) this.raf = requestAnimationFrame(step);
        else this.teardown();
      };
      this.raf = requestAnimationFrame(step);
    });
  }

  bindScrub() {
    const el = this.el;
    const modes = () => (el.dataset.duoScrub || '').split(/\s+/);

    el.addEventListener('wheel', (e) => {
      if (!modes().includes('wheel')) return;
      const d = e.deltaY / 700;
      if ((d > 0 && this.t >= 1) || (d < 0 && this.t <= 0)) return;
      e.preventDefault();
      this.progress = this.t + d;
      clearTimeout(this.wheelTimer);
      this.wheelTimer = setTimeout(() => this.settle(), 180);
    }, { passive: false });

    // Drag starts only after a clear horizontal movement, so clicks and text selection keep working.
    let drag = null;
    el.addEventListener('pointerdown', (e) => {
      if (!modes().includes('drag') || e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, t0: this.t, active: false, id: e.pointerId };
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = drag.x - e.clientX, dy = drag.y - e.clientY;
      if (!drag.active) {
        if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        drag.active = true;
        drag.span = Math.max(1, this.measure().spanB);
        el.setPointerCapture(drag.id);
        window.getSelection()?.removeAllRanges();
      }
      this.progress = drag.t0 + dx / drag.span;
    });
    const end = () => {
      if (drag?.active) this.settle();
      drag = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  emit(type, detail) { this.el.dispatchEvent(new CustomEvent(type, { detail, bubbles: true })); }
}

export function init(root = document) {
  const list = root.matches?.('.duo') ? [root] : [];
  root.querySelectorAll?.('.duo').forEach((el) => list.push(el));
  list.forEach((el) => { if (!el.duo) new DuoFold(el); });
}

// Toggle buttons anywhere on the page.
document.addEventListener('click', (e) => {
  const btn = e.target.closest?.('[data-duo-toggle], [data-duo-open], [data-duo-close]');
  if (!btn) return;
  const id = btn.dataset.duoToggle || btn.dataset.duoOpen || btn.dataset.duoClose;
  const el = id && document.getElementById(id);
  if (!el) return;
  if (!el.duo) new DuoFold(el);
  if (btn.hasAttribute('data-duo-open')) el.duo.open();
  else if (btn.hasAttribute('data-duo-close')) el.duo.close();
  else el.duo.toggle();
});

// Start existing containers now and any added later.
const boot = () => {
  init(document);
  new MutationObserver((records) => {
    for (const r of records) r.addedNodes.forEach((n) => { if (n.nodeType === 1) init(n); });
  }).observe(document.documentElement, { childList: true, subtree: true });
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();

window.DuoFold = Object.assign(DuoFold, { init });
