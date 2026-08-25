/**
 * Toast notifications.
 *
 * A module-level singleton rather than a component a screen mounts. Toasts
 * outlive the view that triggers them — a member can log a post and navigate
 * away before the confirmation clears — so the region belongs to the document.
 *
 * Positioned above the bottom navigation on mobile so a message never covers
 * the controls someone is about to use.
 *
 * @module components/ui/toast
 */

import { el, icon, on } from '../../core/dom.js';
import { Icons } from '../../lib/icons.js';

const DEFAULT_DURATION = 4000;

/**
 * Errors stay longer. A member who misses a success message loses nothing; a
 * member who misses an error does not know what went wrong.
 */
const ERROR_DURATION = 6000;

/** At most three at once — beyond that they stop being readable. */
const MAX_VISIBLE = 3;

/** @type {HTMLElement|null} */
let region = null;

function ensureRegion() {
  if (region && document.body.contains(region)) return region;

  region = el('div', {
    class: 'ft-toast-region',
    attrs: {
      // polite, not assertive: a toast should not interrupt whatever a screen
      // reader is in the middle of saying.
      'aria-live': 'polite',
      'aria-atomic': 'false',
      role: 'status',
    },
  });

  document.body.appendChild(region);
  return region;
}

/**
 * Show a toast.
 *
 * @param {Object} props
 * @param {string} props.message
 * @param {'info'|'success'|'error'} [props.tone='info']
 * @param {number} [props.duration]        0 keeps it until dismissed.
 * @returns {Function} dismiss
 */
export function toast(props) {
  const { message, tone = 'info', duration } = props;

  const container = ensureRegion();

  // Drop the oldest when the stack is full, so the newest is always visible.
  while (container.children.length >= MAX_VISIBLE) {
    container.firstElementChild?.remove();
  }

  const iconPaths =
    tone === 'success' ? Icons.check : tone === 'error' ? Icons.alert : Icons.info;

  const node = el('div', { class: `ft-toast ft-toast--${tone}` }, [
    el('span', { class: 'ft-toast__icon' }, icon(iconPaths)),
    el('span', { class: 'ft-toast__message', text: message }),
    el(
      'button',
      {
        class: 'ft-toast__close',
        type: 'button',
        attrs: { 'aria-label': 'Dismiss' },
        on: { click: () => dismiss() },
      },
      icon(Icons.close, { class: 'ft-toast__icon' }),
    ),
  ]);

  container.appendChild(node);

  const lifespan = duration ?? (tone === 'error' ? ERROR_DURATION : DEFAULT_DURATION);
  let timer = lifespan > 0 ? setTimeout(dismiss, lifespan) : null;

  // Pause the countdown while the pointer is over the toast, so a message
  // someone is reading does not disappear mid-sentence.
  const cleanups = [
    on(node, 'mouseenter', () => {
      if (timer) clearTimeout(timer);
      timer = null;
    }),
    on(node, 'mouseleave', () => {
      if (lifespan > 0 && !timer) timer = setTimeout(dismiss, 1200);
    }),
  ];

  let dismissed = false;

  function dismiss() {
    if (dismissed) return;
    dismissed = true;

    if (timer) clearTimeout(timer);
    cleanups.forEach((teardown) => teardown());

    node.classList.add('ft-toast--leaving');

    // Remove after the exit animation. Falls back to a timer because
    // animationend does not fire when reduced motion collapses the duration.
    const remove = () => node.remove();
    node.addEventListener('animationend', remove, { once: true });
    setTimeout(remove, 400);
  }

  return dismiss;
}

/** @param {string} message @returns {Function} dismiss */
export const toastSuccess = (message) => toast({ message, tone: 'success' });

/** @param {string} message @returns {Function} dismiss */
export const toastError = (message) => toast({ message, tone: 'error' });

/** @param {string} message @returns {Function} dismiss */
export const toastInfo = (message) => toast({ message, tone: 'info' });

/** Remove every visible toast — used when the session ends. */
export function clearToasts() {
  if (region) region.replaceChildren();
}

export default toast;
