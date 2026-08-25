/**
 * Small presentational primitives.
 *
 * Grouped in one module because each is a handful of lines with no behaviour.
 * Splitting them across six files would add imports without adding clarity.
 * Anything that grows state or event handling moves to its own file — which is
 * why Button, Input, PinInput, Select, Modal, and Toast are separate.
 *
 * @module components/ui/primitives
 */

import { cx, el, icon, on } from '../../core/dom.js';
import { stateful } from '../../core/component.js';
import { initials } from '../../lib/format.js';
import { illustration } from '../../lib/illustrations.js';

/* -------------------------------------------------------------------------
 * Card
 * ---------------------------------------------------------------------- */

/**
 * @param {Object} [props]
 * @param {string} [props.title]
 * @param {HTMLElement} [props.action]     Rendered opposite the title.
 * @param {HTMLElement} [props.footer]
 * @param {'default'|'raised'|'brand'} [props.variant='default']
 * @param {boolean} [props.flush=false]    Remove body padding — for tables.
 * @param {boolean} [props.interactive=false]
 * @param {Function} [props.onClick]
 * @param {Array|HTMLElement} [children]
 * @returns {HTMLElement}
 */
export function Card(props = {}, children = []) {
  const {
    title,
    action,
    footer,
    variant = 'default',
    flush = false,
    interactive = false,
    onClick,
  } = props;

  const header =
    title || action
      ? el('div', { class: 'ft-card__header' }, [
          title ? el('h3', { class: 'ft-card__title', text: title }) : el('span'),
          action || null,
        ])
      : null;

  return el(
    'div',
    {
      class: cx(
        'ft-card',
        variant !== 'default' && `ft-card--${variant}`,
        flush && 'ft-card--flush',
        (interactive || onClick) && 'ft-card--interactive',
      ),
      on: onClick ? { click: onClick } : {},
    },
    [
      header,
      el('div', { class: 'ft-card__body' }, children),
      footer ? el('div', { class: 'ft-card__footer' }, footer) : null,
    ],
  );
}

/* -------------------------------------------------------------------------
 * Badge
 * ---------------------------------------------------------------------- */

/**
 * @param {Object} props
 * @param {string} props.label
 * @param {'neutral'|'brand'|'accent'|'success'|'warning'|'danger'|'info'} [props.tone='neutral']
 * @param {boolean} [props.dot=false]      Leading status dot.
 * @returns {HTMLElement}
 */
export function Badge(props) {
  const { label, tone = 'neutral', dot = false } = props;

  return el('span', { class: `ft-badge ft-badge--${tone}` }, [
    dot ? el('span', { class: 'ft-badge__dot' }) : null,
    label,
  ]);
}

/* -------------------------------------------------------------------------
 * Avatar
 * ---------------------------------------------------------------------- */

/**
 * Member avatar.
 *
 * Renders initials on a burgundy field. Profile photos are not in v2 — the
 * `src` prop is already accepted so that adding them later is a change to the
 * `Profiles` sheet and this one branch, with no screen touched. Every place
 * that shows a member already routes through here.
 *
 * @param {Object} props
 * @param {string} props.name              Full name; initials are derived.
 * @param {string} [props.src]             Reserved for v3.
 * @param {'sm'|'md'|'lg'|'xl'} [props.size='md']
 * @returns {HTMLElement}
 */
export function Avatar(props) {
  const { name, src, size = 'md' } = props;

  return el(
    'span',
    {
      class: cx('ft-avatar', size !== 'md' && `ft-avatar--${size}`),
      // Decorative: the member's name is always adjacent in the layout, so
      // announcing it twice would be noise.
      attrs: { 'aria-hidden': 'true', title: name || null },
    },
    src
      ? el('img', { class: 'ft-avatar__image', attrs: { src, alt: '' } })
      : initials(name),
  );
}

/* -------------------------------------------------------------------------
 * Spinner
 * ---------------------------------------------------------------------- */

/**
 * @param {Object} [props]
 * @param {'sm'|'md'|'lg'} [props.size='md']
 * @param {boolean} [props.inverse=false]  For dark backgrounds.
 * @param {string} [props.label='Loading']
 * @returns {HTMLElement}
 */
export function Spinner(props = {}) {
  const { size = 'md', inverse = false, label = 'Loading' } = props;

  return el('span', {
    class: cx('ft-spinner', size !== 'md' && `ft-spinner--${size}`, inverse && 'ft-spinner--inverse'),
    attrs: { role: 'status', 'aria-label': label },
  });
}

/* -------------------------------------------------------------------------
 * Skeleton
 * ---------------------------------------------------------------------- */

/**
 * A loading placeholder.
 *
 * Skeletons shaped like the content they stand in for make a wait feel shorter
 * than a spinner does: the page reads as assembling rather than stalling.
 *
 * @param {Object} [props]
 * @param {'text'|'title'|'circle'|'card'|'block'} [props.variant='text']
 * @param {string} [props.width]
 * @param {string} [props.height]
 * @returns {HTMLElement}
 */
export function Skeleton(props = {}) {
  const { variant = 'text', width, height } = props;

  return el('span', {
    class: cx('ft-skeleton', variant !== 'block' && `ft-skeleton--${variant}`),
    style: { display: 'block', width: width || undefined, height: height || undefined },
    attrs: { 'aria-hidden': 'true' },
  });
}

/**
 * Several skeleton lines, with the last one short so the block reads as a
 * paragraph rather than a rectangle.
 *
 * @param {number} [lines=3]
 * @returns {HTMLElement}
 */
export function SkeletonText(lines = 3) {
  return el(
    'span',
    { style: { display: 'block' }, attrs: { 'aria-hidden': 'true' } },
    Array.from({ length: lines }, (unused, index) =>
      Skeleton({ variant: 'text', width: index === lines - 1 ? '60%' : '100%' }),
    ),
  );
}

/* -------------------------------------------------------------------------
 * Empty state
 * ---------------------------------------------------------------------- */

/**
 * An empty state.
 *
 * Takes either an `illustration` name or `iconPaths`, never both — the
 * illustration wins if both are given. `iconPaths` is the original signature
 * and keeps working unchanged, because a good half of these are error and
 * permission states where a plain icon says it better than a drawing does.
 *
 * @param {Object} props
 * @param {string} props.title
 * @param {string} [props.message]
 * @param {string} [props.illustration]  A key of lib/illustrations.
 * @param {string[]} [props.iconPaths]
 * @param {HTMLElement} [props.action]
 * @returns {HTMLElement}
 */
export function EmptyState(props) {
  const { title, message, illustration: illustrationName, iconPaths, action } = props;

  const art = illustrationName ? illustration(illustrationName, { class: 'ft-empty__art' }) : null;

  return el('div', { class: 'ft-empty' }, [
    art
      ? el('div', { class: 'ft-empty__illustration' }, art)
      : iconPaths
        ? el('div', { class: 'ft-empty__icon' }, icon(iconPaths))
        : null,
    el('p', { class: 'ft-empty__title', text: title }),
    message ? el('p', { class: 'ft-empty__message', text: message }) : null,
    action || null,
  ]);
}

/* -------------------------------------------------------------------------
 * Switch
 * ---------------------------------------------------------------------- */

/**
 * @param {Object} props
 * @param {string} props.label
 * @param {boolean} [props.checked=false]
 * @param {string} [props.name]
 * @param {boolean} [props.disabled=false]
 * @param {Function} [props.onChange]      (checked)
 * @returns {HTMLElement}
 */
export function Switch(props) {
  const { label, checked = false, name, disabled = false, onChange } = props;

  const input = el('input', {
    class: 'ft-switch__input',
    type: 'checkbox',
    name: name || null,
    checked,
    disabled,
  });

  const cleanups = onChange ? [on(input, 'change', () => onChange(input.checked))] : [];

  const node = el('label', { class: 'ft-switch' }, [
    input,
    el('span', { class: 'ft-switch__track' }, el('span', { class: 'ft-switch__thumb' })),
    el('span', { class: 'ft-switch__label', text: label }),
  ]);

  node.getValue = () => input.checked;

  return stateful(node, {
    cleanups,
    update(next = {}) {
      if (next.checked !== undefined) input.checked = next.checked;
      if (next.disabled !== undefined) input.disabled = next.disabled;
    },
  });
}
