/** Flow Adapt — change the path, preserve the destination. */
import { el } from '../../core/dom.js';
import { mount } from '../../core/component.js';
import { Button, Card, Field, Input } from '../../components/ui/index.js';
import { PageHeader, Section } from '../../components/layout/index.js';
import { Icons } from '../../lib/icons.js';
import { call } from '../../core/api.js';
import { toAppError } from '../../core/errors.js';
import { getMember } from '../../core/session.js';
import { navigate } from '../../app/navigation.js';

export default function AdaptView() {
  const root = el('div', { class: 'ft-stack ft-gap-6' });
  mount(root, FormState(root));
  return root;
}

function FormState(root) {
  const member = getMember() || {};
  let constraint = '';
  let busy = false;

  const input = Input({
    placeholder: 'Work got hectic. I lost power. Data is expensive. I am exhausted…',
    maxlength: 500,
    iconPaths: Icons.refresh,
    onInput: (value) => { constraint = value; field.update({ error: null }); },
    onEnter: () => propose(),
  });
  const field = Field({
    label: 'What changed?',
    control: input,
    required: true,
    hint: 'Tell Flow what is true now. The point is adaptation, not blame.',
  });
  const button = Button({ label: 'Adapt my path', size: 'lg', block: true, iconPaths: Icons.refresh });

  async function propose() {
    if (busy) return;
    if (constraint.trim().length < 3) { field.update({ error: 'Tell Flow what changed.' }); return; }
    busy = true;
    button.update({ loading: true });
    try {
      const data = await call('adaptation.propose', { constraint: constraint.trim() });
      mount(root, ProposalState(root, data.proposal));
    } catch (error) {
      field.update({ error: toAppError(error).message });
    } finally {
      busy = false;
      button.update({ loading: false });
    }
  }
  button.addEventListener('click', propose);

  return el('div', { class: 'ft-stack ft-gap-6 ft-animate-in' }, [
    PageHeader({
      eyebrow: 'Flow Adapt',
      title: 'Life changed. Your goal does not have to.',
      subtitle: 'Flow uses the new reality to find a credible next move.',
    }),
    member.goalTitle ? Card({}, [
      el('p', { class: 'ft-text-xs ft-text-muted', text: 'DESTINATION' }),
      el('h2', { class: 'ft-section__title ft-mt-2', text: member.goalTitle }),
      member.showingUp ? el('p', { class: 'ft-text-sm ft-text-muted ft-mt-2', text: `Showing up: ${member.showingUp}` }) : null,
    ]) : null,
    el('ol', { class: 'ft-adapt-path', attrs: { 'aria-label': 'How Flow Adapt works' } }, [
      AdaptStep('1', 'Reality', 'Tell Flow what changed', true),
      AdaptStep('2', 'Proposal', 'See a credible revised route'),
      AdaptStep('3', 'Recovery', 'Choose one useful next action'),
    ]),
    Card({}, [field, el('div', { class: 'ft-mt-6' }, button)]),
    el('p', { class: 'ft-text-sm ft-text-muted ft-text-center', text: 'Flow Adapt never silently changes your goal. You choose whether to accept the revised path.' }),
  ]);
}

function ProposalState(root, proposal) {
  let busy = false;
  const accept = Button({ label: 'Use this path', size: 'lg', block: true, iconPaths: Icons.check });

  async function acceptPlan() {
    if (busy) return;
    busy = true;
    accept.update({ loading: true });
    try {
      await call('adaptation.accept', {
        proposalId: proposal.proposalId,
        category: proposal.category,
        today: proposal.today,
      });
      mount(root, AcceptedState(proposal));
    } catch (error) {
      mount(root, el('div', { class: 'ft-stack ft-gap-4' }, [
        ProposalCard(proposal),
        Card({}, el('p', { class: 'ft-text-sm', text: toAppError(error).message })),
        accept,
      ]));
    } finally {
      busy = false;
      accept.update({ loading: false });
    }
  }
  accept.addEventListener('click', acceptPlan);

  return el('div', { class: 'ft-stack ft-gap-6 ft-animate-in' }, [
    PageHeader({ eyebrow: 'Adapted path', title: proposal.headline, subtitle: proposal.reason }),
    ProposalCard(proposal),
    el('div', { class: 'ft-stack ft-gap-3' }, [
      accept,
      Button({ label: 'Tell Flow something else', variant: 'ghost', block: true, onClick: () => mount(root, FormState(root)) }),
    ]),
  ]);
}

function ProposalCard(proposal) {
  return Card({ variant: 'raised' }, [
    el('p', { class: 'ft-text-xs ft-text-muted', text: 'GOAL PRESERVED' }),
    el('h2', { class: 'ft-section__title ft-mt-2', text: proposal.preservedGoal }),
    el('div', { class: 'ft-adapt-next ft-mt-6' }, [
      el('p', { class: 'ft-adapt-next__label', text: 'YOUR NEXT ACTION' }),
      el('p', { class: 'ft-adapt-next__text', text: proposal.today }),
    ]),
    el('div', { class: 'ft-mt-6' }, [
      el('p', { class: 'ft-text-xs ft-text-muted', text: 'THEN' }),
      el('p', { class: 'ft-text-sm ft-mt-2', text: proposal.next }),
    ]),
  ]);
}

function AdaptStep(numberLabel, label, description, active = false) {
  return el('li', { class: active ? 'ft-adapt-path__step ft-adapt-path__step--active' : 'ft-adapt-path__step' }, [
    el('span', { class: 'ft-adapt-path__number', text: numberLabel }),
    el('span', { class: 'ft-adapt-path__copy' }, [
      el('strong', { text: label }),
      el('small', { text: description }),
    ]),
  ]);
}

function AcceptedState(proposal) {
  return el('div', { class: 'ft-stack ft-gap-6 ft-animate-in' }, [
    PageHeader({ eyebrow: 'You are back in Flow', title: 'The next move is small on purpose.', subtitle: 'Recovery is part of progress.' }),
    Card({}, [
      el('p', { class: 'ft-text-xs ft-text-muted', text: 'YOUR NEXT ACTION' }),
      el('h2', { class: 'ft-section__title ft-mt-2', text: proposal.today }),
    ]),
    Button({ label: 'Show up now', size: 'lg', block: true, iconPaths: Icons.plus, onClick: () => navigate('/submit') }),
    Button({ label: 'Back home', variant: 'ghost', block: true, onClick: () => navigate('/dashboard') }),
  ]);
}
