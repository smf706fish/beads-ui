import { html, render } from 'lit-html';
import { debug } from '../utils/logging.js';

/**
 * Create the Reports view showing throughput and effort charts.
 *
 * @param {HTMLElement} mount_element
 * @param {{ snapshotFor?: (client_id: string) => any[], subscribe?: (fn: () => void) => () => void }} [issueStores]
 * @returns {{ load: () => void, clear: () => void }}
 */
export function createReportsView(mount_element, issueStores = undefined) {
  const log = debug('views:reports');

  /**
   * Get all issues from all known stores.
   *
   * @returns {Array<{ id: string, closed_at?: number, created_at?: number, priority?: number, status?: string }>}
   */
  function getAllIssues() {
    if (!issueStores || typeof issueStores.snapshotFor !== 'function') {
      return [];
    }
    /** @type {Map<string, any>} */
    const by_id = new Map();
    const client_ids = [
      'tab:issues',
      'tab:epics',
      'tab:board:closed',
      'tab:board:ready',
      'tab:board:blocked',
      'tab:board:in-progress',
      'tab:board:epics',
      'tab:reports',
      'tab:reports:closed'
    ];
    for (const cid of client_ids) {
      try {
        const arr = issueStores.snapshotFor(cid);
        if (Array.isArray(arr)) {
          for (const issue of arr) {
            if (issue && issue.id) {
              by_id.set(issue.id, issue);
            }
          }
        }
      } catch {
        // ignore missing stores
      }
    }
    return Array.from(by_id.values());
  }

  /**
   * Get the Monday of the week for a timestamp.
   *
   * @param {number} ts
   * @returns {number}
   */
  function weekStart(ts) {
    const d = new Date(ts > 1e12 ? ts : ts * 1000);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + diff);
    return d.getTime();
  }

  /**
   * Format a week start timestamp as a label.
   *
   * @param {number} ts
   * @returns {string}
   */
  function weekLabel(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /**
   * Effort weight based on priority (higher priority = more effort).
   * P0=5, P1=4, P2=3, P3=2, P4=1
   *
   * @param {number|undefined} priority
   * @returns {number}
   */
  function effortWeight(priority) {
    const p = typeof priority === 'number' ? priority : 2;
    return Math.max(1, 5 - p);
  }

  function template() {
    const all = getAllIssues();
    const now = Date.now();
    const weeks = 12;
    const current_week = weekStart(now);

    // Build week buckets
    /** @type {Array<{ start: number, closed: number, created: number, effort: number }>} */
    const buckets = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const start = current_week - i * 7 * 86400000;
      buckets.push({ start, closed: 0, created: 0, effort: 0 });
    }

    for (const issue of all) {
      const closed_raw = issue.closed_at;
      const closed_ts = closed_raw
        ? typeof closed_raw === 'string' ? Date.parse(closed_raw)
          : closed_raw > 1e12 ? closed_raw : closed_raw * 1000
        : 0;
      const created_raw = issue.created_at;
      const created_ts = created_raw
        ? typeof created_raw === 'string' ? Date.parse(created_raw)
          : created_raw > 1e12 ? created_raw : created_raw * 1000
        : 0;

      if (closed_ts) {
        const ws = weekStart(closed_ts);
        const bucket = buckets.find((b) => b.start === ws);
        if (bucket) {
          bucket.closed++;
          bucket.effort += effortWeight(issue.priority);
        }
      }
      if (created_ts) {
        const ws = weekStart(created_ts);
        const bucket = buckets.find((b) => b.start === ws);
        if (bucket) bucket.created++;
      }
    }

    const max_count = Math.max(1, ...buckets.map((b) => Math.max(b.closed, b.created)));
    const max_effort = Math.max(1, ...buckets.map((b) => b.effort));
    const bar_height = 140;

    // Summary stats
    const total_closed = buckets.reduce((s, b) => s + b.closed, 0);
    const total_effort = buckets.reduce((s, b) => s + b.effort, 0);
    const avg_closed = (total_closed / weeks).toFixed(1);
    const avg_effort = (total_effort / weeks).toFixed(1);

    return html`
      <div class="reports-view">
        <h2 class="reports-title">Reports</h2>

        <div class="reports-stats">
          <div class="reports-stat">
            <div class="reports-stat__value">${total_closed}</div>
            <div class="reports-stat__label">Closed (12 wks)</div>
          </div>
          <div class="reports-stat">
            <div class="reports-stat__value">${avg_closed}</div>
            <div class="reports-stat__label">Avg / week</div>
          </div>
          <div class="reports-stat">
            <div class="reports-stat__value">${total_effort}</div>
            <div class="reports-stat__label">Effort pts (12 wks)</div>
          </div>
          <div class="reports-stat">
            <div class="reports-stat__value">${avg_effort}</div>
            <div class="reports-stat__label">Avg effort / week</div>
          </div>
        </div>

        <h3 class="reports-section-title">Throughput</h3>
        <div class="reports-legend">
          <span class="reports-legend__item"><span class="reports-legend__swatch reports-legend__swatch--closed"></span> Closed</span>
          <span class="reports-legend__item"><span class="reports-legend__swatch reports-legend__swatch--created"></span> Created</span>
        </div>
        <div class="reports-chart" style="height: ${bar_height + 40}px">
          ${buckets.map(
            (b) => html`
              <div class="reports-bar-group">
                <div class="reports-bars" style="height: ${bar_height}px">
                  <div
                    class="reports-bar reports-bar--closed"
                    style="height: ${(b.closed / max_count) * bar_height}px"
                    title="${b.closed} closed"
                  >
                    ${b.closed > 0 ? html`<span class="reports-bar__count">${b.closed}</span>` : ''}
                  </div>
                  <div
                    class="reports-bar reports-bar--created"
                    style="height: ${(b.created / max_count) * bar_height}px"
                    title="${b.created} created"
                  >
                    ${b.created > 0 ? html`<span class="reports-bar__count">${b.created}</span>` : ''}
                  </div>
                </div>
                <div class="reports-bar-label">${weekLabel(b.start)}</div>
              </div>
            `
          )}
        </div>

        <h3 class="reports-section-title">Effort Completed</h3>
        <p class="reports-subtitle">Points per closed issue: P0=5, P1=4, P2=3, P3=2, P4=1</p>
        <div class="reports-chart" style="height: ${bar_height + 40}px">
          ${buckets.map(
            (b) => html`
              <div class="reports-bar-group">
                <div class="reports-bars" style="height: ${bar_height}px">
                  <div
                    class="reports-bar reports-bar--effort"
                    style="height: ${(b.effort / max_effort) * bar_height}px"
                    title="${b.effort} effort points"
                  >
                    ${b.effort > 0 ? html`<span class="reports-bar__count">${b.effort}</span>` : ''}
                  </div>
                </div>
                <div class="reports-bar-label">${weekLabel(b.start)}</div>
              </div>
            `
          )}
        </div>
      </div>
    `;
  }

  function doRender() {
    render(template(), mount_element);
  }

  // Live updates
  if (issueStores && typeof issueStores.subscribe === 'function') {
    issueStores.subscribe(() => {
      if (!mount_element.hidden) {
        try { doRender(); } catch { /* ignore */ }
      }
    });
  }

  return {
    load() {
      log('load');
      doRender();
    },
    clear() {
      mount_element.replaceChildren();
    }
  };
}
