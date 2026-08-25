/**
 * Audit & Logs.
 *
 * Read-only, and Super Admin only. An audit log a Community Manager could edit
 * would not be an audit log — and one they could not read is still a record
 * they might want to alter, which is why it is the narrower permission.
 *
 * @module features/admin/audit
 */

import { el } from '../../core/dom.js';
import { mount } from '../../core/component.js';
import { call } from '../../core/api.js';
import { toAppError } from '../../core/errors.js';
import { Badge, Button, Card, EmptyState } from '../../components/ui/index.js';
import { PageHeader } from '../../components/layout/index.js';
import { DataTable, FilterBar, TableSkeleton } from '../../components/data/index.js';
import { Icons } from '../../lib/icons.js';
import { dateTime } from '../../lib/format.js';
import { ErrorState, RoleBadge } from './shared.js';

/**
 * Human labels for the actions the server records.
 *
 * An unmapped action still renders — its raw name is shown — so a new audit
 * action added later is visible immediately rather than silently blank.
 */
const ACTION_LABELS = {
  LOGIN: 'Logged in',
  LOGIN_FAILED: 'Failed login',
  LOGOUT: 'Logged out',
  REGISTER: 'Registered',
  PIN_CHANGE: 'Changed own PIN',
  PIN_RESET: 'Reset a PIN',
  MEMBER_UPDATE: 'Edited a member',
  MEMBER_STATUS: 'Changed member status',
  MEMBER_READ: 'Viewed a member profile',
  MEMBER_DELETE: 'Deleted a member',
  ROLE_CHANGE: 'Changed a role',
  SUBMISSION_VOID: 'Voided a submission',
  INVITE_CREATE: 'Generated invite codes',
  INVITE_REVOKE: 'Revoked an invite code',
  SETTINGS_UPDATE: 'Changed a setting',
  FORBIDDEN: 'Blocked attempt',
  RECONCILE: 'Rebuilt member stats',
  ROLLUP_PENDING: 'Stats lagged behind',
  ROLLUP_REPAIRED: 'Stats repaired',
  WEEK_CLOSE: 'Week closed',
  RECONCILE_COMPLETE: 'Nightly reconcile',
  SEED_SUPER_ADMIN: 'Seeded Super Admin',
};

/** Which groups a filter offers, and which actions belong to each. */
const GROUPS = {
  member: ['MEMBER_UPDATE', 'MEMBER_STATUS', 'MEMBER_DELETE', 'MEMBER_READ', 'ROLE_CHANGE'],
  security: ['PIN_RESET', 'PIN_CHANGE', 'LOGIN_FAILED', 'FORBIDDEN'],
  invites: ['INVITE_CREATE', 'INVITE_REVOKE'],
  settings: ['SETTINGS_UPDATE'],
  system: ['WEEK_CLOSE', 'RECONCILE', 'RECONCILE_COMPLETE', 'ROLLUP_PENDING', 'ROLLUP_REPAIRED'],
};

export default function AdminAuditView() {
  const root = el('div');
  const state = { group: '' };

  const controls = el('div', { class: 'ft-admin-controls' });
  const results = el('div');
  let rows = [];

  mount(root, el('div', { class: 'ft-stack ft-gap-5' }, [
    PageHeader({
      title: 'Audit log',
      subtitle: 'Who did what. Read-only, and never edited.',
      actions: [
        Button({ label: 'Refresh', variant: 'ghost', size: 'sm', iconPaths: Icons.refresh, onClick: load }),
      ],
    }),
    controls,
    results,
  ]));

  renderControls();
  load();

  function renderControls() {
    mount(controls, FilterBar({
      filters: [
        {
          key: 'group',
          label: 'Category',
          value: state.group,
          options: [
            { value: 'member', label: 'Member changes' },
            { value: 'security', label: 'PIN and access' },
            { value: 'invites', label: 'Invite codes' },
            { value: 'settings', label: 'Settings' },
            { value: 'system', label: 'System jobs' },
          ],
        },
      ],
      onChange: (key, value) => {
        state.group = value;
        renderControls();
        renderRows();
      },
      onReset: () => {
        state.group = '';
        renderControls();
        renderRows();
      },
    }));
  }

  async function load() {
    mount(results, Card({ flush: true }, TableSkeleton(4)));

    try {
      const data = await call('admin.audit.list', { limit: 250 });
      rows = data.entries;
      renderRows();
    } catch (error) {
      mount(results, ErrorState(toAppError(error), load));
    }
  }

  /**
   * Filtering happens client-side.
   *
   * The server returns a bounded 250 rows, so filtering locally is instant and
   * costs no round trip — the right trade at this size.
   */
  function renderRows() {
    const allowed = state.group ? GROUPS[state.group] : null;
    const filtered = allowed
      ? rows.filter((row) => allowed.indexOf(row.action) !== -1)
      : rows;

    if (!filtered.length) {
      mount(results, Card({}, EmptyState({
        title: state.group ? 'Nothing in this category yet' : 'No activity recorded yet',
        message: 'Entries appear here as members and admins use the app.',
        illustration: 'noActivity',
      })));
      return;
    }

    mount(results, el('div', { class: 'ft-stack ft-gap-3' }, [
      Card({ flush: true }, DataTable({
        columns: [
          {
            key: 'timestamp',
            label: 'When',
            primary: true,
            render: (row) => dateTime(row.timestamp),
          },
          {
            key: 'action',
            label: 'Action',
            primary: true,
            render: (row) => el('span', { class: 'ft-stack' }, [
              el('span', { text: ACTION_LABELS[row.action] || row.action }),
              row.result && row.result !== 'SUCCESS'
                ? Badge({
                    label: row.result,
                    tone: row.result === 'FAILURE' || row.result === 'DENIED' ? 'danger' : 'warning',
                  })
                : null,
            ]),
          },
          {
            key: 'actorRole',
            label: 'By',
            render: (row) => el('span', { class: 'ft-stack' }, [
              el('span', { class: 'ft-text-xs ft-text-muted', text: row.actorId || 'system' }),
              row.actorRole && row.actorRole !== 'System' ? RoleBadge(row.actorRole) : null,
            ]),
          },
          { key: 'targetId', label: 'Target', render: (row) => row.targetId || '—' },
          {
            key: 'details',
            label: 'Detail',
            render: (row) => row.details
              ? el('span', { class: 'ft-audit-detail', text: row.details })
              : '—',
          },
        ],
        rows: filtered,
        rowKey: (row) => `${row.timestamp}-${row.action}-${row.actorId}`,
      })),
      el('p', {
        class: 'ft-text-xs ft-text-muted ft-text-center',
        text: `Showing the ${filtered.length} most recent entries. The full history is in the AuditLog sheet.`,
      }),
    ]));
  }

  return root;
}
