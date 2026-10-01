# iphone-duo-css-transition

The iPhone Duo fold for the web. A flap folds across your layout while the content on it stays flat. Depth comes from the flap's perspective outline, dark glass at its top and bottom, and blur and darkening that grow away from the hinge.

This repo has two parts:
- **duo-fold (v0.1):** a drop-in engine for existing two-column ("sidecar") layouts. One CSS file, one script, a few attributes.
- **The playground** (`index.html`): the original interactive prototype, with tuning sliders.

## duo-fold quick start

```html
<link rel="stylesheet" href="src/duo-fold.css">
<script type="module" src="src/duo-fold.js"></script>

<div class="duo" id="reader">
  <section data-pane="a">…left, before…</section>
  <aside   data-pane="b">…right, before; folds over…</aside>
  <section data-pane="c">…left, after; rides in on the back of B…</section>
  <aside   data-pane="d">…right, after; uncovered underneath…</aside>
</div>
<button data-duo-toggle="reader">Open</button>
```

Tune it with CSS (`--duo-blur`, `--duo-depth`, `--duo-duration`, `--duo-columns`, …), use `data-duo-mode="three"` for the Duo-style B → C|D, and script it with `el.duo.open()` and `duo:start` / `duo:progress` / `duo:end` events.

- **[docs/PRINCIPLES.md](docs/PRINCIPLES.md):** the design principles, the full attribute, property and API reference, known limits and the roadmap.
- **[examples/index.html](examples/index.html):** three ordinary layouts with duo-fold added (a 50/50 reader, a 2fr/1fr app sidecar and a centered three-panel device).

ES modules don't load from `file://`, so serve the folder (for example `python3 -m http.server`) and open `/examples/`. When the repo is public, jsDelivr can serve a tagged release straight from GitHub: `https://cdn.jsdelivr.net/gh/seanvosler/iphone-duo-css-transition@v0.1.0/src/duo-fold.js` (and `.css`).

---

# The playground

## Playground modes

| Mode | At rest | After the fold |
|------|---------|----------------|
| Four panels | `A` on the left, `B` on the right | `B` folds over `A`. `C` rides in on the back of `B` and lands on the left. `D` is uncovered on the right. |
| Three panels | Only `B` (half a device) | `B` folds left, and the device grows to show `C` on the left and `D` on the right. The device stays centered as it grows. |

## How it works

1. **The content never transforms.** `A` and `D` are flat layers on the screen. The flap is a separate element the size of the screen. It holds flat copies of `B` (front) and `C` (back), with nothing rotated.
2. **The flap's outline is projected, not its content.** A rigid sheet hinged at the center, at angle θ and seen from a fixed eye at distance `E`, projects a point at distance `u` from the hinge to `x = hinge + u·cos θ · s`, where `s = E / (E − u·sin θ)`. That trapezoid becomes a `clip-path: path()` with rounded corners at the free edge.
3. **The shadow is the gap.** Toward its free edge the flap projects taller than its flat content. The extra area is dark glass, and the blur spreads the content's edges into it, producing the dark wedges at the top and bottom.
4. **Blur and darkening grow away from the hinge.** Blur radius is `max × lift × d^1.35`, where `d` is the distance from the hinge from 0 to 1. Darkening is `2 × lift × ((d − 0.2) / 0.8)^1.35`, clamped to 1. CSS can't vary blur across one element, so the flap stacks five copies at rising blur and crossfades them with horizontal `mask-image` gradients.
5. **What faces you.** Up to 90° the flap shows `B`; past 90° it shows `C`. `D` is always sharp.
6. **Focus lag (optional).** After landing, `C` can stay blurred and then pull into focus. Darkening follows the angle only.

The blur and darkening falloff come from the Three.js/GLSL shader in [chuspeeism/iphone-duo](https://github.com/chuspeeism/iphone-duo), adapted here to DOM layers.

## Triggering it

The fold runs from the button, by dragging the device, by scrolling over it, or from code:

```js
window.dispatchEvent(new CustomEvent('spread:fold', { detail: { open: true } }));

// or
window.foldSpread.open();
window.foldSpread.close();
window.foldSpread.set(0.4);           // scrub to 40% of the timeline
window.foldSpread.cfg.maxBlur = 40;   // tune live
```

## Tuning

| Control | Default | Effect |
|---------|---------|--------|
| Max blur | 30 px | Blur at the free edge when the flap is upright |
| Edge darkening | 100% | How dark the flap gets toward its free edge |
| Depth | 70% | Perspective strength, which sets the size of the top and bottom wedges |
| Focus lag | 30% | How long `C` stays soft after landing |
| Duration | 1.6 s | Length of the button-triggered transition |

## Files

- `src/duo-fold.css`, `src/duo-fold.js` are the v0.1 engine.
- `examples/index.html` is the drop-in examples page.
- `docs/PRINCIPLES.md` is the spec.
- `index.html` is the playground, with both modes, all controls and the tuning curves.
- `experiments/01-3d-page-turn.html` is the first attempt: a real CSS 3D `rotateY` page turn. Its content tilts with the page, which is what the Duo avoids.
- `experiments/02-flat-glass-sweep.html` is the second attempt: a flat clip-path sweep with a side drop shadow, without the perspective outline.

## Notes

- Never put `filter` on an element with `transform-style: preserve-3d`, because it flattens the 3D. That's why blur always sits on inner wrappers.
- Each blur copy is padded by 140px so its blur can spill past the content into the dark glass. A mask on the content box itself would cut that spill off.
- Fonts load from Google Fonts and fall back to system serif and sans-serif fonts offline.
