# Feature: Container update check & single update

## Source links
- `dockpeek/static/js/modules/data-fetch.js` → `checkForUpdates()`, `checkUpdatesIndividually()`, `installUpdate()`
- `dockpeek/static/js/modules/cell-renderer.js` → `renderUpdateIndicator()` (orange icon in image cell)
- `dockpeek/static/js/modules/events.js` → row click delegation on `.update-available-indicator`
- `dockpeek/static/js/modules/modals.js` → updates found / progress / in-progress / success / error modals
- `dockpeek/static/js/modules/filters.js` → `updateUpdatesLabel()`, "updates only" toggle
- `dockpeek/main.py` → `/get-containers-list`, `/check-single-update`, `/cancel-updates`,
  `/check-dependent-containers`, `/update-container`
- `dockpeek/update.py` (checker + cache), `dockpeek/update_manager.py` (`update_container`)

## Check flow
1. Confirm if >1 server targeted.
2. `POST /get-containers-list {server_filter}` → list of `{key, server_name, container_name}`.
3. 3 concurrent workers call `POST /check-single-update` per container; progress modal; cancel
   sets `state.isCheckingForUpdates=false` (+ backend cancel flag).
4. Results written to `container.update_available`; "Updates Found" modal lists them (and offers
   "Select all N for update" → batch selection, see `batch-update.md`).
5. Backend caches results so `/data` reloads keep `update_available`.

## Single update flow (`installUpdate`)
1. `POST /check-dependent-containers` → containers using `network_mode: container:<name>`.
2. Confirmation modal (warns for dockpeek self-update).
3. `POST /update-container` → success/error modal → `fetchContainerData()`.
- Blocked while a batch update runs (re-opens batch progress instead).
