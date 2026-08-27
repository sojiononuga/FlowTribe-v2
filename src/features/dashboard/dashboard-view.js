/** Universal Flow home: direction, momentum, adaptation, Tribe. */
import { el } from '../../core/dom.js';
import { mount } from '../../core/component.js';
import { Button, Card, EmptyState, Skeleton, SkeletonText } from '../../components/ui/index.js';
import { ProgressRing, StatCard, ActivityCalendar } from '../../components/brand/index.js';
import { LevelChip, LevelProgress, NextMilestone, MilestoneBadge } from '../../components/brand/milestone.js';
import { Section } from '../../components/layout/index.js';
import { Icons } from '../../lib/icons.js';
import { number, relative, plural } from '../../lib/format.js';
import { call } from '../../core/api.js';
import { toAppError } from '../../core/errors.js';
import { navigate } from '../../app/navigation.js';
import { openMilestoneModal } from '../milestones/milestone-modal.js';
import { presentLevel, presentMilestone } from '../../lib/catalog.js';

export default function DashboardView() {
  const root = el('div', { class: 'ft-dashboard' });
  mount(root, DashboardSkeleton());
  load();

  async function load() {
    try { mount(root, render(await call('member.dashboard'))); }
    catch (error) { mount(root, ErrorState(toAppError(error), load)); }
  }
  return root;
}

function render(data) {
  const { member, week, calendar, stats, leaderboard, recent } = data;
  const level = presentLevel(data.level);
  const milestones = {
    ...data.milestones,
    next: presentMilestone(data.milestones.next),
    recent: data.milestones.recent.map(presentMilestone),
  };
  const actions = week.postsThisWeek;
  const score = momentumScore(actions, week.weeklyGoal, stats.currentWeekStreak);

  return el('div', { class: 'ft-stack ft-gap-6' }, [
    el('header', { class: 'ft-welcome ft-animate-in' }, [
      el('div', { class: 'ft-welcome__text' }, [
        el('p', { class: 'ft-pagehead__eyebrow', text: 'YOUR FLOW' }),
        el('h1', { class: 'ft-welcome__title', text: `Welcome back, ${firstName(member.fullName)}` }),
        el('div', { class: 'ft-welcome__meta' }, [
          el('span', { class: 'ft-text-sm ft-text-muted', text: 'Keep moving. Perfect is not the point.' }),
          LevelChip({ name: level.name, iconId: level.iconId, size: 'sm' }),
        ]),
      ]),
    ]),

    /* The first viewport tells the whole product story: destination, route,
       one useful move, and the promise that the route can change. */
    Card({ variant: 'brand' }, [
      el('div', { class: 'ft-flow-hero' }, [
        el('div', { class: 'ft-flow-hero__copy' }, [
          el('div', { class: 'ft-row ft-row--between ft-gap-3' }, [
            el('span', { class: 'ft-flow-hero__eyebrow', text: 'YOUR GOAL' }),
            el('a', { class: 'ft-flow-hero__edit', attrs: { href: '#/direction' }, text: 'Edit direction' }),
          ]),
          el('h2', { class: 'ft-flow-hero__title', text: member.goalTitle || 'Choose a meaningful direction' }),
          el('p', {
            class: 'ft-flow-hero__promise',
            text: 'When life changes the plan, Flow changes the path — not the goal.',
          }),
        ]),
        el('div', { class: 'ft-flow-hero__score', attrs: { 'aria-label': `Momentum ${score} out of 100` } }, [
          el('span', { class: 'ft-flow-hero__score-value', text: String(score) }),
          el('span', { class: 'ft-flow-hero__score-label', text: 'momentum' }),
        ]),
      ]),
    ]),

    Card({}, [
      el('div', { class: 'ft-row ft-row--between ft-gap-3' }, [
        el('div', {}, [
          el('p', { class: 'ft-pagehead__eyebrow', text: 'YOUR PLAN' }),
          el('h2', { class: 'ft-section__title ft-mt-2', text: `${week.weeklyGoal} meaningful moves this week` }),
        ]),
        ProgressRing({ value: actions, goal: week.weeklyGoal }),
      ]),
      el('ol', { class: 'ft-flow-plan ft-mt-5' }, [
        PlanStep('1', 'Next action', member.showingUp || 'Complete one meaningful action', actions === 0 ? 'Now' : 'Continue'),
        PlanStep('2', 'Evidence', 'Record what happened without over-documenting it', `${actions} saved`),
        PlanStep('3', 'Progress', week.goalMet ? 'Weekly rhythm reached' : `${week.weeklyGoal - actions} moves remain at this pace`, `${score}%`),
      ]),
      el('div', { class: 'ft-grid ft-grid--2 ft-mt-5' }, [
        Button({ label: 'Do the next action', size: 'lg', block: true, iconPaths: Icons.plus, onClick: () => navigate('/submit') }),
        Button({ label: 'Adapt the path', variant: 'secondary', size: 'lg', block: true, iconPaths: Icons.refresh, onClick: () => navigate('/adapt') }),
      ]),
      member.constraints ? el('div', { class: 'ft-constraint ft-mt-5' }, [
        el('div', {}, [
          el('span', { class: 'ft-constraint__label', text: 'Flow is planning around' }),
          el('p', { class: 'ft-constraint__text', text: member.constraints }),
        ]),
      ]) : null,
    ]),

    Section({ title: 'Your movement' }, Card({}, [
      ActivityCalendar({ from: calendar.from, to: calendar.to, counts: calendar.counts, today: calendar.today }),
      el('p', { class: 'ft-text-xs ft-text-muted ft-mt-3', text: 'Each filled day is evidence that you returned to what matters.' }),
    ])),

    Section({ title: 'Your numbers' }, [
      el('div', { class: 'ft-grid ft-grid--4' }, [
        StatCard({ label: 'Return streak', value: stats.currentWeekStreak, meta: plural(stats.currentWeekStreak, 'week'), iconPaths: Icons.flame, tone: stats.currentWeekStreak > 0 ? 'accent' : 'default' }),
        StatCard({ label: 'Best streak', value: stats.longestWeekStreak, meta: plural(stats.longestWeekStreak, 'week'), iconPaths: Icons.medal }),
        StatCard({ label: 'Lifetime actions', value: number(stats.allTimePosts), iconPaths: Icons.check }),
        StatCard({ label: 'Active days', value: number(stats.activeDays), iconPaths: Icons.calendarCheck }),
      ]),
      level.next ? el('div', { class: 'ft-mt-3' }, Card({}, [
        el('div', { class: 'ft-row ft-row--between ft-mb-3' }, [
          el('span', { class: 'ft-section__title', text: 'Flow Level' }),
          el('a', { class: 'ft-section__action', attrs: { href: '#/levels' }, text: 'See all' }),
        ]),
        LevelProgress({ next: level.next, stats }),
      ])) : null,
    ]),

    Section({
      title: 'Tribe movement',
      action: el('a', { class: 'ft-section__action', attrs: { href: '#/leaderboard' }, text: 'See the Tribe' }),
    }, leaderboard.entries?.length ? Card({ flush: true }, LeaderboardPreview(leaderboard)) : Card({}, EmptyState({
      title: 'The Tribe is warming up',
      message: 'Movement becomes visible as people show up. Nobody is punished for not starting first.',
      illustration: 'emptyLeaderboard',
    }))),

    Section({ title: 'Recent movement' }, recent.length ? RecentList(recent) : RecentEmpty()),

    Section({
      title: 'Milestones',
      action: el('a', { class: 'ft-section__action', attrs: { href: '#/milestones' }, text: `${milestones.totalEarned} of ${milestones.totalAvailable}` }),
    }, [
      NextMilestone({ milestone: milestones.next, onClick: (m) => openMilestoneModal(m) }),
      milestones.recent.length ? el('div', { class: 'ft-milestone-recent ft-mt-3' }, milestones.recent.map((m) => el('button', {
        class: 'ft-milestone-recent__item', type: 'button', on: { click: () => openMilestoneModal(m) },
      }, [
        MilestoneBadge({ iconId: m.iconId, unlocked: true, rarity: m.rarity, size: 'sm' }),
        el('span', { class: 'ft-milestone-recent__name', text: m.name }),
      ]))) : null,
    ]),
  ]);
}

function LeaderboardPreview(leaderboard) {
  return el('ol', { class: 'ft-leaderboard' }, leaderboard.entries.slice(0, 5).map((entry) => el('li', {
    class: entry.isSelf ? 'ft-leaderboard__row ft-leaderboard__row--self' : 'ft-leaderboard__row',
  }, [
    el('span', { class: 'ft-leaderboard__rank', text: `${entry.rank}` }),
    el('span', { class: 'ft-leaderboard__name' }, [
      el('span', { class: 'ft-truncate', text: entry.fullName }),
      entry.isSelf ? el('span', { class: 'ft-badge ft-badge--brand', text: 'You' }) : null,
    ]),
    el('span', { class: 'ft-leaderboard__count' }, [
      el('span', { class: 'ft-numeral', text: String(entry.postCount) }),
      el('span', { class: 'ft-leaderboard__goal', text: `/ ${entry.weeklyGoal}` }),
    ]),
  ])));
}

function RecentList(recent) {
  return el('ul', { class: 'ft-recent ft-stagger' }, recent.map((item) => el('li', { class: 'ft-recent__item' }, [
    el('span', { class: 'ft-recent__icon' }, [el('span', { class: 'ft-badge ft-badge--brand', text: '✓' })]),
    el('div', { class: 'ft-recent__body' }, [
      el('span', { class: 'ft-recent__link ft-truncate', text: item.actionTitle || 'Meaningful action' }),
      item.evidence ? el('span', { class: 'ft-recent__time ft-truncate', text: item.evidence }) : null,
      el('span', { class: 'ft-recent__time', text: relative(item.timestamp) }),
    ]),
  ])));
}

function RecentEmpty() {
  return Card({}, EmptyState({
    title: 'Your evidence starts here',
    message: 'One meaningful action is enough to begin. Flow is interested in returning, not perfection.',
    illustration: 'noActivity',
    action: Button({ label: 'Show up', size: 'sm', onClick: () => navigate('/submit') }),
  }));
}

function momentumScore(actions, goal, streak) {
  const weekly = Math.min(1, actions / Math.max(1, goal));
  const returnStrength = Math.min(1, streak / 4);
  return Math.round((weekly * 75 + returnStrength * 25));
}

function PlanStep(numberLabel, label, description, meta) {
  return el('li', { class: 'ft-flow-plan__step' }, [
    el('span', { class: 'ft-flow-plan__number', text: numberLabel }),
    el('div', { class: 'ft-flow-plan__body' }, [
      el('span', { class: 'ft-flow-plan__label', text: label }),
      el('span', { class: 'ft-flow-plan__description', text: description }),
    ]),
    el('span', { class: 'ft-flow-plan__meta', text: meta }),
  ]);
}

function DashboardSkeleton() {
  return el('div', { class: 'ft-stack ft-gap-6' }, [
    el('div', { class: 'ft-stack ft-gap-2' }, [Skeleton({ variant: 'title', width: '60%' }), Skeleton({ variant: 'text', width: '35%' })]),
    Skeleton({ variant: 'card', height: '9rem' }),
    Skeleton({ variant: 'card', height: '13rem' }),
    Card({}, SkeletonText(4)),
  ]);
}

function ErrorState(error, retry) {
  return Card({}, EmptyState({ title: 'We could not load your Flow', message: error.message, iconPaths: Icons.alert, action: Button({ label: 'Try again', variant: 'secondary', iconPaths: Icons.refresh, onClick: retry }) }));
}

function firstName(fullName) { return String(fullName || '').trim().split(/\s+/)[0] || 'there'; }
