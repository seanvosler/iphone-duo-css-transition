# duo-fold — principles (v0.1)

duo-fold adds the iPhone Duo fold to an existing two-column ("sidecar") layout. You add one CSS file and one script, then mark up your panes. These principles decide what the engine does and doesn't do.

## 1. At rest, it's your layout

Before and after a fold, the engine does nothing. Your panes are your real DOM in a CSS grid, with your styles, your event handlers and your framework state. The engine only takes over for the length of a fold. It lays a temporary stage over the container, plays the fold, removes the stage and flips one attribute: `data-duo-state="open"`.

## 2. Content never transforms

Nothing inside a pane is rotated, scaled or skewed. Only the flap's **outline** is projected in perspective, as a `clip-path`. The content seen through it stays flat at its resting position. This is the illusion the Duo relies on.

## 3. Depth comes from light, not motion

The depth cues are:
- the flap outgrowing its content toward the free edge, which leaves dark glass at the top and bottom;
- blur that grows away from the hinge (`blur × lift × d^1.35`);
- darkening that reaches black at the free edge (`2 × lift × ((d − 0.2) / 0.8)^1.35`).

There's no drop shadow and no 3D rotation.

## 4. The stationary panes stay live

The panes that don't move, A (left) and D (right), stay as real DOM throughout the fold. D is uncovered with a `clip-path`. Only the moving faces, B on the front and C on the back, are shown as copies.

## 5. Copies are temporary and inert

The flap's faces are copies of B and C, one per blur level. They exist only while a fold is in progress, carry `inert` and `aria-hidden`, and are thrown away afterwards. Canvas pixels, form values and the pane's scroll position are copied over. Anything else live (video, iframes, nested scroll positions) shows its markup state for that moment.

## 6. Configure with CSS, control with attributes, script with events

- **Look and timing** use CSS custom properties on the container, so they cascade and theme like any other style.
- **Structure and behavior** use `data-*` attributes.
- **Code** uses one small API (`el.duo.open()`, `.close()`, `.toggle()`, `.progress`) and DOM events (`duo:start`, `duo:progress`, `duo:end`).

## 7. Accessible by default

- Hidden panes get `inert` and `aria-hidden`.
- Toggle buttons get `aria-controls` and `aria-expanded`.
- If focus was inside the container when a fold starts, it moves to the newly shown pane when the fold ends.
- `prefers-reduced-motion` replaces the fold with a short crossfade.

## 8. Degrade, don't break

- **No JavaScript:** the CSS still shows the right panes for `data-duo-state`, so a server or framework can set the state directly.
- **Unsupported browser:** the fold is skipped and the state changes instantly.
- **Unequal columns** (a wide main column with a narrow sidecar) work. The flap matches B's width before 90° and C's width after, and the switch happens where its projected width is zero, so it can't be seen.

---

## Markup contract

```html
<div class="duo" id="reader" data-duo-mode="four">
  <section data-pane="a">…</section>   <!-- left, before -->
  <aside   data-pane="b">…</aside>     <!-- right, before; the flap's front -->
  <section data-pane="c">…</section>   <!-- left, after; the flap's back -->
  <aside   data-pane="d">…</aside>     <!-- right, after; uncovered underneath -->
</div>
<button data-duo-toggle="reader">Open</button>
```

- Panes must be **direct children** of `.duo`. Style them by class or attribute, not with a child combinator such as `.duo > aside`, because the copies on the flap aren't direct children.
- `data-duo-mode="three"` omits A. At rest only B shows, and the left column is empty until the flap lands there.

| Attribute | On | Values |
|---|---|---|
| `data-duo-mode` | container | `four` (default), `three` |
| `data-duo-state` | container | `closed` (default), `open`, `folding` (set by the engine) |
| `data-duo-scrub` | container | any of `drag`, `wheel` (space separated) |
| `data-duo-center` | container | present: in three-panel mode, keeps the visible part centered as it grows |
| `data-duo-toggle` / `data-duo-open` / `data-duo-close` | any button | id of the container |

## Custom properties

| Property | Default | Meaning |
|---|---|---|
| `--duo-columns` | `1fr 1fr` | Grid columns at rest |
| `--duo-gap` | `0px` | Gap between the columns; the hinge sits in the middle of it |
| `--duo-duration` | `1.6s` | Length of a full fold |
| `--duo-blur` | `30px` | Blur at the free edge with the flap upright |
| `--duo-darken` | `1` | Strength of the edge darkening |
| `--duo-depth` | `0.7` | Perspective strength (0–1), which sets the size of the top and bottom wedges |
| `--duo-lag` | `0.3` | Fraction of the timeline C stays soft after landing |
| `--duo-quality` | `5` | Blur levels (3–7). Fewer is cheaper. |
| `--duo-glass` | `#0b0d0e` | Color of the flap's glass beyond the content |
| `--duo-bezel` | `0px` | Bezel thickness around the flap |
| `--duo-radius` | `0px` | Corner radius of the flap's content |
| `--duo-surface` | nearest opaque background | Fill behind copied panes that are transparent |

## API and events

```js
const reader = document.getElementById('reader');
reader.duo.open();           // returns a Promise that resolves when the fold ends
reader.duo.close();
reader.duo.toggle();
reader.duo.progress = 0.4;   // scrub; call reader.duo.settle() to snap to the nearest end
reader.duo.state;            // 'closed' | 'open' | 'folding'

reader.addEventListener('duo:start',    e => e.detail.to);        // 'open' | 'closed'
reader.addEventListener('duo:progress', e => e.detail.progress);  // 0..1, plus e.detail.angle in degrees
reader.addEventListener('duo:end',      e => e.detail.state);
```

The script starts any `.duo` already on the page and any added later (it watches the DOM, so client-rendered apps work). `DuoFold.init(root)` starts them by hand.

## Known limits in v0.1

- Copies are DOM clones. Very heavy panes (thousands of nodes) multiply by `--duo-quality` during the fold. Lower the quality, or wait for View Transition snapshots (see the roadmap).
- Resizing the window in the middle of a fold isn't tracked; the layout is measured again when the fold ends.
- One fold per container: A|B ↔ C|D.

## Roadmap

- **v0.2:** View Transitions snapshots instead of clones where supported; a `<duo-fold>` custom element; npm package and a versioned CDN path.
- **v0.3:** sequences of more than two spreads (A|B → C|D → E|F); a scroll-driven timeline option; a CSS-only "lite" fold.
- **Later:** React and Vue wrappers; vertical (top/bottom) folds.
