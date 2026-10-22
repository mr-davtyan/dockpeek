# PROJECT_MAP

## Vision
Dockpeek is a lightweight, self-hosted web dashboard to see all Docker containers across one or many
hosts at a glance (ports, Traefik routes, stacks, logs) and to check for and install image updates.

## Tech Stack
| Layer | Tech |
|---|---|
| Backend | Python 3.11, Flask (+ Flask-Login, Flask-Cors), docker SDK, `packaging` |
| Server | gunicorn + gevent (`gunicorn.conf.py`, timeout 600s) |
| Frontend | Vanilla ES modules (no bundler), Jinja2 template `templates/index.html` |
| CSS | Tailwind v4 CLI → committed `static/css/tailwindcss.css` (built from `styles.css`); feature stylesheets loaded standalone (e.g. `batch-update.css`) |
| Packaging | Dockerfile (python:3.11-slim), compose examples in repo root + `deploy/` |

## Core Modules
```
run.py / gunicorn.conf.py   entry points
config.py                   env-driven config
dockpeek/
  __init__.py               app factory, blueprints
  auth.py                   login/logout (Flask-Login, DISABLE_AUTH)
  main.py                   all JSON API routes (/data, /check-single-update, /update-container, logs, prune, export)
  get_data.py               builds container/server payload for /data
  docker_utils.py           client discovery (DOCKER_HOST*, sockets), caching
  update.py                 update checker (image pull/compare, cancel, cache)
  update_manager.py         container recreate logic (update_container)
  logs_manager.py           log fetch/stream
  templates/index.html      single-page UI + modal markup + row <template>
  static/js/app.js          bootstrap
  static/js/modules/*.js    feature modules (see .knowledge/CODE_MAP.md)
  static/css/*.css          styles
```

## Patterns
- Frontend: plain ES modules sharing a single mutable `state` object (`modules/state.js`);
  `filters.updateDisplay()` is the single re-render entry point → `TableRenderer.render()`.
- Rows are cloned from `<template id="container-row-template">`; cell renderers populate them.
- Untrusted strings (names, images, labels, backend errors) must go through `escapeHtml`/`safeUrl`
  or `textContent`. New code prefers `createElement` + `textContent`.
- Long Docker operations are per-container HTTP calls; the frontend orchestrates multi-container work.
- Knowledge base: `.knowledge/` (see `CODE_MAP.md`), changelog in `CHANGELOG_ARCHIVE.md`.
