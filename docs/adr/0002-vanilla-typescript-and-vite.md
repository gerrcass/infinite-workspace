# Vanilla TypeScript and Vite, no UI framework

The renderer owns per-card DOM elements for their entire lifetime so that contenteditable focus, selection, caret, and checkbox state survive camera changes. Framework reconciliation would either fight that ownership or require escape hatches around every editable card.

Vite provides the build, dev server, and GitHub Pages-friendly static output. Vitest and Playwright cover the two seams. The app has zero runtime dependencies.

## Consequences

- Card views are created once, updated surgically, and never re-created on camera movement.
- The store notifies targeted changes; there is no virtual DOM diff to lean on.
- Contributors need to understand direct DOM ownership, but the surface is small and localized.
