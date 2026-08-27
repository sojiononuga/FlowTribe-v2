/**
 * Activity Calendar.
 *
 * One square per calendar day, arranged in columns of weeks. Empty means no
 * post; filled means at least one. Today always carries a ring.
 *
 * This is meant to become as recognisable to Flow Tribe as the contribution
 * graph is to GitHub — so it is built to be *read*, not decorated. The eye
 * should catch the shape of a month before it reads a single number.
 *
 * WHAT THE COMPONENT DOES NOT KNOW
 * It never fetches, never knows what a member is, and never decides what
 * "filled" means. A `scale` function maps a count to a level, and the default
 * is binary. That single indirection is what makes the whole future list —
 * colour intensity, monthly view, yearly history, themes, overlays — a change
 * of props rather than a rewrite.
 *
 * @see docs/celebration-system.md §1
 * @module components/brand/activity-calendar
 */

import { cx, el, on } from '../../core/dom.js';
import { stateful } from '../../core/component.js';

const DAY_MS = 86400000;
const WEEKDAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Binary scale: any activity fills the square.
 *
 * Colour intensity later means passing a different function — no schema change,
 * no component change. The counts are already counts.
 *
 * @param {number} count
 * @returns {number} 0 or 1
 */
export const binaryScale = (count) => (count > 0 ? 1 : 0);

/**
 * Four-step intensity scale. Not used in v2; here to prove the seam works.
 *
 * @param {number} count
 * @returns {number} 0–4
 */
export const intensityScale = (count) => {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
};

/**
 * @param {Object} props
 * @param {string} props.from            ISO date, inclusive
 * @param {string} props.to              ISO date, inclusive
 * @param {Object<string, number>} props.counts   Sparse: dayKey → count
 * @param {string} [props.today]         ISO date to mark
 * @param {Function} [props.scale]       count → level. Defaults to binary
 * @param {Function} [props.onSelect]    ({ date, count }) on click or Enter
 * @param {boolean} [props.showLegend=true]
 * @returns {HTMLElement}
 */
export function ActivityCalendar(props) {
  const {
    from,
    to,
    counts = {},
    today = isoDay(new Date()),
    scale = binaryScale,
    onSelect,
    showLegend = true,
  } = props;

  const cleanups = [];
  const weeks = buildWeeks(from, to);

  // Live region so keyboard and screen-reader users get the same detail a
  // hover tooltip gives everyone else.
  const detail = el('p', {
    class: 'ft-calendar__detail',
    attrs: { 'aria-live': 'polite' },
    text: summarise(counts, weeks),
  });

  const grid = el('div', { class: 'ft-calendar__grid', attrs: { role: 'grid' } });

  // Weekday gutter. Only Mon/Wed/Fri are labelled — seven labels is noise at
  // this scale, and three is enough to orient.
  grid.appendChild(
    el(
      'div',
      { class: 'ft-calendar__weekdays', attrs: { 'aria-hidden': 'true' } },
      WEEKDAY_LABELS.map((label) => el('span', { class: 'ft-calendar__weekday', text: label })),
    ),
  );

  const columns = el('div', { class: 'ft-calendar__columns' });

  weeks.forEach((week, index) => {
    const column = el('div', { class: 'ft-calendar__week', attrs: { role: 'row' } });

    // A month label sits above the first column that begins a new month.
    const first = week.find(Boolean);
    const previous = index > 0 ? weeks[index - 1].find(Boolean) : null;
    const startsMonth = first && (!previous || first.getMonth() !== previous.getMonth());

    column.appendChild(
      el('span', {
        class: cx('ft-calendar__month', !startsMonth && 'ft-calendar__month--hidden'),
        attrs: { 'aria-hidden': 'true' },
        text: startsMonth ? MONTH_LABELS[first.getMonth()] : '',
      }),
    );

    week.forEach((date) => {
      if (!date) {
        column.appendChild(el('span', { class: 'ft-calendar__pad', attrs: { 'aria-hidden': 'true' } }));
        return;
      }

      const key = isoDay(date);
      const count = counts[key] || 0;
      const level = scale(count);
      const isToday = key === today;
      const isFuture = date > new Date();

      const cell = el('span', {
        class: cx(
          'ft-calendar__day',
          `ft-calendar__day--l${level}`,
          isToday && 'ft-calendar__day--today',
          isFuture && 'ft-calendar__day--future',
        ),
        dataset: { date: key, count: String(count) },
        attrs: {
          role: 'gridcell',
          // Only days with activity are tab-stops. Tabbing through 182 empty
          // squares to reach the next control is hostile.
          tabindex: count > 0 ? '0' : '-1',
          'aria-label': describe(date, count, isToday),
        },
      });

      cleanups.push(on(cell, 'mouseenter', () => { detail.textContent = describe(date, count, isToday); }));
      cleanups.push(on(cell, 'focus', () => { detail.textContent = describe(date, count, isToday); }));

      if (onSelect) {
        cleanups.push(on(cell, 'click', () => onSelect({ date: key, count })));
        cleanups.push(
          on(cell, 'keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelect({ date: key, count });
            }
          }),
        );
      }

      column.appendChild(cell);
    });

    columns.appendChild(column);
  });

  const scroller = el('div', { class: 'ft-calendar__scroller' }, columns);
  grid.appendChild(scroller);

  const node = el('div', { class: 'ft-calendar' }, [
    grid,
    el('div', { class: 'ft-calendar__footer' }, [
      detail,
      showLegend ? Legend(scale) : null,
    ]),
  ]);

  /**
   * Pin to the current week. A calendar that opens on four months ago answers
   * the wrong question.
   *
   * The component is built here and mounted by its view afterwards, so at this
   * point it has no layout and `scrollWidth` is 0 — a single
   * requestAnimationFrame fires too early. A ResizeObserver was the obvious
   * alternative and proved unreliable for a detached element that is attached
   * later, so this waits for measurable layout instead and gives up rather
   * than looping forever.
   */
  let attempts = 0;
  let timer = 0;

  const pin = () => {
    if (!node.isConnected || scroller.scrollWidth <= scroller.clientWidth) {
      // ~20 tries at 25ms is half a second: long enough for any mount, short
      // enough that a calendar which genuinely fits never keeps a timer alive.
      if (attempts++ < 20) timer = setTimeout(pin, 25);
      return;
    }
    scroller.scrollLeft = scroller.scrollWidth;
  };

  // setTimeout rather than requestAnimationFrame: rAF is suspended in a tab
  // that is not compositing, so a member who opens Flow Tribe in a background
  // tab would find the calendar scrolled to four months ago when they switch
  // to it.
  timer = setTimeout(pin, 0);
  cleanups.push(() => clearTimeout(timer));

  /** Re-pin on demand — used when a view changes the range. */
  node.scrollToToday = () => {
    scroller.scrollLeft = scroller.scrollWidth;
  };

  cleanups.push(
    on(node, 'mouseleave', () => {
      detail.textContent = summarise(counts, weeks);
    }),
  );

  return stateful(node, { cleanups });
}

/**
 * Legend. Rendered from the scale function itself, so a different scale
 * produces a matching legend with no second edit.
 */
function Legend(scale) {
  const levels = scale === binaryScale ? [0, 1] : [0, 1, 2, 3, 4];

  return el('div', { class: 'ft-calendar__legend', attrs: { 'aria-hidden': 'true' } }, [
    el('span', { class: 'ft-calendar__legend-label', text: 'Less' }),
    ...levels.map((level) => el('span', { class: `ft-calendar__day ft-calendar__day--l${level}` })),
    el('span', { class: 'ft-calendar__legend-label', text: 'More' }),
  ]);
}

/* -------------------------------------------------------------------------
 * Internals
 * ---------------------------------------------------------------------- */

/**
 * Build columns of seven, Monday-first, padding the leading and trailing
 * partial weeks with nulls so every column is the same height.
 *
 * @returns {Array<Array<Date|null>>}
 */
function buildWeeks(from, to) {
  const start = parseDay(from);
  const end = parseDay(to);

  // Back up to the Monday on or before `from`.
  const cursor = new Date(start);
  cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));

  const weeks = [];

  while (cursor <= end) {
    const week = [];

    for (let i = 0; i < 7; i += 1) {
      const date = new Date(cursor.getTime() + i * DAY_MS);
      week.push(date < start || date > end ? null : date);
    }

    weeks.push(week);
    cursor.setDate(cursor.getDate() + 7);
  }

  return weeks;
}

function parseDay(value) {
  const [year, month, day] = String(value).split('-').map(Number);
  return new Date(year, month - 1, day);
}

function isoDay(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * The tooltip and accessible label.
 *
 * Written as a sentence rather than "2026-07-27: 2" — the calendar is part of
 * the product's voice, not a data readout.
 */
function describe(date, count, isToday) {
  const when = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const day = isToday ? `Today, ${when}` : when;

  if (count === 0) return `${day} — nothing logged`;
  if (count === 1) return `${day} — 1 meaningful action`;
  return `${day} — ${count} meaningful actions`;
}

/** The resting message when nothing is hovered. */
function summarise(counts, weeks) {
  const active = Object.values(counts).filter((count) => count > 0).length;
  const days = weeks.flat().filter(Boolean).length;

  if (active === 0) return 'Your first square is one meaningful action away.';
  return `${active} active ${active === 1 ? 'day' : 'days'} in the last ${Math.round(days / 7)} weeks.`;
}

export default ActivityCalendar;
