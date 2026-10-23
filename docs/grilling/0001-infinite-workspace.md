# Grilling: Infinite Workspace

**Date:** 2026-10-22
**Facilitator:** coding agent
**Decision owner:** user, delegated with "move forward with the next logical step … choose what you would recommend".

This is the design tree for the first public version of Infinite Workspace. The user explicitly delegated the decisions, so each question is answered with the recommended option and the reasoning that would have been offered in the interview. The result is a shared-understanding record, not a transcript.

## Facts established before the interview

These were checked in the environment rather than asked:

- The repository is a fresh public GitHub repository with a README and an icon, no application code, no issues, no pull requests, and GitHub Pages is not yet enabled.
- Stable Chrome for Testing is 156. Beta is 157.0.8103.15. The API described by Modern Web Guidance as shipped in Chrome 157 is present in the beta.
- A hands-on probe in Chrome 157 confirmed: `content="drawable"` plus `drawable` children, destination-rect scaling in `drawElementImage()`, CTM/DPR scaling, hit-testing at transformed positions, native contenteditable editing, checkbox input, snapshotting of elements laid out far outside the canvas box, selection highlights, and accessibility/find-in-page text exposure.
- Drawing 250 cards with `drawElementImage()` costs roughly 1 ms of main-thread paint work per frame at 2× DPR on this machine. Culling is not needed to hit 60 fps at the target node count.
- `getElementTransform()` only accepts elements with the `drawable` attribute. Descendant geometry comes from `getBoundingClientRect()`.
- Chrome 157 exposes `canvas.getElementTransform()` and the destination-rect overload of `drawElementImage()`. The WICG explainer and the Chrome 157 build differ from the older `layoutsubtree` spelling; the canvas should carry both attributes so the older implementation can still be used.

## Round 1 — Product and scope

### ❓ Q1 — What is this project for?

Is Infinite Workspace a public, polished demo of the HTML-in-Canvas idea, an internal tool, or the start of a commercial product?

**Recommendation:** A public, polished demo that is genuinely usable as a small personal board. The success criterion is that a stranger lands on the GitHub Pages URL, immediately understands the trick, and can verify native find-in-page themselves.

**Decision:** Public polished demo, deployed to GitHub Pages. No accounts, no backend, no collaboration. Local-first board state.

### ❓ Q2 — What is the browser support policy?

Should the canvas renderer be the only path, or should every unsupported browser get a complete fallback?

**Recommendation:** Canvas renderer where HTML-in-Canvas is available; a complete DOM renderer everywhere else. The fallback is not a degraded "please upgrade" page: it is the same board, same data, same editing, same find-in-page, just positioned DOM instead of canvas compositing. No polyfill dependency.

**Decision:** Two first-class renderers behind one interface. Automatic feature detection with `?render=dom` and `?render=canvas` overrides for testing and comparison. The UI displays which renderer is active.

### ❓ Q3 — What is the target scale and performance bar?

How many cards, and what counts as smooth?

**Recommendation:** Seed 216 cards. Target 60 fps pan and zoom at 1600×1000 on a 2× display in canvas mode, and no worse than native DOM smoothness in fallback. Because painting 250 cards measured at ~1 ms/frame, draw every card every paint rather than culling. That preserves geometry for every card, which keeps find-in-page and accessibility honest.

**Decision:** 216 seeded cards; draw all cards every paint in canvas mode; 60 fps is the bar. No culling in v1. Revisit only if real-device profiling says otherwise.

### ❓ Q4 — What is out of scope for v1?

**Recommendation:** Exclude multiplayer, accounts, server persistence, file/image attachments, arbitrary embeds, freehand drawing, connector lines, comments, export/import, rich-text formatting (bold/links), nested boards, and mobile-specific layouts. Include only browser-native interactions that prove the core idea.

**Decision:** Accepted as listed. The board is local-only, single-user, text-and-checklist cards.

## Round 2 — Interaction and content model

### ❓ Q5 — What is a card?

What can the user actually edit inside a card?

**Recommendation:** A card has a plain-text title, a plain-text body, an optional checklist, a color, and a tag label. Title and body are `contenteditable` using `plaintext-only` where supported. Checklist labels are also contenteditable and each has a real checkbox. Card width is fixed per card; height is content-driven. This is enough to prove "real, live editable HTML cards (contenteditable text, checkboxes, the works)" without becoming a rich-text editor.

**Decision:** Title, body, optional checklist, color, tag. Plain text, never `innerHTML` from user input. Fixed width variants, auto height.

### ❓ Q6 — How does editing coexist with pan, zoom, and dragging?

**Recommendation:** Click text to edit in place; click the card chrome to select; drag the top strip to move. Space+drag or drag on empty canvas pans. Wheel pans; Ctrl/Cmd+wheel and trackpad pinch zoom. If a card is focused while the zoom is very low, ease the camera to a readable zoom, centered on the card, without stealing focus. Never auto-zoom during ordinary panning.

**Decision:** As recommended. Editing at low zoom triggers a one-time comfortable-zoom assist below 0.7×. Drag is explicit via the card's drag strip; text selection inside contenteditable is never hijacked.

### ❓ Q7 — How does native find-in-page stay the headline feature?

**Recommendation:** Do not implement a custom find UI and do not intercept Ctrl/Cmd+F. Keep every card in the real DOM at all times. Listen for `selectionchange`; when a selection-based match is outside the viewport, pan/zoom the camera to reveal its card. The browser paints the native highlight into the card snapshot; our paint loop redraws it. Add a first-run hint that says Ctrl/Cmd+F works, and include deliberate "needle" phrases in the seed so it is easy to try.

**Decision:** As recommended. Native find only, plus camera reveal for selections. A Chrome 157 headed-browser check during implementation showed the native find bar finds and highlights real card text inside the canvas. Chrome's native find bar does not expose its active match as a DOM selection, so the camera reveal applies to selection-based find (`window.find`, browser or platform variants that expose a selection); native matches on other parts of the board remain searchable and are revealed by panning. This limitation is stated honestly in the README rather than papered over with a custom find field.

### ❓ Q8 — What are the core shortcuts?

**Recommendation:** `N` add note at viewport centre; `Delete`/`Backspace` delete selected card (when not editing); `Ctrl/Cmd+D` duplicate; `Ctrl/Cmd+Z` / `Shift+Ctrl/Cmd+Z` undo/redo when not editing; `+`/`-` zoom; `0` fit all; `1` reset to 100%; `?` help; Space+drag pan; arrow keys pan when the board has focus. `Esc` leaves editing or clears selection.

**Decision:** As recommended.

### ❓ Q9 — Is undo/redo in scope?

**Recommendation:** Yes, but simple snapshot-based history. Structural actions and one whole text-edit session each produce one history entry. Text typing is coalesced; a single undo reverts the session, not one keypress. Cap history at 50 states. Do not intercept native text undo while a contenteditable is focused.

**Decision:** Snapshot history with coalesced text sessions, depth 50.

### ❓ Q10 — How is state persisted?

**Recommendation:** `localStorage`, versioned, debounced. Persist cards, z-order, and camera. Storage failure degrades to in-memory with a visible "Not saved" status. A help-dialog action can reset the demo board after confirmation. Session-only undo history.

**Decision:** As recommended. Storage key carries a schema version; parse failures reseed rather than crash.

### ❓ Q11 — What happens on first load and on reload?

**Recommendation:** First load seeds a curated 216-card board arranged in clusters around the origin, with a welcome card and searchable phrases. Reload restores the saved board and camera. A "reset demo" action restores the curated seed. The initial camera frames a visually complete slice of the board at a readable zoom, not the entire board shrunk to illegibility.

**Decision:** As recommended.

## Round 3 — Engineering, quality, and delivery

### ❓ Q12 — What is the technology stack?

**Recommendation:** Vanilla TypeScript with Vite. No UI framework. The renderer needs direct DOM control, per-node mutable elements, and precise paint scheduling; a framework's reconciliation would add risk without helping. Vitest for unit tests, Playwright for browser tests, ESLint + Prettier for guardrails.

**Decision:** Vanilla TypeScript + Vite. Zero runtime dependencies.

### ❓ Q13 — What are the module seams?

**Recommendation:** Four seams, highest first:

1. **Board view seam** — the browser-level behavior contract (`?render=dom` or `?render=canvas`), exercised by Playwright.
2. **Renderer seam** — `Renderer` interface with `CanvasRenderer` and `DomRenderer`; the only place HTML-in-Canvas API details live.
3. **Board store seam** — mutations, history, persistence, and notifications without DOM knowledge.
4. **Camera seam** — pure coordinate math, fully unit-tested.

Implementation details live behind these seams; no tests should assert private call sequences.

**Decision:** As recommended.

### ❓ Q14 — What testing decisions follow from those seams?

**Recommendation:** Unit-test camera math exhaustively (zoom-to-cursor invariant, fit, clamping, round-trip). Unit-test store mutations, undo/redo, persistence migration, and seed invariants. Playwright covers the complete user journey in both renderers: load, add, edit text, toggle checkbox, drag, pan, zoom, find, persist/reload. Canvas-specific test runs in Chrome 157 (CI installs Chrome beta) and asserts real DOM inside `<canvas>`, transformed hit-testing, and accessibility exposure. A performance smoke test records paint time but uses a generous threshold to avoid CI flake.

**Decision:** As recommended. Tests assert observable behavior, not implementation details.

### ❓ Q15 — How does this ship?

**Recommendation:** One integration branch, one PR that closes the spec and every ticket, squash-merge to `main`, delete branches and worktrees, then deploy `dist/` to GitHub Pages from a GitHub Actions workflow. README gets the live URL, a representative screenshot, browser-support notes, shortcuts, and development commands.

**Decision:** As recommended. No open issues or PRs at the end.

### ❓ Q16 — What does "done" look like?

**Recommendation:** All of the following are true:

- The GitHub Pages URL serves the built board with a working canvas renderer in Chrome 157 and a working DOM fallback elsewhere.
- The seeded board shows 216 cards; pan, zoom, drag, add, edit, toggle, delete, duplicate, undo, redo, and persistence work.
- Ctrl/Cmd+F finds text inside an off-screen card and the camera reveals it.
- Both renderer paths pass their Playwright journeys; unit tests, typecheck, lint, and build are green in CI.
- README has the live link, screenshot, support matrix, shortcuts, architecture pointers, and dev commands.
- The spec issue, all tickets, and the PR are closed/merged. The integration branch and worktrees are gone.

**Decision:** As recommended. This is the acceptance bar for the project.

## Design tree status

Every branch that changes the first version has a decision. The remaining choices (exact palette, copy, cluster layout, card micro-interactions) are execution details delegated to the design/build phase and recorded in the spec/ADRs where they are hard to reverse. No open question blocks implementation.
