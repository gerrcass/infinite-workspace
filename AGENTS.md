# AGENTS.md

Infinite Workspace is a local-first canvas board whose cards are live HTML. The primary renderer uses the experimental HTML-in-Canvas API; the fallback is a complete DOM renderer. The headline behavior is native Ctrl/Cmd+F finding real card text.

## Read in this order

1. [GLOSSARY.md](./GLOSSARY.md) — canonical product vocabulary. Use these words in code, copy, tests, and commits.
2. [docs/adr/](./docs/adr/) — decisions that would be expensive to reverse (renderer split, stack, plain-text cards, persistence).
3. [docs/grilling/0001-infinite-workspace.md](./docs/grilling/0001-infinite-workspace.md) — product scope and the reasoning behind it.
4. The spec and active ticket on GitHub. The spec is issue #1; tickets are issues #2–#8. Read the ticket's acceptance criteria before touching code.

## Commands

```sh
npm run dev          # Vite dev server
npm run build        # production build in dist/
npm run preview      # serve the production build
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run format:check # Prettier
npm run test         # Vitest
npm run test:e2e     # Playwright (DOM journey by default)
```

`CHROME_157_PATH=/path/to/chrome` enables the canvas Playwright project. Without it, only the DOM browser project runs.

## Working agreements

- **One renderer contract.** The rest of the app must not call HTML-in-Canvas APIs directly. API quirks stay in the canvas renderer; the DOM renderer must reach feature parity.
- **Card elements live for the lifetime of the card.** Update text only when the field is not focused. Camera movement must never recreate DOM, blur a field, or reset a checkbox.
- **Never intercept Ctrl/Cmd+F.** Native find is the product. All cards stay in the DOM in both renderers; do not cull them out of the document. Revealing a match moves the camera, not the DOM.
- **Text is plain text.** Assign `textContent`/`value`, never user content to `innerHTML`.
- **Test behavior at the highest seam.** Pure math/store rules get Vitest. User journeys get Playwright in both render modes.
- **Browser support policy:** Chrome 157+ for canvas; all modern browsers get the DOM fallback. Set both `content="drawable"` and `layoutsubtree`; detect capabilities, not user agents.
- **Coordinates:** camera `{x, y, zoom}` is world-at-viewport-top-left; screen = (world − camera) × zoom. Keep camera math pure.
- **Performance:** coalesce paint into one `requestAnimationFrame` and one `requestPaint()`. Draw all cards (measured ~1 ms/250 cards); do not add culling without profiling evidence.
- **Accessibility and motion:** real semantics, visible focus, labeled controls, and honour `prefers-reduced-motion`.

## Definition of done

Typecheck, lint, format check, unit tests, both browser journeys, and build pass. The PR body follows the `/pr` template with evidence. Spec, tickets, PR, branches, and worktrees are closed or removed before handoff. README carries the live Pages URL and a current screenshot.
