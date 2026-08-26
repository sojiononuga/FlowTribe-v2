/**
 * Leaderboard.
 *
 * Community before competition. Members are shown alongside their own goal, so
 * a member on 3 actions reads as a success rather than as sixth place — the
 * comparison that matters is against your own promise.
 *
 * Members with no actions in scope are absent, not ranked last, and the caller
 * sees an invitation instead of a zero.
 *
 * @module features/leaderboard/leaderboard-view
 */

import { cx, el, icon } from '../../core/dom.js';
import { mount } from '../../core/component.js';
import { Card, EmptyState, Skeleton, Button } from '../../components/ui/index.js';
import { RankPrompt } from '../../components/brand/index.js';
import { LevelChip } from '../../components/brand/milestone.js';
import { PageHeader } from '../../components/layout/index.js';
import { Icons } from '../../lib/icons.js';
import { call } from '../../core/api.js';
import { toAppError } from '../../core/errors.js';
import { plural } from '../../lib/format.js';

const SCOPES = [
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'allTime', label: 'All time' },
];

export default function LeaderboardView() {
  let scope = 'week';

  const body = el('div');
  const tabs = el('div', { class: 'ft-tabs', attrs: { role: 'tablist' } });

  function renderTabs() {
    tabs.replaceChildren(
      ...SCOPES.map((option) =>
        el('button', {
          class: cx('ft-tab', option.id === scope && 'ft-tab--active'),
          type: 'button',
          attrs: { role: 'tab', 'aria-selected': option.id === scope ? 'true' : 'false' },
          text: option.label,
          on: {
            click: () => {
              if (scope === option.id) return;
              scope = option.id;
              renderTabs();
              load();
            },
          },
        }),
      ),
    );
  }

  async function load() {
    mount(body, LeaderboardSkeleton());

    try {
      const data = await call('leaderboard.get', { scope });
      mount(body, render(data));
    } catch (error) {
      mount(body, Card({}, EmptyState({
        title: 'We could not load the leaderboard',
        message: toAppError(error).message,
        iconPaths: Icons.alert,
        action: Button({ label: 'Try again', variant: 'secondary', onClick: load }),
      })));
    }
  }

  renderTabs();
  load();

  return el('div', { class: 'ft-animate-in' }, [
    PageHeader({
      title: 'The Tribe',
      subtitle: 'Collective movement, without turning people into a scoreboard.',
    }),
    tabs,
    body,
  ]);
}

function render(data) {
  if (!data.entries.length) {
    return Card({}, EmptyState({
      title: 'The Tribe is quiet for now',
      message: 'One meaningful action is enough to start the wave.',
      iconPaths: Icons.trophy,
    }));
  }

  return el('div', { class: 'ft-stack ft-gap-4' }, [
    data.rank === null ? RankPrompt() : null,
    Card({ flush: true }, el(
      'ol',
      { class: 'ft-leaderboard ft-leaderboard--full ft-stagger' },
      data.entries.map((entry) => Row(entry)),
    )),
    data.unrankedCount > 0
      ? el('p', {
          class: 'ft-text-xs ft-text-muted ft-text-center',
          text: `${plural(data.unrankedCount, 'member')} yet to show up this week. There is still time.`,
        })
      : null,
  ]);
}

function Row(entry) {

  const met = entry.postCount >= entry.weeklyGoal;

  return el(
    'li',
    { class: cx('ft-leaderboard__row', entry.isSelf && 'ft-leaderboard__row--self') },
    [
      el('span', {
        class: cx('ft-leaderboard__rank', entry.rank <= 3 && 'ft-leaderboard__rank--podium'),
        text: String(entry.rank),
      }),

      el('span', { class: 'ft-leaderboard__name' }, [
        el('span', { class: 'ft-stack' }, [
          el('span', { class: 'ft-row ft-gap-2' }, [
            el('span', { class: 'ft-truncate', text: entry.fullName }),
            entry.isSelf ? el('span', { class: 'ft-badge ft-badge--brand', text: 'You' }) : null,
          ]),
          entry.levelName ? LevelChip({ name: entry.levelName, iconId: entry.levelIconId, size: 'sm' }) : null,
        ]),
      ]),

      el('span', { class: 'ft-leaderboard__count' }, [
        el('span', {
          class: cx('ft-numeral', met && 'ft-text-success'),
          text: String(entry.postCount),
        }),
        el('span', { class: 'ft-leaderboard__goal', text: `/ ${entry.weeklyGoal}` }),
        met ? icon(Icons.check, { class: 'ft-leaderboard__met' }) : null,
      ]),
    ],
  );
}

function LeaderboardSkeleton() {
  return Card({ flush: true }, el(
    'div',
    { class: 'ft-stack', style: { padding: 'var(--ft-space-4)', gap: 'var(--ft-space-4)' } },
    Array.from({ length: 6 }, () =>
      el('div', { class: 'ft-row ft-gap-3' }, [
        Skeleton({ variant: 'circle', width: '1.75rem', height: '1.75rem' }),
        el('div', { class: 'ft-grow' }, Skeleton({ variant: 'text', width: '45%' })),
        Skeleton({ variant: 'text', width: '3rem' }),
      ]),
    ),
  ));
}
