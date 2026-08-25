/**
 * Member dashboard.
 *
 * Sections in the approved order — motivation before statistics:
 *
 *   1 Welcome    2 Progress ring    3 Activity calendar    4 Milestones
 *   5 Statistics 6 Leaderboard      7 Recent activity      8 Submit CTA
 *
 * The ring and the calendar sit above every number deliberately. A member
 * should feel how consistent they have been before they read a figure — that
 * is the "I'm becoming consistent" step of the emotional journey, and it is
 * carried by shape, not by digits.
 *
 * @see docs/celebration-system.md §7
 * @module features/dashboard/dashboard-view
 */

import { el, icon } from '../../core/dom.js';
import { mount } from '../../core/component.js';
import { Button, Card, EmptyState, Skeleton, SkeletonText } from '../../components/ui/index.js';
import { ProgressRing, StatCard, RankPrompt, ActivityCalendar } from '../../components/brand/index.js';
import { LevelChip, LevelProgress, NextMilestone, MilestoneBadge } from '../../components/brand/milestone.js';
import { PageHeader, Section } from '../../components/layout/index.js';
import { Icons } from '../../lib/icons.js';
import { getPlatform } from '../../lib/platforms.js';
import { weeklyProgressMessage, number, relative, shortUrl, plural } from '../../lib/format.js';
import { call } from '../../core/api.js';
import { toAppError } from '../../core/errors.js';
import { getMember } from '../../core/session.js';
import { navigate } from '../../app/navigation.js';
import { openMilestoneModal } from '../milestones/milestone-modal.js';

export default function DashboardView() {
  const root = el('div', { class: 'ft-dashboard' });

  mount(root, DashboardSkeleton());
  load();

  async function load() {
    try {
      const data = await call('member.dashboard');
      mount(root, render(data));
    } catch (error) {
      mount(root, ErrorState(toAppError(error), load));
    }
  }

  return root;
}

/* -------------------------------------------------------------------------
 * Rendered dashboard
 * ---------------------------------------------------------------------- */

function render(data) {
  const { member, level, week, calendar, milestones, stats, leaderboard, recent } = data;
  const platform = getPlatform(member.platform);

  return el('div', { class: 'ft-stack ft-gap-6' }, [
    /* 1 — Welcome */
    el('header', { class: 'ft-welcome ft-animate-in' }, [
      el('div', { class: 'ft-welcome__text' }, [
        el('h1', { class: 'ft-welcome__title', text: `Welcome back, ${firstName(member.fullName)}` }),
        el('div', { class: 'ft-welcome__meta' }, [
          el('span', { class: 'ft-welcome__platform' }, [
            icon(platform.iconPaths, { class: 'ft-welcome__platform-icon' }),
            el('span', { text: platform.label }),
          ]),
          LevelChip({ name: level.name, iconId: level.iconId, size: 'sm' }),
        ]),
      ]),
    ]),

    /* 2 — Weekly progress ring */
    Card({}, [
      el('div', { class: 'ft-week-panel' }, [
        ProgressRing({ value: week.postsThisWeek, goal: week.weeklyGoal }),
        el('p', {
          class: week.goalMet ? 'ft-week-panel__message ft-week-panel__message--met' : 'ft-week-panel__message',
          text: week.goalMet
            ? 'You kept your promise to yourself this week.'
            : weeklyProgressMessage(week.postsThisWeek, week.weeklyGoal),
        }),
      ]),
    ]),

    /* 3 — Activity calendar */
    Section(
      { title: 'Your consistency' },
      Card({}, [
        ActivityCalendar({
          from: calendar.from,
          to: calendar.to,
          counts: calendar.counts,
          today: calendar.today,
        }),
      ]),
    ),

    /* 4 — Milestones */
    Section(
      {
        title: 'Milestones',
        action: el('a', {
          class: 'ft-section__action',
          attrs: { href: '#/milestones' },
          text: `${milestones.totalEarned} of ${milestones.totalAvailable}`,
        }),
      },
      [
        NextMilestone({
          milestone: milestones.next,
          onClick: (m) => openMilestoneModal(m),
        }),
        milestones.recent.length
          ? el(
              'div',
              { class: 'ft-milestone-recent ft-mt-3' },
              milestones.recent.map((m) =>
                el(
                  'button',
                  {
                    class: 'ft-milestone-recent__item',
                    type: 'button',
                    on: { click: () => openMilestoneModal(m) },
                  },
                  [
                    MilestoneBadge({ iconId: m.iconId, unlocked: true, rarity: m.rarity, size: 'sm' }),
                    el('span', { class: 'ft-milestone-recent__name', text: m.name }),
                  ],
                ),
              ),
            )
          : null,
      ],
    ),

    /* 5 — Weekly statistics */
    Section({ title: 'Your numbers' }, [
      el('div', { class: 'ft-grid ft-grid--4' }, [
        StatCard({
          label: 'Current streak',
          value: stats.currentWeekStreak,
          meta: plural(stats.currentWeekStreak, 'week'),
          iconPaths: Icons.flame,
          tone: stats.currentWeekStreak > 0 ? 'accent' : 'default',
        }),
        StatCard({
          label: 'Longest streak',
          value: stats.longestWeekStreak,
          meta: plural(stats.longestWeekStreak, 'week'),
          iconPaths: Icons.medal,
        }),
        StatCard({
          label: 'Lifetime posts',
          value: number(stats.allTimePosts),
          iconPaths: Icons.fileText,
        }),
        StatCard({
          label: 'Active days',
          value: number(stats.activeDays),
          iconPaths: Icons.calendarCheck,
        }),
      ]),
      level.next
        ? el(
            'div',
            { class: 'ft-mt-3' },
            Card({}, [
              el('div', { class: 'ft-row ft-row--between ft-mb-3' }, [
                el('span', { class: 'ft-section__title', text: 'Flow Level' }),
                el('a', { class: 'ft-section__action', attrs: { href: '#/levels' }, text: 'See all' }),
              ]),
              LevelProgress({ next: level.next, stats }),
            ]),
          )
        : null,
    ]),

    /* 6 — Leaderboard preview */
    Section(
      {
        title: 'This week',
        action: el('a', { class: 'ft-section__action', attrs: { href: '#/leaderboard' }, text: 'Full leaderboard' }),
      },
      leaderboard.rank === null
        ? RankPrompt()
        : Card({ flush: true }, LeaderboardPreview(leaderboard)),
    ),

    /* 7 — Recent activity */
    Section({ title: 'Recent posts' }, recent.length ? RecentList(recent) : RecentEmpty()),

    /* 8 — Submit CTA */
    el('div', { class: 'ft-dashboard__cta' }, [
      Button({
        label: "Submit today's post",
        size: 'lg',
        block: true,
        iconPaths: Icons.plus,
        onClick: () => navigate('/submit'),
      }),
    ]),
  ]);
}

/* -------------------------------------------------------------------------
 * Pieces
 * ---------------------------------------------------------------------- */

function LeaderboardPreview(leaderboard) {
  return el(
    'ol',
    { class: 'ft-leaderboard' },
    leaderboard.entries.slice(0, 5).map((entry) => LeaderboardRow(entry)),
  );
}

export function LeaderboardRow(entry) {
  return el(
    'li',
    { class: entry.isSelf ? 'ft-leaderboard__row ft-leaderboard__row--self' : 'ft-leaderboard__row' },
    [
      el('span', { class: 'ft-leaderboard__rank', text: `${entry.rank}` }),
      el('span', { class: 'ft-leaderboard__name' }, [
        el('span', { class: 'ft-truncate', text: entry.fullName }),
        entry.isSelf ? el('span', { class: 'ft-badge ft-badge--brand', text: 'You' }) : null,
      ]),
      el('span', { class: 'ft-leaderboard__count' }, [
        el('span', { class: 'ft-numeral', text: String(entry.postCount) }),
        el('span', { class: 'ft-leaderboard__goal', text: `/ ${entry.weeklyGoal}` }),
      ]),
    ],
  );
}

function RecentList(recent) {
  return el(
    'ul',
    { class: 'ft-recent ft-stagger' },
    recent.map((item) => {
      const platform = getPlatform(item.platform);

      return el('li', { class: 'ft-recent__item' }, [
        el('span', { class: 'ft-recent__icon', style: { color: platform.color } }, icon(platform.iconPaths)),
        el('div', { class: 'ft-recent__body' }, [
          el('a', {
            class: 'ft-recent__link ft-truncate',
            attrs: { href: item.link, target: '_blank', rel: 'noopener noreferrer' },
            text: shortUrl(item.link),
          }),
          el('span', { class: 'ft-recent__time', text: relative(item.timestamp) }),
        ]),
      ]);
    }),
  );
}

function RecentEmpty() {
  return Card({}, EmptyState({
    title: 'Nothing logged yet',
    message: 'Your next post starts today’s momentum. It takes about ten seconds to log.',
    illustration: 'noPosts',
  }));
}

/* -------------------------------------------------------------------------
 * Loading and error
 * ---------------------------------------------------------------------- */

/**
 * The skeleton mirrors the real layout — ring, calendar block, stat grid — so
 * the page reads as assembling rather than stalling. A spinner here would be
 * faster to write and would make the wait feel longer.
 */
function DashboardSkeleton() {
  return el('div', { class: 'ft-stack ft-gap-6' }, [
    el('div', { class: 'ft-stack ft-gap-2' }, [
      Skeleton({ variant: 'title', width: '60%' }),
      Skeleton({ variant: 'text', width: '35%' }),
    ]),
    Card({}, el('div', { class: 'ft-week-panel' }, [
      Skeleton({ variant: 'circle', width: '9.5rem', height: '9.5rem' }),
      Skeleton({ variant: 'text', width: '55%' }),
    ])),
    Card({}, el('div', { class: 'ft-stack ft-gap-3' }, [
      Skeleton({ height: '104px' }),
      Skeleton({ variant: 'text', width: '40%' }),
    ])),
    el('div', { class: 'ft-grid ft-grid--4' }, [
      Skeleton({ variant: 'card', height: '5.5rem' }),
      Skeleton({ variant: 'card', height: '5.5rem' }),
      Skeleton({ variant: 'card', height: '5.5rem' }),
      Skeleton({ variant: 'card', height: '5.5rem' }),
    ]),
    Card({}, SkeletonText(4)),
  ]);
}

function ErrorState(error, retry) {
  return Card({}, EmptyState({
    title: 'We could not load your dashboard',
    message: error.message,
    iconPaths: Icons.alert,
    action: Button({ label: 'Try again', variant: 'secondary', iconPaths: Icons.refresh, onClick: retry }),
  }));
}

function firstName(fullName) {
  return String(fullName || '').trim().split(/\s+/)[0] || 'there';
}
