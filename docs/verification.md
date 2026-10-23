# Verification

Run on 2026-10-23 with Node 22.22.1, Chromium 156 (Playwright bundle), and Chrome for Testing 157.0.8103.15.

## Automated

```sh
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run test
CHROME_157_PATH=/path/to/chrome npm run test:e2e
```

Last local run:

- 55 Vitest tests across camera, store, history, persistence, seed, and renderer mode.
- 25 Playwright tests: 13 DOM-renderer journeys and 12 canvas-renderer journeys.
- Canvas paint average while panning 216 cards: **1.8 ms** over 27 frames at 2× DPR (budget assertion `< 16 ms`).
- Production build: ~73 kB JavaScript, ~21 kB CSS before gzip.

The Playwright canvas project is enabled by `CHROME_157_PATH`. It exercises real `drawable` children, transformed hit-testing, editing, checkboxes, drag, undo/redo, persistence, renderer failover, find selection/reveal, touch pinch, accessibility exposure, and the paint budget.

## Native Ctrl/Cmd+F manual check

Chrome's own find bar is not automatable through Playwright (the renderer does not receive its UI events), so this was checked in a headed Chrome 157 window against the production build:

1. Open `https://gerrcass.github.io/infinite-workspace/` (or the local preview) in Chrome 157.
2. Press Ctrl/Cmd+F and type `needle`.
3. Chrome reports 5 matches. The orange native highlights appear on the real text inside the canvas cards.
4. Cycle matches with Enter. The camera does not follow Chrome's find bar because the browser does not expose the active match to page JavaScript.
5. Use `window.find('The needle in the interviews')` from DevTools or the E2E path to verify the selection-based reveal: the camera eases to the card and the browser paints the selection highlight into the canvas snapshot.

Evidence: [`assets/native-find.png`](../assets/native-find.png) shows Chrome's find bar at 1/5 with orange highlights on live card text. [`assets/selection-reveal.png`](../assets/selection-reveal.png) shows the selection-based reveal.

## Chrome 156 flag check

Chromium 156 with `--enable-features=CanvasDrawElement` / `chrome://flags/#canvas-draw-element` reports the drawing API and renders the board in Canvas mode. The app sets both `content="drawable"` and `layoutsubtree`; capability detection chooses the path.

## Failure modes covered

- No HTML-in-Canvas support: DOM renderer, same features.
- Forced canvas on an unsupported browser: DOM renderer with a clear toast.
- Runtime canvas draw failure: switches to DOM without losing board or camera.
- Storage denied or quota failure: session stays usable, status reads "Not saved".
- Invalid/unsupported saved schema: reseeds safely.
- Narrow viewport: chrome stays usable, selection toolbar clamps, undo/redo remain reachable.
- Reduced motion: camera transitions and inertia are skipped.
