import { html, render } from 'lit-html';
import { debug } from '../utils/logging.js';

/**
 * Render the top navigation with three tabs and handle route changes.
 *
 * @param {HTMLElement} mount_element
 * @param {{ getState: () => any, subscribe: (fn: (s: any) => void) => () => void }} store
 * @param {{ gotoView: (v: 'issues'|'epics'|'board') => void }} router
 */
export function createTopNav(mount_element, store, router) {
  const log = debug('views:nav');
  /** @type {(() => void) | null} */
  let unsubscribe = null;

  /**
   * @param {'issues'|'epics'|'board'} view
   * @returns {(ev: MouseEvent) => void}
   */
  function onClick(view) {
    return (ev) => {
      ev.preventDefault();
      log('click tab %s', view);
      router.gotoView(view);
    };
  }

  function template() {
    const s = store.getState();
    const active = s.view || 'issues';
    const menu_items = [
      { label: 'Your work', view: 'issues' },
      { label: 'Projects', view: 'board' },
      { label: 'Filter', view: 'issues' },
      { label: 'Dashboards', view: 'epics' },
      { label: 'Teams', view: 'issues' },
      { label: 'Plans', view: 'board' },
      { label: 'Apps', view: 'issues' }
    ];
    return html`
      <nav class="header-nav" aria-label="Primary">
        ${menu_items.map(
          (item) => html`
            <a
              href="#/${item.view}"
              class="tab ${active === item.view &&
              (item.label === 'Projects' ||
                item.label === 'Filter' ||
                item.label === 'Dashboards')
                ? 'active'
                : ''}"
              @click=${onClick(
                /** @type {'issues'|'epics'|'board'} */ (item.view)
              )}
              >${item.label}<span class="tab__chevron" aria-hidden="true"></span
            ></a>
          `
        )}
      </nav>
    `;
  }

  function doRender() {
    render(template(), mount_element);
  }

  doRender();
  unsubscribe = store.subscribe(() => doRender());

  return {
    destroy() {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      render(html``, mount_element);
    }
  };
}
