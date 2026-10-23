# Coding standards

Reviewers apply these rules in addition to the acceptance criteria on the ticket.

## Architecture

- `src/camera/` and `src/store/` are DOM-free pure modules. They may use `localStorage` only through an injected storage port.
- `src/render/` owns all renderer-specific behavior. Any reference to `drawElementImage`, `requestPaint`, `drawable`, or `content="drawable"` outside the canvas renderer is a defect.
- `src/ui/` owns transient UI and DOM events but not board state. Mutations go through store actions.
- No circular imports. Use explicit `import type` for type-only imports.

## DOM and editing

- User content is assigned with `textContent` or `.value`. `innerHTML` is permitted only for hard-coded, trusted template strings.
- Do not re-create a card element while any descendant is focused.
- Event handlers that mutate the board must not run while a contenteditable field has focus unless the event originated inside that field.
- Every interactive control has an accessible name. Every focusable control has a visible focus style.
- Use `pointer` events, not mouse/touch pairs. Use `setPointerCapture` for drags.

## Visual

- Use the design tokens in `src/styles/tokens.css`. No one-off hex colors in component styles.
- Card colors come from the model's color union; do not accept arbitrary color strings.
- Respect `prefers-reduced-motion` for every camera or UI animation.

## Tests

- A test names the user-visible behavior, not the function call. Prefer `it('reveals an off-screen find match')` over `it('calls reveal')`.
- Camera invariants are tested with multiple coordinate signs and zoom levels.
- Browser tests visit the built app and use the render-mode URL override, never internal debug hooks that bypass UI. Contract assertions on the HTML-in-Canvas attributes (`content="drawable"`, `drawable`) are allowed in tests; production code outside the canvas renderer still must not name them.
- Performance assertions use recorded numbers and generous budgets; do not gate on exact frame times.
