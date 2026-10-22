# CODE_MAP

Structural index of the codebase. Feature digests live in `features/`.

## Digests
- [ARCHITECTURE.md](ARCHITECTURE.md) — request flow, state, render pipeline, boundaries
- [features/container-updates.md](features/container-updates.md) — update check + single update
- [features/batch-update.md](features/batch-update.md) — checkbox selection + sequential batch update

## Backend (`dockpeek/`)
| File | Responsibility |
|---|---|
| `__init__.py` | Flask app factory, blueprint registration |
| `auth.py` | Login/logout, `conditional_login_required` |
| `main.py` | JSON API routes: `/data`, `/status`, `/get-containers-list`, `/check-single-update`, `/cancel-updates`, `/check-dependent-containers`, `/update-container`, prune, logs, export |
| `get_data.py` | Assembles container/server payload (ports, traefik, tags, cached `update_available`) |
| `docker_utils.py` | Docker client discovery across hosts/sockets |
| `update.py` | Update checker: pull + digest compare, cache, cancel flag |
| `update_manager.py` | `update_container()` — stop/recreate with new image, dependents |
| `logs_manager.py` | Logs fetch / streaming |

## Frontend (`dockpeek/static/js/`)
| File | Responsibility |
|---|---|
| `app.js` | Bootstrap; `renderTable()` |
| `modules/state.js` | Shared mutable state (data, filters, update/batch flags, selection) |
| `modules/data-fetch.js` | `/data` load, update check orchestration, `installUpdate()` single update |
| `modules/filters.js` | `updateDisplay()` (filter/sort → render), server buttons, updates label |
| `modules/table-renderer.js` | Clones row template, calls cell renderers, syncs batch bar |
| `modules/cell-renderer.js` | Per-cell rendering (name, image, update icon, ports, traefik, logs) |
| `modules/batch-selection.js` | Batch selection model, row checkbox, floating bar |
| `modules/batch-update.js` | Batch confirm/run/summary modal, sequential runner |
| `modules/modals.js` | Shared modals (confirm, updates found, progress, success/error, prune) |
| `modules/events.js` | Global listeners; delegates row clicks (update icon, tags, stack) |
| `modules/logs-viewer.js` | Logs modal viewer |
| other modules | column order/visibility, drag-drop, prune, stats, swarm indicator, sanitize, tooltips/theme (`ui-utils.js`) |

## Templates / CSS
- `templates/index.html` — page, row `<template>`, all modal markup, batch bar
- `static/css/styles.css` → built into `tailwindcss.css` (committed)
- `static/css/batch-update.css` — standalone batch update styles
- `static/css/logs-viewer.css` — imported by styles.css
