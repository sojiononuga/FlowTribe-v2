/**
 * Milestone and Flow Level components.
 *
 * Milestones celebrate an accomplishment; levels describe who someone has
 * become. Both render from server-supplied descriptors — the UI holds no
 * hardcoded list, which is what makes a new milestone a catalog row.
 *
 * No emojis anywhere. Every milestone and level uses an icon from the Phase 1
 * system, so the set stays coherent as it grows.
 *
 * @module components/brand/milestone
 */

import { cx, el, icon } from '../../core/dom.js';
import { stateful } from '../../core/component.js';
import { Icons } from '../../lib/icons.js';

/* -------------------------------------------------------------------------
 * Milestone badge
 * ---------------------------------------------------------------------- */

/**
 * The circular icon medallion. Locked is muted and desaturated; unlocked
 * carries the rarity treatment.
 *
 * @param {Object} props
 * @param {string} props.iconId
 * @param {boolean} props.unlocked
 * @param {string} [props.rarity='Common']
 * @param {'sm'|'md'|'lg'} [props.size='md']
 * @param {boolean} [props.celebrate=false]  Play the unlock animation. Only
 *   for the moment a milestone is earned — a gallery of badges that all
 *   glowed at once would mean nothing.
 * @returns {HTMLElement}
 */
export function MilestoneBadge(props) {
  const { iconId, unlocked, rarity = 'Common', size = 'md', celebrate = false } = props;
  const paths = Icons[iconId] || Icons.medal;

  return el(
    'span',
    {
      class: cx(
        'ft-badge-medal',
        size !== 'md' && `ft-badge-medal--${size}`,
        unlocked ? `ft-badge-medal--${rarity.toLowerCase()}` : 'ft-badge-medal--locked',
        celebrate && 'ft-badge-medal--celebrate',
      ),
      attrs: { 'aria-hidden': 'true' },
    },
    icon(paths, { class: 'ft-badge-medal__icon' }),
  );
}

/**
 * A milestone in the gallery grid.
 *
 * A locked milestone still shows its name and its progress. Hiding what someone
 * is working toward removes the reason to work toward it — "members should
 * always know what they are working toward" is a product requirement, and this
 * is where it lives.
 *
 * @param {Object} props
 * @param {Object} props.milestone   { id, name, description, iconId, rarity, progress, target, unlocked }
 * @param {Function} [props.onClick]
 * @returns {HTMLElement}
 */
export function MilestoneCard(props) {
  const { milestone, onClick } = props;
  const { name, iconId, rarity, unlocked, progress, target } = milestone;

  const showProgress = !unlocked && target > 1;

  return el(
    'button',
    {
      class: cx('ft-milestone', unlocked ? 'ft-milestone--unlocked' : 'ft-milestone--locked'),
      type: 'button',
      attrs: {
        'aria-label': `${name}. ${unlocked ? 'Unlocked' : `${progress} of ${target}`}`,
      },
      on: onClick ? { click: () => onClick(milestone) } : {},
    },
    [
      MilestoneBadge({ iconId, unlocked, rarity }),
      el('span', { class: 'ft-milestone__name', text: name }),
      showProgress
        ? ProgressBar({ value: progress, max: target, compact: true })
        : el('span', {
            class: 'ft-milestone__status',
            text: unlocked ? 'Unlocked' : 'Locked',
          }),
    ],
  );
}

/**
 * The "next milestone" panel on the dashboard. One milestone, stated as a
 * goal rather than as a lock.
 *
 * @param {Object} props
 * @param {Object|null} props.milestone
 * @param {Function} [props.onClick]
 * @returns {HTMLElement}
 */
export function NextMilestone(props) {
  const { milestone, onClick } = props;

  if (!milestone) {
    return el('div', { class: 'ft-next-milestone ft-next-milestone--complete' }, [
      MilestoneBadge({ iconId: 'crown', unlocked: true, rarity: 'Legendary' }),
      el('div', { class: 'ft-next-milestone__body' }, [
        el('p', { class: 'ft-next-milestone__label', text: 'Every milestone earned' }),
        el('p', { class: 'ft-next-milestone__name', text: 'There is nothing left to unlock. Remarkable.' }),
      ]),
    ]);
  }

  const remaining = Math.max(milestone.target - milestone.progress, 0);

  return el(
    'button',
    {
      class: 'ft-next-milestone',
      type: 'button',
      on: onClick ? { click: () => onClick(milestone) } : {},
    },
    [
      MilestoneBadge({ iconId: milestone.iconId, unlocked: false, rarity: milestone.rarity }),
      el('div', { class: 'ft-next-milestone__body' }, [
        el('p', { class: 'ft-next-milestone__label', text: 'Working toward' }),
        el('p', { class: 'ft-next-milestone__name', text: milestone.name }),
        ProgressBar({ value: milestone.progress, max: milestone.target }),
        el('p', {
          class: 'ft-next-milestone__remaining',
          text:
            milestone.target === 1
              ? 'Almost there.'
              : `${remaining} to go.`,
        }),
      ]),
    ],
  );
}

/* -------------------------------------------------------------------------
 * Progress bar
 * ---------------------------------------------------------------------- */

/**
 * @param {Object} props
 * @param {number} props.value
 * @param {number} props.max
 * @param {boolean} [props.compact=false]
 * @param {string} [props.tone]
 * @returns {HTMLElement}
 */
export function ProgressBar(props) {
  const { value, max, compact = false, tone } = props;
  const ratio = max > 0 ? Math.min(value / max, 1) : 0;

  const fill = el('span', {
    class: 'ft-progressbar__fill',
    style: { width: `${ratio * 100}%` },
  });

  const node = el(
    'span',
    {
      class: cx('ft-progressbar', compact && 'ft-progressbar--compact', tone && `ft-progressbar--${tone}`),
      attrs: {
        role: 'progressbar',
        'aria-valuenow': String(value),
        'aria-valuemin': '0',
        'aria-valuemax': String(max),
      },
    },
    [fill, compact ? null : el('span', { class: 'ft-progressbar__label', text: `${value} / ${max}` })],
  );

  return stateful(node, {
    update({ value: next }) {
      const nextRatio = max > 0 ? Math.min(next / max, 1) : 0;
      fill.style.width = `${nextRatio * 100}%`;
      node.setAttribute('aria-valuenow', String(next));
    },
  });
}

/* -------------------------------------------------------------------------
 * Flow Levels
 * ---------------------------------------------------------------------- */

/**
 * The member's current level, as an identity chip.
 *
 * @param {Object} props
 * @param {string} props.name
 * @param {string} props.iconId
 * @param {'sm'|'md'} [props.size='md']
 * @returns {HTMLElement}
 */
export function LevelChip(props) {
  const { name, iconId, size = 'md' } = props;

  return el('span', { class: cx('ft-level-chip', size === 'sm' && 'ft-level-chip--sm') }, [
    icon(Icons[iconId] || Icons.leaf, { class: 'ft-level-chip__icon' }),
    el('span', { text: name }),
  ]);
}

/**
 * The full level progression, as a vertical track.
 *
 * Shown as a journey rather than a ladder: every level is visible, the ones
 * behind are marked reached, and the ones ahead state what they ask for. Nobody
 * is told they are "below" anything.
 *
 * @param {Object} props
 * @param {Array} props.levels
 * @param {string} props.currentId
 * @param {Object} [props.stats]  { allTimePosts, perfectWeeks }
 * @returns {HTMLElement}
 */
export function LevelTrack(props) {
  const { levels, currentId, stats = {} } = props;
  const currentIndex = levels.findIndex((level) => level.id === currentId);

  return el(
    'ol',
    { class: 'ft-level-track' },
    levels.map((level, index) => {
      const reached = index <= currentIndex;
      const isCurrent = index === currentIndex;

      return el(
        'li',
        {
          class: cx(
            'ft-level-step',
            reached && 'ft-level-step--reached',
            isCurrent && 'ft-level-step--current',
          ),
          attrs: { 'aria-current': isCurrent ? 'step' : null },
        },
        [
          el('span', { class: 'ft-level-step__marker' }, icon(Icons[level.iconId] || Icons.leaf)),
          el('div', { class: 'ft-level-step__body' }, [
            el('div', { class: 'ft-level-step__head' }, [
              el('span', { class: 'ft-level-step__name', text: level.name }),
              isCurrent ? el('span', { class: 'ft-badge ft-badge--brand', text: 'You are here' }) : null,
            ]),
            el('p', { class: 'ft-level-step__description', text: level.description }),
            level.requiredPosts > 0
              ? el('p', {
                  class: 'ft-level-step__requirement',
                  text: `${level.requiredPosts} posts · ${level.requiredPerfectWeeks} goal weeks`,
                })
              : el('p', { class: 'ft-level-step__requirement', text: 'Where everyone begins' }),
          ]),
        ],
      );
    }),
  );
}

/**
 * Progress toward the next level.
 *
 * Shows both requirements, because a member held back by weeks rather than
 * posts should be able to see that — one combined percentage would hide it.
 *
 * @param {Object} props
 * @param {Object|null} props.next   A FlowLevels row: name, requiredPosts,
 *                                   requiredPerfectWeeks. Targets only.
 * @param {Object} [props.stats]     The member's stats: allTimePosts,
 *                                   perfectWeeks. Supplies current progress.
 * @returns {HTMLElement}
 */
export function LevelProgress(props) {
  const { next, stats } = props;

  if (!next) {
    return el('p', { class: 'ft-text-sm ft-text-muted', text: 'You have reached the final level.' });
  }

  // A Flow Level row carries only its TARGETS — requiredPosts and
  // requiredPerfectWeeks. Current progress lives in the member's stats, which
  // both callers (the dashboard and the Levels screen) already hold.
  //
  // This component previously read `next.posts.current` and
  // `next.perfectWeeks.current`. No endpoint has ever returned that shape, so
  // it threw on every render — taking the whole dashboard down with it, since
  // the view's catch turned a render bug into "We could not load your
  // dashboard". See docs/CURRENT_STATE.md, Phase 10 defect B3.
  const current = stats || {};
  const postsNow = current.allTimePosts || 0;
  const weeksNow = current.perfectWeeks || 0;

  // A target of 0 is already satisfied; an empty bar beside it reads as
  // failure rather than as "nothing required here".
  const rows = [
    { label: 'Posts', value: postsNow, max: next.requiredPosts || 0 },
    { label: 'Goal weeks', value: weeksNow, max: next.requiredPerfectWeeks || 0 },
  ].filter((row) => row.max > 0);

  return el('div', { class: 'ft-level-progress' }, [
    el('p', { class: 'ft-level-progress__label' }, [
      'Next: ',
      el('strong', { text: next.name }),
    ]),
    ...rows.map((row) =>
      el('div', { class: 'ft-level-progress__row' }, [
        el('span', { class: 'ft-level-progress__metric', text: row.label }),
        ProgressBar({ value: row.value, max: row.max }),
      ]),
    ),
  ]);
}
