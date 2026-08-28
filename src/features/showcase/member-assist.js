import { el, icon } from '../../core/dom.js';
import { navigate } from '../../app/navigation.js';

const VOICE_STORAGE_KEY = 'flowtribe.voice.v1';

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
    route: '/dashboard',
    selector: '.ft-dashboard .ft-welcome',
    eyebrow: '1 · YOUR FLOW',
    title: 'This is your home base.',
    body: 'Flow starts with what matters now. Your dashboard brings your direction, your current pace, and the next useful move into one place.',
    narration: 'Welcome to Flow Tribe. This is your home base. Flow is built to help you keep meaningful goals alive when real life changes the plan. Your dashboard brings your direction, your current pace, and the next useful move into one place.',
  },
  {
    route: '/dashboard',
    selector: '.ft-dashboard .ft-card--brand',
    eyebrow: '2 · DIRECTION',
    title: 'The goal stays visible.',
    body: 'This green card is your direction. Flow protects the destination while allowing the route to change. Momentum tells you whether movement is building.',
    narration: 'This green card is your direction. The goal stays visible, even when the route has to change. Momentum is not a perfection score. It is a quick signal of whether useful movement is building.',
  },
  {
    route: '/dashboard',
    selector: '.ft-dashboard .ft-flow-plan',
    eyebrow: '3 · THE PLAN',
    title: 'Flow reduces the week to useful movement.',
    body: 'Your plan connects next action, evidence and progress. You can act immediately, or adapt the path when reality changes.',
    narration: 'Here is the working plan. Flow connects a next action, evidence that it happened, and progress. You can do the next action immediately, or adapt the path when reality changes.',
  },
  {
    route: '/submit',
    selector: '.ft-submit',
    eyebrow: '4 · SHOW UP',
    title: 'Record movement without over-documenting your life.',
    body: 'Show up is where a meaningful action becomes evidence. A short description is enough; proof or a note is optional.',
    narration: 'Now I have taken you to Show up. This is where a meaningful action becomes evidence. A short description is enough. A link, note or proof is optional. Flow is designed to capture movement, not create admin.',
  },
  {
    route: '/adapt',
    selector: '.ft-adapt-path',
    eyebrow: '5 · ADAPT',
    title: 'When life changes, tell Flow what changed.',
    body: 'Flow Adapt preserves the goal, uses the new reality, and proposes a credible next move. You decide whether to accept it.',
    narration: 'This is Flow Adapt, one of the core ideas in the product. When time, energy, money, work or life changes the conditions, tell Flow what is true now. Flow preserves the goal, proposes a credible revised route, and you remain in control of whether to use it.',
  },
  {
    route: '/leaderboard',
    selector: '#main',
    eyebrow: '6 · TRIBE',
    title: 'Progress is social without becoming punitive.',
    body: 'The Tribe makes movement visible across the community. It is designed to encourage return and shared momentum, not shame people for falling behind.',
    narration: 'This is the Tribe view. Flow can make movement visible across the community, but the purpose is encouragement rather than punishment. The system values returning, recovery and shared momentum.',
  },
  {
    route: '/milestones',
    selector: '#main',
    eyebrow: '7 · MILESTONES',
    title: 'Meaningful progress becomes visible over time.',
    body: 'Milestones recognise patterns of movement and recovery, while Flow Levels show how your relationship with the system develops.',
    narration: 'Milestones make meaningful progress visible over time. They recognise patterns of movement and recovery. Flow Levels add a longer view of how your relationship with the system develops.',
  },
  {
    route: '/profile',
    selector: '#main',
    eyebrow: '8 · YOU',
    title: 'You remain the owner of the direction.',
    body: 'Your profile holds the personal context that helps Flow work around your reality. You can change your direction and preferences as your life changes.',
    narration: 'And this is your profile. You remain the owner of the direction. Your context helps Flow work around your reality, and you can change your direction and preferences as your life changes. That is Flow Tribe: direction, useful action, adaptation, recovery and momentum, with your Tribe around you.',
  },
];

export function MemberAssistControls() {
  const settings = loadVoiceSettings();
  const status = el('span', { class: 'ft-assist__status', attrs: { role: 'status', 'aria-live': 'polite' } });
  const voicePanel = VoicePanel(settings, status);
  const tour = ActiveGuidedTour(settings, status);

  const voice = el('button', {
    class: 'ft-assist__button',
    attrs: { type: 'button', 'aria-label': 'Voice settings', 'aria-expanded': 'false' },
    on: {
      click: () => {
        const opening = voicePanel.hidden;
        voicePanel.hidden = !opening;
        voice.setAttribute('aria-expanded', String(opening));
        if (opening) voicePanel.refreshVoices();
      },
    },
  }, [
    el('span', { class: 'ft-assist__icon' }, icon(MIC_PATHS)),
    el('span', { class: 'ft-assist__label', text: 'Voice' }),
  ]);

  const tourButton = el('button', {
    class: 'ft-assist__button',
    attrs: { type: 'button', 'aria-label': 'Show me round Flow Tribe' },
    on: { click: () => tour.open() },
  }, [
    el('span', { class: 'ft-assist__icon' }, icon(COMPASS_PATHS)),
    el('span', { class: 'ft-assist__label', text: 'Show me round' }),
  ]);

  const node = el('div', { class: 'ft-assist', attrs: { 'aria-label': 'Flow help' } }, [
    voice,
    tourButton,
    status,
    voicePanel,
    tour,
  ]);

  document.addEventListener('click', (event) => {
    if (!node.contains(event.target)) {
      voicePanel.hidden = true;
      voice.setAttribute('aria-expanded', 'false');
    }
  });

  return node;
}

function VoicePanel(settings, status) {
  const voiceSelect = el('select', { class: 'ft-voice-panel__select', attrs: { 'aria-label': 'Choose voice' } });
  const rateValue = el('span', { class: 'ft-voice-panel__value', text: `${settings.rate.toFixed(2)}×` });
  const pitchValue = el('span', { class: 'ft-voice-panel__value', text: settings.pitch.toFixed(2) });
  const narration = el('input', {
    attrs: { type: 'checkbox', checked: settings.narration ? '' : null, 'aria-label': 'Speak guided tour' },
    on: { change: (event) => { settings.narration = event.target.checked; saveVoiceSettings(settings); } },
  });

  const rate = el('input', {
    class: 'ft-voice-panel__range',
    attrs: { type: 'range', min: '0.7', max: '1.3', step: '0.05', value: String(settings.rate), 'aria-label': 'Voice speed' },
    on: {
      input: (event) => {
        settings.rate = Number(event.target.value);
        rateValue.textContent = `${settings.rate.toFixed(2)}×`;
        saveVoiceSettings(settings);
      },
    },
  });

  const pitch = el('input', {
    class: 'ft-voice-panel__range',
    attrs: { type: 'range', min: '0.7', max: '1.3', step: '0.05', value: String(settings.pitch), 'aria-label': 'Voice pitch' },
    on: {
      input: (event) => {
        settings.pitch = Number(event.target.value);
        pitchValue.textContent = settings.pitch.toFixed(2);
        saveVoiceSettings(settings);
      },
    },
  });

  voiceSelect.addEventListener('change', () => {
    settings.voiceURI = voiceSelect.value;
    saveVoiceSettings(settings);
  });

  const preview = el('button', {
    class: 'ft-voice-panel__preview',
    attrs: { type: 'button' },
    text: 'Preview this voice',
    on: {
      click: () => speakText(
        'Hello. I am the Flow Tribe guide. I will help you keep moving when the plan changes.',
        settings,
        status,
      ),
    },
  });

  const panel = el('div', { class: 'ft-voice-panel', attrs: { hidden: true } }, [
    el('div', { class: 'ft-voice-panel__head' }, [
      el('strong', { text: 'Flow voice' }),
      el('span', { text: 'Choose how Flow speaks to you.' }),
    ]),
    el('label', { class: 'ft-voice-panel__field' }, [
      el('span', { text: 'Voice' }),
      voiceSelect,
    ]),
    el('label', { class: 'ft-voice-panel__field' }, [
      el('span', { class: 'ft-row ft-row--between' }, [el('span', { text: 'Speed' }), rateValue]),
      rate,
    ]),
    el('label', { class: 'ft-voice-panel__field' }, [
      el('span', { class: 'ft-row ft-row--between' }, [el('span', { text: 'Pitch' }), pitchValue]),
      pitch,
    ]),
    el('label', { class: 'ft-voice-panel__toggle' }, [narration, el('span', { text: 'Speak the guided tour' })]),
    preview,
  ]);

  function refreshVoices() {
    if (!supportsSpeech()) {
      voiceSelect.replaceChildren(el('option', { attrs: { value: '' }, text: 'Voice unavailable in this browser' }));
      voiceSelect.disabled = true;
      preview.disabled = true;
      return;
    }

    const voices = window.speechSynthesis.getVoices();
    const options = [el('option', { attrs: { value: '' }, text: 'System default' })];
    for (const voice of voices) {
      options.push(el('option', {
        attrs: { value: voice.voiceURI },
        text: `${voice.name} · ${voice.lang}${voice.default ? ' · default' : ''}`,
      }));
    }
    voiceSelect.replaceChildren(...options);
    voiceSelect.value = voices.some((voice) => voice.voiceURI === settings.voiceURI) ? settings.voiceURI : '';
  }

  panel.refreshVoices = refreshVoices;
  refreshVoices();
  if (supportsSpeech()) window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoices);
  return panel;
}

function ActiveGuidedTour(settings, status) {
  let index = 0;
  let startRoute = '/dashboard';
  let currentTarget = null;
  let speaking = false;

  const eyebrow = el('p', { class: 'ft-live-tour__eyebrow' });
  const title = el('h2', { class: 'ft-live-tour__title', attrs: { id: 'member-live-tour-title' } });
  const body = el('p', { class: 'ft-live-tour__body' });
  const counter = el('span', { class: 'ft-live-tour__counter' });
  const narrationState = el('span', { class: 'ft-live-tour__narration', text: 'Narration on' });

  const back = el('button', {
    class: 'ft-live-tour__button ft-live-tour__button--quiet',
    attrs: { type: 'button' },
    text: 'Back',
    on: { click: async () => { if (index > 0) { index -= 1; await showStep(); } } },
  });

  const replay = el('button', {
    class: 'ft-live-tour__button ft-live-tour__button--quiet',
    attrs: { type: 'button' },
    text: 'Replay voice',
    on: { click: () => narrateCurrent() },
  });

  const next = el('button', {
    class: 'ft-live-tour__button ft-live-tour__button--primary',
    attrs: { type: 'button' },
    text: 'Next',
    on: {
      click: async () => {
        if (index === TOUR_STEPS.length - 1) close();
        else { index += 1; await showStep(); }
      },
    },
  });

  const node = el('div', {
    class: 'ft-live-tour',
    attrs: { hidden: true, role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'member-live-tour-title' },
  }, [
    el('div', { class: 'ft-live-tour__panel' }, [
      el('div', { class: 'ft-live-tour__top' }, [
        el('div', { class: 'ft-live-tour__meta' }, [counter, narrationState]),
        el('button', {
          class: 'ft-live-tour__close',
          attrs: { type: 'button', 'aria-label': 'Close guided tour' },
          text: '×',
          on: { click: close },
        }),
      ]),
      eyebrow,
      title,
      body,
      el('div', { class: 'ft-live-tour__footer' }, [back, replay, next]),
    ]),
  ]);

  async function showStep() {
    const step = TOUR_STEPS[index];
    stopSpeaking();
    clearTarget();

    eyebrow.textContent = step.eyebrow;
    title.textContent = step.title;
    body.textContent = step.body;
    counter.textContent = `${index + 1} of ${TOUR_STEPS.length}`;
    narrationState.textContent = settings.narration ? 'Narration on' : 'Narration off';
    back.disabled = index === 0;
    next.textContent = index === TOUR_STEPS.length - 1 ? 'Finish' : 'Next';

    if (currentRoute() !== step.route) {
      navigate(step.route);
    }

    // Speak immediately. Target discovery and scrolling can take a moment on a
    // newly loaded view, but the guide should never feel silent while the app
    // catches up visually.
    if (settings.narration) {
      window.setTimeout(() => narrateCurrent(), 180);
    }

    currentTarget = await waitForTarget(step.selector);
    if (currentTarget) {
      currentTarget.classList.add('ft-live-tour-target');
      currentTarget.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }
  }

  function narrateCurrent() {
    if (!settings.narration) return;
    const step = TOUR_STEPS[index];
    speaking = true;
    speakText(step.narration, settings, status, {
      onStart: () => {
        speaking = true;
        narrationState.textContent = 'Speaking…';
      },
      onEnd: () => {
        speaking = false;
        narrationState.textContent = 'Narration on';
      },
      onError: () => {
        speaking = false;
        narrationState.textContent = 'Voice unavailable';
      },
    });
  }

  async function open() {
    startRoute = currentRoute();
    index = 0;
    node.hidden = false;
    document.documentElement.classList.add('ft-live-tour-open');
    await showStep();
    next.focus();
  }

  function close() {
    stopSpeaking();
    clearTarget();
    node.hidden = true;
    document.documentElement.classList.remove('ft-live-tour-open');
    if (startRoute && currentRoute() !== startRoute) navigate(startRoute);
  }

  function stopSpeaking() {
    if (speaking && supportsSpeech()) window.speechSynthesis.cancel();
    speaking = false;
  }

  function clearTarget() {
    if (currentTarget) currentTarget.classList.remove('ft-live-tour-target');
    currentTarget = null;
  }

  node.open = open;
  return node;
}

function speakText(text, settings, status, callbacks = {}) {
  if (!supportsSpeech()) {
    status.textContent = 'Voice is not available in this browser.';
    callbacks.onError?.();
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  const selected = voices.find((voice) => voice.voiceURI === settings.voiceURI);
  if (selected) utterance.voice = selected;
  utterance.rate = settings.rate;
  utterance.pitch = settings.pitch;
  utterance.volume = 1;
  utterance.onstart = () => {
    status.textContent = 'Flow is speaking.';
    callbacks.onStart?.();
  };
  utterance.onend = () => {
    status.textContent = 'Flow voice ready.';
    callbacks.onEnd?.();
  };
  utterance.onerror = () => {
    status.textContent = 'Flow voice could not start.';
    callbacks.onError?.();
  };
  window.speechSynthesis.speak(utterance);
}

function supportsSpeech() {
  return 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

function currentRoute() {
  const hash = window.location.hash || '#/dashboard';
  return hash.startsWith('#') ? hash.slice(1).split('?')[0] : hash;
}

async function waitForTarget(selector, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const target = document.querySelector(selector);
    if (target) return target;
    await new Promise((resolve) => window.setTimeout(resolve, 80));
  }
  return document.querySelector('#main');
}

function loadVoiceSettings() {
  const defaults = { voiceURI: '', rate: 0.92, pitch: 1, narration: true };
  try {
    const saved = JSON.parse(localStorage.getItem(VOICE_STORAGE_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return defaults;
    return {
      voiceURI: typeof saved.voiceURI === 'string' ? saved.voiceURI : '',
      rate: clampNumber(saved.rate, 0.7, 1.3, defaults.rate),
      pitch: clampNumber(saved.pitch, 0.7, 1.3, defaults.pitch),
      narration: saved.narration !== false,
    };
  } catch {
    return defaults;
  }
}

function saveVoiceSettings(settings) {
  try {
    localStorage.setItem(VOICE_STORAGE_KEY, JSON.stringify({
      voiceURI: settings.voiceURI,
      rate: settings.rate,
      pitch: settings.pitch,
      narration: settings.narration,
    }));
  } catch {
    // Voice preferences are convenience only. The feature remains usable when
    // storage is unavailable (for example in strict private browsing modes).
  }
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}
