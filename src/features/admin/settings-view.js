/**
 * Settings.
 *
 * Super Admin only. A Community Manager can read these — knowing the invite
 * expiry is useful when you are the one handing codes out — but cannot change
 * them. The server enforces that; this screen reflects it.
 *
 * @module features/admin/settings
 */

import { el } from '../../core/dom.js';
import { mount } from '../../core/component.js';
import { call } from '../../core/api.js';
import { toAppError } from '../../core/errors.js';
import { Button, Card, Field, Input, Switch, toastError, toastSuccess } from '../../components/ui/index.js';
import { PageHeader } from '../../components/layout/index.js';
import { Icons } from '../../lib/icons.js';
import { can } from '../../core/session.js';
import { ErrorState, LoadingPanel, Panel } from './shared.js';

/**
 * The settings this screen exposes, grouped as the approved spec names them.
 *
 * Deliberately a subset. `Settings` also holds hash iterations, session
 * lifetimes, and lockout thresholds — values where a careless edit degrades
 * security with no visible symptom. Those stay editable in the sheet by
 * someone who knows what they are doing, and out of a screen where they could
 * be changed by accident.
 */
const GROUPS = [
  {
    title: 'Founding member',
    description: 'Members who join on or before this date earn the Founding Member milestone.',
    keys: [
      { key: 'milestones.foundingPeriodEnd', label: 'Founding cutoff', type: 'date', hint: 'YYYY-MM-DD' },
    ],
  },
  {
    title: 'Invite codes',
    description: 'Defaults applied when you generate a batch.',
    keys: [
      { key: 'invite.expiryDays', label: 'Default expiry', type: 'number', hint: 'Days before an unused code stops working' },
      { key: 'invite.codeLength', label: 'Code length', type: 'number', hint: 'Characters. Longer is harder to type by hand' },
    ],
  },
  {
    title: 'Weekly goals',
    description: 'What a new member starts with.',
    keys: [
      { key: 'member.defaultWeeklyGoal', label: 'Default weekly goal', type: 'number', hint: 'Posts per week' },
    ],
  },
  {
    title: 'Community',
    description: 'How the product behaves for everyone.',
    keys: [
      { key: 'submission.duplicateWindowDays', label: 'Duplicate window', type: 'number', hint: 'Days before the same link can be logged again' },
      { key: 'submission.dailyCap', label: 'Daily post cap', type: 'number', hint: 'Most posts one member can log in a day' },
      { key: 'calendar.defaultWeeks', label: 'Calendar window', type: 'number', hint: 'Weeks shown on the activity calendar' },
      { key: 'metrics.consistencyScore.enabled', label: 'Consistency Score', type: 'boolean', hint: 'Paused until the calculation is agreed' },
    ],
  },
];

export default function AdminSettingsView() {
  const root = el('div');
  const editable = can('settings:update');

  mount(root, LoadingPanel());
  load();

  async function load() {
    try {
      mount(root, render(await call('admin.settings.get')));
    } catch (error) {
      mount(root, ErrorState(toAppError(error), load));
    }
  }

  function render(data) {
    const byKey = {};
    data.entries.forEach((entry) => { byKey[entry.key] = entry; });

    return el('div', { class: 'ft-stack ft-gap-6 ft-animate-in' }, [
      PageHeader({
        title: 'Settings',
        subtitle: editable
          ? 'Community configuration.'
          : 'Community configuration. Only a Super Admin can change these.',
      }),

      ...GROUPS.map((group) =>
        Card({}, Panel(group.title, el('div', { class: 'ft-stack ft-gap-4' }, [
          el('p', { class: 'ft-text-sm ft-text-muted', text: group.description }),
          ...group.keys.map((setting) => SettingRow(setting, byKey[setting.key], editable)),
        ]))),
      ),

      el('p', {
        class: 'ft-text-xs ft-text-muted ft-text-center',
        text: 'Security values — PIN hashing, session lifetimes, lockout thresholds — are set in the spreadsheet, not here.',
      }),
    ]);
  }

  return root;
}

/**
 * One editable setting.
 *
 * Saves on blur for text and number fields, and on change for switches.
 * A separate Save button per row would be a lot of buttons; a single Save for
 * the whole page would make it unclear what is unsaved.
 */
function SettingRow(setting, entry, editable) {
  const current = entry ? entry.value : '';

  if (setting.type === 'boolean') {
    const value = current === true || String(current).toLowerCase() === 'true';

    const toggle = Switch({
      label: setting.hint || setting.label,
      checked: value,
      disabled: !editable,
      onChange: (checked) => save(setting.key, checked, toggle),
    });

    return el('div', { class: 'ft-setting-row' }, [
      el('span', { class: 'ft-setting-row__label', text: setting.label }),
      toggle,
    ]);
  }

  const input = Input({
    value: String(current ?? ''),
    type: setting.type === 'number' ? 'text' : 'text',
    inputmode: setting.type === 'number' ? 'numeric' : undefined,
    disabled: !editable,
  });

  const field = Field({ label: setting.label, control: input, hint: setting.hint });

  if (editable) {
    input.input.addEventListener('blur', () => {
      const next = input.input.value.trim();
      if (String(next) === String(current ?? '')) return;
      save(setting.key, next, field);
    });
  }

  return field;
}

async function save(key, value, target) {
  try {
    await call('admin.settings.update', { key, value });
    toastSuccess('Saved.');
  } catch (error) {
    const appError = toAppError(error);

    if (target && typeof target.update === 'function') {
      target.update({ error: appError.message });
    }

    toastError(appError.message);
  }
}
