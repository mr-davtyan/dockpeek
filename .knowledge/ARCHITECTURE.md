# ARCHITECTURE

## Request flow
```
Browser (ES modules) ──fetch JSON──▶ Flask blueprint main.py ──docker SDK──▶ Docker hosts
                                         │
                                         ├─ get_data.py      (/data payload)
                                         ├─ update.py        (check updates, cache, cancel)
                                         └─ update_manager.py (recreate container)
```
- All API routes are `@conditional_login_required` (auth can be disabled via config).
- Multi-host: `docker_utils.discover_docker_clients()` returns `{name, client, status, url}` per host.
- Long operations run per container per HTTP request (gunicorn timeout 600s); the frontend
  orchestrates loops (update check uses 3 parallel workers; batch update is strictly sequential).

## Frontend state & render pipeline
- `modules/state.js` exports one mutable `state` object:
  `allContainersData`, `allServersData`, `filteredAndSortedContainers`, `swarmServers`,
  `currentServerFilter`, sort fields, `isCheckingForUpdates`, `isBatchUpdating`,
  `selectedForUpdate` (Map), column order/visibility.
- `data-fetch.fetchContainerData()` → fills state → `filters.updateDisplay()`.
- `updateDisplay()` filters/sorts into `filteredAndSortedContainers` → `app.renderTable()` →
  `TableRenderer.render()` → per-row cell renderers → `syncBatchBar()`.
- Status refresh every 60s (`refreshContainerStatus`) patches statuses and re-renders.
- Any UI derived from container data should be recomputed inside the render path, not cached in DOM.

## Boundaries
- Backend never trusts container metadata for HTML; frontend escapes (`sanitize.js`) or uses
  `textContent`.
- Swarm services: read-only for updates (check button disabled, batch excludes them).
- Dockpeek cannot update its own container.

## Styling
- Tailwind v4 compiled CSS is committed; new feature styles may ship as standalone CSS linked in
  `index.html`. Unlayered rules override Tailwind `.hidden` — guard `display` with `:not(.hidden)`.
