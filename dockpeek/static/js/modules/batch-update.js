import { apiUrl } from './config.js';
import { state } from './state.js';
import { updateDisplay, updateUpdatesLabel } from './filters.js';
import { fetchContainerData } from './data-fetch.js';
import {
  selectionKey,
  setSelected,
  clearSelection,
  isSelected,
  isBatchEligible,
  getVisibleEligible,
  getSelectedContainers,
  syncBatchBar,
} from './batch-selection.js';

/**
 * Batch update runner.
 *
 * Updates the selected containers strictly one at a time by reusing the
 * existing per-container `/update-container` endpoint. Running sequentially
 * keeps registry pulls and container recreation predictable and lets a failure
 * on one container be reported without affecting the rest.
 *
 * All DOM is built with createElement/textContent — container names, images and
 * backend error messages are treated as untrusted.
 */

let stopRequested = false;
let modalStage = 'idle'; // idle | confirm | running | done

const $ = (id) => document.getElementById(id);

export function initBatchUpdate() {
  const rows = $('container-rows');

  rows.addEventListener('change', (e) => {
    const input = e.target.closest('.batch-select-checkbox');
    if (!input) return;
    setSelected(input.dataset.server, input.dataset.container, input.checked);
    input.closest('tr')?.classList.toggle('batch-selected', input.checked);
    syncBatchBar();
  });

  // Checkbox clicks must not bubble into the row's other click handlers.
  rows.addEventListener('click', (e) => {
    if (e.target.closest('[data-content="batch-select"]')) e.stopPropagation();
  });

  $('batch-select-all-button').addEventListener('click', () => {
    const visible = getVisibleEligible();
    const allSelected = visible.length > 0 && visible.every(isSelected);
    visible.forEach(c => setSelected(c.server, c.name, !allSelected));
    updateDisplay();
  });

  $('batch-clear-button').addEventListener('click', () => {
    clearSelection();
    updateDisplay();
  });

  $('batch-update-button').addEventListener('click', () => {
    if (state.isBatchUpdating) {
      $('batch-update-modal').classList.remove('hidden');
      return;
    }
    openConfirmStage();
  });

  $('batch-cancel-button').addEventListener('click', onCancelClick);
  $('batch-confirm-button').addEventListener('click', onConfirmClick);

  $('batch-update-modal').addEventListener('click', (e) => {
    if (e.target === $('batch-update-modal') && modalStage !== 'running') closeModal();
  });

  // Opening logs from the summary should reveal the logs viewer, not stack under the modal.
  $('batch-update-list').addEventListener('click', (e) => {
    if (e.target.closest('.view-logs-btn')) closeModal();
  });

  window.addEventListener('beforeunload', (e) => {
    if (state.isBatchUpdating) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

/** Select every eligible container from a list (used by the "Updates Found" modal). */
export function selectContainersForBatch(containers) {
  containers.filter(isBatchEligible).forEach(c => setSelected(c.server, c.name, true));
  updateDisplay();
}

// ---------------------------------------------------------------------------
// Modal stages
// ---------------------------------------------------------------------------

async function openConfirmStage() {
  const targets = getSelectedContainers();
  if (!targets.length) return;

  modalStage = 'confirm';
  stopRequested = false;

  setHeader('Update selected containers',
    `${targets.length} container${plural(targets.length)} will be updated one by one. ` +
    'Each container is stopped and recreated with its new image.');
  setProgress(0, targets.length, false);
  setNote('');

  const list = $('batch-update-list');
  list.replaceChildren(...targets.map(c => buildItem(c)));

  setButtons({ cancel: 'Cancel', confirm: `Update ${targets.length}`, confirmVisible: true });
  $('batch-update-modal').classList.remove('hidden');

  // Surface network_mode dependents (they get recreated too) without blocking the dialog.
  const results = await Promise.all(targets.map(fetchDependents));
  if (modalStage !== 'confirm') return;
  let total = 0;
  results.forEach((deps, i) => {
    if (!deps.length) return;
    total += deps.length;
    const item = findItem(targets[i]);
    const el = item?.querySelector('.batch-item-dependents');
    if (el) {
      el.textContent = `Also recreates: ${deps.join(', ')}`;
      el.classList.remove('hidden');
    }
  });
  if (total) setNote(`${total} dependent container${plural(total)} will also be recreated.`);
}

function onCancelClick() {
  if (modalStage === 'running') {
    stopRequested = true;
    $('batch-cancel-button').disabled = true;
    $('batch-cancel-button').textContent = 'Stopping after current…';
    return;
  }
  closeModal();
}

function onConfirmClick() {
  if (modalStage === 'confirm') runBatch();
  else closeModal();
}

function closeModal() {
  $('batch-update-modal').classList.add('hidden');
  if (modalStage !== 'running') modalStage = 'idle';
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function runBatch() {
  const targets = getSelectedContainers();
  if (!targets.length || state.isBatchUpdating) return;

  modalStage = 'running';
  state.isBatchUpdating = true;
  stopRequested = false;
  setButtons({ cancel: 'Stop after current', confirmVisible: false });
  updateDisplay(); // disables row checkboxes / switches bar to "Show progress"

  const counts = { success: 0, error: 0, skipped: 0 };

  try {
    for (let i = 0; i < targets.length; i++) {
      const container = targets[i];
      const item = findItem(container);

      if (stopRequested) {
        setItemState(item, 'skipped');
        counts.skipped++;
        continue;
      }

      setItemState(item, 'running');
      item?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      setHeader(`Updating ${i + 1} of ${targets.length}`, container.name);
      setProgress(i, targets.length, true);

      try {
        await updateOne(container);
        counts.success++;
        setItemState(item, 'success');
        container.update_available = false;
        setSelected(container.server, container.name, false);
      } catch (error) {
        counts.error++;
        setItemState(item, 'error', error.message);
        console.error(`Batch update failed for ${container.server}/${container.name}`);
      }

      setProgress(i + 1, targets.length, true);
      updateDisplay();
      updateUpdatesLabel();
    }
  } finally {
    state.isBatchUpdating = false;
    modalStage = 'done';
    showSummary(counts, targets.length);
    updateDisplay();
    updateUpdatesLabel();
    // Recreated containers have new IDs/statuses; reload once at the end.
    fetchContainerData();
  }
}

async function updateOne(container) {
  const response = await fetch(apiUrl('/update-container'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ server_name: container.server, container_name: container.name }),
  });

  let result = {};
  try {
    result = await response.json();
  } catch {
    // Non-JSON body (e.g. proxy error page) — fall back to the status line.
  }

  if (!response.ok) {
    throw new Error(htmlToText(result.error) || `Request failed (HTTP ${response.status})`);
  }
  return result;
}

async function fetchDependents(container) {
  try {
    const response = await fetch(apiUrl('/check-dependent-containers'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ server_name: container.server, container_name: container.name }),
    });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data.dependent_containers) ? data.dependent_containers.map(String) : [];
  } catch {
    return [];
  }
}

function showSummary(counts, total) {
  const parts = [];
  if (counts.success) parts.push(`${counts.success} updated`);
  if (counts.error) parts.push(`${counts.error} failed`);
  if (counts.skipped) parts.push(`${counts.skipped} skipped`);

  const title = counts.skipped
    ? 'Batch update stopped'
    : counts.error ? 'Batch update finished with errors' : 'Batch update complete';

  setHeader(title, parts.join(' · ') || `0 of ${total} updated`);
  setProgress(total, total, false, counts.error ? 'error' : 'success');
  setNote(counts.error ? 'Failed containers stay selected so you can retry them.' : '');
  setButtons({ confirm: 'Done', confirmVisible: true, cancelVisible: false });

  // Running item rows become clickable log shortcuts once finished.
  document.querySelectorAll('#batch-update-list .batch-item').forEach(item => {
    const s = item.dataset.state;
    if (s === 'success' || s === 'error') item.querySelector('.batch-item-logs')?.classList.remove('hidden');
  });
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function buildItem(container) {
  const li = document.createElement('li');
  li.className = 'batch-item';
  li.dataset.state = 'pending';
  li.dataset.key = selectionKey(container.server, container.name);

  const status = document.createElement('span');
  status.className = 'batch-item-status';
  status.setAttribute('aria-hidden', 'true');

  const body = document.createElement('div');
  body.className = 'batch-item-body';

  const name = document.createElement('div');
  name.className = 'batch-item-name';
  name.textContent = container.name;

  const meta = document.createElement('div');
  meta.className = 'batch-item-meta';
  meta.textContent = [container.server, container.stack, container.image].filter(Boolean).join(' · ');

  const deps = document.createElement('div');
  deps.className = 'batch-item-dependents hidden';

  const err = document.createElement('div');
  err.className = 'batch-item-error hidden';

  body.append(name, meta, deps, err);

  const logs = document.createElement('button');
  logs.type = 'button';
  logs.className = 'batch-item-logs view-logs-btn hidden';
  logs.dataset.server = container.server;
  logs.dataset.container = container.name;
  logs.textContent = 'Logs';

  const stateLabel = document.createElement('span');
  stateLabel.className = 'batch-item-state';
  stateLabel.textContent = 'Queued';

  li.append(status, body, stateLabel, logs);
  return li;
}

const STATE_LABELS = { pending: 'Queued', running: 'Updating…', success: 'Updated', error: 'Failed', skipped: 'Skipped' };

function setItemState(item, newState, errorMessage = '') {
  if (!item) return;
  item.dataset.state = newState;
  item.querySelector('.batch-item-state').textContent = STATE_LABELS[newState] || '';
  const err = item.querySelector('.batch-item-error');
  err.textContent = errorMessage;
  err.classList.toggle('hidden', !errorMessage);
}

function findItem(container) {
  const key = selectionKey(container.server, container.name);
  return [...$('batch-update-list').children].find(li => li.dataset.key === key) || null;
}

function setHeader(title, subtitle) {
  $('batch-modal-title').textContent = title;
  $('batch-modal-subtitle').textContent = subtitle;
}

function setProgress(done, total, visible, tone = '') {
  const wrap = $('batch-progress');
  wrap.classList.toggle('hidden', !visible && done === 0);
  wrap.dataset.tone = tone;
  $('batch-progress-fill').style.width = `${total ? Math.round((done / total) * 100) : 0}%`;
  $('batch-progress-counter').textContent = `${done} / ${total}`;
}

function setNote(text) {
  const note = $('batch-modal-note');
  note.textContent = text;
  note.classList.toggle('hidden', !text);
}

function setButtons({ cancel = 'Cancel', confirm = '', confirmVisible = true, cancelVisible = true }) {
  const cancelBtn = $('batch-cancel-button');
  const confirmBtn = $('batch-confirm-button');
  cancelBtn.textContent = cancel;
  cancelBtn.disabled = false;
  cancelBtn.classList.toggle('hidden', !cancelVisible);
  confirmBtn.textContent = confirm;
  confirmBtn.classList.toggle('hidden', !confirmVisible);
}

/** Backend errors may carry HTML formatting; render them as inert plain text. */
function htmlToText(value) {
  if (!value) return '';
  const doc = new DOMParser().parseFromString(String(value), 'text/html');
  return (doc.body.textContent || '').trim();
}

function plural(n) {
  return n === 1 ? '' : 's';
}
