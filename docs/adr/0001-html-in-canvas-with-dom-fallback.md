# Render live cards with HTML-in-Canvas, with a DOM renderer as a first-class fallback

The project exists to prove that canvas-based boards can keep real document affordances. We use the experimental HTML-in-Canvas API (`content="drawable"`, `drawable` children, `drawElementImage()`) as the primary renderer and keep a complete DOM renderer for browsers without it.

The alternative — screenshotting DOM to canvas — was rejected because it discards native find-in-page, accessibility, editing, and form controls, which are the point of the project. A canvas-only implementation was rejected because the API is experimental and Chrome-only.

## Consequences

- Every card element exists in the DOM in both renderers. The canvas renderer only changes where and how it is painted.
- All HTML-in-Canvas API contact is isolated in the canvas renderer. The rest of the app knows only the `Renderer` contract.
- The fallback is feature-complete; it is not a reduced mode.
- Cards are drawn every paint rather than culled, preserving geometry for off-screen cards so native find and accessibility remain honest at the target scale.
