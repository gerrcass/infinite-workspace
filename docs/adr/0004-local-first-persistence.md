# Local-first persistence with no backend

The first version is a public demo, not a collaborative product. Board content, camera, and schema version live in `localStorage`, written on a short debounce. A missing or invalid record seeds the curated board; storage failures leave the session usable and surface a "Not saved" status.

A backend would introduce auth, tenancy, conflict handling, and operational cost before the core bet — native document affordances in a canvas board — has been validated. Session-only undo history is deliberate; cross-reload undo is not expected in this product.

## Consequences

- Clearing site data resets the board unless the user exported it (export is out of scope).
- The seed is deterministic and versioned alongside the schema.
- Multi-device sync would require a new ADR and a data migration.
