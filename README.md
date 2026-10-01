# iphone-duo-css-transition

A CSS + vanilla JS recreation of the iPhone Duo fold transition, for web layouts made of side-by-side panels. A flap folds across the view while the content on it stays flat. Depth comes from the flap's perspective outline, dark glass at its top and bottom, and blur and darkening that grow away from the hinge.

No build step and no dependencies. Open `index.html` in a browser.

## Modes

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

- `index.html` is the current demo, with both modes, all controls and the tuning curves.
- `experiments/01-3d-page-turn.html` is the first attempt: a real CSS 3D `rotateY` page turn. Its content tilts with the page, which is what the Duo avoids.
- `experiments/02-flat-glass-sweep.html` is the second attempt: a flat clip-path sweep with a side drop shadow, without the perspective outline.

## Notes

- Never put `filter` on an element with `transform-style: preserve-3d`, because it flattens the 3D. That's why blur always sits on inner wrappers.
- Each blur copy is padded by 140px so its blur can spill past the content into the dark glass. A mask on the content box itself would cut that spill off.
- Fonts load from Google Fonts and fall back to system serif and sans-serif fonts offline.
