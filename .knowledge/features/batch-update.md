# Feature: Batch container updates

Select multiple containers that have updates (checkbox next to the orange update icon) and update
them sequentially, one by one, from a floating action bar.

## Source links
- `dockpeek/static/js/modules/batch-selection.js` — selection model + rendering (state-only deps)
  - `selectionKey(server, name)` → `JSON.stringify([server, name])`
  - `getIneligibleReason()` / `isBatchEligible()` — excludes no-update, Swarm, dockpeek
  - `renderBatchCheckbox(container, clone)` — called by `table-renderer.js` per row
  - `getSelectedContainers()` — table order first, then filtered-out selections
  - `pruneSelection()` / `syncBatchBar()` — called after every table render
- `dockpeek/static/js/modules/batch-update.js` — runner + modal
  - `initBatchUpdate()` — called from `events.js` `initEventListeners()`
  - `selectContainersForBatch(list)` — used by "Updates Found" modal (`modals.js`, dynamic import)
  - stages: `confirm` → `running` → `done` (`modalStage`)
- `dockpeek/static/js/modules/state.js` — `selectedForUpdate: Map`, `isBatchUpdating: bool`
- `dockpeek/static/js/modules/table-renderer.js` — hooks checkbox + bar sync
- `dockpeek/static/js/modules/events.js` / `data-fetch.js` — guards while batch runs
- `dockpeek/templates/index.html` — `[data-content="batch-select"]` in row template,
  `#batch-update-bar`, `#batch-update-modal`, `#updates-modal-select-button`
- `dockpeek/static/css/batch-update.css` — all styles (light/dark)

## Runtime flow
1. Row renders → checkbox visible iff `update_available`; disabled (with tooltip) if ineligible or
   a batch is running.
2. Checkbox `change` (delegated on `#container-rows`) → `setSelected` → `syncBatchBar`.
3. Bar shows when any eligible update is visible or something is selected:
   count, Select all / Deselect all (visible eligible rows), Clear, "Update N".
4. "Update N" → confirm stage: list built with `createElement`; dependents fetched in parallel
   from `/check-dependent-containers` and shown per item.
5. Confirm → `runBatch()`: `state.isBatchUpdating=true`; for each target sequentially
   `POST /update-container`. Item states: pending → running → success | error | skipped.
   - success: `update_available=false`, deselect, `updateDisplay()` (row icon disappears live)
   - error: message (HTML→text via DOMParser) shown inline; stays selected for retry
   - "Stop after current": remaining items marked skipped
6. Done stage: summary, per-item "Logs" buttons (`.view-logs-btn` → global logs handler, modal
   closes), then one `fetchContainerData()`.

## Invariants
- Never more than one `/update-container` request in flight from the batch runner.
- No new backend endpoints; auth/CSRF posture identical to single update.
- Untrusted strings only via `textContent`.

## Testing
Mocked Playwright smoke test (all API routes intercepted) covered selection, select-all,
dockpeek exclusion, sequential order, partial failure, XSS-inert errors, dark mode.
