/**
 * Known status values in canonical order.
 *
 * @type {Array<'open'|'in_progress'|'closed'>}
 */
export const STATUSES = ['open', 'in_progress', 'closed'];

/**
 * Map canonical status to display label.
 *
 * @param {string | null | undefined} status
 * @returns {string}
 */
export function statusLabel(status) {
  switch ((status || '').toString()) {
    case 'open':
      return 'TO DO';
    case 'in_progress':
      return 'IN PROGRESS';
    case 'closed':
      return 'DONE';
    default:
      return (status || '').toString() || 'TO DO';
  }
}
