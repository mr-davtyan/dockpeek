# Feature: Manual Docker Build & Publish Pipeline

## Source links
- `.github/workflows/build-docker.yml` → manual workflow definition, version calculator, multi-arch build, and registry push
- `Dockerfile` → container image specification, OCI labels, `BUILD_DATE`, `VERSION`, `VCS_REF` build args
- `package.json` → Tailwind CSS compilation scripts (`npm run build:css`)
- `dockpeek/config.py` → reads runtime `VERSION` (`APP_VERSION`)
- `dockpeek/main.py` → exposes `APP_VERSION` via `/status` and `/data` endpoints

## Pipeline Architecture & Execution Flow
1. **Trigger**: Manual trigger via GitHub Actions `workflow_dispatch`.
   - `base_version`: Base semantic version string (defaults to `1.7.3`).
   - `version_suffix`: Optional override for sequence number `NN` (e.g. `01`, `02`).
   - `push_image`: Boolean flag (default `true`) controlling push to GitHub Container Registry (`ghcr.io`).
   - `create_git_tag`: Boolean flag (default `true`) controlling git tag creation and push back to repository.
   - `tag_latest`: Boolean flag (default `true`) controlling addition of `:latest` tag.
2. **Version Resolution**:
   - Strips leading `v` from `base_version` if supplied.
   - If `version_suffix` is empty, fetches all repository tags and scans for existing `v<base_version>-*` tags.
   - Evaluates numeric maximum of existing suffix sequence and sets next sequence number padded to 2 digits (`NN = max + 1`), starting at `01` when no matching tags exist.
   - If `version_suffix` is specified, normalizes and pads it to 2 digits (or preserves custom alphanumeric).
   - Produces target tag in format `v<base_version>-<NN>` (e.g. `v1.7.3-01`).
3. **CSS Asset Compilation**:
   - Runs `npm ci` and `npm run build:css` to ensure `dockpeek/static/css/tailwindcss.css` is completely up-to-date with any stylesheet changes prior to container packaging.
4. **Multi-Arch Docker Build**:
   - Sets up QEMU and Docker Buildx.
   - Authenticates to `ghcr.io` using the built-in `GITHUB_TOKEN`.
   - Builds target architectures `linux/amd64` and `linux/arm64`.
   - Injects `BUILD_DATE`, `VERSION`, and `VCS_REF` build arguments to align with OCI labels in `Dockerfile`.
   - Uses GitHub Actions cache (`type=gha`) for optimal build layer caching.
5. **Tagging & Git Release**:
   - When enabled, automatically creates and pushes git tag `v1.7.3-NN` using `GITHUB_TOKEN`.
   - Enables subsequent pipeline runs to automatically detect and increment the sequence number.
