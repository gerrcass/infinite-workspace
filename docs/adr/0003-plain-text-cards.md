# Cards store plain text, checklists, and presentation only

Card content is plain text (title, body, checklist labels), never user-authored HTML. The alternative, a rich-text document model with sanitization, adds a parser, a security boundary, and an editor toolbar without proving anything new about HTML-in-Canvas.

Checklist items are separate structured records, not HTML inside the body, so the native checkbox remains a real control with real accessibility semantics. Cards also carry a color and tag for visual organization.

## Consequences

- Rendering user content uses text content and value assignment, not `innerHTML`.
- Pasting rich text into a contenteditable normalizes to plain text.
- Future rich text requires a real document model and sanitization; this decision is intentionally reversible only with that work.
