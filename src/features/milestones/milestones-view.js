/**
 * Milestone gallery.
 *
 * Locked milestones are shown, not hidden. Members should always know what
 * they are working toward — concealing the set would remove the reason to
 * reach for any of it.
 *
 * Grouped by category so the gallery reads as a map rather than a list.
 *
 * @module features/milestones/milestones-view
 */

import { el } from '../../core/dom.js';
import { mount } from '../../core/component.js';
import { Button, Card, EmptyState, Skeleton } from '../../components/ui/index.js';
import { MilestoneCard, NextMilestone } from '../../components/brand/milestone.js';
import { PageHeader, Section } from '../../components/layout/index.js';
import { Icons } from '../../lib/icons.js';
import { call } from '../../core/api.js';
import { toAppError } from '../../core/errors.js';
import { MILESTONE_CATEGORIES } from '../../lib/catalog.js';
import { openMilestoneModal } from './milestone-modal.js';
import { plural } from '../../lib/format.js';

export default function MilestonesView() {
  const root = el('div', { class: 'ft-animate-in' });

  mount(root, Loading());
  load();

  async function load() {
    try {
      const data = await call('milestones.list');
      mount(root, render(data));
    } catch (error) {
      mount(root, Card({}, EmptyState({
        title: 'We could not load your milestones',
        message: toAppError(error).message,
        iconPaths: Icons.alert,
        action: Button({ label: 'Try again', variant: 'secondary', onClick: load }),
      })));
    }
  }

  return root;
}

function render(data) {
  const { milestones, totalEarned, totalAvailable, next } = data;

  const earnedNone = totalEarned === 0;

  return el('div', { class: 'ft-stack ft-gap-6' }, [
    PageHeader({
      title: 'Milestones',
      subtitle: earnedNone
        ? 'Every one of these is still ahead of you.'
        : `${totalEarned} of ${totalAvailable} earned. ${totalAvailable - totalEarned} still to go.`,
    }),

    el('div', { class: 'ft-milestone-summary' }, [
      SummaryStat('Earned', totalEarned),
      SummaryStat('Remaining', totalAvailable - totalEarned),
      SummaryStat('Total', totalAvailable),
    ]),

    next ? Section({ title: 'Closest to unlocking' }, NextMilestone({ milestone: next, onClick: openMilestoneModal })) : null,

    ...MILESTONE_CATEGORIES.map((category) => {
      const items = milestones
        .filter((milestone) => milestone.category === category.id)
        .sort((a, b) => a.sortOrder - b.sortOrder);

      if (!items.length) return null;

      const earned = items.filter((item) => item.unlocked).length;

      return Section(
        {
          title: category.label,
          action: el('span', { class: 'ft-text-xs ft-text-muted', text: `${earned}/${items.length}` }),
        },
        el(
          'div',
          { class: 'ft-milestone-grid' },
          items.map((milestone) => MilestoneCard({ milestone, onClick: openMilestoneModal })),
        ),
      );
    }),
  ]);
}

function SummaryStat(label, value) {
  return el('div', { class: 'ft-milestone-summary__item' }, [
    el('span', { class: 'ft-numeral ft-milestone-summary__value', text: String(value) }),
    el('span', { class: 'ft-milestone-summary__label', text: label }),
  ]);
}

function Loading() {
  return el('div', { class: 'ft-stack ft-gap-6' }, [
    Skeleton({ variant: 'title', width: '40%' }),
    el('div', { class: 'ft-milestone-grid' },
      Array.from({ length: 8 }, () => Skeleton({ variant: 'card', height: '7.5rem' }))),
  ]);
}
