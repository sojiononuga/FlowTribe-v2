/**
 * Milestone modals — details, and the celebration.
 *
 * Two different jobs wearing the same shell:
 *
 *   `openMilestoneModal` is a reference view. Tapped from the gallery, it
 *   explains what a milestone is and how close you are.
 *
 *   `openCelebrationModal` is the moment. It fires once, when something is
 *   earned, and it is the only place in the app besides logging a post that
 *   celebrates. One animation, one line of copy, no confetti — "refined and
 *   professional" is a constraint on the celebration, not a description of it.
 *
 * Several milestones can unlock at once, so celebrations queue rather than
 * collide.
 *
 * @module features/milestones/milestone-modal
 */

import { el } from '../../core/dom.js';
import { Button, openModal } from '../../components/ui/index.js';
import { MilestoneBadge, ProgressBar } from '../../components/brand/milestone.js';
import { SuccessBurst } from '../../components/brand/success-burst.js';
import { date } from '../../lib/format.js';

const RARITY_LABEL = {
  Common: 'Common',
  Uncommon: 'Uncommon',
  Rare: 'Rare',
  Legendary: 'Legendary',
};

/**
 * Details for one milestone.
 *
 * @param {Object} milestone
 */
export function openMilestoneModal(milestone) {
  const { name, description, iconId, rarity, unlocked, progress, target, unlockedAt } = milestone;

  const content = el('div', { class: 'ft-milestone-detail' }, [
    MilestoneBadge({ iconId, unlocked, rarity, size: 'lg' }),
    el('p', { class: 'ft-milestone-detail__description', text: description }),
    el('div', { class: 'ft-milestone-detail__meta' }, [
      el('span', { class: `ft-badge ft-badge--${rarityTone(rarity)}`, text: RARITY_LABEL[rarity] || rarity }),
      unlocked
        ? el('span', {
            class: 'ft-badge ft-badge--success',
            text: unlockedAt ? `Earned ${date(unlockedAt)}` : 'Earned',
          })
        : el('span', { class: 'ft-badge ft-badge--neutral', text: 'Not yet' }),
    ]),
    !unlocked && target > 1
      ? el('div', { class: 'ft-milestone-detail__progress' }, [
          ProgressBar({ value: progress, max: target }),
          el('p', {
            class: 'ft-text-xs ft-text-muted ft-text-center ft-mt-2',
            text: `${target - progress} to go.`,
          }),
        ])
      : null,
  ]);

  const close = Button({ label: 'Close', variant: 'ghost', block: true });
  const modal = openModal({ title: name, content, actions: [close] });
  close.addEventListener('click', () => modal.close());
}

/**
 * The celebration. Returns a promise resolving when it is dismissed, so a
 * queue of unlocks can be shown in sequence.
 *
 * @param {Object} milestone
 * @returns {Promise<void>}
 */
export function openCelebrationModal(milestone) {
  return new Promise((resolve) => {
    const content = el('div', { class: 'ft-celebration' }, [
      el('div', { class: 'ft-celebration__burst' }, SuccessBurst({ label: 'Milestone unlocked' })),
      el('div', { class: 'ft-celebration__medal' }, MilestoneBadge({
        iconId: milestone.iconId,
        unlocked: true,
        rarity: milestone.rarity,
        size: 'lg',
        celebrate: true,
      })),
      el('p', { class: 'ft-celebration__eyebrow', text: 'Milestone unlocked' }),
      el('h3', { class: 'ft-celebration__name', text: milestone.name }),
      el('p', { class: 'ft-celebration__description', text: milestone.description }),
    ]);

    const confirm = Button({ label: 'Keep going', size: 'lg', block: true });

    const modal = openModal({
      title: 'Nice work',
      content,
      actions: [confirm],
      onClose: resolve,
    });

    confirm.addEventListener('click', () => modal.close());
  });
}

/**
 * Show a queue of unlocks one after another.
 *
 * @param {Object[]} milestones
 * @returns {Promise<void>}
 */
export async function celebrateAll(milestones) {
  for (const milestone of milestones) {
    // Sequential on purpose — stacked celebration modals would compete and
    // none of them would land.
    await openCelebrationModal(milestone);
  }
}

/**
 * The level-up modal. Distinct copy from a milestone: a level is about who
 * someone has become, not what they did.
 *
 * @param {Object} level
 * @returns {Promise<void>}
 */
export function openLevelUpModal(level) {
  return new Promise((resolve) => {
    const content = el('div', { class: 'ft-celebration' }, [
      el('div', { class: 'ft-celebration__burst' }, SuccessBurst({ label: 'New Flow Level' })),
      el('div', { class: 'ft-celebration__medal' }, MilestoneBadge({
        iconId: level.iconId,
        unlocked: true,
        rarity: 'Legendary',
        size: 'lg',
        celebrate: true,
      })),
      el('p', { class: 'ft-celebration__eyebrow', text: 'New Flow Level' }),
      el('h3', { class: 'ft-celebration__name', text: level.name }),
      el('p', { class: 'ft-celebration__description', text: level.description }),
    ]);

    const confirm = Button({ label: 'Continue', size: 'lg', block: true });
    const modal = openModal({ title: 'You levelled up', content, actions: [confirm], onClose: resolve });
    confirm.addEventListener('click', () => modal.close());
  });
}

function rarityTone(rarity) {
  return { Common: 'neutral', Uncommon: 'success', Rare: 'accent', Legendary: 'brand' }[rarity] || 'neutral';
}
