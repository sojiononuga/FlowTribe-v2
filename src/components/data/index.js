/**
 * Data components: table, pagination, filter bar, search.
 *
 * Used only by the admin app, but built on the same primitives and tokens as
 * the member app — the admin screens are the management interface of the same
 * product, not a second product.
 *
 * Nothing here fetches or knows about Flow Tribe's domain. A table takes
 * columns and rows; who supplies them is the view's business.
 *
 * @module components/data
 */

import { cx, el, icon, on } from '../../core/dom.js';
import { stateful } from '../../core/component.js';
import { Button, Skeleton } from '../ui/index.js';
import { Icons } from '../../lib/icons.js';

/* -------------------------------------------------------------------------
 * DataTable
 * ---------------------------------------------------------------------- */

/**
 * @typedef {Object} Column
 * @property {string} key
 * @property {string} label
 * @property {Function} [render]   (row) => Node|string. Defaults to row[key]
 * @property {boolean} [numeric]   Right-aligned, tabular figures
 * @property {boolean} [primary]   Never hidden on narrow screens
 * @property {string} [width]
 */

/**
 * A responsive table.
 *
 * Below the tablet breakpoint it becomes a stack of cards: a table squeezed
 * onto a phone is unreadable, and horizontal scrolling hides the columns that
 * matter. Each cell carries its column label as a `data-label`, which the CSS
 * shows in card mode — so one markup structure serves both.
 *
 * @param {Object} props
 * @param {Column[]} props.columns
 * @param {Object[]} props.rows
 * @param {Function} [props.onRowClick]  (row) => void
 * @param {Function} [props.rowKey]      (row) => string
 * @param {Node} [props.empty]           Shown when there are no rows
 * @returns {HTMLElement}
 */
export function DataTable(props) {
  const { columns, rows, onRowClick, rowKey, empty } = props;

  if (!rows.length && empty) return el('div', { class: 'ft-table-empty' }, empty);

  const head = el(
    'thead',
    {},
    el(
      'tr',
      {},
      columns.map((column) =>
        el('th', {
          class: cx(column.numeric && 'ft-table__cell--numeric'),
          style: column.width ? { width: column.width } : undefined,
          attrs: { scope: 'col' },
          text: column.label,
        }),
      ),
    ),
  );

  const body = el(
    'tbody',
    {},
    rows.map((row) => {
      const cells = columns.map((column) => {
        const content = column.render ? column.render(row) : row[column.key];

        return el(
          'td',
          {
            class: cx(
              column.numeric && 'ft-table__cell--numeric',
              column.primary && 'ft-table__cell--primary',
            ),
            // Read by CSS in card mode, so the label travels with the value.
            dataset: { label: column.label },
          },
          content === null || content === undefined ? '—' : content,
        );
      });

      return el(
        'tr',
        {
          class: cx(onRowClick && 'ft-table__row--interactive'),
          dataset: rowKey ? { key: rowKey(row) } : undefined,
          attrs: onRowClick ? { tabindex: '0', role: 'button' } : undefined,
          on: onRowClick
            ? {
                click: () => onRowClick(row),
                keydown: (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onRowClick(row);
                  }
                },
              }
            : {},
        },
        cells,
      );
    }),
  );

  return el('div', { class: 'ft-table-wrap' }, el('table', { class: 'ft-table' }, [head, body]));
}

/**
 * Skeleton rows shaped like the table they stand in for.
 *
 * @param {number} columns
 * @param {number} [rows=6]
 * @returns {HTMLElement}
 */
export function TableSkeleton(columns, rows = 6) {
  return el(
    'div',
    { class: 'ft-table-skeleton' },
    Array.from({ length: rows }, () =>
      el(
        'div',
        { class: 'ft-table-skeleton__row' },
        Array.from({ length: columns }, (unused, index) =>
          Skeleton({ variant: 'text', width: index === 0 ? '38%' : '14%' }),
        ),
      ),
    ),
  );
}

/* -------------------------------------------------------------------------
 * Pagination
 * ---------------------------------------------------------------------- */

/**
 * @param {Object} props
 * @param {number} props.page      1-based
 * @param {number} props.pageSize
 * @param {number} props.total
 * @param {Function} props.onChange  (page) => void
 * @returns {HTMLElement}
 */
export function Pagination(props) {
  const { page, pageSize, total, onChange } = props;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  if (total === 0) return el('div');

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return el('div', { class: 'ft-pagination' }, [
    el('span', {
      class: 'ft-pagination__summary',
      text: `${first}–${last} of ${total}`,
    }),
    el('div', { class: 'ft-row ft-gap-2' }, [
      Button({
        label: 'Previous',
        variant: 'ghost',
        size: 'sm',
        disabled: page <= 1,
        onClick: () => onChange(page - 1),
      }),
      Button({
        label: 'Next',
        variant: 'ghost',
        size: 'sm',
        disabled: page >= pages,
        onClick: () => onChange(page + 1),
      }),
    ]),
  ]);
}

/* -------------------------------------------------------------------------
 * SearchInput
 * ---------------------------------------------------------------------- */

/**
 * A debounced search box.
 *
 * Debounced because every keystroke would otherwise be a request to Apps
 * Script, which is both slow and rate-limited. 300ms is long enough to batch a
 * word and short enough to feel immediate.
 *
 * @param {Object} props
 * @param {string} [props.placeholder]
 * @param {string} [props.value]
 * @param {Function} props.onSearch  (term) => void
 * @returns {HTMLElement}
 */
export function SearchInput(props) {
  const { placeholder = 'Search', value = '', onSearch } = props;
  let timer = null;

  const control = el('input', {
    class: 'ft-input ft-search__input',
    type: 'search',
    value,
    placeholder,
    attrs: { 'aria-label': placeholder, autocomplete: 'off' },
  });

  const cleanups = [
    on(control, 'input', () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => onSearch(control.value.trim()), 300);
    }),
    on(control, 'keydown', (event) => {
      if (event.key !== 'Enter') return;
      // Enter means "now", so the debounce is skipped rather than waited out.
      if (timer) clearTimeout(timer);
      onSearch(control.value.trim());
    }),
  ];

  const node = el('div', { class: 'ft-search' }, [
    el('span', { class: 'ft-search__icon' }, icon(Icons.search)),
    control,
  ]);

  node.input = control;

  return stateful(node, {
    cleanups,
    destroy: () => timer && clearTimeout(timer),
  });
}

/* -------------------------------------------------------------------------
 * FilterBar
 * ---------------------------------------------------------------------- */

/**
 * A row of dropdown filters, each with an "any" option.
 *
 * @param {Object} props
 * @param {Array<{key, label, options: Array<{value,label}>, value}>} props.filters
 * @param {Function} props.onChange  (key, value) => void
 * @param {Function} [props.onReset]
 * @returns {HTMLElement}
 */
export function FilterBar(props) {
  const { filters, onChange, onReset } = props;
  const active = filters.filter((filter) => filter.value).length;

  return el('div', { class: 'ft-filterbar' }, [
    ...filters.map((filter) =>
      el('label', { class: 'ft-filterbar__field' }, [
        el('span', { class: 'ft-filterbar__label', text: filter.label }),
        el(
          'select',
          {
            class: 'ft-select ft-select--sm',
            on: { change: (event) => onChange(filter.key, event.target.value) },
          },
          [
            el('option', { value: '', text: `Any ${filter.label.toLowerCase()}`, selected: !filter.value }),
            ...filter.options.map((option) =>
              el('option', {
                value: String(option.value),
                text: option.label,
                selected: String(option.value) === String(filter.value),
              }),
            ),
          ],
        ),
      ]),
    ),

    active > 0 && onReset
      ? Button({ label: 'Clear', variant: 'ghost', size: 'sm', onClick: onReset })
      : null,
  ]);
}

/* -------------------------------------------------------------------------
 * DetailList — a labelled key/value block
 * ---------------------------------------------------------------------- */

/**
 * @param {Array<{label: string, value: Node|string}>} items
 * @returns {HTMLElement}
 */
export function DetailList(items) {
  return el(
    'dl',
    { class: 'ft-detail-list' },
    items.map((item) =>
      el('div', { class: 'ft-detail-list__item' }, [
        el('dt', { class: 'ft-detail-list__label', text: item.label }),
        el('dd', { class: 'ft-detail-list__value' }, item.value ?? '—'),
      ]),
    ),
  );
}
