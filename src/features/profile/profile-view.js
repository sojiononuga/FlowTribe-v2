/**
 * Member profile.
 *
 * A member's own record of what they have built: who they are, what they
 * committed to, their level, their milestones, their numbers, and their
 * calendar.
 *
 * The calendar appears here as well as on the dashboard deliberately. On the
 * dashboard it answers "how am I doing?"; here it is closer to a record of
 * work — the same component, two different questions.
 *
 * @module features/profile/profile-view
 */

import { el, icon } from '../../core/dom.js';
import { mount } from '../../core/component.js';
import {
  Avatar, Button, Card, EmptyState, Field, Input, Skeleton, Switch,
  toastError, toastSuccess,
} from '../../components/ui/index.js';
import { ActivityCalendar, StatCard } from '../../components/brand/index.js';
import { LevelChip, MilestoneBadge } from '../../components/brand/milestone.js';
import { PageHeader, Section } from '../../components/layout/index.js';
import { Icons } from '../../lib/icons.js';
import { getPlatform, goalLabel } from '../../lib/platforms.js';
import { date, number, plural } from '../../lib/format.js';
import { call } from '../../core/api.js';
import { toAppError } from '../../core/errors.js';
import { clearSession } from '../../core/session.js';
import { navigate } from '../../app/navigation.js';
import { openMilestoneModal } from '../milestones/milestone-modal.js';
import { confirmModal } from '../../components/ui/modal.js';

export default function ProfileView() {
  const root = el('div', { class: 'ft-animate-in' });

  mount(root, Loading());
  load();

  async function load() {
    try {
      const data = await call('member.profile');
      mount(root, render(data));
    } catch (error) {
      mount(root, Card({}, EmptyState({
        title: 'We could not load your profile',
        message: toAppError(error).message,
        iconPaths: Icons.alert,
        action: Button({ label: 'Try again', variant: 'secondary', onClick: load }),
      })));
    }
  }

  return root;
}

function render(data) {
  const { member, stats, calendar, milestones, level, joinDate } = data;
  const platform = getPlatform(member.platform);
  // `member.profile` returns { totalEarned, totalAvailable, recent } — `recent`
  // is already the earned list, newest first. There is no `milestones.milestones`;
  // reading one crashed this screen on every load until Phase 10.
  const earned = milestones.recent || [];

  return el('div', { class: 'ft-stack ft-gap-6' }, [
    /* Identity */
    Card({}, [
      el('div', { class: 'ft-profile-head' }, [
        Avatar({ name: member.fullName, size: 'xl' }),
        el('div', { class: 'ft-profile-head__body' }, [
          el('h1', { class: 'ft-profile-head__name', text: member.fullName }),
          el('p', { class: 'ft-profile-head__username', text: `@${member.username}` }),
          el('div', { class: 'ft-profile-head__chips' }, [
            LevelChip({ name: level.name, iconId: level.iconId, size: 'sm' }),
          ]),
        ]),
      ]),

      el('dl', { class: 'ft-profile-facts' }, [
        Fact('Platform', platform.label, platform.iconPaths, platform.color),
        Fact('Weekly goal', goalLabel(member.weeklyGoal), Icons.target),
        Fact('Member since', date(joinDate, { withYear: true }), Icons.calendar),
      ]),
    ]),

    /* Numbers */
    Section({ title: 'Posting statistics' }, [
      el('div', { class: 'ft-grid ft-grid--4' }, [
        StatCard({ label: 'Lifetime posts', value: number(stats.allTimePosts), iconPaths: Icons.fileText }),
        StatCard({ label: 'Active days', value: number(stats.activeDays), iconPaths: Icons.calendarCheck }),
        StatCard({ label: 'Goal weeks', value: number(stats.perfectWeeks), iconPaths: Icons.checkCircle }),
        StatCard({
          label: 'Longest streak',
          value: stats.longestWeekStreak,
          meta: plural(stats.longestWeekStreak, 'week'),
          iconPaths: Icons.medal,
        }),
      ]),
    ]),

    /* Calendar */
    Section({ title: 'Activity' }, Card({}, ActivityCalendar({
      from: calendar.from,
      to: calendar.to,
      counts: calendar.counts,
      today: calendar.today,
    }))),

    /* Milestones earned */
    Section(
      {
        title: 'Milestones earned',
        action: el('a', { class: 'ft-section__action', attrs: { href: '#/milestones' }, text: 'See all' }),
      },
      earned.length
        ? el(
            'div',
            { class: 'ft-profile-medals' },
            earned.map((milestone) =>
              el(
                'button',
                {
                  class: 'ft-profile-medals__item',
                  type: 'button',
                  attrs: { 'aria-label': milestone.name },
                  on: { click: () => openMilestoneModal(milestone) },
                },
                [
                  MilestoneBadge({
                    iconId: milestone.iconId,
                    unlocked: true,
                    rarity: milestone.rarity,
                    size: 'sm',
                  }),
                  el('span', { class: 'ft-profile-medals__name', text: milestone.name }),
                ],
              ),
            ),
          )
        : Card({}, EmptyState({
            title: 'No milestones yet',
            message: 'Your first one unlocks the moment you log a post.',
            iconPaths: Icons.medal,
            action: Button({ label: 'Log a post', size: 'sm', onClick: () => navigate('/submit') }),
          })),
    ),

    /* Account */
    Section({ title: 'Account' }, Card({}, [
      el('div', { class: 'ft-stack ft-gap-5' }, [
        DisplayNameControl(member),
        ConsentControl(member),

        el('p', {
          class: 'ft-text-sm ft-text-muted',
          text: 'Need your username, platform, or goal changed? Message the team and we will sort it.',
        }),
        Button({
          label: 'Log out',
          variant: 'secondary',
          block: true,
          iconPaths: Icons.logout,
          onClick: async () => {
            const confirmed = await confirmModal({
              title: 'Log out?',
              message: 'Your streak stays exactly where it is. You will need your PIN to get back in.',
              confirmLabel: 'Log out',
            });

            if (!confirmed) return;

            await call('auth.logout').catch(() => {});
            clearSession();
            navigate('/login', { replace: true });
          },
        }),
      ]),
    ])),
  ]);
}

function Fact(label, value, iconPaths, color) {
  return el('div', { class: 'ft-profile-facts__item' }, [
    el('dt', { class: 'ft-profile-facts__label' }, [
      iconPaths
        ? el('span', { class: 'ft-profile-facts__icon', style: color ? { color } : undefined }, icon(iconPaths))
        : null,
      el('span', { text: label }),
    ]),
    el('dd', { class: 'ft-profile-facts__value', text: value }),
  ]);
}

/* -------------------------------------------------------------------------
 * Account controls
 *
 * Both wrap endpoints that shipped in Phase 5a and had no caller. They live
 * inside the Account section that already existed rather than in a new screen:
 * this is wiring, not a redesign.
 * ---------------------------------------------------------------------- */

/**
 * Edit the display name.
 *
 * `FullName` is display-only and freely duplicable — two Davids are fine — so
 * unlike the username it needs no admin involvement. The Account copy already
 * directed members to the team for username, platform and goal; the name was
 * never on that list because it was never meant to be.
 *
 * Length is validated server-side. The button simply stays disabled until the
 * value actually differs, so a no-op save cannot be submitted.
 */
function DisplayNameControl(member) {
  let value = member.fullName;
  let busy = false;

  const input = Input({
    name: 'fullName',
    value: member.fullName,
    autocomplete: 'name',
    onInput: (next) => {
      value = next;
      field.update({ error: null });
      save.update({ disabled: busy || next.trim() === member.fullName || !next.trim() });
    },
  });

  const field = Field({
    label: 'Display name',
    control: input,
    hint: 'How your name appears on the leaderboard and in shoutouts.',
  });

  const save = Button({
    label: 'Save name',
    variant: 'secondary',
    size: 'sm',
    disabled: true,
    onClick: async () => {
      const next = value.trim();
      if (busy || next === member.fullName) return;

      busy = true;
      save.update({ loading: true });

      try {
        const data = await call('member.updateName', { fullName: next });
        member.fullName = data.member.fullName;
        input.update({ value: member.fullName });
        toastSuccess('Name updated.');
      } catch (error) {
        field.update({ error: toAppError(error).message });
      } finally {
        busy = false;
        save.update({ loading: false, disabled: true });
      }
    },
  });

  return el('div', { class: 'ft-stack ft-gap-3' }, [field, el('div', {}, save)]);
}

/**
 * Feature consent.
 *
 * Consent defaults to false, gates every shoutout list, and was collected once
 * at registration with no way to revoke it. A permission that cannot be
 * withdrawn is not really a permission, and Tunde — the member who reads
 * everything and comments on nothing — is exactly who it was written for.
 *
 * Saves on toggle. On failure the switch snaps back, so what is on screen is
 * never a claim the server has not agreed to.
 */
function ConsentControl(member) {
  let busy = false;

  const control = Switch({
    label: 'Let the team feature me in shoutouts',
    checked: Boolean(member.consentFeature),
    onChange: async (checked) => {
      if (busy) return;
      busy = true;

      try {
        const data = await call('member.updateConsent', { consentFeature: checked });
        member.consentFeature = data.consentFeature;
        toastSuccess(data.consentFeature ? 'You can be featured.' : 'You will not be featured.');
      } catch (error) {
        control.update({ checked: !checked });
        toastError(toAppError(error).message);
      } finally {
        busy = false;
      }
    },
  });

  return el('div', { class: 'ft-stack ft-gap-2' }, [
    control,
    el('p', {
      class: 'ft-text-sm ft-text-muted',
      text: 'Off means your name stays out of FlowMate of the Week and every public shoutout. Your streak, calendar and leaderboard position are unaffected.',
    }),
  ]);
}

function Loading() {
  return el('div', { class: 'ft-stack ft-gap-6' }, [
    Card({}, el('div', { class: 'ft-row ft-gap-4' }, [
      Skeleton({ variant: 'circle', width: '5rem', height: '5rem' }),
      el('div', { class: 'ft-grow ft-stack ft-gap-2' }, [
        Skeleton({ variant: 'title', width: '50%' }),
        Skeleton({ variant: 'text', width: '30%' }),
      ]),
    ])),
    el('div', { class: 'ft-grid ft-grid--4' },
      Array.from({ length: 4 }, () => Skeleton({ variant: 'card', height: '5.5rem' }))),
  ]);
}
