/**
 * Public Flow showcase.
 *
 * This is intentionally useful before authentication: a visitor can hear the
 * product voice, open the requested Meta AI hand-off, run the existing Flow
 * Intelligence demo, or take a short guided tour without creating an account.
 * No member data is read or written here.
 */

import { el, icon } from '../../core/dom.js';
import { Icons } from '../../lib/icons.js';

const MIC_PATHS = [
  'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z',
  'M19 10v2a7 7 0 0 1-14 0v-2',
  'M12 19v3',
  'M8 22h8',
];

const COMPASS_PATHS = [
  'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  'M16.2 7.8 14 14l-6.2 2.2L10 10z',
];

const EXTERNAL_PATHS = [
  'M14 3h7v7',
  'M10 14 21 3',
  'M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5',
];

const TOUR_STEPS = [
  {
    eyebrow: '1 · DIRECTION',
    title: 'Start with a goal that matters.',
    body: 'Flow begins with the destination, not a perfect timetable. The goal stays visible while the route is allowed to change.',
  },
  {
    eyebrow: '2 · NEXT MOVE',
    title: 'Turn intention into one useful action.',
    body: 'Instead of handing you a wall of tasks, Flow keeps the next credible move obvious enough to act on now.',
  },
  {
    eyebrow: '3 · ADAPT',
    title: 'When reality changes, change the path.',
    body: 'Time, energy, money, work and life move. Flow treats disruption as new information and helps you find a smaller or better route.',
  },
  {
    eyebrow: '4 · MOMENTUM',
    title: 'Make recovery count as progress.',
    body: 'Evidence, return and shared Tribe momentum show that progress can survive interruption instead of being erased by it.',
  },
];

export function FlowShowcase() {
  const voiceStatus = el('span', {
    class: 'ft-showcase__status',
    attrs: { role: 'status', 'aria-live': 'polite' },
    text: 'Hear the product promise.',
  });

  const voiceButton = ShowcaseAction({
    label: 'Voice',
    description: 'Hear Flow introduce itself.',
    iconPaths: MIC_PATHS,
    onClick: () => speakFlow(voiceButton, voiceStatus),
  });

  const metaAiLink = ShowcaseAction({
    label: 'META AI',
    description: 'Continue the conversation in Meta AI.',
    iconPaths: Icons.sparkle,
    href: 'https://www.meta.ai/',
    external: true,
  });

  const demoLink = ShowcaseAction({
    label: 'Demo',
    description: 'Watch Flow adapt a real plan.',
    iconPaths: Icons.target,
    href: '#/demo',
  });

  const tour = GuidedTour();
  const tourButton = ShowcaseAction({
    label: 'Show me round',
    description: 'A 60-second guided tour.',
    iconPaths: COMPASS_PATHS,
    onClick: () => tour.open(),
  });

  return el('section', { class: 'ft-showcase', attrs: { 'aria-label': 'Explore Flow Tribe' } }, [
    el('div', { class: 'ft-showcase__intro' }, [
      el('p', { class: 'ft-showcase__eyebrow', text: 'EXPLORE FLOW' }),
      el('h2', { class: 'ft-showcase__title', text: 'Meet the system before you sign in.' }),
      el('p', {
        class: 'ft-showcase__copy',
        text: 'Listen, explore the intelligence layer, try a real adaptation, or take the guided tour.',
      }),
    ]),
    el('div', { class: 'ft-showcase__actions' }, [voiceButton, metaAiLink, demoLink, tourButton]),
    voiceStatus,
    tour,
  ]);
}

function ShowcaseAction({ label, description, iconPaths, href, external = false, onClick }) {
  const tag = href ? 'a' : 'button';
  const attrs = href
    ? {
        href,
        ...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
      }
    : { type: 'button' };

  return el(tag, {
    class: 'ft-showcase-action',
    attrs,
    on: onClick ? { click: onClick } : undefined,
  }, [
    el('span', { class: 'ft-showcase-action__icon' }, icon(iconPaths)),
    el('span', { class: 'ft-showcase-action__body' }, [
      el('strong', { class: 'ft-showcase-action__label', text: label }),
      el('small', { class: 'ft-showcase-action__description', text: description }),
    ]),
    external ? el('span', { class: 'ft-showcase-action__external', attrs: { 'aria-hidden': 'true' } }, icon(EXTERNAL_PATHS)) : null,
  ]);
}

function speakFlow(button, status) {
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    status.textContent = 'Voice is not available in this browser. The rest of Flow still works normally.';
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(
    'Welcome to Flow Tribe. When life changes the plan, Flow changes the path, not the goal. Start with what matters. We will help you keep moving.',
  );
  utterance.rate = 0.94;
  utterance.pitch = 1;
  utterance.onstart = () => {
    button.classList.add('ft-showcase-action--active');
    status.textContent = 'Flow is speaking.';
  };
  utterance.onend = () => {
    button.classList.remove('ft-showcase-action--active');
    status.textContent = 'Voice ready. Tap again to replay.';
  };
  utterance.onerror = () => {
    button.classList.remove('ft-showcase-action--active');
    status.textContent = 'Voice could not start. You can still use the demo or guided tour.';
  };
  window.speechSynthesis.speak(utterance);
}

function GuidedTour() {
  let index = 0;

  const eyebrow = el('p', { class: 'ft-tour__eyebrow' });
  const title = el('h2', { class: 'ft-tour__title', attrs: { id: 'flow-tour-title' } });
  const body = el('p', { class: 'ft-tour__body' });
  const counter = el('span', { class: 'ft-tour__counter' });
  const back = el('button', {
    class: 'ft-tour__button ft-tour__button--quiet',
    attrs: { type: 'button' },
    text: 'Back',
    on: { click: () => { if (index > 0) { index -= 1; render(); } } },
  });
  const next = el('button', {
    class: 'ft-tour__button ft-tour__button--primary',
    attrs: { type: 'button' },
    text: 'Next',
    on: { click: () => {
      if (index >= TOUR_STEPS.length - 1) close();
      else { index += 1; render(); }
    } },
  });

  const node = el('div', {
    class: 'ft-tour',
    attrs: {
      hidden: true,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'flow-tour-title',
    },
  }, [
    el('button', {
      class: 'ft-tour__backdrop',
      attrs: { type: 'button', 'aria-label': 'Close guided tour' },
      on: { click: () => close() },
    }),
    el('div', { class: 'ft-tour__panel' }, [
      el('div', { class: 'ft-tour__top' }, [
        counter,
        el('button', {
          class: 'ft-tour__close',
          attrs: { type: 'button', 'aria-label': 'Close guided tour' },
          text: '×',
          on: { click: () => close() },
        }),
      ]),
      el('div', { class: 'ft-tour__visual', attrs: { 'aria-hidden': 'true' } }, [
        el('span', { class: 'ft-tour__orb ft-tour__orb--one' }),
        el('span', { class: 'ft-tour__orb ft-tour__orb--two' }),
        el('span', { class: 'ft-tour__path' }),
      ]),
      eyebrow,
      title,
      body,
      el('div', { class: 'ft-tour__footer' }, [back, next]),
    ]),
  ]);

  function render() {
    const step = TOUR_STEPS[index];
    eyebrow.textContent = step.eyebrow;
    title.textContent = step.title;
    body.textContent = step.body;
    counter.textContent = `${index + 1} of ${TOUR_STEPS.length}`;
    back.disabled = index === 0;
    next.textContent = index === TOUR_STEPS.length - 1 ? 'Enter Flow' : 'Next';
  }

  function open() {
    index = 0;
    render();
    node.hidden = false;
    document.documentElement.classList.add('ft-tour-open');
    next.focus();
  }

  function close() {
    node.hidden = true;
    document.documentElement.classList.remove('ft-tour-open');
  }

  node.open = open;
  node.close = close;
  render();
  return node;
}

export default FlowShowcase;
