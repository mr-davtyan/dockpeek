import { state } from './state.js';

/**
 * Selection model for batch updates.
 *
 * Kept free of network/modal imports so the table renderer can depend on it
 * without creating import cycles. Selection lives in `state.selectedForUpdate`
 * (a Map of key -> { server, name }) so it survives table re-renders.
 */

export function selectionKey(server, name) {
  // JSON array avoids ambiguity when server/container names contain ':'.
  return JSON.stringify([server, name]);
}

export function isDockpeekContainer(name) {
  return String(name || '').toLowerCase().includes('dockpeek');
}

export function getIneligibleReason(container) {
  if (!container.update_available) return 'No update available';
  if (state.swarmServers.includes(container.server)) return 'Batch update is not supported for Swarm services';
  if (isDockpeekContainer(container.name)) return 'Dockpeek cannot update itself — update it manually';
  return null;
}

export function isBatchEligible(container) {
  return getIneligibleReason(container) === null;
}

export function isSelected(container) {
  return state.selectedForUpdate.has(selectionKey(container.server, container.name));
}

export function setSelected(server, name, selected) {
  const key = selectionKey(server, name);
  if (selected) {
    state.selectedForUpdate.set(key, { server, name });
  } else {
    state.selectedForUpdate.delete(key);
  }
}

export function clearSelection() {
  state.selectedForUpdate.clear();
}

/** Containers that are eligible and currently visible (respecting filters/search). */
export function getVisibleEligible() {
  return state.filteredAndSortedContainers.filter(isBatchEligible);
}

/**
 * Selected containers resolved against live data, ordered as they appear in the
 * table first, then any selected containers hidden by the current filters.
 */
export function getSelectedContainers() {
  const ordered = [];
  const seen = new Set();
  const pushIfSelected = (c) => {
    const key = selectionKey(c.server, c.name);
    if (!seen.has(key) && state.selectedForUpdate.has(key) && isBatchEligible(c)) {
      seen.add(key);
      ordered.push(c);
    }
  };
  state.filteredAndSortedContainers.forEach(pushIfSelected);
  state.allContainersData.forEach(pushIfSelected);
  return ordered;
}

/** Drop selections whose container vanished or no longer has an eligible update. */
export function pruneSelection() {
  const live = new Map(state.allContainersData.map(c => [selectionKey(c.server, c.name), c]));
  for (const key of [...state.selectedForUpdate.keys()]) {
    const container = live.get(key);
    if (!container || !isBatchEligible(container)) {
      state.selectedForUpdate.delete(key);
    }
  }
}

/** Populate the per-row checkbox that sits next to the update indicator. */
export function renderBatchCheckbox(container, clone) {
  const label = clone.querySelector('[data-content="batch-select"]');
  if (!label) return;
  const input = label.querySelector('input');
  const row = clone.querySelector('tr');

  if (!container.update_available) {
    label.classList.add('hidden');
    return;
  }

  const reason = getIneligibleReason(container);
  const checked = !reason && isSelected(container);

  label.classList.remove('hidden');
  input.dataset.server = container.server;
  input.dataset.container = container.name;
  input.checked = checked;
  input.disabled = Boolean(reason) || state.isBatchUpdating;
  input.setAttribute('aria-label', `Select ${container.name} for batch update`);
  label.setAttribute('data-tooltip', reason || `Select for batch update`);

  if (row) row.classList.toggle('batch-selected', checked);
}

/** Refresh the floating batch action bar (counts, visibility, button states). */
export function syncBatchBar() {
  const bar = document.getElementById('batch-update-bar');
  if (!bar) return;

  pruneSelection();

  const eligibleVisible = getVisibleEligible();
  const selectedCount = state.selectedForUpdate.size;
  const shouldShow = state.isBatchUpdating || selectedCount > 0 || eligibleVisible.length > 0;

  bar.classList.toggle('hidden', !shouldShow);
  if (!shouldShow) return;

  const allVisibleSelected = eligibleVisible.length > 0 && eligibleVisible.every(isSelected);

  document.getElementById('batch-bar-count').textContent = String(selectedCount);
  document.getElementById('batch-bar-label').textContent =
    `of ${eligibleVisible.length} update${eligibleVisible.length === 1 ? '' : 's'} selected`;

  const selectAllBtn = document.getElementById('batch-select-all-button');
  selectAllBtn.textContent = allVisibleSelected ? 'Deselect all' : 'Select all';
  selectAllBtn.disabled = state.isBatchUpdating || eligibleVisible.length === 0;

  document.getElementById('batch-clear-button').classList.toggle('hidden', selectedCount === 0 || allVisibleSelected);
  document.getElementById('batch-clear-button').disabled = state.isBatchUpdating;

  const updateBtn = document.getElementById('batch-update-button');
  const updateLabel = document.getElementById('batch-update-button-label');
  updateBtn.disabled = !state.isBatchUpdating && selectedCount === 0;
  updateBtn.classList.toggle('running', state.isBatchUpdating);
  updateLabel.textContent = state.isBatchUpdating
    ? 'Show progress'
    : `Update ${selectedCount || ''}`.trim();

  bar.classList.toggle('has-selection', selectedCount > 0);
}
