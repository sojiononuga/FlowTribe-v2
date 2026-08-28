import { el, icon } from '../../core/dom.js';

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

const TOUR_STEPS = [
  ['1 · DIRECTION', 'Start with a goal that matters.', 'Flow keeps the destination visible even when the route has to change.'],
  ['2 · NEXT MOVE', 'Take one useful action.', 'Your next credible move stays obvious enough to act on now.'],
  ['3 · ADAPT', 'Change the path when reality changes.', 'Use Adapt when time, energy, money, work or life changes the conditions.'],
  ['4 · MOMENTUM', 'Recovery still counts.', 'Evidence, return and Tribe momentum make progress visible after interruption.'],
];

export function MemberAssistControls() {
  const status = el('span', { class: 'ft-assist__status', attrs: { role: 'status', 'aria-live': 'polite' } });

  const voice = el('button', {
    class: 'ft-assist__button',
    attrs: { type: 'button', 'aria-label': 'Hear Flow voice' },
    on: { click: () => speak(voice, status) },
  }, [
    el('span', { class: 'ft-assist__icon' }, icon(MIC_PATHS)),
    el('span', { class: 'ft-assist__label', text: 'Voice' }),
  ]);

  const tour = GuidedTour();
  const tourButton = el('button', {
    class: 'ft-assist__button',
    attrs: { type: 'button', 'aria-label': 'Show me round Flow Tribe' },
    on: { click: () => tour.open() },
  }, [
    el('span', { class: 'ft-assist__icon' }, icon(COMPASS_PATHS)),
    el('span', { class: 'ft-assist__label', text: 'Show me round' }),
  ]);

  return el('div', { class: 'ft-assist', attrs: { 'aria-label': 'Flow help' } }, [voice, tourButton, status, tour]);
}

function speak(button, status) {
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    status.textContent = 'Voice is not available in this browser.';
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(
    'Welcome back to Flow Tribe. Keep moving. Perfect is not the point. Your goal stays steady while Flow helps you adapt the path.',
  );
  utterance.rate = 0.94;
  utterance.onstart = () => {
    button.classList.add('ft-assist__button--active');
    status.textContent = 'Flow is speaking.';
  };
  utterance.onend = () => {
    button.classList.remove('ft-assist__button--active');
    status.textContent = 'Voice ready.';
  };
  utterance.onerror = () => {
    button.classList.remove('ft-assist__button--active');
    status.textContent = 'Voice could not start.';
  };
  window.speechSynthesis.speak(utterance);
}

function GuidedTour() {
  let index = 0;
  const eyebrow = el('p', { class: 'ft-tour__eyebrow' });
  const title = el('h2', { class: 'ft-tour__title', attrs: { id: 'member-tour-title' } });
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
    on: { click: () => { if (index === TOUR_STEPS.length - 1) close(); else { index += 1; render(); } } },
  });

  const node = el('div', {
    class: 'ft-tour',
    attrs: { hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'member-tour-title' },
  }, [
    el('button', { class: 'ft-tour__backdrop', attrs: { type: 'button', 'aria-label': 'Close guided tour' }, on: { click: close } }),
    el('div', { class: 'ft-tour__panel' }, [
      el('div', { class: 'ft-tour__top' }, [
        counter,
        el('button', { class: 'ft-tour__close', attrs: { type: 'button', 'aria-label': 'Close guided tour' }, text: '×', on: { click: close } }),
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
    const [step, heading, copy] = TOUR_STEPS[index];
    eyebrow.textContent = step;
    title.textContent = heading;
    body.textContent = copy;
    counter.textContent = `${index + 1} of ${TOUR_STEPS.length}`;
    back.disabled = index === 0;
    next.textContent = index === TOUR_STEPS.length - 1 ? 'Done' : 'Next';
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
  render();
  return node;
}
