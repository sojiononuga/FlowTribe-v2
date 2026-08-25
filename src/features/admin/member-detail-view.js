/**
 * Member Management — one member.
 *
 * Everything about a member, and every action that can be taken on them.
 *
 * Every action here is also enforced server-side. The capability checks below
 * hide controls that would fail anyway; they are not what keeps a Community
 * Manager out of Super-Admin operations.
 *
 * @module features/admin/member-detail
 */

import { el, icon } from '../../core/dom.js';
import { mount } from '../../core/component.js';
import { call } from '../../core/api.js';
import { toAppError } from '../../core/errors.js';
import {
  Button, Card, Field, Input, PinInput, Select, confirmModal, openModal,
  toastError, toastSuccess,
} from '../../components/ui/index.js';
import { PageHeader } from '../../components/layout/index.js';
import { ActivityCalendar, LevelChip, StatCard } from '../../components/brand/index.js';
import { DetailList } from '../../components/data/index.js';
import { Icons } from '../../lib/icons.js';
import { date, dateTime, number, shortUrl } from '../../lib/format.js';
import { PLATFORM_LIST, WEEKLY_GOALS, getPlatform } from '../../lib/platforms.js';
import { navigate } from '../../app/navigation.js';
import { ErrorState, LoadingPanel, Panel, RoleBadge, StatusBadge, ifCan } from './shared.js';

export default function AdminMemberDetailView(context) {
  const root = el('div');
  const memberId = context.params.id;

  mount(root, LoadingPanel());
  load();

  async function load() {
    try {
      mount(root, render(await call('admin.members.get', { memberId })));
    } catch (error) {
      mount(root, ErrorState(toAppError(error), load));
    }
  }

  function render(data) {
    const { member, profile, stats, recent } = data;
    const platform = getPlatform(member.platform);

    return el('div', { class: 'ft-stack ft-gap-6 ft-animate-in' }, [
      PageHeader({
        eyebrow: `@${member.username}`,
        title: member.fullName,
        subtitle: `Joined ${date(member.joinDate, { withYear: true })}`,
        actions: [
          Button({
            label: 'Back to members',
            variant: 'ghost',
            size: 'sm',
            iconPaths: Icons.chevronLeft,
            onClick: () => navigate('/members'),
          }),
        ],
      }),

      el('div', { class: 'ft-row ft-gap-2 ft-row--wrap' }, [
        StatusBadge(member.status),
        RoleBadge(member.role),
        LevelChip({ name: member.flowLevelId, iconId: member.flowLevelId, size: 'sm' }),
      ]),

      el('div', { class: 'ft-admin-metrics' }, [
        StatCard({ label: 'Total posts', value: number(member.allTimePosts), iconPaths: Icons.archive }),
        StatCard({ label: 'Current streak', value: member.currentWeekStreak, meta: 'weeks', iconPaths: Icons.flame }),
        StatCard({ label: 'Longest streak', value: member.longestWeekStreak, meta: 'weeks', iconPaths: Icons.medal }),
        StatCard({ label: 'Active days', value: number(stats.activeDays), iconPaths: Icons.calendarDays }),
        StatCard({ label: 'Perfect weeks', value: stats.perfectWeeks, iconPaths: Icons.checkCircle }),
        StatCard({
          label: 'Best rank',
          value: stats.bestRank ? `#${stats.bestRank}` : null,
          meta: stats.bestRank ? 'settled week' : 'no settled week yet',
          iconPaths: Icons.trophy,
        }),
      ]),

      Card({}, Panel('Details', DetailList([
        { label: 'Full name', value: member.fullName },
        { label: 'Username', value: `@${member.username}` },
        {
          label: 'Platform',
          value: el('span', { class: 'ft-row ft-gap-2' }, [
            icon(platform.iconPaths, { style: { width: '1rem', height: '1rem', color: platform.color } }),
            platform.label,
          ]),
        },
        { label: 'Weekly goal', value: `${member.weeklyGoal} posts a week` },
        { label: 'Joined', value: date(member.joinDate, { withYear: true }) },
        { label: 'Feature consent', value: member.consentFeature ? 'Yes' : 'Not given' },
        // Contact details appear only here, on the member's own page, and the
        // server logs this read as a PII access.
        { label: 'WhatsApp', value: profile.whatsapp || '—' },
        { label: 'Email', value: profile.email || '—' },
        { label: 'Bio', value: profile.bio || '—' },
      ]))),

      Card({}, Panel('Activity', ActivityCalendar({
        from: data.calendar ? data.calendar.from : null,
        to: data.calendar ? data.calendar.to : null,
        today: data.calendar ? data.calendar.today : null,
        counts: data.calendar ? data.calendar.counts : {},
        interactive: false,
      }))),

      Card({}, Panel('Recent submissions', recent.length
        ? el('ul', { class: 'ft-admin-recent' }, recent.map((row) =>
            el('li', { class: 'ft-admin-recent__row' }, [
              el('span', { class: 'ft-text-xs ft-text-muted', text: dateTime(row.timestamp) }),
              el('a', {
                class: 'ft-truncate',
                attrs: { href: row.contentLink, target: '_blank', rel: 'noopener noreferrer' },
                text: shortUrl(row.contentLink),
              }),
            ]),
          ))
        : el('p', { class: 'ft-text-sm ft-text-muted', text: 'Nothing logged yet.' }),
      )),

      Card({}, Panel('Actions', el('div', { class: 'ft-admin-actions' }, [
        ifCan('member:update', () => Button({
          label: 'Edit details',
          variant: 'secondary',
          iconPaths: Icons.edit,
          onClick: () => openEdit(member, load),
        })),

        ifCan('member:pin:reset', () => Button({
          label: 'Reset PIN',
          variant: 'secondary',
          iconPaths: Icons.lock,
          onClick: () => openResetPin(member, load),
        })),

        ifCan('member:status:set', () => Button({
          label: member.status === 'Active' ? 'Suspend member' : 'Reactivate member',
          variant: member.status === 'Active' ? 'danger' : 'primary',
          iconPaths: member.status === 'Active' ? Icons.eyeOff : Icons.check,
          onClick: () => toggleStatus(member, load),
        })),

        ifCan('member:role:set', () => Button({
          label: 'Change role',
          variant: 'ghost',
          iconPaths: Icons.shield,
          onClick: () => openRole(member, load),
        })),

        ifCan('member:update', () => Button({
          label: 'Recalculate stats',
          variant: 'ghost',
          iconPaths: Icons.refresh,
          onClick: () => reconcile(member, load),
        })),
      ]))),
    ]);
  }

  return root;
}

/* -------------------------------------------------------------------------
 * Actions
 * ---------------------------------------------------------------------- */

function openEdit(member, reload) {
  const nameInput = Input({ value: member.fullName });
  const usernameInput = Input({ value: member.username });

  const platformSelect = Select({
    options: PLATFORM_LIST.map((p) => ({ value: p.id, label: p.label })),
    value: member.platform,
  });

  const goalSelect = Select({
    options: WEEKLY_GOALS.map((g) => ({ value: g.value, label: g.label })),
    value: member.weeklyGoal,
  });

  const nameField = Field({ label: 'Full name', control: nameInput });
  const usernameField = Field({
    label: 'Username',
    control: usernameInput,
    hint: 'Members cannot change their own username. This is the only way it changes.',
  });
  const platformField = Field({ label: 'Preferred platform', control: platformSelect });
  const goalField = Field({ label: 'Weekly goal', control: goalSelect });

  const cancel = Button({ label: 'Cancel', variant: 'ghost' });
  const save = Button({ label: 'Save changes' });

  const modal = openModal({
    title: 'Edit member',
    content: el('div', { class: 'ft-stack ft-gap-4' }, [nameField, usernameField, platformField, goalField]),
    actions: [cancel, save],
  });

  cancel.addEventListener('click', () => modal.close());

  save.addEventListener('click', async () => {
    save.update({ loading: true });

    try {
      await call('admin.members.update', {
        memberId: member.memberId,
        fullName: nameInput.input ? nameInput.input.value : nameInput.value,
        username: usernameInput.input ? usernameInput.input.value : usernameInput.value,
        platform: platformSelect.value,
        weeklyGoal: Number(goalSelect.value),
      });

      modal.close();
      toastSuccess('Saved.');
      reload();
    } catch (error) {
      const appError = toAppError(error);
      // Field-scoped errors land on the field; everything else is a toast.
      if (appError.field === 'username') usernameField.update({ error: appError.message });
      else toastError(appError.message);
      save.update({ loading: false });
    }
  });
}

function openResetPin(member, reload) {
  const pin = PinInput({ ariaLabel: 'Temporary PIN' });

  const field = Field({
    label: 'Temporary PIN',
    control: pin,
    hint: `${member.fullName} will be asked to choose their own PIN at next login. Every active session ends immediately.`,
  });

  const cancel = Button({ label: 'Cancel', variant: 'ghost' });
  const confirm = Button({ label: 'Reset PIN', variant: 'danger' });

  const modal = openModal({ title: 'Reset PIN', content: field, actions: [cancel, confirm] });

  cancel.addEventListener('click', () => modal.close());

  confirm.addEventListener('click', async () => {
    const value = pin.getValue();

    if (value.length !== 6) {
      field.update({ error: 'A PIN is 6 digits.' });
      return;
    }

    confirm.update({ loading: true });

    try {
      await call('admin.members.resetPin', { memberId: member.memberId, tempPin: value });
      modal.close();
      toastSuccess('PIN reset. Share it with them privately.');
      reload();
    } catch (error) {
      field.update({ error: toAppError(error).message });
      confirm.update({ loading: false });
    }
  });
}

async function toggleStatus(member, reload) {
  const suspending = member.status === 'Active';

  const agreed = await confirmModal({
    title: suspending ? 'Suspend this member?' : 'Reactivate this member?',
    message: suspending
      ? `${member.fullName} will not be able to log in or submit posts. Their history is kept, and you can reactivate them at any time.`
      : `${member.fullName} will be able to log in again. They will need to log in fresh.`,
    confirmLabel: suspending ? 'Suspend' : 'Reactivate',
    destructive: suspending,
  });

  if (!agreed) return;

  try {
    await call('admin.members.setStatus', {
      memberId: member.memberId,
      status: suspending ? 'Inactive' : 'Active',
    });
    toastSuccess(suspending ? 'Member suspended.' : 'Member reactivated.');
    reload();
  } catch (error) {
    toastError(toAppError(error).message);
  }
}

function openRole(member, reload) {
  const select = Select({
    options: [
      { value: 'Member', label: 'Member' },
      { value: 'CommunityManager', label: 'Community Manager' },
      { value: 'SuperAdmin', label: 'Super Admin' },
    ],
    value: member.role,
  });

  const field = Field({
    label: 'Role',
    control: select,
    hint: 'A role change takes effect immediately and ends their current sessions.',
  });

  const cancel = Button({ label: 'Cancel', variant: 'ghost' });
  const save = Button({ label: 'Change role' });

  const modal = openModal({ title: 'Change role', content: field, actions: [cancel, save] });

  cancel.addEventListener('click', () => modal.close());

  save.addEventListener('click', async () => {
    save.update({ loading: true });

    try {
      await call('admin.members.setRole', { memberId: member.memberId, role: select.value });
      modal.close();
      toastSuccess('Role updated.');
      reload();
    } catch (error) {
      // The server refuses self-escalation and removing the last Super Admin.
      field.update({ error: toAppError(error).message });
      save.update({ loading: false });
    }
  });
}

async function reconcile(member, reload) {
  try {
    await call('admin.members.reconcile', { memberId: member.memberId });
    toastSuccess('Stats rebuilt from the submission history.');
    reload();
  } catch (error) {
    toastError(toAppError(error).message);
  }
}
