/**
 * Post-registration welcome, and the forgot-PIN placeholder.
 *
 * The welcome screen exists because dropping a new member straight onto an
 * empty dashboard is the worst possible first impression: every number is
 * zero, every square is grey, and nothing explains that this is normal. One
 * screen between registration and that view turns an empty dashboard from a
 * verdict into a starting line.
 *
 * @module features/auth/welcome-view
 */

import { el, icon } from '../../core/dom.js';
import { Button, Card } from '../../components/ui/index.js';
import { Logo } from '../../components/brand/index.js';
import { PageHeader } from '../../components/layout/index.js';
import { Icons } from '../../lib/icons.js';
import { getMember } from '../../core/session.js';
import { getPlatform, goalLabel } from '../../lib/platforms.js';
import { navigate } from '../../app/navigation.js';

export function WelcomeView() {
  const member = getMember() || {};
  const platform = getPlatform(member.platform);

  return el('div', { class: 'ft-auth ft-animate-in' }, [
    el('div', { class: 'ft-auth__brand' }, Logo({ size: 'lg' })),
    el('h1', { class: 'ft-auth__title', text: `You're in, ${firstName(member.fullName)}` }),
    el('p', {
      class: 'ft-auth__subtitle',
      text: 'Here is what you just committed to. Nothing is locked — an admin can change any of it.',
    }),

    Card({}, [
      el('ul', { class: 'ft-welcome-list' }, [
        Item(platform.iconPaths, 'Your platform', platform.label, platform.color),
        Item(Icons.target, 'Your weekly goal', goalLabel(member.weeklyGoal)),
        Item(Icons.calendarCheck, 'Your first square', 'Waiting for your first post'),
      ]),
    ]),

    el('div', { class: 'ft-stack ft-gap-3 ft-mt-6' }, [
      Button({
        label: 'Log my first post',
        size: 'lg',
        block: true,
        iconPaths: Icons.plus,
        onClick: () => navigate('/submit'),
      }),
      Button({
        label: 'Take me to my dashboard',
        variant: 'ghost',
        block: true,
        onClick: () => navigate('/dashboard'),
      }),
    ]),
  ]);
}

function Item(iconPaths, label, value, color) {
  return el('li', { class: 'ft-welcome-list__item' }, [
    el('span', { class: 'ft-welcome-list__icon', style: color ? { color } : undefined }, icon(iconPaths)),
    el('div', { class: 'ft-welcome-list__body' }, [
      el('span', { class: 'ft-welcome-list__label', text: label }),
      el('span', { class: 'ft-welcome-list__value', text: value }),
    ]),
  ]);
}

/**
 * Forgot-PIN placeholder.
 *
 * There is no self-service recovery, because there is no verified email or
 * phone to send one to — Stage 2 is optional and unverified. That is a
 * coherent decision, and this screen makes it a named path rather than a dead
 * end. An error that tells you what to do next is not really an error.
 */
export function ForgotPinView() {
  return el('div', { class: 'ft-auth ft-animate-in' }, [
    el('div', { class: 'ft-auth__brand' }, Logo({ size: 'lg' })),
    PageHeader({
      title: 'Forgot your PIN?',
      subtitle: 'It happens. Here is how to get back in.',
    }),

    Card({}, [
      el('ol', { class: 'ft-steps-list' }, [
        el('li', { text: 'Message the team on WhatsApp or in the group.' }),
        el('li', { text: 'We will set a temporary PIN and send it to you privately.' }),
        el('li', { text: 'You choose a new one the moment you log in.' }),
      ]),
      el('p', {
        class: 'ft-text-sm ft-text-muted ft-mt-4',
        text: 'Your streak, milestones, and calendar are all untouched by a PIN reset. Nothing is lost.',
      }),
    ]),

    el('div', { class: 'ft-mt-6' }, Button({
      label: 'Back to login',
      variant: 'secondary',
      block: true,
      onClick: () => navigate('/login'),
    })),
  ]);
}

function firstName(fullName) {
  return String(fullName || '').trim().split(/\s+/)[0] || 'friend';
}

export default WelcomeView;
