/** Universal "Show up" action capture. */
import { el } from '../../core/dom.js';
import { mount } from '../../core/component.js';
import { Button, Card, Field, Input } from '../../components/ui/index.js';
import { ProgressRing, SuccessBurst } from '../../components/brand/index.js';
import { PageHeader } from '../../components/layout/index.js';
import { Icons } from '../../lib/icons.js';
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

function FormState(root) {
  const member = getMember() || {};
  let title = '';
  let evidence = '';
  let busy = false;

  const titleInput = Input({
    placeholder: member.showingUp || 'What did you do?',
    iconPaths: Icons.check,
    maxlength: 160,
    onInput: (value) => { title = value; titleField.update({ error: null }); },
    onEnter: () => submit(),
  });
  const titleField = Field({
    label: 'How did you show up?',
    control: titleInput,
    required: true,
    hint: member.goalTitle ? `This counts toward: ${member.goalTitle}` : 'One meaningful action is enough.',
  });

  const evidenceInput = Input({
    placeholder: 'Optional link, note, result or proof',
    iconPaths: Icons.link,
    maxlength: 500,
    onInput: (value) => { evidence = value; evidenceField.update({ error: null }); },
  });
  const evidenceField = Field({
    label: 'Evidence or note',
    control: evidenceInput,
    hint: 'Optional. Flow records what happened without forcing you to document your life.',
  });

  const button = Button({ label: 'Count this action', size: 'lg', block: true, iconPaths: Icons.check });

  async function submit() {
    if (busy) return;
    if (title.trim().length < 2) { titleField.update({ error: 'Say what you did in one clear line.' }); return; }
    busy = true;
    button.update({ loading: true });
    try {
      const result = await call('action.create', { title: title.trim(), evidence: evidence.trim() });
      mount(root, SuccessState(root, result));
      if (result.newMilestones?.length) await celebrateAll(result.newMilestones);
      if (result.levelUp) await openLevelUpModal(result.levelUp);
    } catch (error) {
      const appError = toAppError(error);
      (appError.field === 'evidence' ? evidenceField : titleField).update({ error: appError.message });
      titleInput.input?.focus?.();
    } finally {
      busy = false;
      button.update({ loading: false });
    }
  }

  button.addEventListener('click', submit);

  return el('div', { class: 'ft-animate-in' }, [
    PageHeader({
      eyebrow: 'Show up',
      title: 'What moved today?',
      subtitle: member.showingUp || 'Record the meaningful action you took. Flow handles the momentum.',
    }),
    Card({}, [
      el('form', { on: { submit: (e) => { e.preventDefault(); submit(); } } }, [
        titleField,
        el('div', { class: 'ft-mt-6' }, evidenceField),
        el('div', { class: 'ft-mt-6' }, button),
      ]),
    ]),
    el('div', { class: 'ft-mt-4 ft-text-center' }, [
      el('a', { class: 'ft-section__action', attrs: { href: '#/adapt' }, text: 'Something changed? Adapt the path instead.' }),
    ]),
  ]);
}

function SuccessState(root, result) {
  const stats = result.stats || null;
  const settling = Boolean(result.statsSettling);
  return el('div', { class: 'ft-submit-success' }, [
    el('div', { class: 'ft-submit-success__burst' }, SuccessBurst({ label: 'Action counted' })),
    el('h1', { class: 'ft-submit-success__title', text: 'You moved.' }),
    el('p', { class: 'ft-submit-success__message', text: 'That action is now part of your history.' }),
    stats ? Card({}, [
      el('div', { class: 'ft-week-panel' }, [
        ProgressRing({ value: stats.actionsThisWeek, goal: stats.weeklyGoal }),
        el('p', {
          class: stats.goalMet ? 'ft-week-panel__message ft-week-panel__message--met' : 'ft-week-panel__message',
          text: stats.goalMet
            ? 'You kept your promise to yourself this week.'
            : `${stats.actionsThisWeek} of ${stats.weeklyGoal} meaningful actions this week.`,
        }),
      ]),
    ]) : settling ? Card({}, el('p', { class: 'ft-week-panel__message', text: 'Your action is saved. Momentum is catching up.' })) : null,
    el('div', { class: 'ft-stack ft-gap-3 ft-mt-6' }, [
      Button({ label: 'Back to home', size: 'lg', block: true, onClick: () => navigate('/dashboard') }),
      Button({ label: 'Log another action', variant: 'ghost', block: true, onClick: () => mount(root, FormState(root)) }),
    ]),
  ]);
}
