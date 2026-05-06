import { html, render } from 'lit-html';
import { createListSelectors } from '../data/list-selectors.js';
import { cmpClosedDesc, cmpPriorityThenCreated } from '../data/sort.js';
import { createIssueIdRenderer } from '../utils/issue-id-renderer.js';
import { debug } from '../utils/logging.js';
import { showToast } from '../utils/toast.js';

/**
 * @typedef {{
 *   id: string,
 *   title?: string,
 *   status?: 'open'|'in_progress'|'closed',
 *   priority?: number,
 *   issue_type?: string,
 *   created_at?: number,
 *   updated_at?: number,
 *   closed_at?: number,
 *   parent?: string,
 *   parent_title?: string,
 *   dependencies?: Array<{ depends_on_id?: string, type?: string }>
 * }} IssueLite
 */

/**
 * Map column IDs to their corresponding status values.
 *
 * @type {Record<string, 'open'|'in_progress'|'closed'>}
 */
const COLUMN_STATUS_MAP = {
  'ready-col': 'open',
  'in-progress-col': 'in_progress',
  'closed-col': 'closed'
};

/**
 * Create the Board view with To Do, In Progress, Done.
 * Push-only: derives items from per-subscription stores.
 *
 * Sorting rules:
 * - To Do/In Progress: priority asc, then created_at asc.
 * - Closed: closed_at desc.
 *
 * @param {HTMLElement} mount_element
 * @param {unknown} _data - Unused (legacy param retained for call-compat)
 * @param {(id: string) => void} gotoIssue - Navigate to issue detail.
 * @param {{ getState: () => any, setState: (patch: any) => void, subscribe?: (fn: (s:any)=>void)=>()=>void }} [store]
 * @param {{ selectors: { getIds: (client_id: string) => string[], count?: (client_id: string) => number } }} [subscriptions]
 * @param {{ snapshotFor?: (client_id: string) => any[], subscribe?: (fn: () => void) => () => void }} [issueStores]
 * @param {(type: string, payload: unknown) => Promise<unknown>} [transport] - Transport function for sending updates
 * @returns {{ load: () => Promise<void>, clear: () => void }}
 */
export function createBoardView(
  mount_element,
  _data,
  gotoIssue,
  store,
  subscriptions = undefined,
  issueStores = undefined,
  transport = undefined
) {
  const log = debug('views:board');
  /** @type {IssueLite[]} */
  let list_to_do = [];
  /** @type {IssueLite[]} */
  let list_in_progress = [];
  /** @type {IssueLite[]} */
  let list_closed = [];
  /** @type {IssueLite[]} */
  let list_closed_raw = [];
  /** @type {IssueLite[]} */
  let list_epics = [];
  /** @type {Map<string, string>} */
  let epic_title_by_id = new Map();
  /** @type {string} */
  let search_text = '';
  /** @type {'default'|'recent'|'priority'} */
  let active_filter = 'default';
  // Centralized selection helpers
  const selectors = issueStores ? createListSelectors(issueStores) : null;

  /**
   * @param {Event} ev
   */
  function onSearchInput(ev) {
    const input = /** @type {HTMLInputElement} */ (ev.currentTarget);
    search_text = input.value;
    doRender();
  }

  /**
   * @param {'default'|'recent'|'priority'} filter
   */
  function onFilterClick(filter) {
    active_filter = active_filter === filter ? 'default' : filter;
    doRender();
  }

  /**
   * @param {IssueLite[]} items
   * @returns {IssueLite[]}
   */
  function filterBySearch(items) {
    if (!search_text) return items;
    const needle = search_text.toLowerCase();
    return items.filter((it) => {
      const a = String(it.id).toLowerCase();
      const b = String(it.title || '').toLowerCase();
      return a.includes(needle) || b.includes(needle);
    });
  }

  /**
   * @param {IssueLite[]} items
   * @returns {IssueLite[]}
   */
  function applyFilter(items) {
    if (active_filter === 'default') return items;
    const sorted = [...items];
    if (active_filter === 'recent') {
      sorted.sort((a, b) => (b.updated_at || b.created_at || 0) - (a.updated_at || a.created_at || 0));
    } else if (active_filter === 'priority') {
      sorted.sort((a, b) => (a.priority || 5) - (b.priority || 5));
    }
    return sorted;
  }

  function template() {
    return html`
      <div class="panel__body jira-board-shell">
        <main class="jira-board-main">
          <div class="jira-board-content">
            <div class="jira-board-toolbar" aria-label="Board filters">
              <label class="jira-board-search">
                <span aria-hidden="true"></span>
                <input type="search" aria-label="Search board" placeholder="Search cards…" .value=${search_text} @input=${onSearchInput} />
              </label>
              <button class="jira-toolbar-button ${active_filter === 'recent' ? 'is-active' : ''}" type="button" @click=${() => onFilterClick('recent')}>
                Recent
              </button>
              <button class="jira-toolbar-button ${active_filter === 'priority' ? 'is-active' : ''}" type="button" @click=${() => onFilterClick('priority')}>
                Priority
              </button>
            </div>
            <div class="board-root">
              ${columnTemplate('TO DO', 'ready-col', applyFilter(filterBySearch(list_to_do)))}
              ${columnTemplate(
                'IN PROGRESS',
                'in-progress-col',
                applyFilter(filterBySearch(list_in_progress))
              )}
              ${columnTemplate('DONE', 'closed-col', applyFilter(filterBySearch(list_closed)))}
            </div>
          </div>
        </main>
      </div>
    `;
  }

  /**
   * @param {string} title
   * @param {string} id
   * @param {IssueLite[]} items
   */
  function columnTemplate(title, id, items) {
    const item_count = Array.isArray(items) ? items.length : 0;
    const count_label = item_count === 1 ? '1 issue' : `${item_count} issues`;
    const done_icon =
      id === 'closed-col'
        ? html`<span class="board-column__done-icon" aria-hidden="true"></span>`
        : '';
    return html`
      <section class="board-column" id=${id}>
        <header
          class="board-column__header"
          id=${id + '-header'}
          role="heading"
          aria-level="2"
        >
          <div class="board-column__title">
            <span class="board-column__title-text">${title}</span>
            ${done_icon}
            <span class="badge board-column__count" aria-label=${count_label}>
              ${item_count}
            </span>
          </div>
        </header>
        <div
          class="board-column__body"
          role="list"
          aria-labelledby=${id + '-header'}
        >
          ${items.map((it) => cardTemplate(it))}
        </div>
      </section>
    `;
  }

  /**
   * @param {number|undefined} ts - Unix timestamp in ms (or seconds)
   * @returns {string}
   */
  function formatAge(ts) {
    if (!ts) return '';
    // Normalize seconds to ms
    const ms = ts < 1e12 ? ts * 1000 : ts;
    const days = Math.floor((Date.now() - ms) / 86400000);
    if (days < 1) return 'today';
    if (days === 1) return '1d ago';
    if (days < 30) return `${days}d ago`;
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /**
   * Return a consistent color for an epic title.
   *
   * @param {string} title
   * @returns {string}
   */
  function epicColor(title) {
    const colors = [
      '#e53935', '#d81b60', '#8e24aa', '#5e35b1', '#3949ab',
      '#1e88e5', '#00acc1', '#00897b', '#43a047', '#7cb342',
      '#f4511e', '#6d4c41'
    ];
    let hash = 5381;
    for (let i = 0; i < title.length; i++) {
      hash = ((hash * 33) ^ title.charCodeAt(i)) >>> 0;
    }
    return colors[hash % colors.length];
  }

  /**
   * @param {IssueLite} it
   */
  function cardTemplate(it) {
    const epic_title = epicTitleForIssue(it);
    const age = formatAge(it.updated_at || it.created_at);
    const pri = it.priority != null ? `P${it.priority}` : '';
    return html`
      <article
        class="board-card"
        data-issue-id=${it.id}
        role="listitem"
        tabindex="-1"
        draggable="true"
        @click=${(/** @type {MouseEvent} */ ev) => onCardClick(ev, it.id)}
        @dragstart=${(/** @type {DragEvent} */ ev) => onDragStart(ev, it.id)}
        @dragend=${onDragEnd}
      >
        <div class="board-card__title text-truncate">
          ${it.title || '(no title)'}
        </div>
        ${epic_title
          ? html`<span
              class="jira-card-label jira-card-label--epic"
              style="background: ${epicColor(epic_title)}"
              title=${epic_title}
            >
              ${epic_title}
            </span>`
          : ''}
        <div class="board-card__meta">
          <span class="jira-issue-icon" aria-hidden="true"></span>
          ${createIssueIdRenderer(it.id, { class_name: 'mono' })}
          <span class="board-card__age">${age}</span>
          ${pri ? html`<span class="board-card__priority">${pri}</span>` : ''}
        </div>
      </article>
    `;
  }

  /**
   * @param {IssueLite} issue
   */
  function epicTitleForIssue(issue) {
    if (
      typeof issue.parent_title === 'string' &&
      issue.parent_title.length > 0
    ) {
      return cleanEpicTitle(issue.parent_title);
    }
    const parent_id = parentIdForIssue(issue);
    if (!parent_id) {
      return '';
    }
    const title = epic_title_by_id.get(parent_id);
    if (title) {
      return cleanEpicTitle(title);
    }
    return parent_id;
  }

  /**
   * @param {IssueLite} issue
   */
  function parentIdForIssue(issue) {
    if (typeof issue.parent === 'string' && issue.parent.length > 0) {
      return issue.parent;
    }
    const deps = Array.isArray(issue.dependencies) ? issue.dependencies : [];
    const parent_dep = deps.find(
      (dep) => dep && dep.type === 'parent-child' && dep.depends_on_id
    );
    return parent_dep?.depends_on_id || '';
  }

  /**
   * @param {string} title
   */
  function cleanEpicTitle(title) {
    return title.replace(/^EPIC:\s*/i, '').trim();
  }

  function rebuildEpicTitleLookup() {
    /** @type {Map<string, string>} */
    const next = new Map();
    const all_items = [
      ...list_epics,
      ...list_to_do,
      ...list_in_progress,
      ...list_closed_raw
    ];
    for (const item of all_items) {
      if (
        item &&
        item.id &&
        item.issue_type === 'epic' &&
        typeof item.title === 'string'
      ) {
        next.set(item.id, item.title);
      }
    }
    epic_title_by_id = next;
  }

  /** @type {string|null} */
  let dragging_id = null;

  /**
   * Handle card click, ignoring clicks during drag operations.
   *
   * @param {MouseEvent} ev
   * @param {string} id
   */
  function onCardClick(ev, id) {
    // Only navigate if this wasn't a drag operation
    if (!dragging_id) {
      gotoIssue(id);
    }
  }

  /**
   * Handle drag start: store issue id in dataTransfer and add dragging class.
   *
   * @param {DragEvent} ev
   * @param {string} id
   */
  function onDragStart(ev, id) {
    dragging_id = id;
    if (ev.dataTransfer) {
      ev.dataTransfer.setData('text/plain', id);
      ev.dataTransfer.effectAllowed = 'move';
    }
    const target = /** @type {HTMLElement} */ (ev.target);
    target.classList.add('board-card--dragging');
    log('dragstart %s', id);
  }

  /**
   * Handle drag end: remove dragging class.
   *
   * @param {DragEvent} ev
   */
  function onDragEnd(ev) {
    const target = /** @type {HTMLElement} */ (ev.target);
    target.classList.remove('board-card--dragging');
    // Clear any highlighted drop target
    clearDropTarget();
    // Clear dragging_id after a short delay to allow click event to check it
    setTimeout(() => {
      dragging_id = null;
    }, 0);
    log('dragend');
  }

  /**
   * Clear the currently highlighted drop target column.
   */
  function clearDropTarget() {
    /** @type {HTMLElement[]} */
    const all_cols = Array.from(
      mount_element.querySelectorAll('.board-column--drag-over')
    );
    for (const c of all_cols) {
      c.classList.remove('board-column--drag-over');
    }
  }

  /**
   * Update issue status via WebSocket transport.
   *
   * @param {string} issue_id
   * @param {'open'|'in_progress'|'closed'} new_status
   */
  async function updateIssueStatus(issue_id, new_status) {
    if (!transport) {
      log('no transport available, status update skipped');
      showToast('Cannot update status: not connected', 'error');
      return;
    }
    try {
      log('update-status %s → %s', issue_id, new_status);
      await transport('update-status', { id: issue_id, status: new_status });
      showToast('Status updated', 'success', 1500);
    } catch (err) {
      log('update-status failed: %o', err);
      showToast('Failed to update status', 'error');
    }
  }

  function doRender() {
    render(template(), mount_element);
    postRenderEnhance();
  }

  /**
   * Enhance rendered board with a11y and keyboard navigation.
   * - Roving tabindex per column (first card tabbable).
   * - ArrowUp/ArrowDown within column.
   * - ArrowLeft/ArrowRight to adjacent non-empty column (focus top card).
   * - Enter/Space to open details for focused card.
   */
  function postRenderEnhance() {
    try {
      /** @type {HTMLElement[]} */
      const columns = Array.from(
        mount_element.querySelectorAll('.board-column')
      );
      for (const col of columns) {
        const body = /** @type {HTMLElement|null} */ (
          col.querySelector('.board-column__body')
        );
        if (!body) {
          continue;
        }
        /** @type {HTMLElement[]} */
        const cards = Array.from(body.querySelectorAll('.board-card'));
        // Assign aria-label using column header for screen readers
        const header = /** @type {HTMLElement|null} */ (
          col.querySelector('.board-column__header')
        );
        const col_name = header ? header.textContent?.trim() || '' : '';
        for (const card of cards) {
          const title_el = /** @type {HTMLElement|null} */ (
            card.querySelector('.board-card__title')
          );
          const t = title_el ? title_el.textContent?.trim() || '' : '';
          card.setAttribute(
            'aria-label',
            `Issue ${t || '(no title)'} — Column ${col_name}`
          );
          // Default roving setup
          card.tabIndex = -1;
        }
        if (cards.length > 0) {
          cards[0].tabIndex = 0;
        }
      }
    } catch {
      // non-fatal
    }
  }

  // Delegate keyboard handling from mount_element
  mount_element.addEventListener('keydown', (ev) => {
    const target = ev.target;
    if (!target || !(target instanceof HTMLElement)) {
      return;
    }
    // Do not intercept keys inside editable controls
    const tag = String(target.tagName || '').toLowerCase();
    if (
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      target.isContentEditable === true
    ) {
      return;
    }
    const card = target.closest('.board-card');
    if (!card) {
      return;
    }
    const key = String(ev.key || '');
    if (key === 'Enter' || key === ' ') {
      ev.preventDefault();
      const id = card.getAttribute('data-issue-id');
      if (id) {
        gotoIssue(id);
      }
      return;
    }
    if (
      key !== 'ArrowUp' &&
      key !== 'ArrowDown' &&
      key !== 'ArrowLeft' &&
      key !== 'ArrowRight'
    ) {
      return;
    }
    ev.preventDefault();
    // Column context
    const col = /** @type {HTMLElement|null} */ (card.closest('.board-column'));
    if (!col) {
      return;
    }
    const body = col.querySelector('.board-column__body');
    if (!body) {
      return;
    }
    /** @type {HTMLElement[]} */
    const cards = Array.from(body.querySelectorAll('.board-card'));
    const idx = cards.indexOf(/** @type {HTMLElement} */ (card));
    if (idx === -1) {
      return;
    }
    if (key === 'ArrowDown' && idx < cards.length - 1) {
      moveFocus(cards[idx], cards[idx + 1]);
      return;
    }
    if (key === 'ArrowUp' && idx > 0) {
      moveFocus(cards[idx], cards[idx - 1]);
      return;
    }
    if (key === 'ArrowRight' || key === 'ArrowLeft') {
      // Find adjacent column with at least one card
      /** @type {HTMLElement[]} */
      const cols = Array.from(mount_element.querySelectorAll('.board-column'));
      const col_idx = cols.indexOf(col);
      if (col_idx === -1) {
        return;
      }
      const dir = key === 'ArrowRight' ? 1 : -1;
      let next_idx = col_idx + dir;
      /** @type {HTMLElement|null} */
      let target_col = null;
      while (next_idx >= 0 && next_idx < cols.length) {
        const candidate = cols[next_idx];
        const c_body = /** @type {HTMLElement|null} */ (
          candidate.querySelector('.board-column__body')
        );
        const c_cards = c_body
          ? Array.from(c_body.querySelectorAll('.board-card'))
          : [];
        if (c_cards.length > 0) {
          target_col = candidate;
          break;
        }
        next_idx += dir;
      }
      if (target_col) {
        const first = /** @type {HTMLElement|null} */ (
          target_col.querySelector('.board-column__body .board-card')
        );
        if (first) {
          moveFocus(/** @type {HTMLElement} */ (card), first);
        }
      }
      return;
    }
  });

  // Track the currently highlighted column to avoid flicker
  /** @type {HTMLElement|null} */
  let current_drop_target = null;

  // Delegate drag and drop handling for columns
  mount_element.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    if (ev.dataTransfer) {
      ev.dataTransfer.dropEffect = 'move';
    }
    // Find the column being dragged over
    const target = /** @type {HTMLElement} */ (ev.target);
    const col = /** @type {HTMLElement|null} */ (
      target.closest('.board-column')
    );

    // Only update if we've entered a different column
    if (col && col !== current_drop_target) {
      // Remove highlight from previous column
      if (current_drop_target) {
        current_drop_target.classList.remove('board-column--drag-over');
      }
      // Highlight the new column
      col.classList.add('board-column--drag-over');
      current_drop_target = col;
    }
  });

  mount_element.addEventListener('dragleave', (ev) => {
    const related = /** @type {HTMLElement|null} */ (ev.relatedTarget);
    // Only clear if we're leaving the mount element entirely
    if (!related || !mount_element.contains(related)) {
      if (current_drop_target) {
        current_drop_target.classList.remove('board-column--drag-over');
        current_drop_target = null;
      }
    }
  });

  mount_element.addEventListener('drop', (ev) => {
    ev.preventDefault();
    // Clear the drop target highlight
    if (current_drop_target) {
      current_drop_target.classList.remove('board-column--drag-over');
      current_drop_target = null;
    }

    const target = /** @type {HTMLElement} */ (ev.target);
    const col = target.closest('.board-column');
    if (!col) {
      return;
    }

    const col_id = col.id;
    const new_status = COLUMN_STATUS_MAP[col_id];
    if (!new_status) {
      log('drop on unknown column: %s', col_id);
      return;
    }

    const issue_id = ev.dataTransfer?.getData('text/plain');
    if (!issue_id) {
      log('drop without issue id');
      return;
    }

    log('drop %s on %s → %s', issue_id, col_id, new_status);
    void updateIssueStatus(issue_id, new_status);
  });

  /**
   * @param {HTMLElement} from
   * @param {HTMLElement} to
   */
  function moveFocus(from, to) {
    try {
      from.tabIndex = -1;
      to.tabIndex = 0;
      to.focus();
    } catch {
      // ignore focus errors
    }
  }

  // Sort helpers centralized in app/data/sort.js

  /**
   * Recompute closed list from raw and sort all done items.
   */
  function applyClosedList() {
    log('applyClosedList');
    const items = Array.isArray(list_closed_raw) ? [...list_closed_raw] : [];
    items.sort(cmpClosedDesc);
    list_closed = items;
  }

  /**
   * @param {IssueLite[]} items
   */
  function uniqueById(items) {
    /** @type {Map<string, IssueLite>} */
    const by_id = new Map();
    for (const item of items) {
      if (item && item.id && !by_id.has(item.id)) {
        by_id.set(item.id, item);
      }
    }
    return Array.from(by_id.values());
  }

  /**
   * Compose lists from subscriptions + issues store and render.
   */
  function refreshFromStores() {
    try {
      if (selectors) {
        const in_progress = selectors.selectBoardColumn(
          'tab:board:in-progress',
          'in_progress'
        );
        const blocked = selectors.selectBoardColumn(
          'tab:board:blocked',
          'blocked'
        );
        const ready_raw = selectors.selectBoardColumn(
          'tab:board:ready',
          'ready'
        );
        const closed = selectors.selectBoardColumn(
          'tab:board:closed',
          'closed'
        );
        const epics = selectors.selectBoardColumn('tab:board:epics', 'ready');

        // To Do is all open work: blocked plus ready, excluding in-progress.
        /** @type {Set<string>} */
        const in_prog_ids = new Set(in_progress.map((i) => i.id));
        const to_do = uniqueById([...blocked, ...ready_raw]).filter(
          (i) => !in_prog_ids.has(i.id)
        );
        to_do.sort(cmpPriorityThenCreated);

        list_to_do = to_do;
        list_in_progress = in_progress;
        list_closed_raw = closed;
        list_epics = epics;
      }
      applyClosedList();
      rebuildEpicTitleLookup();
      doRender();
    } catch {
      list_to_do = [];
      list_in_progress = [];
      list_closed = [];
      list_epics = [];
      rebuildEpicTitleLookup();
      doRender();
    }
  }

  // Live updates: recompose on issue store envelopes
  if (selectors) {
    selectors.subscribe(() => {
      try {
        refreshFromStores();
      } catch {
        // ignore
      }
    });
  }

  return {
    async load() {
      // Compose lists from subscriptions + issues store
      log('load');
      refreshFromStores();
      // If nothing is present yet (e.g., immediately after switching back
      // to the Board and before list-delta arrives), fetch via data layer as
      // a fallback so the board is not empty on initial display.
      try {
        const has_subs = Boolean(subscriptions && subscriptions.selectors);
        /**
         * @param {string} id
         */
        const cnt = (id) => {
          if (!has_subs || !subscriptions) {
            return 0;
          }
          const sel = subscriptions.selectors;
          if (typeof sel.count === 'function') {
            return Number(sel.count(id) || 0);
          }
          try {
            const arr = sel.getIds(id);
            return Array.isArray(arr) ? arr.length : 0;
          } catch {
            return 0;
          }
        };
        const total_items =
          cnt('tab:board:ready') +
          cnt('tab:board:blocked') +
          cnt('tab:board:in-progress') +
          cnt('tab:board:closed');
        const data = /** @type {any} */ (_data);
        const can_fetch =
          data &&
          typeof data.getReady === 'function' &&
          typeof data.getBlocked === 'function' &&
          typeof data.getInProgress === 'function' &&
          typeof data.getClosed === 'function';
        if (total_items === 0 && can_fetch) {
          log('fallback fetch');
          /** @type {[IssueLite[], IssueLite[], IssueLite[], IssueLite[]]} */
          const [ready_raw, blocked_raw, in_prog_raw, closed_raw] =
            await Promise.all([
              data.getReady().catch(() => []),
              data.getBlocked().catch(() => []),
              data.getInProgress().catch(() => []),
              data.getClosed().catch(() => [])
            ]);
          // Normalize and map unknowns to IssueLite shape
          /** @type {IssueLite[]} */
          let ready = Array.isArray(ready_raw) ? ready_raw.map((it) => it) : [];
          /** @type {IssueLite[]} */
          const blocked = Array.isArray(blocked_raw)
            ? blocked_raw.map((it) => it)
            : [];
          /** @type {IssueLite[]} */
          const in_prog = Array.isArray(in_prog_raw)
            ? in_prog_raw.map((it) => it)
            : [];
          /** @type {IssueLite[]} */
          const closed = Array.isArray(closed_raw)
            ? closed_raw.map((it) => it)
            : [];

          // To Do is all open work: blocked plus ready, excluding in-progress.
          /** @type {Set<string>} */
          const in_progress_ids = new Set(in_prog.map((i) => i.id));
          const to_do = uniqueById([...blocked, ...ready]).filter(
            (i) => !in_progress_ids.has(i.id)
          );

          // Sort as per column rules
          to_do.sort(cmpPriorityThenCreated);
          in_prog.sort(cmpPriorityThenCreated);
          list_to_do = to_do;
          list_in_progress = in_prog;
          list_closed_raw = closed;
          applyClosedList();
          rebuildEpicTitleLookup();
          doRender();
        }
      } catch {
        // ignore fallback errors
      }
    },
    clear() {
      mount_element.replaceChildren();
      list_to_do = [];
      list_in_progress = [];
      list_closed = [];
      list_epics = [];
      rebuildEpicTitleLookup();
    }
  };
}
