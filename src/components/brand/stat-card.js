/**
 * Stat card, streak flame, and the unranked leaderboard prompt.
 *
 * The dashboard's four figures — current streak, longest streak, all-time
 * posts, leaderboard position — all render through `StatCard`, so they share
 * one treatment and one idea of what "no value yet" looks like.
 *
 * @module components/brand/stat-card
 */

import { cx, el, icon } from '../../core/dom.js';
import { stateful } from '../../core/component.js';
import { Icons } from '../../lib/icons.js';

/**
 * @param {Object} props
 * @param {string} props.label
 * @param {string|number|null} props.value  null renders the empty placeholder.
 * @param {string} [props.meta]             Small line under the value.
 * @param {string[]} [props.iconPaths]
 * @param {'default'|'accent'|'success'} [props.tone='default']
 * @param {string} [props.emptyLabel='—']
 * @returns {HTMLElement}
 */
export function StatCard(props) {
  const {
    label,
    value,
    meta,
    iconPaths,
    tone = 'default',
    emptyLabel = '—',
  } = props;

  const isEmpty = value === null || value === undefined || value === '';

  const valueNode = el('span', {
    class: cx('ft-stat__value', isEmpty && 'ft-stat__value--empty'),
    text: isEmpty ? emptyLabel : String(value),
  });

  const metaNode = el('span', { class: 'ft-stat__meta', text: meta || '', attrs: { hidden: !meta } });

  const node = el('div', { class: cx('ft-stat', tone !== 'default' && `ft-stat--${tone}`) }, [
    el('div', { class: 'ft-stat__header' }, [
      iconPaths ? el('span', { class: 'ft-stat__icon' }, icon(iconPaths)) : null,
      el('span', { class: 'ft-stat__label', text: label }),
    ]),
    valueNode,
    metaNode,
  ]);

  return stateful(node, {
    /**
     * @param {{ value?: string|number|null, meta?: string }} next
     */
    update(next = {}) {
      if (next.value !== undefined) {
        const empty = next.value === null || next.value === undefined || next.value === '';
        valueNode.textContent = empty ? emptyLabel : String(next.value);
        valueNode.classList.toggle('ft-stat__value--empty', empty);
      }

      if (next.meta !== undefined) {
        metaNode.textContent = next.meta || '';
        metaNode.hidden = !next.meta;
      }
    },
  });
}

/**
 * Streak marker.
 *
 * Deliberately static. An animated flame beside a number a member checks every
 * day becomes noise within a week — and the number is what carries the
 * meaning. A dormant streak keeps the shape and loses the colour.
 *
 * @param {Object} props
 * @param {number} props.weeks
 * @param {boolean} [props.active=true]
 * @returns {HTMLElement}
 */
export function StreakFlame(props) {
  const { weeks, active = true } = props;

  return el(
    'span',
    {
      class: cx('ft-flame', !active && 'ft-flame--cold'),
      attrs: { 'aria-label': `${weeks} week streak` },
    },
    [
      icon(Icons.flame, { class: 'ft-flame__icon', filled: true }),
      el('span', { text: String(weeks) }),
    ],
  );
}

/**
 * The prompt shown in place of a rank for a member with no posts this week.
 *
 * Copy is fixed by product decision and reproduced exactly. Styled as an
 * invitation rather than an error, because not having posted yet is the
 * normal state on a Monday morning, not a failure.
 *
 * @returns {HTMLElement}
 */
export function RankPrompt() {
  return el('div', { class: 'ft-rank-prompt' }, [
    el('span', { class: 'ft-rank-prompt__icon' }, icon(Icons.trophy)),
    el('span', { text: 'Take one meaningful action to join the Tribe movement.' }),
  ]);
}

export default StatCard;
