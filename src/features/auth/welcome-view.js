/** Post-registration welcome and PIN recovery guidance. */
import { el, icon } from '../../core/dom.js';
import { Button, Card } from '../../components/ui/index.js';
import { Logo } from '../../components/brand/index.js';
import { PageHeader } from '../../components/layout/index.js';
import { Icons } from '../../lib/icons.js';
import { getMember } from '../../core/session.js';
import { navigate } from '../../app/navigation.js';

export function WelcomeView() {
  const member = getMember() || {};
  return el('div', { class: 'ft-auth ft-animate-in' }, [
    el('div', { class: 'ft-auth__brand' }, Logo({ size: 'lg' })),
    el('h1', { class: 'ft-auth__title', text: `You're in, ${firstName(member.fullName)}` }),
    el('p', { class: 'ft-auth__subtitle', text: 'You have a destination. Flow will help you keep a path to it.' }),
    Card({}, [
      el('ul', { class: 'ft-welcome-list' }, [
        Item(Icons.target, 'Your direction', member.goalTitle || 'A meaningful goal'),
        Item(Icons.check, 'Showing up means', member.showingUp || 'One meaningful action'),
        Item(Icons.calendarCheck, 'Your weekly rhythm', `${member.weeklyGoal || 3} meaningful actions`),
      ]),
    ]),
    el('p', { class: 'ft-text-sm ft-text-muted ft-text-center ft-mt-4', text: 'If life changes the plan, use Flow Adapt. Missing a day does not reset who you are becoming.' }),
    el('div', { class: 'ft-stack ft-gap-3 ft-mt-6' }, [
      Button({ label: 'Take my first action', size: 'lg', block: true, iconPaths: Icons.plus, onClick: () => navigate('/submit') }),
      Button({ label: 'Go home', variant: 'ghost', block: true, onClick: () => navigate('/dashboard') }),
    ]),
  ]);
}

function Item(iconPaths, label, value) {
  return el('li', { class: 'ft-welcome-list__item' }, [
    el('span', { class: 'ft-welcome-list__icon' }, icon(iconPaths)),
    el('div', { class: 'ft-welcome-list__body' }, [
      el('span', { class: 'ft-welcome-list__label', text: label }),
      el('span', { class: 'ft-welcome-list__value', text: value }),
    ]),
  ]);
}

export function ForgotPinView() {
  return el('div', { class: 'ft-auth ft-animate-in' }, [
    el('div', { class: 'ft-auth__brand' }, Logo({ size: 'lg' })),
    PageHeader({ title: 'Forgot your PIN?', subtitle: 'It happens. Here is how to get back in.' }),
    Card({}, [
      el('ol', { class: 'ft-steps-list' }, [
        el('li', { text: 'Message the team on WhatsApp or in the group.' }),
        el('li', { text: 'We will set a temporary PIN and send it to you privately.' }),
        el('li', { text: 'You choose a new one the moment you log in.' }),
      ]),
      el('p', { class: 'ft-text-sm ft-text-muted ft-mt-4', text: 'Your direction, momentum, milestones, and calendar stay intact.' }),
    ]),
    el('div', { class: 'ft-mt-6' }, Button({ label: 'Back to login', variant: 'secondary', block: true, onClick: () => navigate('/login') })),
  ]);
}

function firstName(fullName) { return String(fullName || '').trim().split(/\s+/)[0] || 'friend'; }
export default WelcomeView;
