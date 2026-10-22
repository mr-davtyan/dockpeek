# CHANGELOG_ARCHIVE

## [2026-10-22] Feature: Batch container updates

**Intent:** After "Check for updates" flags several containers, let the user tick the ones they
want and update them in one go, strictly one after another, instead of clicking each update icon
and confirming individually.

**Mechanism**
- New `static/js/modules/batch-selection.js` — selection model stored in
  `state.selectedForUpdate` (Map keyed by `JSON.stringify([server, name])` to avoid `:` ambiguity),
  eligibility rules, row checkbox rendering, floating bar sync. Depends only on `state.js`, so
  `table-renderer.js` can import it without import cycles.
- New `static/js/modules/batch-update.js` — confirm → run → summary modal. Calls the existing
  `POST /update-container` once per container in a sequential `for … await` loop (never >1 in
  flight). Pre-fetches `/check-dependent-containers` to show `network_mode: container:` dependents.
  Success → `update_available=false`, deselect, live re-render. Failure → error shown inline,
  container stays selected for retry. "Stop after current" is cooperative (doesn't abort an
  in-flight recreate, which could leave a container removed). One `fetchContainerData()` at end.
- `templates/index.html`: per-row `<label data-content="batch-select">` checkbox next to the update
  icon; `#batch-update-bar` floating bar; `#batch-update-modal`; "Select all N for update" button in
  the Updates Found modal; links new `static/css/batch-update.css`.
- `table-renderer.js` renders the checkbox and calls `syncBatchBar()` after each render.
- Guards: while `state.isBatchUpdating`, the single-update icon (`events.js`) and "Check for
  updates" (`data-fetch.js`) re-open batch progress instead of running; `beforeunload` warns.

**Decisions / edge cases**
- No backend changes; reuses existing auth-protected endpoints.
- Excluded from batch: Swarm services (update unsupported) and any container whose name contains
  `dockpeek` (cannot update itself) — checkbox shown disabled with tooltip.
- Order = current table order, then selected rows hidden by filters.
- Backend error HTML is converted to inert text via `DOMParser` + `textContent` (verified a
  `<script>` payload does not execute).
- Styles are a standalone stylesheet because `tailwindcss.css` is a committed build artifact and
  `node_modules` is not present; rules guard `display` with `:not(.hidden)` since unlayered CSS
  overrides Tailwind's layered `.hidden`.
- Verified with a mocked Playwright run (selection, select-all, dockpeek exclusion, sequential
  execution, partial failure, retry selection, dark mode).

Docs: `.knowledge/features/batch-update.md`.
