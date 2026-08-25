/**
 * Field — the label, hint, and error wrapper shared by every input type.
 *
 * Every form control in the application is wrapped in one of these, so the
 * relationship between a label, its control, its hint, and its error message
 * is built once and is correct everywhere.
 *
 * The accessibility wiring is the reason this exists as a component rather
 * than as markup repeated per screen:
 *
 *   - `for`/`id` ties the label to the control, so tapping the label focuses it
 *   - `aria-describedby` points at the hint AND the error, so a screen reader
 *     announces both rather than leaving the error silent
 *   - `aria-invalid` marks the control itself, not just its container
 *   - the error region is `role="alert"`, so it is announced when it appears
 *
 * Getting one of those wrong on one screen is exactly the kind of thing that
 * goes unnoticed, which is why it is centralised.
 *
 * @module components/ui/field
 */

import { cx, el, restartAnimation } from '../../core/dom.js';
import { stateful } from '../../core/component.js';

let sequence = 0;

/**
 * Generate a unique id for a control that was not given one.
 * @returns {string}
 */
export function fieldId(prefix = 'ft-field') {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

/**
 * @param {Object} props
 * @param {string} props.label
 * @param {HTMLElement} props.control     The input, select, or composite control.
 * @param {string} [props.id]             Defaults to the control's id, or a generated one.
 * @param {string} [props.hint]           Guidance shown under the control.
 * @param {string} [props.error]          Validation message. Presence marks the field invalid.
 * @param {boolean} [props.required=false]
 * @param {boolean} [props.hideLabel=false]  Visually hidden but still announced.
 * @returns {HTMLElement}
 */
export function Field(props) {
  const {
    label,
    control,
    hint,
    error,
    required = false,
    hideLabel = false,
  } = props;

  // A decorated Input (one with an icon or a suffix) returns a WRAPPER div and
  // exposes the real control as `.input`. Everything below — the label's `for`,
  // aria-describedby, aria-invalid, aria-required — must land on the labelable
  // element, not on the wrapper.
  //
  // Until Phase 10 it landed on whatever Input returned. For the submit link
  // field, which carries an icon, that meant `<label for>` pointed at a div:
  // tapping the label did not focus the input, and a screen reader never
  // associated the two. `for` on a non-labelable element is invalid HTML, so
  // the association was simply absent.
  const labelable = control.input || control;

  const id = props.id || labelable.id || fieldId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  if (!labelable.id) labelable.id = id;
  control.classList.add('ft-field__control');

  const labelNode = el(
    'label',
    {
      class: cx('ft-field__label', hideLabel && 'ft-sr-only'),
      attrs: { for: id },
    },
    [label, required ? el('span', { class: 'ft-field__required', text: '*' }) : null],
  );

  const hintNode = hint
    ? el('p', { class: 'ft-field__hint', text: hint, id: hintId })
    : null;

  const errorNode = el('p', {
    class: 'ft-field__error',
    id: errorId,
    // role="alert" makes a newly appearing message announce itself. Without
    // it, a member using a screen reader submits, hears nothing, and has no
    // idea why the form did not advance.
    attrs: { role: 'alert', hidden: !error },
    text: error || '',
  });

  const node = el('div', { class: 'ft-field' }, [labelNode, control, hintNode, errorNode]);

  applyState(labelable, node, { error, hintId: hintNode ? hintId : null, errorId, required });

  return stateful(node, {
    /**
     * Set or clear the error message.
     *
     * Re-triggers the shake animation each time an error is set, including
     * when the same error is set twice — a member who submits an unchanged
     * form should still see feedback.
     *
     * @param {{ error?: string|null, hint?: string }} next
     */
    update(next = {}) {
      if (next.hint !== undefined && hintNode) hintNode.textContent = next.hint;

      if (next.error !== undefined) {
        const message = next.error || '';
        errorNode.textContent = message;
        errorNode.hidden = !message;

        applyState(labelable, node, {
          error: message,
          hintId: hintNode ? hintId : null,
          errorId,
          required,
        });

        if (message) restartAnimation(node, 'ft-field--invalid');
      }
    },
  });
}

/** `labelable` is the real control — never a decorated Input's wrapper. */
function applyState(labelable, node, { error, hintId, errorId, required }) {
  const describedBy = [hintId, error ? errorId : null].filter(Boolean).join(' ');

  if (describedBy) labelable.setAttribute('aria-describedby', describedBy);
  else labelable.removeAttribute('aria-describedby');

  if (error) labelable.setAttribute('aria-invalid', 'true');
  else labelable.removeAttribute('aria-invalid');

  if (required) labelable.setAttribute('aria-required', 'true');

  node.classList.toggle('ft-field--invalid', Boolean(error));
}

export default Field;
