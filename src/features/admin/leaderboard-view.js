/**
 * Leaderboard Management.
 *
 * Read-only by design. There is no score editing anywhere in this screen —
 * every number comes from the ledger, and the only way to change one is to
 * void a submission, which is done on the Submissions screen and leaves an
 * audit trail. A leaderboard an admin can quietly adjust is not a leaderboard.
 *
 * @module features/admin/leaderboard
 */

import { el } from '../../core/dom.js';
import { mount } from '../../core/component.js';
import { call } from '../../core/api.js';
import { toAppError } from '../../core/errors.js';
import { Button, Card, EmptyState, Badge, toastSuccess } from '../../components/ui/index.js';
import { PageHeader, Section } from '../../components/layout/index.js';
import { LevelChip, StatCard } from '../../components/brand/index.js';
import { DataTable, TableSkeleton } from '../../components/data/index.js';
import { Icons } from '../../lib/icons.js';
import { number, plural, weekRange } from '../../lib/format.js';
import { ErrorState } from './shared.js';

const SCOPES = [
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'allTime', label: 'All time' },
];

const SORTS = [
  { id: 'posts', label: 'Total posts' },
  { id: 'currentStreak', label: 'Current streak' },
  { id: 'longestStreak', label: 'Longest streak' },
];

export default function AdminLeaderboardView() {
  const root = el('div');
  const state = { scope: 'week', sortBy: 'posts' };

  const tabs = el('div');
  const results = el('div');

  mount(root, el('div', { class: 'ft-stack ft-gap-5' }, [
    PageHeader({
      title: 'Leaderboard',
      subtitle: 'Live standings, straight from the ledger.',
      actions: [
        Button({
          label: 'Refresh',
          variant: 'secondary',
          size: 'sm',
          iconPaths: Icons.refresh,
          onClick: () => {
            load();
            toastSuccess('Rankings refreshed.');
          },
        }),
      ],
    }),
    tabs,
    results,
  ]));

  renderTabs();
  load();

  function renderTabs() {
    mount(tabs, el('div', { class: 'ft-stack ft-gap-3' }, [
      el('div', { class: 'ft-segmented', attrs: { role: 'tablist' } },
        SCOPES.map((scope) =>
          el('button', {
            class: `ft-segmented__option${state.scope === scope.id ? ' ft-segmented__option--active' : ''}`,
            type: 'button',
            attrs: { role: 'tab', 'aria-selected': String(state.scope === scope.id) },
            text: scope.label,
            on: {
              click: () => {
                state.scope = scope.id;
                renderTabs();
                load();
              },
            },
          }),
        ),
      ),
      el('div', { class: 'ft-filterbar' }, [
        el('label', { class: 'ft-filterbar__field' }, [
          el('span', { class: 'ft-filterbar__label', text: 'Sort by' }),
          el('select', {
            class: 'ft-select ft-select--sm',
            on: {
              change: (event) => {
                state.sortBy = event.target.value;
                load();
              },
            },
          }, SORTS.map((sort) =>
            el('option', { value: sort.id, text: sort.label, selected: state.sortBy === sort.id }),
          )),
        ]),
      ]),
    ]));
  }

  async function load() {
    mount(results, Card({ flush: true }, TableSkeleton(5)));

    try {
      mount(results, render(await call('leaderboard.get', {
        scope: state.scope,
        sortBy: state.sortBy,
      })));
    } catch (error) {
      mount(results, ErrorState(toAppError(error), load));
    }
  }

  function render(data) {
    if (!data.entries.length) {
      return Card({}, EmptyState({
        title: 'Nobody on the board yet',
        message: 'Members appear here once they log their first post in this period.',
        illustration: 'emptyLeaderboard',
      }));
    }

    const champion = data.entries[0];
    const totalPosts = data.entries.reduce((sum, entry) => sum + entry.postCount, 0);
    const metGoal = data.entries.filter((entry) => entry.postCount >= entry.weeklyGoal).length;

    return el('div', { class: 'ft-stack ft-gap-5' }, [
      /* Weekly Champion, given its own card because it is the week's headline */
      state.scope === 'week'
        ? Card({ variant: 'brand' }, el('div', { class: 'ft-champion' }, [
            el('span', { class: 'ft-champion__eyebrow', text: `Leading ${weekRange(data.weekStart)}` }),
            el('span', { class: 'ft-champion__name', text: champion.fullName }),
            el('span', { class: 'ft-champion__meta', text: plural(champion.postCount, 'post') + ' this week' }),
            el('p', {
              class: 'ft-champion__note',
              text: 'Weekly Champion is awarded when the week closes, from the settled ranking.',
            }),
          ]))
        : null,

      el('div', { class: 'ft-admin-metrics' }, [
        StatCard({ label: 'On the board', value: data.entries.length, iconPaths: Icons.users }),
        StatCard({ label: 'Yet to post', value: data.unrankedCount, iconPaths: Icons.inbox }),
        StatCard({ label: 'Posts in period', value: number(totalPosts), iconPaths: Icons.archive }),
        StatCard({ label: 'Met their goal', value: metGoal, iconPaths: Icons.target }),
      ]),

      Section({ title: 'Top contributors' }, Card({ flush: true }, DataTable({
        columns: [
          {
            key: 'rank',
            label: '#',
            primary: true,
            width: '3rem',
            render: (row) => el('span', {
              class: `ft-mini-board__rank${row.rank <= 3 ? ' ft-mini-board__rank--podium' : ''}`,
              text: String(row.rank),
            }),
          },
          {
            key: 'fullName',
            label: 'Member',
            primary: true,
            render: (row) => el('span', { class: 'ft-stack' }, [
              el('span', { class: 'ft-font-semibold ft-truncate', text: row.fullName }),
              el('span', { class: 'ft-text-xs ft-text-muted', text: `@${row.username}` }),
            ]),
          },
          {
            key: 'levelName',
            label: 'Level',
            render: (row) => row.levelName
              ? LevelChip({ name: row.levelName, iconId: row.levelIconId, size: 'sm' })
              : null,
          },
          {
            key: 'postCount',
            label: 'Posts',
            numeric: true,
            render: (row) => el('span', { class: 'ft-row ft-gap-2 ft-row--end' }, [
              el('span', {
                class: `ft-numeral${row.postCount >= row.weeklyGoal ? ' ft-text-success' : ''}`,
                text: String(row.postCount),
              }),
              el('span', { class: 'ft-text-xs ft-text-muted', text: `/ ${row.weeklyGoal}` }),
            ]),
          },
          {
            key: 'currentWeekStreak',
            label: 'Streak',
            numeric: true,
            render: (row) => `${row.currentWeekStreak} wk`,
          },
          {
            key: 'goal',
            label: 'Goal',
            render: (row) => row.postCount >= row.weeklyGoal
              ? Badge({ label: 'Met', tone: 'success' })
              : Badge({ label: 'In progress', tone: 'neutral' }),
          },
        ],
        rows: data.entries,
        rowKey: (row) => row.memberId,
      }))),

      el('p', {
        class: 'ft-text-xs ft-text-muted ft-text-center',
        text: 'Rankings are derived from submissions and cannot be edited. To correct a standing, void the submission behind it.',
      }),
    ]);
  }

  return root;
}
