/**
 * Community Overview.
 *
 * The first screen an admin sees. It answers one question — "how is the
 * community doing this week?" — before asking them to look at anything else.
 *
 * @module features/admin/overview
 */

import { el, icon } from '../../core/dom.js';
import { mount } from '../../core/component.js';
import { call } from '../../core/api.js';
import { toAppError } from '../../core/errors.js';
import { Card, Skeleton, EmptyState, Button } from '../../components/ui/index.js';
import { PageHeader, Section } from '../../components/layout/index.js';
import { StatCard, LevelChip } from '../../components/brand/index.js';
import { Icons } from '../../lib/icons.js';
import { number, weekRange } from '../../lib/format.js';
import { navigate } from '../../app/navigation.js';
import { ErrorState } from './shared.js';

export default function AdminOverviewView() {
  const root = el('div');

  mount(root, Loading());
  load();

  async function load() {
    try {
      mount(root, render(await call('admin.overview')));
    } catch (error) {
      mount(root, ErrorState(toAppError(error), load));
    }
  }

  return root;
}

function render(data) {
  return el('div', { class: 'ft-stack ft-gap-6 ft-animate-in' }, [
    PageHeader({
      eyebrow: weekRange(data.weekStart),
      title: 'Community overview',
      subtitle: 'How the tribe is doing this week.',
      actions: [
        Button({
          label: 'Analytics',
          variant: 'secondary',
          size: 'sm',
          iconPaths: Icons.chart,
          onClick: () => navigate('/analytics'),
        }),
      ],
    }),

    /* The metric cards — exactly what the server enabled, nothing hardcoded.
       A metric paused in Settings is absent here rather than stubbed. */
    el(
      'div',
      { class: 'ft-admin-metrics ft-stagger' },
      data.metrics.map((metric) =>
        StatCard({
          label: metric.label,
          value: metric.unit === '%' ? `${metric.value}%` : number(metric.value),
          meta: metric.meta,
          iconPaths: METRIC_ICONS[metric.id] || Icons.chart,
        }),
      ),
    ),

    Section(
      {
        title: 'This week’s leaderboard',
        action: el('a', {
          class: 'ft-section__action',
          attrs: { href: '#/leaderboard' },
          text: 'See all',
        }),
      },
      Card({ flush: true }, data.leaderboard.length
        ? el(
            'ol',
            { class: 'ft-mini-board' },
            data.leaderboard.map((entry) =>
              el('li', { class: 'ft-mini-board__row' }, [
                el('span', {
                  class: `ft-mini-board__rank${entry.rank <= 3 ? ' ft-mini-board__rank--podium' : ''}`,
                  text: String(entry.rank),
                }),
                el('span', { class: 'ft-mini-board__body' }, [
                  el('span', { class: 'ft-truncate', text: entry.fullName }),
                  entry.levelName
                    ? LevelChip({ name: entry.levelName, iconId: entry.levelIconId, size: 'sm' })
                    : null,
                ]),
                el('span', { class: 'ft-mini-board__count' }, [
                  el('span', {
                    class: `ft-numeral${entry.postCount >= entry.weeklyGoal ? ' ft-text-success' : ''}`,
                    text: String(entry.postCount),
                  }),
                  el('span', { class: 'ft-text-xs ft-text-muted', text: `/ ${entry.weeklyGoal}` }),
                ]),
              ]),
            ),
          )
        : EmptyState({
            title: 'Nobody has posted yet this week',
            message: 'The board fills as members log their first posts.',
            illustration: 'emptyLeaderboard',
          }),
      ),
    ),

    Section({ title: 'Jump to' }, el('div', { class: 'ft-admin-jump' }, [
      JumpCard('Members', 'Search, edit, suspend', Icons.users, '/members'),
      JumpCard('Submissions', 'Review what was posted', Icons.fileText, '/submissions'),
      JumpCard('Invites', 'Generate and revoke codes', Icons.ticket, '/invites'),
      JumpCard('Analytics', 'Trends and distribution', Icons.chart, '/analytics'),
    ])),
  ]);
}

const METRIC_ICONS = {
  totalMembers: Icons.users,
  activeMembersThisWeek: Icons.flame,
  postsToday: Icons.plus,
  postsThisWeek: Icons.calendar,
  goalCompletionRate: Icons.target,
  totalPosts: Icons.archive,
  newMembers: Icons.sparkle,
};

function JumpCard(title, description, iconPaths, href) {
  return el('a', { class: 'ft-jump-card', attrs: { href: `#${href}` } }, [
    el('span', { class: 'ft-jump-card__icon' }, icon(iconPaths)),
    el('span', { class: 'ft-jump-card__body' }, [
      el('span', { class: 'ft-jump-card__title', text: title }),
      el('span', { class: 'ft-jump-card__description', text: description }),
    ]),
    icon(Icons.chevronRight, { class: 'ft-jump-card__chevron' }),
  ]);
}

function Loading() {
  return el('div', { class: 'ft-stack ft-gap-6' }, [
    el('div', {}, [
      Skeleton({ variant: 'text', width: '8rem' }),
      el('div', { class: 'ft-mt-2' }, Skeleton({ variant: 'title', width: '16rem' })),
    ]),
    el(
      'div',
      { class: 'ft-admin-metrics' },
      Array.from({ length: 7 }, () => Skeleton({ variant: 'card', height: '5.5rem' })),
    ),
    Skeleton({ variant: 'card', height: '14rem' }),
  ]);
}
