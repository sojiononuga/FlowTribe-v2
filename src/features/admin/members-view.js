/**
 * Member Management — the list.
 *
 * Search, filter, and open a member. Contact details are deliberately absent
 * here: revealing a phone number should be a deliberate act on a member's own
 * page, not a side effect of scrolling a table.
 *
 * @module features/admin/members
 */

import { el } from '../../core/dom.js';
import { mount } from '../../core/component.js';
import { call } from '../../core/api.js';
import { toAppError } from '../../core/errors.js';
import { Card, EmptyState } from '../../components/ui/index.js';
import { PageHeader } from '../../components/layout/index.js';
import { DataTable, FilterBar, Pagination, SearchInput, TableSkeleton } from '../../components/data/index.js';
import { LevelChip, StreakFlame } from '../../components/brand/index.js';
import { Icons } from '../../lib/icons.js';
import { date, number } from '../../lib/format.js';
import { PLATFORM_LIST, WEEKLY_GOALS } from '../../lib/platforms.js';
import { navigate } from '../../app/navigation.js';
import { ErrorState, StatusBadge, RoleBadge } from './shared.js';

export default function AdminMembersView() {
  const root = el('div');

  // Query state lives here, not in the URL, so a filter change does not push a
  // history entry for every keystroke.
  const query = { search: '', platform: '', status: '', weeklyGoal: '', role: '', page: 1 };

  const results = el('div');
  const controls = el('div', { class: 'ft-admin-controls' });

  mount(root, el('div', { class: 'ft-stack ft-gap-5' }, [
    PageHeader({ title: 'Members', subtitle: 'Everyone in the tribe.' }),
    controls,
    results,
  ]));

  renderControls();
  load();

  function renderControls() {
    mount(controls, el('div', { class: 'ft-stack ft-gap-3' }, [
      SearchInput({
        placeholder: 'Search by name or username',
        value: query.search,
        onSearch: (term) => {
          query.search = term;
          query.page = 1; // A new search always starts at page one.
          load();
        },
      }),
      FilterBar({
        filters: [
          {
            key: 'platform',
            label: 'Platform',
            value: query.platform,
            options: PLATFORM_LIST.map((p) => ({ value: p.id, label: p.label })),
          },
          {
            key: 'status',
            label: 'Status',
            value: query.status,
            options: [
              { value: 'Active', label: 'Active' },
              { value: 'Inactive', label: 'Paused' },
            ],
          },
          {
            key: 'weeklyGoal',
            label: 'Goal',
            value: query.weeklyGoal,
            options: WEEKLY_GOALS.map((g) => ({ value: g.value, label: g.label })),
          },
          {
            key: 'role',
            label: 'Role',
            value: query.role,
            options: [
              { value: 'Member', label: 'Member' },
              { value: 'CommunityManager', label: 'Community Manager' },
              { value: 'SuperAdmin', label: 'Super Admin' },
            ],
          },
        ],
        onChange: (key, value) => {
          query[key] = value;
          query.page = 1;
          load();
          renderControls();
        },
        onReset: () => {
          Object.assign(query, { platform: '', status: '', weeklyGoal: '', role: '', page: 1 });
          load();
          renderControls();
        },
      }),
    ]));
  }

  async function load() {
    mount(results, Card({ flush: true }, TableSkeleton(6)));

    try {
      const data = await call('admin.members.list', {
        search: query.search,
        platform: query.platform,
        status: query.status,
        weeklyGoal: query.weeklyGoal,
        role: query.role,
        page: query.page,
        pageSize: 25,
      });

      mount(results, render(data));
    } catch (error) {
      mount(results, ErrorState(toAppError(error), load));
    }
  }

  function render(data) {
    if (!data.entries.length) {
      return Card({}, EmptyState({
        title: query.search ? 'No members match that' : 'No members yet',
        message: query.search
          ? 'Try a different name, or clear the filters.'
          : 'Members appear here as they register with an invite code.',
        illustration: query.search ? 'noResults' : 'noActivity',
      }));
    }

    return el('div', { class: 'ft-stack ft-gap-3' }, [
      Card({ flush: true }, DataTable({
        columns: COLUMNS,
        rows: data.entries,
        rowKey: (row) => row.memberId,
        onRowClick: (row) => navigate(`/members/${row.memberId}`),
      })),
      Pagination({
        page: data.page,
        pageSize: data.pageSize,
        total: data.total,
        onChange: (page) => {
          query.page = page;
          load();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },
      }),
    ]);
  }

  return root;
}

/**
 * Columns, in the order the approved spec lists them.
 *
 * `primary` marks the two that survive the card layout on a phone — name and
 * status are what an admin scans for.
 */
const COLUMNS = [
  {
    key: 'fullName',
    label: 'Name',
    primary: true,
    render: (row) => el('span', { class: 'ft-stack' }, [
      el('span', { class: 'ft-font-semibold ft-truncate', text: row.fullName }),
      el('span', { class: 'ft-text-xs ft-text-muted', text: `@${row.username}` }),
    ]),
  },
  { key: 'platform', label: 'Platform' },
  { key: 'joinDate', label: 'Joined', render: (row) => date(row.joinDate) },
  {
    key: 'flowLevelId',
    label: 'Level',
    render: (row) => LevelChip({ name: levelName(row.flowLevelId), iconId: row.flowLevelId, size: 'sm' }),
  },
  { key: 'weeklyGoal', label: 'Goal', numeric: true, render: (row) => `${row.weeklyGoal}/wk` },
  {
    key: 'currentWeekStreak',
    label: 'Streak',
    numeric: true,
    render: (row) => StreakFlame({ weeks: row.currentWeekStreak, active: row.currentWeekStreak > 0 }),
  },
  { key: 'allTimePosts', label: 'Posts', numeric: true, render: (row) => number(row.allTimePosts) },
  { key: 'role', label: 'Role', render: (row) => RoleBadge(row.role) },
  { key: 'status', label: 'Status', primary: true, render: (row) => StatusBadge(row.status) },
];

/**
 * A readable level name from its id.
 *
 * The list endpoint returns `flowLevelId` only — sending the full level object
 * on every one of sixty rows would be repetition for a label. Title-casing the
 * id is enough here; the member's own page shows the real name and
 * description from the server.
 */
function levelName(levelId) {
  return String(levelId || '')
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
