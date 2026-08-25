/**
 * Charts.
 *
 * ── HAND-ROLLED SVG. THIS IS SETTLED ──────────────────────────────────────
 * Decision D22 originally approved Chart.js, vendored locally. It was never
 * vendored, and the SVG renderer written in its place was reviewed and kept:
 * FINAL_PRODUCT_DECISIONS.md §3 now locks it, and the Flow Tribe Design
 * System independently specifies SVG charts. Do NOT reintroduce Chart.js or
 * any other charting library.
 *
 * The adapter shape survives from D22 and still earns its keep: views ask for
 * "a line chart with this data and this title" and never touch a rendering
 * API, so the renderer stays replaceable without touching a single view.
 *
 * What the SVG renderer gives up: hover tooltips, animation, and the long
 * tail of chart types. What it gives back: no dependency, ~250 lines, and
 * charts that inherit the design tokens directly.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * @module components/charts
 */

import { el, svg } from '../../core/dom.js';
import { EmptyState } from '../ui/index.js';
import { Icons } from '../../lib/icons.js';

/** Chart geometry. One place, so every chart shares proportions. */
const VIEW = { width: 640, height: 220, padTop: 12, padRight: 8, padBottom: 26, padLeft: 34 };

const PLOT = {
  width: VIEW.width - VIEW.padLeft - VIEW.padRight,
  height: VIEW.height - VIEW.padTop - VIEW.padBottom,
};

/**
 * The categorical palette.
 *
 * Burgundy and gold lead because they are the brand; the rest are chosen to
 * stay distinguishable side by side without competing with them.
 */
const SERIES_COLORS = [
  'var(--ft-burgundy-600)',
  'var(--ft-gold-400)',
  'var(--ft-burgundy-400)',
  'var(--ft-gold-600)',
  'var(--ft-burgundy-300)',
];

/**
 * A titled chart container. Every chart goes through this, so headings,
 * spacing, and the empty state are identical across the analytics screen.
 *
 * @param {Object} props
 * @param {string} props.title
 * @param {string} [props.description]
 * @param {Node} [props.chart]
 * @param {boolean} [props.empty]
 * @returns {HTMLElement}
 */
export function ChartPanel(props) {
  const { title, description, chart, empty } = props;

  return el('section', { class: 'ft-chart-panel' }, [
    el('header', { class: 'ft-chart-panel__header' }, [
      el('h3', { class: 'ft-chart-panel__title', text: title }),
      description ? el('p', { class: 'ft-chart-panel__description', text: description }) : null,
    ]),
    empty
      ? EmptyState({
          title: 'Nothing to chart yet',
          message: 'This fills in as the community posts.',
          iconPaths: Icons.chart,
        })
      : el('div', { class: 'ft-chart-panel__body' }, chart),
  ]);
}

/**
 * Line chart, for a trend over time.
 *
 * @param {Object} props
 * @param {Array<{label: string, value: number}>} props.points
 * @param {string} [props.color]
 * @param {boolean} [props.area=true]  Fill beneath the line
 * @param {Function} [props.formatValue]
 * @returns {HTMLElement}
 */
export function LineChart(props) {
  const { points, color = SERIES_COLORS[0], area = true, formatValue = String } = props;
  if (!points.length) return el('div');

  const max = niceMax(Math.max(...points.map((p) => p.value)));
  const step = points.length > 1 ? PLOT.width / (points.length - 1) : 0;

  const coords = points.map((point, index) => ({
    x: VIEW.padLeft + index * step,
    y: VIEW.padTop + PLOT.height - (point.value / max) * PLOT.height,
    point,
  }));

  const line = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const baseline = VIEW.padTop + PLOT.height;

  return chartFrame(max, points, formatValue, [
    area
      ? svg('polygon', {
          attrs: {
            points: `${VIEW.padLeft},${baseline} ${line} ${VIEW.padLeft + (points.length - 1) * step},${baseline}`,
            fill: color,
            'fill-opacity': '0.12',
          },
        })
      : null,

    svg('polyline', {
      attrs: {
        points: line,
        fill: 'none',
        stroke: color,
        'stroke-width': '2.5',
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
      },
    }),

    // A dot per point, each with a native <title> so hovering names the value.
    // Not as rich as a Chart.js tooltip, but it needs no library and it is
    // announced by screen readers.
    ...coords.map((c) =>
      svg('circle', { attrs: { cx: c.x, cy: c.y, r: '3', fill: color } }, [
        svg('title', { text: `${shortLabel(c.point.label)}: ${formatValue(c.point.value)}` }),
      ]),
    ),
  ]);
}

/**
 * Bar chart, for discrete counts per period.
 *
 * @param {Object} props
 * @param {Array<{label: string, value: number}>} props.points
 * @param {string} [props.color]
 * @param {Function} [props.formatValue]
 * @returns {HTMLElement}
 */
export function BarChart(props) {
  const { points, color = SERIES_COLORS[0], formatValue = String } = props;
  if (!points.length) return el('div');

  const max = niceMax(Math.max(...points.map((p) => p.value)));
  const slot = PLOT.width / points.length;
  const barWidth = Math.max(3, Math.min(slot * 0.62, 30));

  return chartFrame(max, points, formatValue, points.map((point, index) => {
    const height = max > 0 ? (point.value / max) * PLOT.height : 0;
    const x = VIEW.padLeft + index * slot + (slot - barWidth) / 2;
    const y = VIEW.padTop + PLOT.height - height;

    return svg('rect', {
      attrs: {
        x: x.toFixed(1),
        y: y.toFixed(1),
        width: barWidth.toFixed(1),
        height: Math.max(height, point.value > 0 ? 2 : 0).toFixed(1),
        rx: '3',
        fill: color,
      },
    }, [svg('title', { text: `${shortLabel(point.label)}: ${formatValue(point.value)}` })]);
  }));
}

/**
 * Horizontal distribution bars.
 *
 * Chosen over a pie or donut deliberately: comparing lengths on a shared
 * baseline is more accurate than comparing angles, and the category labels fit
 * without a legend.
 *
 * @param {Object} props
 * @param {Array<{label: string, value: number}>} props.items
 * @param {Function} [props.formatValue]
 * @returns {HTMLElement}
 */
export function DistributionChart(props) {
  const { items, formatValue = String } = props;
  if (!items.length) return el('div');

  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
  const max = Math.max(...items.map((item) => item.value)) || 1;

  return el(
    'ul',
    { class: 'ft-distribution' },
    items.map((item, index) =>
      el('li', { class: 'ft-distribution__row' }, [
        el('span', { class: 'ft-distribution__label', text: item.label }),
        el('span', { class: 'ft-distribution__track' },
          el('span', {
            class: 'ft-distribution__fill',
            style: {
              width: `${(item.value / max) * 100}%`,
              background: SERIES_COLORS[index % SERIES_COLORS.length],
            },
          }),
        ),
        el('span', { class: 'ft-distribution__value' }, [
          el('span', { class: 'ft-numeral', text: formatValue(item.value) }),
          el('span', {
            class: 'ft-distribution__percent',
            text: `${Math.round((item.value / total) * 100)}%`,
          }),
        ]),
      ]),
    ),
  );
}

/**
 * Community activity heatmap: one column per week, one cell per weekday.
 *
 * The same visual language as a member's Activity Calendar, so an admin reads
 * community rhythm the way a member reads their own.
 *
 * @param {Object} props
 * @param {Array<{week: string, days: Array<{day, value, future}>}>} props.weeks
 * @returns {HTMLElement}
 */
export function HeatmapChart(props) {
  const { weeks } = props;
  if (!weeks.length) return el('div');

  const peak = Math.max(1, ...weeks.flatMap((week) => week.days.map((day) => day.value)));
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return el('div', { class: 'ft-heatmap' }, [
    el(
      'div',
      { class: 'ft-heatmap__days' },
      dayNames.map((name, index) =>
        el('span', {
          class: 'ft-heatmap__dayname',
          // Every other label, so they do not collide at small sizes.
          text: index % 2 === 0 ? name : '',
        }),
      ),
    ),

    el('div', { class: 'ft-heatmap__grid' },
      weeks.map((week) =>
        el('div', { class: 'ft-heatmap__week' },
          week.days.map((day) =>
            el('span', {
              class: `ft-heatmap__cell ft-heatmap__cell--l${day.future ? 'f' : intensity(day.value, peak)}`,
              attrs: {
                title: day.future
                  ? `${day.day} — not yet`
                  : `${day.day} — ${day.value} ${day.value === 1 ? 'post' : 'posts'}`,
              },
            }),
          ),
        ),
      ),
    ),

    el('div', { class: 'ft-heatmap__legend' }, [
      el('span', { class: 'ft-text-2xs ft-text-muted', text: 'Quieter' }),
      ...[0, 1, 2, 3, 4].map((level) =>
        el('span', { class: `ft-heatmap__cell ft-heatmap__cell--l${level}` }),
      ),
      el('span', { class: 'ft-text-2xs ft-text-muted', text: 'Busier' }),
    ]),
  ]);
}

/* -------------------------------------------------------------------------
 * Internals
 * ---------------------------------------------------------------------- */

/** Axes, gridlines, and the plot, in one frame. */
function chartFrame(max, points, formatValue, children) {
  const ticks = [0, 0.5, 1];

  return svg(
    'svg',
    {
      class: 'ft-chart',
      attrs: {
        viewBox: `0 0 ${VIEW.width} ${VIEW.height}`,
        preserveAspectRatio: 'none',
        role: 'img',
        'aria-label': `Chart with ${points.length} points, peak ${formatValue(max)}`,
      },
    },
    [
      ...ticks.map((tick) => {
        const y = VIEW.padTop + PLOT.height - tick * PLOT.height;
        return svg('g', {}, [
          svg('line', {
            attrs: {
              x1: VIEW.padLeft, y1: y, x2: VIEW.width - VIEW.padRight, y2: y,
              stroke: 'var(--ft-border-subtle)', 'stroke-width': '1',
            },
          }),
          svg('text', {
            class: 'ft-chart__axis',
            attrs: { x: VIEW.padLeft - 6, y: y + 3, 'text-anchor': 'end' },
            text: formatValue(Math.round(max * tick)),
          }),
        ]);
      }),

      ...children.filter(Boolean),

      // First, middle, and last labels only. A label per week is unreadable
      // over a year and adds nothing over three.
      ...[0, Math.floor(points.length / 2), points.length - 1]
        .filter((index, position, list) => list.indexOf(index) === position && points[index])
        .map((index) => {
          const x = VIEW.padLeft + (points.length > 1 ? (index / (points.length - 1)) * PLOT.width : 0);
          return svg('text', {
            class: 'ft-chart__axis',
            attrs: {
              x: Math.max(VIEW.padLeft, Math.min(x, VIEW.width - VIEW.padRight)),
              y: VIEW.height - 8,
              'text-anchor': index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle',
            },
            text: shortLabel(points[index].label),
          });
        }),
    ],
  );
}

/** Round an axis maximum up to something readable. */
function niceMax(value) {
  if (value <= 0) return 1;
  if (value <= 5) return 5;
  if (value <= 10) return 10;

  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  return Math.ceil(value / magnitude) * magnitude;
}

/** `2026-07-27` → `27 Jul`. */
function shortLabel(label) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(label));
  if (!match) return String(label);

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(match[3])} ${months[Number(match[2]) - 1]}`;
}

/** Map a count to one of four intensity steps. */
function intensity(value, peak) {
  if (value <= 0) return 0;
  const ratio = value / peak;
  if (ratio > 0.66) return 4;
  if (ratio > 0.33) return 3;
  if (ratio > 0.15) return 2;
  return 1;
}
