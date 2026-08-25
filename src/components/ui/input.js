/**
 * Text input, with an optional leading icon and trailing status slot.
 *
 * @module components/ui/input
 */

import { cx, el, icon, on } from '../../core/dom.js';
import { stateful } from '../../core/component.js';

/**
 * @param {Object} props
 * @param {string} [props.name]
 * @param {string} [props.type='text']
 * @param {string} [props.value='']
 * @param {string} [props.placeholder]
 * @param {string[]} [props.iconPaths]      Leading icon, from lib/icons.
 * @param {HTMLElement} [props.suffix]      Trailing slot — a status chip, a toggle.
 * @param {boolean} [props.disabled=false]
 * @param {boolean} [props.required=false]
 * @param {string} [props.autocomplete]
 * @param {string} [props.inputmode]
 * @param {number} [props.maxlength]
 * @param {Function} [props.onInput]        (value, event)
 * @param {Function} [props.onChange]       (value, event) — on blur/commit
 * @param {Function} [props.onEnter]        (value) — submit-on-Enter for single-field forms
 * @returns {HTMLElement} wrapper; `.input` exposes the control
 */
export function Input(props) {
  const {
    name,
    type = 'text',
    value = '',
    placeholder,
    iconPaths,
    suffix,
    disabled = false,
    required = false,
    autocomplete,
    inputmode,
    maxlength,
    onInput,
    onChange,
    onEnter,
  } = props;

  const control = el('input', {
    class: 'ft-input',
    type,
    name: name || null,
    value,
    placeholder: placeholder || null,
    disabled,
    required,
    attrs: {
      autocomplete: autocomplete || null,
      inputmode: inputmode || null,
      maxlength: maxlength || null,
      // Members paste links and type names; the browser's own capitalisation
      // and correction get both wrong more often than right.
      autocapitalize: type === 'url' || type === 'email' ? 'off' : null,
      autocorrect: 'off',
      spellcheck: 'false',
    },
  });

  const cleanups = [];

  if (onInput) {
    cleanups.push(on(control, 'input', (event) => onInput(control.value, event)));
  }

  if (onChange) {
    cleanups.push(on(control, 'change', (event) => onChange(control.value, event)));
  }

  if (onEnter) {
    cleanups.push(
      on(control, 'keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        onEnter(control.value);
      }),
    );
  }

  // A bare input needs no wrapper; only build the group when there is
  // something to position around it.
  const needsGroup = Boolean(iconPaths || suffix);
  if (!needsGroup) {
    return decorate(control, control, cleanups);
  }

  const node = el('div', { class: 'ft-input-group' }, [
    iconPaths ? el('span', { class: 'ft-input-group__icon' }, icon(iconPaths)) : null,
    control,
    suffix ? el('span', { class: 'ft-input-group__suffix' }, suffix) : null,
  ]);

  return decorate(node, control, cleanups);
}

/**
 * The live availability chip beside the username field.
 *
 * Its own component because the check is asynchronous and debounced, and the
 * three states need to be visually distinct at a glance while typing.
 *
 * @param {Object} [props]
 * @param {'idle'|'checking'|'available'|'taken'} [props.state='idle']
 * @returns {HTMLElement}
 */
export function InputStatus(props = {}) {
  const node = el('span', { class: 'ft-input-status', attrs: { 'aria-live': 'polite' } });

  const render = (state) => {
    switch (state) {
      case 'checking':
        node.className = 'ft-input-status ft-input-status--checking';
        node.textContent = 'Checking…';
        break;
      case 'available':
        node.className = 'ft-input-status ft-input-status--ok';
        node.textContent = 'Available';
        break;
      case 'taken':
        node.className = 'ft-input-status ft-input-status--taken';
        node.textContent = 'Taken';
        break;
      default:
        node.className = 'ft-input-status';
        node.textContent = '';
    }
  };

  render(props.state || 'idle');

  return stateful(node, {
    update: (next = {}) => render(next.state || 'idle'),
  });
}

function decorate(node, control, cleanups) {
  // Expose the control so callers can focus it, read it, or hand it to Field
  // without knowing whether a wrapper was built.
  node.input = control;

  return stateful(node, {
    cleanups,
    /**
     * @param {{ value?: string, disabled?: boolean, invalid?: boolean }} next
     */
    update(next = {}) {
      if (next.value !== undefined && next.value !== control.value) {
        control.value = next.value;
      }
      if (next.disabled !== undefined) control.disabled = next.disabled;
      if (next.invalid !== undefined) {
        control.className = cx('ft-input', 'ft-field__control', next.invalid && 'ft-input--invalid');
      }
    },
  });
}

export default Input;
