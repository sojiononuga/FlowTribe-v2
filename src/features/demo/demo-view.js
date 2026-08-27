/** Public, no-account proof of Flow Intelligence. */
import { el, icon } from '../../core/dom.js';
import { mount } from '../../core/component.js';
import { Button, Card, Field, Input } from '../../components/ui/index.js';
import { Logo } from '../../components/brand/index.js';
import { Icons } from '../../lib/icons.js';

const SAMPLE_GOAL = 'Launch my neighbourhood food business';
const SAMPLE_ACTION = 'Test one meal with five potential customers';

export default function DemoView() {
  const root = el('div', { class: 'ft-demo ft-animate-in' });
  mount(root, DemoForm(root));
  return root;
}

function DemoForm(root) {
  let goal = SAMPLE_GOAL;
  let action = SAMPLE_ACTION;
  let constraint = '';

  const goalInput = Input({ value: goal, maxlength: 120, iconPaths: Icons.target, onInput: (value) => { goal = value; } });
  const actionInput = Input({ value: action, maxlength: 160, iconPaths: Icons.check, onInput: (value) => { action = value; } });
  const constraintInput = el('textarea', {
    class: 'ft-input ft-demo__textarea',
    placeholder: 'For example: My work shifts changed and I only have 20 minutes tonight.',
    attrs: { maxlength: 500, rows: 4 },
    on: { input: (event) => { constraint = event.target.value; constraintField.update({ error: null }); } },
  });
  const constraintField = Field({
    label: 'What changed in real life?',
    control: constraintInput,
    required: true,
    hint: 'Use your own situation. Flow interprets the constraint before proposing a new path.',
  });

  function adapt() {
    if (constraint.trim().length < 3) {
      constraintField.update({ error: 'Tell Flow what changed.' });
      constraintInput.focus();
      return;
    }
    mount(root, DemoResult(root, analyseConstraint({ goal, action, constraint })));
  }

  return el('main', { class: 'ft-demo__shell' }, [
    el('div', { class: 'ft-demo__topbar' }, [
      Logo({ size: 'sm', inline: true }),
      el('a', { class: 'ft-demo__login', attrs: { href: '#/login' }, text: 'Member login' }),
    ]),
    el('div', { class: 'ft-demo__intro' }, [
      el('span', { class: 'ft-demo__badge' }, [icon(Icons.sparkle), 'Interactive AI demo · no account needed']),
      el('h1', { class: 'ft-demo__title', text: 'Watch Flow change the path, not the goal.' }),
      el('p', { class: 'ft-demo__subtitle', text: 'Give Flow a meaningful goal and a real-life disruption. Its intelligence layer will understand the constraint and create one credible next move.' }),
    ]),
    Card({ variant: 'raised' }, [
      Field({ label: 'Meaningful goal', control: goalInput }),
      el('div', { class: 'ft-mt-5' }, Field({ label: 'Current plan', control: actionInput })),
      el('div', { class: 'ft-mt-5' }, constraintField),
      el('div', { class: 'ft-mt-6' }, Button({ label: 'Let Flow adapt my path', size: 'lg', block: true, iconPaths: Icons.sparkle, onClick: adapt })),
    ]),
    el('p', { class: 'ft-demo__privacy', text: 'This demonstration runs privately in your browser and does not save what you type.' }),
  ]);
}

function DemoResult(root, result) {
  return el('main', { class: 'ft-demo__shell' }, [
    el('div', { class: 'ft-demo__topbar' }, [Logo({ size: 'sm', inline: true }), el('span', { class: 'ft-demo__badge' }, [icon(Icons.sparkle), 'Flow Intelligence'])]),
    el('section', { class: 'ft-demo__result-head' }, [
      el('p', { class: 'ft-pagehead__eyebrow', text: 'PATH ADAPTED' }),
      el('h1', { class: 'ft-demo__result-title', text: result.headline }),
      el('p', { class: 'ft-demo__subtitle', text: result.reason }),
    ]),
    el('ol', { class: 'ft-adapt-path', attrs: { 'aria-label': 'Flow Intelligence reasoning' } }, [
      ReasonStep('1', 'Understood', result.understood, true),
      ReasonStep('2', 'Preserved', result.goal),
      ReasonStep('3', 'Replanned', result.adjustment),
    ]),
    Card({ variant: 'raised' }, [
      el('div', { class: 'ft-demo__ai-label' }, [icon(Icons.sparkle), el('span', { text: 'AI RECOMMENDATION' })]),
      el('p', { class: 'ft-text-sm ft-text-muted ft-mt-4', text: 'Your one useful next action' }),
      el('h2', { class: 'ft-demo__next', text: result.nextAction }),
      el('div', { class: 'ft-demo__preserved ft-mt-5' }, [
        el('span', { text: 'Progress preserved' }),
        el('strong', { text: 'Your goal and existing momentum remain intact' }),
      ]),
    ]),
    el('div', { class: 'ft-grid ft-grid--2' }, [
      Button({ label: 'Try another change', variant: 'secondary', size: 'lg', block: true, onClick: () => mount(root, DemoForm(root)) }),
      Button({ label: 'Start my Flow', size: 'lg', block: true, onClick: () => { window.location.hash = '#/register'; } }),
    ]),
  ]);
}

function ReasonStep(number, label, description, active = false) {
  return el('li', { class: active ? 'ft-adapt-path__step ft-adapt-path__step--active' : 'ft-adapt-path__step' }, [
    el('span', { class: 'ft-adapt-path__number', text: number }),
    el('span', { class: 'ft-adapt-path__copy' }, [el('strong', { text: label }), el('small', { text: description })]),
  ]);
}

export function analyseConstraint({ goal, action, constraint }) {
  const text = constraint.trim();
  const lower = text.toLowerCase();
  const category = /power|electric|battery|internet|data|offline|network/.test(lower) ? 'access'
    : /money|cost|cash|budget|afford/.test(lower) ? 'resources'
      : /tired|exhaust|health|sick|energy|overwhelm/.test(lower) ? 'energy'
        : /time|busy|shift|work|deadline|family|child/.test(lower) ? 'time'
          : 'change';

  const plans = {
    access: ['An access or connectivity constraint', 'Move the work offline and use the tools already available', `Use your phone or paper for 15 minutes to prepare the smallest offline version of: ${action}`],
    resources: ['A money or resource constraint', 'Replace spending with a smaller validation step', `Run a no-cost version today: ask one real person for feedback on “${action}”`],
    energy: ['A capacity and energy constraint', 'Lower the effort without abandoning the direction', `Do a ten-minute starter version of: ${action}`],
    time: ['A time and responsibility constraint', 'Protect a short focused window and defer everything non-essential', `Set a 15-minute timer and complete only the first part of: ${action}`],
    change: ['A change to the conditions around the plan', 'Reduce the plan to its smallest still-useful version', `Take ten minutes to begin the smallest useful version of: ${action}`],
  };
  const [understood, adjustment, nextAction] = plans[category];
  return {
    category,
    goal: goal.trim() || SAMPLE_GOAL,
    understood: `${understood}: “${text}”`,
    adjustment,
    nextAction,
    headline: category === 'energy' ? 'Make returning the win.' : 'A smaller path can still move the goal forward.',
    reason: 'Flow treated the disruption as new information, not as failure.',
  };
}
