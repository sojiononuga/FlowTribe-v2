/**
 * Modal dialog.
 *
 * A bottom sheet on phones and a centred dialog from tablet width up — the
 * same component, switched in CSS. A sheet is reachable by thumb; a centred
 * box on a phone is not.
 *
 * The behaviour a dialog has to get right, and that is easy to leave out:
 *
 *   - focus moves into the dialog on open and returns to the trigger on close,
 *     so a keyboard user is not dumped at the top of the page
 *   - Tab is trapped inside; without it, tabbing walks into the page behind
 *   - Escape closes, as does the backdrop
 *   - the body cannot scroll while it is open
 *   - `role="dialog"` + `aria-modal` + a labelled title
 *
 * @module components/ui/modal
 */

import { el, focusFirst, icon, on, trapFocus } from '../../core/dom.js';
import { destroyTree } from '../../core/component.js';
import { Icons } from '../../lib/icons.js';

/** Tracks nesting so the body scroll lock is only released by the last dialog. */
let openCount = 0;

/**
 * Open a modal.
 *
 * @param {Object} props
 * @param {string} props.title
 * @param {Array|HTMLElement} props.content
 * @param {HTMLElement[]} [props.actions]      Footer buttons.
 * @param {boolean} [props.dismissible=true]   Escape and backdrop close it.
 * @param {Function} [props.onClose]
 * @returns {{ close: Function, element: HTMLElement }}
 */
export function openModal(props) {
  const { title, content, actions, dismissible = true, onClose } = props;

  // Remembered so focus can be handed back exactly where it came from.
  const previouslyFocused = document.activeElement;

  const titleId = `ft-modal-title-${Date.now().toString(36)}`;
  const cleanups = [];

  const closeButton = dismissible
    ? el('button', {
        class: 'ft-btn ft-btn--ghost ft-btn--icon',
        type: 'button',
        attrs: { 'aria-label': 'Close' },
        on: { click: () => close() },
      }, icon(Icons.close, { class: 'ft-btn__icon' }))
    : null;

  const dialog = el(
    'div',
    {
      class: 'ft-modal',
      attrs: {
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': titleId,
      },
    },
    [
      el('div', { class: 'ft-modal__grabber', attrs: { 'aria-hidden': 'true' } }),
      el('div', { class: 'ft-modal__header' }, [
        el('h2', { class: 'ft-modal__title', id: titleId, text: title }),
        closeButton,
      ]),
      el('div', { class: 'ft-modal__body' }, content),
      actions?.length ? el('div', { class: 'ft-modal__footer' }, actions) : null,
    ],
  );

  const backdrop = el('div', { class: 'ft-modal-backdrop' }, dialog);

  if (dismissible) {
    cleanups.push(
      on(backdrop, 'click', (event) => {
        // Only a click on the backdrop itself, never one that bubbled up from
        // inside the dialog.
        if (event.target === backdrop) close();
      }),
    );

    cleanups.push(
      on(document, 'keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          close();
        }
      }),
    );
  }

  cleanups.push(trapFocus(dialog));

  document.body.appendChild(backdrop);

  // Lock body scroll. Without it, scrolling inside a sheet on iOS scrolls the
  // page behind once the sheet reaches its end.
  openCount += 1;
  if (openCount === 1) {
    document.body.style.overflow = 'hidden';
  }

  focusFirst(dialog);

  let closed = false;

  function close() {
    if (closed) return;
    closed = true;

    cleanups.forEach((teardown) => teardown());
    destroyTree(backdrop);
    backdrop.remove();

    openCount = Math.max(0, openCount - 1);
    if (openCount === 0) {
      document.body.style.overflow = '';
    }

    if (previouslyFocused instanceof HTMLElement) {
      previouslyFocused.focus({ preventScroll: true });
    }

    if (onClose) onClose();
  }

  return { close, element: dialog };
}

/**
 * A yes/no confirmation.
 *
 * Wrapped so that destructive admin actions — suspending a member, voiding a
 * submission, deleting an account — all ask the same way. Resolves false when
 * dismissed, so a member who taps outside is never treated as having agreed.
 *
 * @param {Object} props
 * @param {string} props.title
 * @param {string} props.message
 * @param {string} [props.confirmLabel='Confirm']
 * @param {string} [props.cancelLabel='Cancel']
 * @param {boolean} [props.destructive=false]
 * @returns {Promise<boolean>}
 */
export function confirmModal(props) {
  const {
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    destructive = false,
  } = props;

  return new Promise((resolve) => {
    let settled = false;

    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const cancel = el('button', {
      class: 'ft-btn ft-btn--ghost',
      type: 'button',
      text: cancelLabel,
      on: {
        click: () => {
          settle(false);
          modal.close();
        },
      },
    });

    const confirm = el('button', {
      class: `ft-btn ${destructive ? 'ft-btn--danger' : 'ft-btn--primary'}`,
      type: 'button',
      text: confirmLabel,
      on: {
        click: () => {
          settle(true);
          modal.close();
        },
      },
    });

    const modal = openModal({
      title,
      content: el('p', { text: message }),
      actions: [cancel, confirm],
      onClose: () => settle(false),
    });
  });
}

export default openModal;
