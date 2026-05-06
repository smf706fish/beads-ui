import { describe, expect, test } from 'vitest';
import { createDetailView } from './detail.js';

describe('views/detail', () => {
  test('renders fields, markdown description, and dependency links', async () => {
    document.body.innerHTML =
      '<section class="panel"><div id="mount"></div></section>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));

    const issue = {
      id: 'UI-29',
      title: 'Issue detail view',
      description:
        '# Heading\n\nImplement detail view with a [link](https://example.com) and `code`.',
      status: 'open',
      priority: 2,
      dependencies: [{ id: 'UI-25' }, { id: 'UI-27' }],
      dependents: [{ id: 'UI-34' }]
    };

    /** @type {string[]} */
    const navigations = [];
    const stores = {
      /** @param {string} id */
      snapshotFor(id) {
        return id === 'detail:UI-29' ? [issue] : [];
      },
      subscribe() {
        return () => {};
      }
    };
    const view = createDetailView(
      mount,
      async () => ({}),
      (hash) => {
        navigations.push(hash);
      },
      stores
    );

    await view.load('UI-29');

    // ID is no longer rendered within detail view; the dialog title shows it
    const titleSpan = /** @type {HTMLSpanElement} */ (
      mount.querySelector('h2 .editable')
    );
    expect(titleSpan.textContent).toBe('Issue detail view');
    // status select + priority select exist
    const selects = mount.querySelectorAll('select');
    expect(selects.length).toBeGreaterThanOrEqual(2);
    // description rendered as markdown in read mode
    const md = /** @type {HTMLDivElement} */ (mount.querySelector('.md'));
    expect(md).toBeTruthy();
    const a = /** @type {HTMLAnchorElement|null} */ (md.querySelector('a'));
    expect(a && a.getAttribute('href')).toBe('https://example.com');
    const code = md.querySelector('code');
    expect(code && code.textContent).toBe('code');

    const links = mount.querySelectorAll('li');
    const hrefs = Array.from(links)
      .map((a) => a.dataset.href)
      .filter(Boolean);
    expect(hrefs).toEqual([
      '#/issues?issue=UI-25',
      '#/issues?issue=UI-27',
      '#/issues?issue=UI-34'
    ]);

    // No description editing element in read mode
    const descInput0 = mount.querySelector('.jira-description-editing');
    expect(descInput0).toBeNull();

    // Simulate clicking the first internal link, ensure navigate_fn is used
    links[0].click();
    expect(navigations[navigations.length - 1]).toBe('#/issues?issue=UI-25');
  });

  test('renders type in Properties sidebar', async () => {
    document.body.innerHTML =
      '<section class="panel"><div id="mount"></div></section>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const issue = {
      id: 'UI-50',
      title: 'With type',
      issue_type: 'feature',
      dependencies: [],
      dependents: []
    };
    const stores = {
      /** @param {string} id */
      snapshotFor(id) {
        return id === 'detail:UI-50' ? [issue] : [];
      },
      subscribe() {
        return () => {};
      }
    };
    const view = createDetailView(mount, async () => ({}), undefined, stores);
    await view.load('UI-50');
    const badge = mount.querySelector('.props-card .type-badge');
    expect(badge).toBeTruthy();
    expect(badge && badge.textContent).toBe('Feature');
  });

  test('renders parent epic, related siblings, and issue timestamps', async () => {
    document.body.innerHTML =
      '<section class="panel"><div id="mount"></div></section>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const issue = {
      id: 'UI-51',
      title: 'Child task',
      issue_type: 'task',
      parent: 'EPIC-1',
      parent_title: 'EPIC: Billing accounts',
      created_at: Date.parse('2026-05-01T12:00:00.000Z'),
      updated_at: Date.parse('2026-05-01T13:30:00.000Z'),
      dependencies: [],
      dependents: []
    };
    const sibling = {
      id: 'UI-52',
      title: 'Sibling test',
      issue_type: 'task',
      parent: 'EPIC-1',
      status: 'open',
      priority: 1,
      created_at: Date.parse('2026-05-01T11:00:00.000Z')
    };
    const unrelated = {
      id: 'UI-53',
      title: 'Other epic child',
      issue_type: 'task',
      parent: 'EPIC-2',
      status: 'open'
    };
    const stores = {
      /** @param {string} id */
      snapshotFor(id) {
        if (id === 'detail:UI-51') {
          return [issue];
        }
        if (id === 'tab:board:ready') {
          return [issue, sibling, unrelated];
        }
        return [];
      },
      subscribe() {
        return () => {};
      }
    };
    const view = createDetailView(mount, async () => ({}), undefined, stores);

    await view.load('UI-51');

    const breadcrumb = mount.querySelector('.jira-breadcrumb-button');
    expect(breadcrumb?.textContent?.trim()).toBe('Billing accounts');
    expect(mount.textContent || '').toContain('Epic');
    expect(mount.textContent || '').toContain('Billing accounts');
    expect(mount.textContent || '').toContain('Related issues');
    expect(mount.textContent || '').toContain('Sibling test');
    expect(mount.textContent || '').not.toContain('Other epic child');
    expect(mount.textContent || '').toContain('Created');
    expect(mount.textContent || '').toContain('2026');
  });

  test('inline editing toggles for title and description', async () => {
    document.body.innerHTML =
      '<section class="panel"><div id="mount"></div></section>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));

    const issue = {
      id: 'UI-29',
      title: 'Issue detail view',
      description: 'Some text',
      status: 'open',
      priority: 2,
      dependencies: [],
      dependents: []
    };

    const stores = {
      /** @param {string} id */
      snapshotFor(id) {
        return id === 'detail:UI-29' ? [issue] : [];
      },
      subscribe() {
        return () => {};
      }
    };
    const view = createDetailView(
      mount,
      async (type, payload) => {
        if (type === 'edit-text') {
          const f = /** @type {any} */ (payload).field;
          const v = /** @type {any} */ (payload).value;
          /** @type {any} */ (issue)[f] = v;
          return issue;
        }
        throw new Error('Unexpected type');
      },
      undefined,
      stores
    );

    await view.load('UI-29');

    // Title: click to edit -> input appears, Esc cancels
    const titleSpan = /** @type {HTMLSpanElement} */ (
      mount.querySelector('h2 .editable')
    );
    titleSpan.click();
    let titleInput = /** @type {HTMLInputElement} */ (
      mount.querySelector('h2 input')
    );
    expect(titleInput).toBeTruthy();
    const esc = new KeyboardEvent('keydown', { key: 'Escape' });
    titleInput.dispatchEvent(esc);
    expect(
      /** @type {HTMLInputElement|null} */ (mount.querySelector('h2 input'))
    ).toBeNull();

    // Description: click to edit -> contenteditable appears, Ctrl+Enter saves
    const md = /** @type {HTMLDivElement} */ (mount.querySelector('.md'));
    md.click();
    const editable = /** @type {HTMLElement} */ (
      mount.querySelector('.jira-description-editing')
    );
    editable.innerText = 'Changed';
    const key = new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true });
    editable.dispatchEvent(key);
    // After save, returns to read mode (allow microtask flush)
    await Promise.resolve();
    expect(
      mount.querySelector('.jira-description-editing')
    ).toBeNull();
  });

  test('shows placeholder when not found or bad payload', async () => {
    document.body.innerHTML =
      '<section class="panel"><div id="mount"></div></section>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const stores = {
      snapshotFor() {
        return [];
      },
      subscribe() {
        return () => {};
      }
    };
    const view = createDetailView(mount, async () => ({}), undefined, stores);

    await view.load('UI-404');
    expect((mount.textContent || '').toLowerCase()).toContain('loading');

    view.clear();
    expect((mount.textContent || '').toLowerCase()).toContain(
      'select an issue'
    );
  });

  test('renders close reason when present on closed issue', async () => {
    document.body.innerHTML =
      '<section class="panel"><div id="mount"></div></section>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const issue = {
      id: 'UI-60',
      title: 'Closed with reason',
      status: 'closed',
      close_reason: 'Duplicate of UI-55',
      dependencies: [],
      dependents: []
    };
    const stores = {
      /** @param {string} id */
      snapshotFor(id) {
        return id === 'detail:UI-60' ? [issue] : [];
      },
      subscribe() {
        return () => {};
      }
    };
    const view = createDetailView(mount, async () => ({}), undefined, stores);
    await view.load('UI-60');

    const props = mount.querySelectorAll('.props-card .prop');
    const closeReasonProp = Array.from(props).find(
      (p) => p.querySelector('.label')?.textContent === 'Close Reason'
    );
    expect(closeReasonProp).toBeTruthy();
    expect(closeReasonProp?.querySelector('.value')?.textContent).toBe(
      'Duplicate of UI-55'
    );
  });

  test('does not render close reason when absent', async () => {
    document.body.innerHTML =
      '<section class="panel"><div id="mount"></div></section>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const issue = {
      id: 'UI-61',
      title: 'Open issue',
      status: 'open',
      dependencies: [],
      dependents: []
    };
    const stores = {
      /** @param {string} id */
      snapshotFor(id) {
        return id === 'detail:UI-61' ? [issue] : [];
      },
      subscribe() {
        return () => {};
      }
    };
    const view = createDetailView(mount, async () => ({}), undefined, stores);
    await view.load('UI-61');

    const props = mount.querySelectorAll('.props-card .prop');
    const closeReasonProp = Array.from(props).find(
      (p) => p.querySelector('.label')?.textContent === 'Close Reason'
    );
    expect(closeReasonProp).toBeUndefined();
  });

  describe('delete issue', () => {
    test('renders delete button in detail view', async () => {
      document.body.innerHTML =
        '<section class="panel"><div id="mount"></div></section>';
      const mount = /** @type {HTMLElement} */ (
        document.getElementById('mount')
      );
      const issue = {
        id: 'UI-99',
        title: 'Test delete',
        dependencies: [],
        dependents: []
      };
      const stores = {
        /** @param {string} id */
        snapshotFor(id) {
          return id === 'detail:UI-99' ? [issue] : [];
        },
        subscribe() {
          return () => {};
        }
      };
      const view = createDetailView(mount, async () => ({}), undefined, stores);
      await view.load('UI-99');

      const deleteBtn = mount.querySelector('.delete-issue-btn');
      expect(deleteBtn).toBeTruthy();
      expect(deleteBtn?.textContent?.trim()).toBe('Delete');
    });

    test('clicking delete button opens confirmation dialog', async () => {
      document.body.innerHTML =
        '<section class="panel"><div id="mount"></div></section>';
      const mount = /** @type {HTMLElement} */ (
        document.getElementById('mount')
      );
      const issue = {
        id: 'UI-100',
        title: 'Confirm delete test',
        dependencies: [],
        dependents: []
      };
      const stores = {
        /** @param {string} id */
        snapshotFor(id) {
          return id === 'detail:UI-100' ? [issue] : [];
        },
        subscribe() {
          return () => {};
        }
      };
      const view = createDetailView(mount, async () => ({}), undefined, stores);
      await view.load('UI-100');

      const deleteBtn = /** @type {HTMLButtonElement} */ (
        mount.querySelector('.delete-issue-btn')
      );
      deleteBtn.click();

      // Dialog should now be in document
      const dialog = document.getElementById('delete-confirm-dialog');
      expect(dialog).toBeTruthy();
      expect(dialog?.hasAttribute('open')).toBe(true);

      // Should show issue ID and title
      const message = dialog?.querySelector('.delete-confirm__message');
      expect(message?.innerHTML).toContain('<strong>UI-100</strong>');
      expect(message?.innerHTML).toContain(
        '<strong>Confirm delete test</strong>'
      );
    });

    test('cancel button closes dialog without deleting', async () => {
      document.body.innerHTML =
        '<section class="panel"><div id="mount"></div></section>';
      const mount = /** @type {HTMLElement} */ (
        document.getElementById('mount')
      );
      const issue = {
        id: 'UI-101',
        title: 'Cancel test',
        dependencies: [],
        dependents: []
      };
      let deleteCalled = false;
      const stores = {
        /** @param {string} id */
        snapshotFor(id) {
          return id === 'detail:UI-101' ? [issue] : [];
        },
        subscribe() {
          return () => {};
        }
      };
      const view = createDetailView(
        mount,
        async (type) => {
          if (type === 'delete-issue') deleteCalled = true;
          return {};
        },
        undefined,
        stores
      );
      await view.load('UI-101');

      const deleteBtn = /** @type {HTMLButtonElement} */ (
        mount.querySelector('.delete-issue-btn')
      );
      deleteBtn.click();

      const dialog = /** @type {HTMLDialogElement} */ (
        document.getElementById('delete-confirm-dialog')
      );
      const cancelBtn = /** @type {HTMLButtonElement} */ (
        dialog.querySelector('.btn:not(.danger)')
      );
      cancelBtn.click();

      expect(dialog.hasAttribute('open')).toBe(false);
      expect(deleteCalled).toBe(false);
    });

    test('confirm button sends delete-issue and clears view', async () => {
      document.body.innerHTML =
        '<section class="panel"><div id="mount"></div></section>';
      const mount = /** @type {HTMLElement} */ (
        document.getElementById('mount')
      );
      const issue = {
        id: 'UI-102',
        title: 'Delete me',
        dependencies: [],
        dependents: []
      };
      /** @type {{ type: string, payload: any }[]} */
      const calls = [];
      const stores = {
        /** @param {string} id */
        snapshotFor(id) {
          return id === 'detail:UI-102' ? [issue] : [];
        },
        subscribe() {
          return () => {};
        }
      };
      const view = createDetailView(
        mount,
        async (type, payload) => {
          calls.push({ type, payload });
          return { deleted: true };
        },
        undefined,
        stores
      );
      await view.load('UI-102');

      const deleteBtn = /** @type {HTMLButtonElement} */ (
        mount.querySelector('.delete-issue-btn')
      );
      deleteBtn.click();

      const dialog = /** @type {HTMLDialogElement} */ (
        document.getElementById('delete-confirm-dialog')
      );
      const confirmBtn = /** @type {HTMLButtonElement} */ (
        dialog.querySelector('.btn.danger')
      );
      confirmBtn.click();

      // Wait for async operation
      await new Promise((r) => setTimeout(r, 10));

      expect(calls).toContainEqual({
        type: 'delete-issue',
        payload: { id: 'UI-102' }
      });

      // View should be cleared (showing placeholder)
      const placeholder = mount.querySelector('.muted');
      expect(placeholder?.textContent).toContain('No issue selected');
    });
  });
});
