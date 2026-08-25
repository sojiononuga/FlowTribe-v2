/**
 * Six-box PIN input.
 *
 * Segmented entry rather than a single password field. It shows progress at a
 * glance, makes a mistyped digit obvious and cheap to fix, and reads as part
 * of the product rather than a password box borrowed from elsewhere.
 *
 * The behaviour that makes segmented inputs bearable — and that most
 * implementations get wrong:
 *
 *   - typing advances automatically; Backspace on an empty box steps back
 *   - a pasted PIN fills every box, however it was formatted
 *   - arrow keys move between boxes without altering values
 *   - each box is `type="password"` so the digits are masked, while the
 *     filled/empty tint still communicates progress
 *   - `inputmode="numeric"` brings up the number pad on a phone
 *   - the first box carries the label; the rest are hidden from screen
 *     readers, which would otherwise announce six unlabelled fields
 *
 * @module components/ui/pin-input
 */

import { cx, el, on } from '../../core/dom.js';
import { stateful } from '../../core/component.js';
import { config } from '../../core/config.js';

/**
 * @param {Object} [props]
 * @param {number} [props.length=6]        Defaults to config.rules.pinLength.
 * @param {string} [props.name]
 * @param {string} [props.ariaLabel='PIN']
 * @param {boolean} [props.autoFocus=false]
 * @param {Function} [props.onChange]      (value) on every keystroke
 * @param {Function} [props.onComplete]    (value) once every box is filled
 * @returns {HTMLElement} wrapper; `.getValue()`, `.clear()`, `.focusFirst()`
 */
export function PinInput(props = {}) {
  const {
    length = config.rules.pinLength,
    name,
    ariaLabel = 'PIN',
    autoFocus = false,
    onChange,
    onComplete,
  } = props;

  const cleanups = [];
  /** @type {HTMLInputElement[]} */
  const boxes = [];

  const node = el('div', {
    class: 'ft-pin',
    // The group is announced as one labelled control rather than six.
    attrs: { role: 'group', 'aria-label': ariaLabel },
  });

  for (let index = 0; index < length; index += 1) {
    const box = el('input', {
      class: 'ft-pin__digit',
      type: 'password',
      attrs: {
        inputmode: 'numeric',
        // Accepts a pasted full-length PIN; a maxlength of 1 would silently
        // truncate it to a single digit.
        maxlength: String(length),
        autocomplete: index === 0 ? 'one-time-code' : 'off',
        // Every box is focusable, so every box needs a name. These previously
        // carried aria-hidden="true" on boxes 2-6, which the ARIA spec
        // prohibits outright on a focusable element: a screen-reader user
        // typing their PIN moved through five controls the accessibility tree
        // said did not exist. Positional labels say where they are instead.
        'aria-label': index === 0 ? ariaLabel : `${ariaLabel}, digit ${index + 1} of ${length}`,
        'data-index': String(index),
      },
    });

    cleanups.push(on(box, 'input', (event) => handleInput(event, index)));
    cleanups.push(on(box, 'keydown', (event) => handleKeydown(event, index)));
    cleanups.push(on(box, 'paste', (event) => handlePaste(event)));
    cleanups.push(on(box, 'focus', () => box.select()));

    boxes.push(box);
    node.appendChild(box);
  }

  // A hidden mirror so the PIN participates in native form submission and
  // password managers can recognise it.
  const hidden = name ? el('input', { type: 'hidden', name }) : null;
  if (hidden) node.appendChild(hidden);

  function value() {
    return boxes.map((box) => box.value).join('');
  }

  function emit() {
    const current = value();

    boxes.forEach((box) => {
      box.classList.toggle('ft-pin__digit--filled', box.value !== '');
    });

    if (hidden) hidden.value = current;
    if (onChange) onChange(current);
    if (current.length === length && onComplete) onComplete(current);
  }

  function handleInput(event, index) {
    const box = boxes[index];
    const raw = box.value.replace(/\D/g, '');

    // Multiple digits arrived at once — an autofilled code, or a fast typist.
    if (raw.length > 1) {
      distribute(raw, index);
      return;
    }

    box.value = raw;

    if (raw && index < length - 1) boxes[index + 1].focus();

    emit();
  }

  function handleKeydown(event, index) {
    const box = boxes[index];

    if (event.key === 'Backspace') {
      if (box.value === '' && index > 0) {
        // Step back and clear, so holding Backspace walks the whole PIN out.
        event.preventDefault();
        boxes[index - 1].value = '';
        boxes[index - 1].focus();
        emit();
      }
      return;
    }

    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      boxes[index - 1].focus();
      return;
    }

    if (event.key === 'ArrowRight' && index < length - 1) {
      event.preventDefault();
      boxes[index + 1].focus();
      return;
    }

    // Block non-digits at the source; a rejected keystroke never reaches the
    // value, so there is nothing to strip afterwards.
    if (
      event.key.length === 1 &&
      !/\d/.test(event.key) &&
      !event.metaKey &&
      !event.ctrlKey
    ) {
      event.preventDefault();
    }
  }

  function handlePaste(event) {
    event.preventDefault();
    const text = (event.clipboardData || window.clipboardData).getData('text') || '';
    distribute(text.replace(/\D/g, ''), 0);
  }

  function distribute(digits, startIndex) {
    const chars = digits.slice(0, length - startIndex).split('');

    chars.forEach((digit, offset) => {
      const target = boxes[startIndex + offset];
      if (target) target.value = digit;
    });

    const nextIndex = Math.min(startIndex + chars.length, length - 1);
    boxes[nextIndex].focus();

    emit();
  }

  node.getValue = value;

  node.clear = () => {
    boxes.forEach((box) => {
      box.value = '';
      box.classList.remove('ft-pin__digit--filled');
    });
    if (hidden) hidden.value = '';
    emit();
  };

  node.focusFirst = () => boxes[0].focus();

  if (autoFocus) {
    // Deferred: focusing during construction fights the browser's own focus
    // restoration on a back navigation.
    requestAnimationFrame(() => boxes[0].focus());
  }

  return stateful(node, {
    cleanups,
    /**
     * @param {{ invalid?: boolean, disabled?: boolean, clear?: boolean }} next
     */
    update(next = {}) {
      if (next.invalid !== undefined) {
        node.className = cx('ft-pin', next.invalid && 'ft-pin--invalid');
        // A rejected PIN is cleared and refocused: retyping is faster than
        // selecting six boxes to overwrite them.
        if (next.invalid) {
          node.clear();
          node.focusFirst();
        }
      }

      if (next.disabled !== undefined) {
        boxes.forEach((box) => {
          box.disabled = next.disabled;
        });
      }

      if (next.clear) node.clear();
    },
  });
}

export default PinInput;
