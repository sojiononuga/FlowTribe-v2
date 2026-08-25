/**
 * Invite Code Management.
 *
 * Registration is invite-gated, so this is the only way anyone joins. Codes
 * are single-use and expiring; the screen is built around generating a batch
 * and copying them out one at a time.
 *
 * @module features/admin/invites
 */

import { el, icon } from '../../core/dom.js';
import { mount } from '../../core/component.js';
import { call } from '../../core/api.js';
import { toAppError } from '../../core/errors.js';
import {
  Badge, Button, Card, EmptyState, Field, Input, Select,
  confirmModal, openModal, toastError, toastSuccess,
} from '../../components/ui/index.js';
import { PageHeader } from '../../components/layout/index.js';
import { DataTable, FilterBar, TableSkeleton } from '../../components/data/index.js';
import { Icons } from '../../lib/icons.js';
import { date, relative } from '../../lib/format.js';
import { ErrorState, ifCan } from './shared.js';

const STATUS_TONES = { Unused: 'success', Used: 'neutral', Revoked: 'danger', Expired: 'warning' };

export default function AdminInvitesView() {
  const root = el('div');
  const query = { status: '' };

  const controls = el('div', { class: 'ft-admin-controls' });
  const results = el('div');

  mount(root, el('div', { class: 'ft-stack ft-gap-5' }, [
    PageHeader({
      title: 'Invite codes',
      subtitle: 'The only way into the tribe.',
      actions: [
        ifCan('invite:create', () => Button({
          label: 'Generate codes',
          iconPaths: Icons.plus,
          onClick: () => openGenerate(load),
        })),
      ].filter(Boolean),
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
          key: 'status',
          label: 'Status',
          value: query.status,
          options: [
            { value: 'Unused', label: 'Unused' },
            { value: 'Used', label: 'Used' },
            { value: 'Revoked', label: 'Revoked' },
            { value: 'Expired', label: 'Expired' },
          ],
        },
      ],
      onChange: (key, value) => {
        query[key] = value;
        load();
        renderControls();
      },
      onReset: () => {
        query.status = '';
        load();
        renderControls();
      },
    }));
  }

  async function load() {
    mount(results, Card({ flush: true }, TableSkeleton(5)));

    try {
      mount(results, render(await call('admin.invites.list', { status: query.status })));
    } catch (error) {
      mount(results, ErrorState(toAppError(error), load));
    }
  }

  function render(data) {
    if (!data.entries.length) {
      return Card({}, EmptyState({
        title: query.status ? 'No codes with that status' : 'No invite codes yet',
        message: 'Generate a batch, then share them privately with the people you want in.',
        iconPaths: Icons.ticket,
        action: ifCan('invite:create', () => Button({
          label: 'Generate codes',
          size: 'sm',
          onClick: () => openGenerate(load),
        })),
      }));
    }

    const unused = data.entries.filter((entry) => entry.status === 'Unused').length;

    const columns = [
      {
        key: 'code',
        label: 'Code',
        primary: true,
        render: (row) => el('button', {
          class: 'ft-code-chip',
          type: 'button',
          attrs: { title: 'Copy to clipboard' },
          on: { click: () => copyCode(row.code) },
        }, [
          el('span', { class: 'ft-code-chip__value', text: row.code }),
          icon(Icons.files, { class: 'ft-code-chip__icon' }),
        ]),
      },
      {
        key: 'status',
        label: 'Status',
        primary: true,
        render: (row) => Badge({ label: row.status, tone: STATUS_TONES[row.status] || 'neutral' }),
      },
      { key: 'usedBy', label: 'Redeemed by', render: (row) => row.usedBy || '—' },
      {
        key: 'expiresAt',
        label: 'Expires',
        render: (row) => (row.status === 'Unused' ? relative(row.expiresAt) : date(row.expiresAt)),
      },
      { key: 'note', label: 'Note', render: (row) => row.note || '—' },
    ];

    const revokeColumn = ifCan('invite:revoke', () => ({
      key: 'actions',
      label: '',
      render: (row) => row.status === 'Unused'
        ? Button({
            label: 'Revoke',
            variant: 'ghost',
            size: 'sm',
            onClick: () => revoke(row, load),
          })
        : null,
    }));

    return el('div', { class: 'ft-stack ft-gap-3' }, [
      el('p', {
        class: 'ft-text-sm ft-text-muted',
        text: `${unused} unused of ${data.entries.length}. Each code works once.`,
      }),
      Card({ flush: true }, DataTable({
        columns: revokeColumn ? columns.concat(revokeColumn) : columns,
        rows: data.entries,
        rowKey: (row) => row.code,
      })),
    ]);
  }

  return root;
}

/* -------------------------------------------------------------------------
 * Actions
 * ---------------------------------------------------------------------- */

function openGenerate(reload) {
  const countSelect = Select({
    options: [1, 5, 10, 25, 50].map((n) => ({ value: n, label: `${n} code${n === 1 ? '' : 's'}` })),
    value: 5,
  });

  const expirySelect = Select({
    options: [7, 14, 30, 90].map((n) => ({ value: n, label: `${n} days` })),
    value: 14,
  });

  const noteInput = Input({ placeholder: 'e.g. August cohort' });

  const cancel = Button({ label: 'Cancel', variant: 'ghost' });
  const generate = Button({ label: 'Generate' });

  const modal = openModal({
    title: 'Generate invite codes',
    content: el('div', { class: 'ft-stack ft-gap-4' }, [
      Field({ label: 'How many', control: countSelect }),
      Field({ label: 'Valid for', control: expirySelect }),
      Field({ label: 'Note', control: noteInput, hint: 'Only you see this. Useful for remembering who a batch was for.' }),
    ]),
    actions: [cancel, generate],
  });

  cancel.addEventListener('click', () => modal.close());

  generate.addEventListener('click', async () => {
    generate.update({ loading: true });

    try {
      const result = await call('admin.invites.create', {
        count: Number(countSelect.value),
        expiresInDays: Number(expirySelect.value),
        note: noteInput.input ? noteInput.input.value : noteInput.value,
      });

      modal.close();
      showCodes(result.codes);
      reload();
    } catch (error) {
      toastError(toAppError(error).message);
      generate.update({ loading: false });
    }
  });
}

/**
 * Show the codes immediately after generating.
 *
 * They are listed again on the table, but surfacing them here means an admin
 * can copy the batch without hunting for which rows are new.
 */
function showCodes(codes) {
  const done = Button({ label: 'Done' });

  const modal = openModal({
    title: `${codes.length} code${codes.length === 1 ? '' : 's'} ready`,
    content: el('div', { class: 'ft-stack ft-gap-3' }, [
      el('p', {
        class: 'ft-text-sm ft-text-secondary',
        text: 'Tap a code to copy it. Each one works once, and they expire.',
      }),
      el('div', { class: 'ft-code-grid' }, codes.map((invite) =>
        el('button', {
          class: 'ft-code-chip ft-code-chip--lg',
          type: 'button',
          on: { click: () => copyCode(invite.code) },
        }, [
          el('span', { class: 'ft-code-chip__value', text: invite.code }),
          icon(Icons.files, { class: 'ft-code-chip__icon' }),
        ]),
      )),
      el('button', {
        class: 'ft-btn ft-btn--secondary ft-btn--block',
        type: 'button',
        text: 'Copy all',
        on: { click: () => copyCode(codes.map((c) => c.code).join('\n'), `${codes.length} codes copied.`) },
      }),
    ]),
    actions: [done],
  });

  done.addEventListener('click', () => modal.close());
}

async function revoke(row, reload) {
  const agreed = await confirmModal({
    title: 'Revoke this code?',
    message: `${row.code} will stop working. Anyone you already sent it to will not be able to register with it.`,
    confirmLabel: 'Revoke',
    destructive: true,
  });

  if (!agreed) return;

  try {
    await call('admin.invites.revoke', { code: row.code });
    toastSuccess('Code revoked.');
    reload();
  } catch (error) {
    toastError(toAppError(error).message);
  }
}

/**
 * Copy to clipboard, with a fallback.
 *
 * `navigator.clipboard` needs a secure context, which a local HTTP dev server
 * is not — so the older path stays as a fallback rather than the feature
 * simply failing outside production.
 */
function copyCode(text, message) {
  const done = () => toastSuccess(message || 'Copied.');

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(done).catch(fallback);
    return;
  }

  fallback();

  function fallback() {
    const scratch = document.createElement('textarea');
    scratch.value = text;
    scratch.setAttribute('readonly', '');
    scratch.style.position = 'fixed';
    scratch.style.opacity = '0';

    document.body.appendChild(scratch);
    scratch.select();

    try {
      document.execCommand('copy');
      done();
    } catch {
      toastError('Could not copy. Select the code and copy it manually.');
    }

    scratch.remove();
  }
}
