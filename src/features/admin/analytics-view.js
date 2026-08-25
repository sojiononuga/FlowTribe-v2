/**
 * Community Analytics.
 *
 * The seven charts the approved spec names, and no others. Every series is
 * derived from data the product already collects — no metric is invented here.
 *
 * @module features/admin/analytics
 */

import { el } from '../../core/dom.js';
import { mount } from '../../core/component.js';
import { call } from '../../core/api.js';
import { toAppError } from '../../core/errors.js';
import { Card, Skeleton } from '../../components/ui/index.js';
import { PageHeader } from '../../components/layout/index.js';
import {
  BarChart, ChartPanel, DistributionChart, HeatmapChart, LineChart,
} from '../../components/charts/index.js';
import { ErrorState } from './shared.js';

const RANGES = [
  { weeks: 8, label: '8 weeks' },
  { weeks: 12, label: '12 weeks' },
  { weeks: 26, label: '26 weeks' },
  { weeks: 52, label: '1 year' },
];

export default function AdminAnalyticsView() {
  const root = el('div');
  const state = { weeks: 12 };

  const controls = el('div');
  const body = el('div');

  mount(root, el('div', { class: 'ft-stack ft-gap-5' }, [
    PageHeader({ title: 'Analytics', subtitle: 'How the community is trending.' }),
    controls,
    body,
  ]));

  renderControls();
  load();

  function renderControls() {
    mount(controls, el('div', { class: 'ft-segmented' },
      RANGES.map((range) =>
        el('button', {
          class: `ft-segmented__option${state.weeks === range.weeks ? ' ft-segmented__option--active' : ''}`,
          type: 'button',
          text: range.label,
          on: {
            click: () => {
              state.weeks = range.weeks;
              renderControls();
              load();
            },
          },
        }),
      ),
    ));
  }

  async function load() {
    mount(body, Loading());

    try {
      mount(body, render(await call('admin.analytics', { weeks: state.weeks })));
    } catch (error) {
      mount(body, ErrorState(toAppError(error), load));
    }
  }

  function render(data) {
    const noPosts = data.postingTrend.every((point) => point.value === 0);

    return el('div', { class: 'ft-analytics ft-animate-in' }, [
      Card({}, ChartPanel({
        title: 'Posting trend',
        description: 'Posts logged per week across the community.',
        empty: noPosts,
        chart: BarChart({ points: data.postingTrend }),
      })),

      Card({}, ChartPanel({
        title: 'Registration trend',
        description: 'Total members over time.',
        empty: !data.registrationTrend.length,
        chart: LineChart({ points: data.registrationTrend }),
      })),

      Card({}, ChartPanel({
        title: 'Weekly growth',
        description: 'New members joining each week.',
        empty: data.weeklyGrowth.every((point) => point.value === 0),
        chart: BarChart({ points: data.weeklyGrowth, color: 'var(--ft-gold-400)' }),
      })),

      Card({}, ChartPanel({
        title: 'Goal completion',
        description: 'Share of members who met their weekly goal.',
        empty: noPosts,
        chart: LineChart({
          points: data.goalCompletion,
          color: 'var(--ft-success-500)',
          formatValue: (value) => `${value}%`,
        }),
      })),

      Card({}, ChartPanel({
        title: 'Activity heatmap',
        description: 'When the community posts. Each column is a week, each cell a day.',
        empty: noPosts,
        chart: HeatmapChart({ weeks: data.activityHeatmap }),
      })),

      Card({}, ChartPanel({
        title: 'Platform distribution',
        description: 'Where the tribe publishes.',
        empty: !data.platformDistribution.length,
        chart: DistributionChart({ items: data.platformDistribution }),
      })),

      Card({}, ChartPanel({
        title: 'Flow Level distribution',
        description: 'How far along active members are.',
        empty: data.flowLevelDistribution.every((item) => item.value === 0),
        chart: DistributionChart({ items: data.flowLevelDistribution }),
      })),
    ]);
  }

  return root;
}

function Loading() {
  return el(
    'div',
    { class: 'ft-analytics' },
    Array.from({ length: 4 }, () =>
      Card({}, el('div', { class: 'ft-stack ft-gap-3' }, [
        Skeleton({ variant: 'text', width: '9rem' }),
        Skeleton({ variant: 'card', height: '11rem' }),
      ])),
    ),
  );
}
