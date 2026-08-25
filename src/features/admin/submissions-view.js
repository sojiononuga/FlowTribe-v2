/**
 * Submission Management.
 *
 * Every logged post, filterable, with the link openable so a Community Manager
 * can actually review the content rather than only its metadata.
 *
 * @module features/admin/submissions
 */

import { el, icon } from '../../core/dom.js';
import { mount } from '../../core/component.js';
import { call } from '../../core/api.js';
import { toAppError } from '../../core/errors.js';
import { Button, Card, EmptyState, confirmModal, toastError, toastSuccess } from '../../components/ui/index.js';
import { PageHeader } from '../../components/layout/index.js';
import { DataTable, FilterBar, Pagination, SearchInput, TableSkeleton } from '../../components/data/index.js';
import { Icons } from '../../lib/icons.js';
import { dateTime, shortUrl, weekRange } from '../../lib/format.js';
import { PLATFORM_LIST, getPlatform } from '../../lib/platforms.js';
import { ErrorState, ifCan } from './shared.js';

export default function AdminSubmissionsView() {
  const root = el('div');
  const query = { search: '', platform: '', weekStart: '', page: 1 };

  const controls = el('div', { class: 'ft-admin-controls' });
  const results = el('div');

  mount(root, el('div', { class: 'ft-stack ft-gap-5' }, [
    PageHeader({ title: 'Submissions', subtitle: 'Everything the tribe has logged.' }),
    controls,
    results,
  ]));

  renderControls();
  load();

  function renderControls() {
    mount(controls, el('div', { class: 'ft-stack ft-gap-3' }, [
      SearchInput({
        placeholder: 'Search by member name or username',
        value: query.search,
        onSearch: (term) => {
          query.search = term;
          query.page = 1;
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
            key: 'weekStart',
            label: 'Week',
            value: query.weekStart,
            options: recentWeeks(8),
          },
        ],
        onChange: (key, value) => {
          query[key] = value;
          query.page = 1;
          load();
          renderControls();
        },
        onReset: () => {
          Object.assign(query, { platform: '', weekStart: '', page: 1 });
          load();
          renderControls();
        },
      }),
    ]));
  }

  async function load() {
    mount(results, Card({ flush: true }, TableSkeleton(5)));

    try {
      mount(results, render(await call('admin.submissions.list', {
        search: query.search,
        platform: query.platform,
        weekStart: query.weekStart,
        page: query.page,
        pageSize: 25,
      })));
    } catch (error) {
      mount(results, ErrorState(toAppError(error), load));
    }
  }

  function render(data) {
    if (!data.entries.length) {
      return Card({}, EmptyState({
        title: 'No submissions match',
        message: 'Try clearing the filters, or pick a different week.',
        illustration: 'noResults',
      }));
    }

    const columns = [
      {
        key: 'timestamp',
        label: 'When',
        primary: true,
        render: (row) => dateTime(row.timestamp),
      },
      {
        key: 'name',
        label: 'Member',
        primary: true,
        render: (row) => el('span', { class: 'ft-stack' }, [
          el('span', { class: 'ft-font-semibold ft-truncate', text: row.name }),
          el('span', { class: 'ft-text-xs ft-text-muted', text: `@${row.username}` }),
        ]),
      },
      {
        key: 'platform',
        label: 'Platform',
        render: (row) => {
          const platform = getPlatform(row.platform);
          return el('span', { class: 'ft-row ft-gap-2' }, [
            icon(platform.iconPaths, { style: { width: '1rem', height: '1rem', color: platform.color } }),
            el('span', { text: platform.label }),
          ]);
        },
      },
      {
        key: 'contentLink',
        label: 'Link',
        // Opens in a new tab with noopener — an external link from an admin
        // session should never get a handle back to this window.
        render: (row) => el('a', {
          class: 'ft-admin-link',
          attrs: { href: row.contentLink, target: '_blank', rel: 'noopener noreferrer' },
        }, [
          el('span', { class: 'ft-truncate', text: shortUrl(row.contentLink, 34) }),
          icon(Icons.link, { class: 'ft-admin-link__icon' }),
        ]),
      },
      { key: 'weekNumber', label: 'Week', numeric: true, render: (row) => `W${row.weekNumber}` },
    ];

    const voidColumn = ifCan('submission:void', () => ({
      key: 'actions',
      label: '',
      render: (row) => Button({
        label: 'Void',
        variant: 'ghost',
        size: 'sm',
        onClick: (event) => {
          event.stopPropagation();
          voidSubmission(row, load);
        },
      }),
    }));

    return el('div', { class: 'ft-stack ft-gap-3' }, [
      Card({ flush: true }, DataTable({
        columns: voidColumn ? columns.concat(voidColumn) : columns,
        rows: data.entries,
        rowKey: (row) => row.submissionId,
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
 * Void a submission.
 *
 * Voiding is not deleting: the row stays in the ledger marked `Voided`, and
 * every derived number is rebuilt without it. That keeps the history honest
 * and the correction reversible.
 */
async function voidSubmission(row, reload) {
  const agreed = await confirmModal({
    title: 'Void this submission?',
    message: `${row.name}'s post will stop counting toward their streak, totals, and the leaderboard. The record is kept, not deleted.`,
    confirmLabel: 'Void it',
    destructive: true,
  });

  if (!agreed) return;

  try {
    await call('admin.submissions.void', { submissionId: row.submissionId });
    toastSuccess('Voided. Their stats have been rebuilt.');
    reload();
  } catch (error) {
    toastError(toAppError(error).message);
  }
}

/**
 * The last N Mondays, as filter options.
 *
 * Computed client-side because it is a calendar fact, not a business rule —
 * no round trip needed to know what last Monday was.
 */
function recentWeeks(count) {
  const options = [];
  const today = new Date();
  const monday = new Date(today);

  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));

  for (let i = 0; i < count; i += 1) {
    const value = monday.toISOString().slice(0, 10);
    options.push({ value, label: i === 0 ? `This week (${weekRange(value)})` : weekRange(value) });
    monday.setDate(monday.getDate() - 7);
  }

  return options;
}
