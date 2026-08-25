/**
 * Submit a post.
 *
 * One field. The platform comes from registration and is never asked again —
 * "make it effortless to publish and log content" is the Create principle, and
 * every removed decision serves it.
 *
 * The success state is the emotional peak of the product: the burst, the
 * updated ring, and any milestone that just unlocked. All of it arrives from
 * one response, so there is no second request and no timer.
 *
 * @module features/submit/submit-view
 */

import { el, icon } from '../../core/dom.js';
import { mount } from '../../core/component.js';
import { Button, Card, Field, Input } from '../../components/ui/index.js';
import { ProgressRing, SuccessBurst } from '../../components/brand/index.js';
import { PageHeader } from '../../components/layout/index.js';
import { Icons } from '../../lib/icons.js';
import { getPlatform } from '../../lib/platforms.js';
import { weeklyProgressMessage } from '../../lib/format.js';
import { call } from '../../core/api.js';
import { toAppError } from '../../core/errors.js';
import { getMember } from '../../core/session.js';
import { navigate } from '../../app/navigation.js';
import { celebrateAll, openLevelUpModal } from '../milestones/milestone-modal.js';

export default function SubmitView() {
  const root = el('div', { class: 'ft-submit' });
  mount(root, FormState(root));
  return root;
}

/* -------------------------------------------------------------------------
 * Form
 * ---------------------------------------------------------------------- */

function FormState(root) {
  const member = getMember() || { platform: 'LinkedIn' };
  const platform = getPlatform(member.platform);

  let link = '';
  let busy = false;

  const input = Input({
    type: 'url',
    placeholder: platform.hint || 'https://…',
    iconPaths: Icons.link,
    autocomplete: 'off',
    onInput: (value) => {
      link = value;
      field.update({ error: null });
    },
    onEnter: () => submit(),
  });

  const field = Field({
    label: 'Paste your content link',
    control: input,
    required: true,
    hint: `We check the link belongs to ${platform.label} before it counts.`,
  });

  const button = Button({
    label: 'Log this post',
    size: 'lg',
    block: true,
    iconPaths: Icons.check,
  });

  async function submit() {
    if (busy) return;

    const value = link.trim();
    if (!value) {
      field.update({ error: 'Paste the link to your post.' });
      return;
    }

    busy = true;
    button.update({ loading: true });

    try {
      const result = await call('submission.create', { link: value });
      mount(root, SuccessState(root, result));

      // Celebrations run after the success state is on screen, so the member
      // sees their numbers move first and the modal lands on top of a page
      // that already reflects what they did.
      if (result.newMilestones?.length) await celebrateAll(result.newMilestones);
      if (result.levelUp) await openLevelUpModal(result.levelUp);
    } catch (error) {
      const appError = toAppError(error);
      field.update({ error: appError.message });
      input.input.focus();
    } finally {
      busy = false;
      button.update({ loading: false });
    }
  }

  button.addEventListener('click', submit);

  return el('div', { class: 'ft-animate-in' }, [
    PageHeader({
      eyebrow: platform.label,
      title: "Log today's post",
      subtitle: 'One link. That is the whole thing.',
    }),
    Card({}, [
      el('form', { on: { submit: (e) => { e.preventDefault(); submit(); } } }, [
        field,
        el('div', { class: 'ft-mt-6' }, button),
      ]),
    ]),
    el('p', { class: 'ft-text-xs ft-text-muted ft-text-center ft-mt-4' }, [
      'Posting somewhere else today? Your account is set to ',
      el('strong', { text: platform.label }),
      '. An admin can change it.',
    ]),
  ]);
}

/* -------------------------------------------------------------------------
 * Success
 * ---------------------------------------------------------------------- */

function SuccessState(root, result) {
  // `submission.create` returns stats FLAT — postsThisWeek, weeklyGoal, goalMet.
  // There is no `stats.week`. Reading one threw a TypeError on every successful
  // post, which submit()'s catch then showed as "We couldn't reach Flow Tribe"
  // on a post that was already in the ledger.
  //
  // `stats` is absent entirely when the server sets statsSettling: the ledger
  // was written but a rollup step failed, so the derived numbers would be
  // stale. RollupRepair closes the gap within fifteen minutes.
  //
  // The post is a fact either way, so the success state is the same. What
  // changes is that we do not draw a progress ring we know to be wrong —
  // showing a member "1 of 3" when they have posted four times is worse than
  // telling them the count is catching up.
  const stats = result.stats || null;
  const settling = Boolean(result.statsSettling);

  return el('div', { class: 'ft-submit-success' }, [
    el('div', { class: 'ft-submit-success__burst' }, SuccessBurst({ label: 'Post logged' })),
    el('h1', { class: 'ft-submit-success__title', text: 'Nice work.' }),
    el('p', {
      class: 'ft-submit-success__message',
      text: "Today's post has been logged.",
    }),

    stats
      ? Card({}, [
          el('div', { class: 'ft-week-panel' }, [
            ProgressRing({ value: stats.postsThisWeek, goal: stats.weeklyGoal }),
            el('p', {
              class: stats.goalMet
                ? 'ft-week-panel__message ft-week-panel__message--met'
                : 'ft-week-panel__message',
              text: stats.goalMet
                ? 'You kept your promise to yourself this week.'
                : weeklyProgressMessage(stats.postsThisWeek, stats.weeklyGoal),
            }),
          ]),
        ])
      : settling
        ? Card({}, [
            el('div', { class: 'ft-week-panel' }, [
              el('p', {
                class: 'ft-week-panel__message',
                text: 'Your post is saved. This week’s numbers are still catching up — check back in a few minutes.',
              }),
            ]),
          ])
        : null,

    el('div', { class: 'ft-stack ft-gap-3 ft-mt-6' }, [
      Button({
        label: 'Back to dashboard',
        size: 'lg',
        block: true,
        onClick: () => navigate('/dashboard'),
      }),
      Button({
        label: 'Log another',
        variant: 'ghost',
        block: true,
        onClick: () => mount(root, FormState(root)),
      }),
    ]),
  ]);
}
