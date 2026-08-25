/**
 * Select, and the option-card group that replaces it where the choice matters.
 *
 * Two components because the same data deserves different treatment in
 * different places:
 *
 *   `Select` is a native <select>. It belongs in admin forms and filters,
 *   where density beats personality and the platform's own picker is the
 *   fastest thing available on a phone.
 *
 *   `OptionGroup` renders tappable cards backed by radio inputs. It belongs
 *   in registration, where choosing a platform and a weekly goal is part of
 *   committing to something. A dropdown makes that feel like paperwork.
 *
 * Both produce the same value, so a screen can switch between them without
 * anything downstream changing.
 *
 * @module components/ui/select
 */

import { cx, el, icon, on } from '../../core/dom.js';
import { stateful } from '../../core/component.js';

/**
 * @param {Object} props
 * @param {Array<{value: string|number, label: string, disabled?: boolean}>} props.options
 * @param {string|number} [props.value]
 * @param {string} [props.name]
 * @param {string} [props.placeholder]     Shown as a disabled first option.
 * @param {boolean} [props.disabled=false]
 * @param {Function} [props.onChange]      (value)
 * @returns {HTMLSelectElement}
 */
export function Select(props) {
  const { options, value, name, placeholder, disabled = false, onChange } = props;

  const node = el('select', {
    class: 'ft-select',
    name: name || null,
    disabled,
  });

  if (placeholder) {
    node.appendChild(
      el('option', {
        value: '',
        text: placeholder,
        disabled: true,
        selected: value === undefined || value === null || value === '',
      }),
    );
  }

  for (const option of options) {
    node.appendChild(
      el('option', {
        value: String(option.value),
        text: option.label,
        disabled: Boolean(option.disabled),
        selected: String(option.value) === String(value),
      }),
    );
  }

  const cleanups = onChange ? [on(node, 'change', () => onChange(node.value))] : [];

  return stateful(node, {
    cleanups,
    update(next = {}) {
      if (next.value !== undefined) node.value = String(next.value);
      if (next.disabled !== undefined) node.disabled = next.disabled;
      if (next.invalid !== undefined) {
        node.className = cx('ft-select', 'ft-field__control', next.invalid && 'ft-select--invalid');
      }
    },
  });
}

/**
 * Tappable option cards backed by radio inputs.
 *
 * Radios rather than buttons with click handlers, so arrow-key navigation,
 * form participation, and screen-reader grouping all work natively. The cards
 * are styling over standard semantics, not a replacement for them.
 *
 * @param {Object} props
 * @param {string} props.name              Required — groups the radios.
 * @param {Array<Object>} props.options
 *   { value, label, meta?, iconPaths?, color? }
 * @param {string|number} [props.value]
 * @param {string} [props.ariaLabel]
 * @param {Function} [props.onChange]      (value)
 * @returns {HTMLElement}
 */
export function OptionGroup(props) {
  const { name, options, value, ariaLabel, onChange } = props;

  const cleanups = [];
  const inputs = [];

  const node = el('div', {
    class: 'ft-options',
    attrs: { role: 'radiogroup', 'aria-label': ariaLabel || null },
  });

  for (const option of options) {
    const input = el('input', {
      class: 'ft-option__input',
      type: 'radio',
      name,
      value: String(option.value),
      checked: String(option.value) === String(value),
    });

    inputs.push(input);

    const body = el('span', { class: 'ft-option__body' }, [
      el('span', { class: 'ft-option__label', text: option.label }),
      option.meta ? el('span', { class: 'ft-option__meta', text: option.meta }) : null,
    ]);

    const label = el('label', { class: 'ft-option' }, [
      input,
      option.iconPaths
        ? el(
            'span',
            {
              class: 'ft-option__icon',
              // The platform's own brand colour, applied inline because it is
              // data rather than a design token.
              style: option.color ? { color: option.color } : undefined,
            },
            icon(option.iconPaths),
          )
        : null,
      body,
    ]);

    if (onChange) {
      cleanups.push(on(input, 'change', () => onChange(input.value)));
    }

    node.appendChild(label);
  }

  node.getValue = () => inputs.find((input) => input.checked)?.value ?? null;

  return stateful(node, {
    cleanups,
    update(next = {}) {
      if (next.value !== undefined) {
        inputs.forEach((input) => {
          input.checked = String(input.value) === String(next.value);
        });
      }
      if (next.disabled !== undefined) {
        inputs.forEach((input) => {
          input.disabled = next.disabled;
        });
      }
    },
  });
}

export default Select;
