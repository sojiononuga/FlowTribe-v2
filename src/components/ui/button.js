/**
 * Button.
 *
 * @module components/ui/button
 */

import { cx, el, icon } from '../../core/dom.js';
import { stateful } from '../../core/component.js';

/**
 * @param {Object} props
 * @param {string} props.label
 * @param {'primary'|'secondary'|'ghost'|'danger'|'accent'} [props.variant='primary']
 * @param {'sm'|'md'|'lg'} [props.size='md']
 * @param {boolean} [props.block=false]        Full width. The default shape for
 *                                             primary actions on mobile.
 * @param {boolean} [props.loading=false]
 * @param {boolean} [props.disabled=false]
 * @param {string[]} [props.iconPaths]         From lib/icons.
 * @param {'start'|'end'} [props.iconPosition='start']
 * @param {'button'|'submit'} [props.type='button']
 * @param {Function} [props.onClick]
 * @param {string} [props.ariaLabel]           Required when there is no visible label.
 * @returns {HTMLButtonElement}
 */
export function Button(props) {
  const {
    label,
    variant = 'primary',
    size = 'md',
    block = false,
    loading = false,
    disabled = false,
    iconPaths,
    iconPosition = 'start',
    type = 'button',
    onClick,
    ariaLabel,
  } = props;

  const labelNode = el('span', { class: 'ft-btn__label', text: label ?? '' });
  const iconNode = iconPaths ? icon(iconPaths, { class: 'ft-btn__icon' }) : null;
  const spinner = el('span', { class: 'ft-btn__spinner', attrs: { 'aria-hidden': 'true' } });

  const node = el(
    'button',
    {
      class: buildClass({ variant, size, block, loading, hasLabel: Boolean(label) }),
      type,
      disabled: disabled || loading,
      attrs: {
        'aria-label': ariaLabel || null,
        // Announces the loading state to assistive technology, which cannot
        // see the spinner.
        'aria-busy': loading ? 'true' : null,
      },
      on: onClick ? { click: onClick } : {},
    },
    buildChildren({ loading, spinner, iconNode, iconPosition, labelNode, label }),
  );

  return stateful(node, {
    /**
     * Toggle loading or disabled state after creation.
     *
     * The label stays in place while loading rather than being replaced by a
     * spinner: swapping it collapses the button's width and makes the
     * surrounding layout jump.
     *
     * @param {{ loading?: boolean, disabled?: boolean, label?: string }} next
     */
    update(next = {}) {
      const isLoading = next.loading ?? node.classList.contains('ft-btn--loading');
      const isDisabled = next.disabled ?? false;

      if (next.label !== undefined) labelNode.textContent = next.label;

      node.classList.toggle('ft-btn--loading', isLoading);
      node.disabled = isDisabled || isLoading;

      if (isLoading) node.setAttribute('aria-busy', 'true');
      else node.removeAttribute('aria-busy');

      const hasSpinner = node.contains(spinner);
      if (isLoading && !hasSpinner) node.prepend(spinner);
      if (!isLoading && hasSpinner) spinner.remove();
    },
  });
}

function buildClass({ variant, size, block, loading, hasLabel }) {
  return cx(
    'ft-btn',
    `ft-btn--${variant}`,
    size !== 'md' && `ft-btn--${size}`,
    block && 'ft-btn--block',
    loading && 'ft-btn--loading',
    !hasLabel && 'ft-btn--icon',
  );
}

function buildChildren({ loading, spinner, iconNode, iconPosition, labelNode, label }) {
  const children = [];

  if (loading) children.push(spinner);
  if (iconNode && iconPosition === 'start') children.push(iconNode);
  if (label) children.push(labelNode);
  if (iconNode && iconPosition === 'end') children.push(iconNode);

  return children;
}

export default Button;
