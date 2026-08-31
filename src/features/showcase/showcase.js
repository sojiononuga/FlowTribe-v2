/**
 * Public Flow showcase.
 *
 * This is intentionally useful before authentication: a visitor can hear the
 * product voice, discover Griot, run the existing Flow Intelligence demo, or
 * take a short guided tour without creating an account. No member data is read
 * or written here.
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

const TOUR_STEPS = [
  {
    preview: 'direction',
    eyebrow: '1 · DIRECTION',
    title: 'Start with a goal that matters.',
    body: 'Flow begins with the destination, not a perfect timetable. The goal stays visible while the route is allowed to change.',
  },
  {
    preview: 'action',
    eyebrow: '2 · NEXT MOVE',
    title: 'Turn intention into one useful action.',
    body: 'Instead of handing you a wall of tasks, Flow keeps the next credible move obvious enough to act on now.',
  },
  {
    preview: 'adapt',
    eyebrow: '3 · ADAPT',
    title: 'When reality changes, change the path.',
    body: 'Time, energy, money, work and life move. Flow treats disruption as new information and helps you find a smaller or better route.',
  },
  {
    preview: 'momentum',
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

  const griotLink = ShowcaseAction({
    label: 'Griot',
    description: 'Meet Flow Tribe’s intelligent companion.',
    iconPaths: Icons.sparkle,
    href: '#/login',
  });

  const demoLink = ShowcaseAction({
    label: 'Demo',
    description: 'Watch Flow adapt a real plan.',
    iconPaths: Icons.target,
    href: '#/demo',
  });

  const tour = GuidedTour({ voiceButton, griotLink, demoLink, status: voiceStatus });
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
        text: 'Listen, meet Griot, try a real adaptation, or take the guided tour.',
      }),
    ]),
    el('div', { class: 'ft-showcase__actions' }, [voiceButton, griotLink, demoLink, tourButton]),
    voiceStatus,
    tour,
  ]);
}

function ShowcaseAction({ label, description, iconPaths, href, onClick }) {
  const tag = href ? 'a' : 'button';
  const attrs = href ? { href } : { type: 'button' };

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
  ]);
}

function speakFlow(button, status) {
  speakPreview('intro', {
    onPreparing: () => { status.textContent = 'Flow is preparing the voice.'; },
    onStart: () => {
    button.classList.add('ft-showcase-action--active');
    status.textContent = 'Flow is speaking.';
    },
    onEnd: () => {
    button.classList.remove('ft-showcase-action--active');
    status.textContent = 'Voice ready. Tap again to replay.';
    },
    onError: () => {
    button.classList.remove('ft-showcase-action--active');
    status.textContent = 'Voice could not start. Check your sound and try again.';
    },
  });
}

function GuidedTour({ voiceButton, griotLink, demoLink, status }) {
  let index = 0;
  let highlighted = null;
  const targets = [voiceButton, griotLink, demoLink, null];

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
    stopPreview();
    if (highlighted) highlighted.classList.remove('ft-showcase-action--tour-target');
    highlighted = targets[index];
    if (highlighted) highlighted.classList.add('ft-showcase-action--tour-target');
    eyebrow.textContent = step.eyebrow;
    title.textContent = step.title;
    body.textContent = step.body;
    counter.textContent = `${index + 1} of ${TOUR_STEPS.length}`;
    back.disabled = index === 0;
    next.textContent = index === TOUR_STEPS.length - 1 ? 'Enter Flow' : 'Next';
    speakPreview(step.preview, {
      onPreparing: () => { status.textContent = 'Tour narration is preparing.'; },
      onStart: () => { status.textContent = `Tour narration ${index + 1} of ${TOUR_STEPS.length}.`; },
      onEnd: () => { status.textContent = 'Tour narration ready.'; },
      onError: () => { status.textContent = 'Tour narration could not start. You can continue with Next.'; },
    });
  }

  function open() {
    index = 0;
    render();
    node.hidden = false;
    document.documentElement.classList.add('ft-tour-open');
    next.focus();
  }

  function close() {
    stopPreview();
    if (highlighted) highlighted.classList.remove('ft-showcase-action--tour-target');
    highlighted = null;
    node.hidden = true;
    document.documentElement.classList.remove('ft-tour-open');
  }

  node.open = open;
  node.close = close;
  render();
  return node;
}

let previewAudio = null;
let previewUrl = '';
let previewSource = null;
let previewContext = null;
let previewToken = 0;

function speakPreview(preview, callbacks = {}) {
  const token = ++previewToken;
  stopPreview({ preserveToken: true });
  const context = primePreviewAudio();
  callbacks.onPreparing?.();

  fetch('/.netlify/functions/griot-voice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json;charset=utf-8' },
    body: JSON.stringify({ preview }),
  }).then(async (response) => {
    if (!response.ok) throw new Error('Voice endpoint unavailable');
    const contentType = String(response.headers.get('content-type') || 'audio/mpeg');
    if (!contentType.startsWith('audio/')) throw new Error('Voice endpoint returned non-audio');
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength < 256 || token !== previewToken) throw new Error('Voice endpoint returned no audio');
    if (context) {
      try {
        if (context.state === 'suspended') await context.resume();
        if (context.state !== 'running' || token !== previewToken) throw new Error('Audio context unavailable');
        const buffer = await context.decodeAudioData(bytes.slice(0));
        if (token !== previewToken) return;
        const source = context.createBufferSource();
        previewSource = source;
        source.buffer = buffer;
        source.connect(context.destination);
        source.onended = () => {
          if (token !== previewToken) return;
          previewSource = null;
          callbacks.onEnd?.();
        };
        source.start(0);
        callbacks.onStart?.();
        return;
      } catch { /* HTMLAudio remains the compatibility fallback. */ }
    }
    await playPreviewWithAudio(bytes, contentType, token, callbacks);
  }).catch(() => {
    if (token !== previewToken) return;
    stopPreview({ preserveToken: true });
    callbacks.onError?.();
  });
}

function primePreviewAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  try {
    if (!previewContext) previewContext = new AudioContextClass();
    if (previewContext.state === 'suspended') previewContext.resume().catch(() => {});
    return previewContext;
  } catch { return null; }
}

async function playPreviewWithAudio(bytes, contentType, token, callbacks) {
  previewUrl = URL.createObjectURL(new Blob([bytes], { type: contentType }));
  const audio = new Audio(previewUrl);
  previewAudio = audio;
  audio.preload = 'auto';
  audio.setAttribute('playsinline', '');
  audio.onplay = () => { if (token === previewToken) callbacks.onStart?.(); };
  audio.onended = () => {
    if (token !== previewToken) return;
    stopPreview({ preserveToken: true });
    callbacks.onEnd?.();
  };
  audio.onerror = () => {
    if (token !== previewToken) return;
    stopPreview({ preserveToken: true });
    callbacks.onError?.();
  };
  await audio.play();
}

function stopPreview({ preserveToken = false } = {}) {
  if (!preserveToken) previewToken += 1;
  if (previewSource) {
    previewSource.onended = null;
    try { previewSource.stop(); } catch { /* Already stopped. */ }
    try { previewSource.disconnect(); } catch { /* Already disconnected. */ }
    previewSource = null;
  }
  if (previewAudio) {
    previewAudio.onplay = null;
    previewAudio.onended = null;
    previewAudio.onerror = null;
    try { previewAudio.pause(); } catch { /* Already stopped. */ }
    previewAudio = null;
  }
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = '';
  }
}

export default FlowShowcase;
