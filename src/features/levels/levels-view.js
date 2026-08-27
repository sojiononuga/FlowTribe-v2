/**
 * Flow Levels.
 *
 * Presented as a journey, not a ladder. Every level is visible, the ones behind
 * are marked reached, and the ones ahead simply state what they ask for. Nobody
 * is told they are "below" anything — levels describe who a member has become,
 * and they never fall.
 *
 * @module features/levels/levels-view
 */

import { el, icon } from '../../core/dom.js';
import { mount } from '../../core/component.js';
import { Button, Card, EmptyState, Skeleton } from '../../components/ui/index.js';
import { LevelChip, LevelProgress, LevelTrack } from '../../components/brand/milestone.js';
import { PageHeader, Section } from '../../components/layout/index.js';
import { Icons } from '../../lib/icons.js';
import { call } from '../../core/api.js';
import { toAppError } from '../../core/errors.js';
import { presentLevel } from '../../lib/catalog.js';

export default function LevelsView() {
  const root = el('div', { class: 'ft-animate-in' });

  mount(root, Loading());
  load();

  async function load() {
    try {
      const data = await call('levels.list');
      mount(root, render(data));
    } catch (error) {
      mount(root, Card({}, EmptyState({
        title: 'We could not load your Flow Level',
        message: toAppError(error).message,
        iconPaths: Icons.alert,
        action: Button({ label: 'Try again', variant: 'secondary', onClick: load }),
      })));
    }
  }

  return root;
}

function render(data) {
  const stats = data.stats;
  const levels = data.levels.map(presentLevel);
  const current = { ...presentLevel(data.current), next: presentLevel(data.current.next) };

  return el('div', { class: 'ft-stack ft-gap-6' }, [
    PageHeader({
      title: 'Flow Levels',
      subtitle: 'Milestones mark what you did. Levels mark who you have become.',
    }),

    /* Current level, given the weight of a hero card */
    Card({ variant: 'brand' }, [
      el('div', { class: 'ft-level-hero' }, [
        el('span', { class: 'ft-level-hero__icon' }, icon(Icons[current.iconId] || Icons.leaf)),
        el('div', { class: 'ft-level-hero__body' }, [
          el('p', { class: 'ft-level-hero__eyebrow', text: 'Your Flow Level' }),
          el('h2', { class: 'ft-level-hero__name', text: current.name }),
          el('p', { class: 'ft-level-hero__description', text: current.description }),
        ]),
      ]),
    ]),

    /* Progress toward the next */
    current.next
      ? Section({ title: 'What comes next' }, Card({}, LevelProgress({ next: current.next, stats })))
      : Section(
          { title: 'What comes next' },
          Card({}, EmptyState({
            title: 'You have reached the final level',
            message: 'Tribe Legend. There is nothing above this — only more of what got you here.',
            iconPaths: Icons.laurel,
          })),
        ),

    /* The whole journey */
    Section(
      { title: 'The journey' },
      Card({}, LevelTrack({ levels, currentId: current.levelId, stats })),
    ),

    el('p', {
      class: 'ft-text-xs ft-text-muted ft-text-center',
      text: 'Levels reflect meaningful actions and goal weeks. Returning matters as much as volume — and a level never falls.',
    }),
  ]);
}

function Loading() {
  return el('div', { class: 'ft-stack ft-gap-6' }, [
    Skeleton({ variant: 'title', width: '40%' }),
    Skeleton({ variant: 'card', height: '8rem' }),
    Skeleton({ variant: 'card', height: '18rem' }),
  ]);
}
