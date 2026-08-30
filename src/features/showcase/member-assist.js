import { el, icon } from '../../core/dom.js';
import { call } from '../../core/api.js';
import { navigate } from '../../app/navigation.js';
import { GriotControl } from './meta-ai.js';

const VOICE_STORAGE_KEY = 'flowtribe.voice.v2';

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
    route: '/dashboard', selector: '.ft-dashboard .ft-welcome', eyebrow: '1 · WHAT FLOW IS FOR',
    title: 'Flow keeps meaningful goals alive when life changes.',
    body: 'Flow Tribe is not a to-do list. It keeps a destination visible, turns it into useful movement, helps you adapt when reality changes, and makes recovery part of progress.',
    narration: 'Welcome to Flow Tribe. The central idea is simple. A useful system should not only work when the plan works. Flow helps you keep a meaningful goal alive when work, money, energy, time or life changes the route. It protects direction, reduces progress to useful movement, and treats recovery as part of progress rather than failure.',
  },
  {
    route: '/dashboard', selector: '.ft-dashboard .ft-welcome', eyebrow: '2 · YOUR HOME BASE',
    title: 'Your Flow puts the important things in one place.',
    body: 'The dashboard brings together direction, pace, the next useful move, evidence, progress and the signals Flow uses to decide how much help to offer.',
    narration: 'This is your home base. Instead of making you manage the system, the dashboard brings together your direction, current pace, next useful move, evidence and progress. Flow also reads these patterns to decide whether to stay light touch, offer normal guidance, or become more active when you appear to be slipping.',
  },
  {
    route: '/dashboard', selector: '.ft-dashboard .ft-card--brand', eyebrow: '3 · DIRECTION',
    title: 'The destination stays visible.',
    body: 'Your goal is the anchor. Momentum shows whether useful movement is building; it is not a punishment score.',
    narration: 'This green card is your direction. Flow protects the destination while allowing the route to change. Momentum is a quick signal of useful movement, not a perfection score and not a judgement on you.',
  },
  {
    route: '/direction', selector: '#main', eyebrow: '4 · EDIT DIRECTION',
    title: 'You own the goal and what showing up means.',
    body: 'Direction lets you change the goal, the form of meaningful action and the constraints Flow should plan around as your life changes.',
    narration: 'Direction is where you tell Flow what matters, what showing up looks like, and what conditions the plan needs to respect. You remain the owner of the destination. Flow can adapt a route, but it should not silently rewrite your goal.',
  },
  {
    route: '/dashboard', selector: '.ft-dashboard .ft-flow-plan', eyebrow: '5 · YOUR PLAN',
    title: 'A plan becomes next action, evidence and progress.',
    body: 'Flow deliberately reduces a large goal to the next useful move, proof that movement happened, and a visible sense of pace.',
    narration: 'Here is the working plan. Flow connects three things. First, a next action. Second, lightweight evidence that it happened. Third, progress. This keeps the system useful without turning your life into project administration.',
  },
  {
    route: '/submit', selector: '.ft-submit', eyebrow: '6 · SHOW UP',
    title: 'Record a meaningful move in seconds.',
    body: 'Show up turns action into evidence. Describe what moved; add a link, note or proof only when it is useful.',
    narration: 'Now I have taken you to Show up. This is where a meaningful action becomes evidence. Say what you did in one clear line. A link, result, note or proof is optional. The purpose is to preserve movement, not create paperwork.',
  },
  {
    route: '/adapt', selector: '.ft-adapt-path', eyebrow: '7 · FLOW ADAPT',
    title: 'When reality changes, change the path rather than abandon the goal.',
    body: 'Tell Flow what changed. It preserves the destination, proposes a credible revised route, and leaves the decision with you.',
    narration: 'This is Flow Adapt, one of the core functions. When the old plan stops fitting reality, tell Flow what is true now. Flow preserves the goal, proposes a smaller or different next move, and you decide whether to use that revised path. That is how the product handles running late, interruption and recovery.',
  },
  {
    route: '/dashboard', selector: '.ft-dashboard .ft-constraint', eyebrow: '8 · CONSTRAINTS',
    title: 'The plan can remember what it must work around.',
    body: 'Active constraints keep the plan honest about time, money, energy, access or other real conditions.',
    narration: 'When you give Flow a constraint, it becomes part of the planning context. That matters because a technically perfect plan that ignores your actual time, energy, money or access is not a useful plan.',
  },
  {
    route: '/dashboard', selector: '.ft-dashboard .ft-activity-calendar', eyebrow: '9 · MOVEMENT HISTORY',
    title: 'Returning becomes visible.',
    body: 'The movement calendar shows evidence of return over time. It is designed to make continuity and recovery visible, not just uninterrupted streaks.',
    narration: 'Your movement history makes return visible over time. Flow is interested in continuity, but it also values coming back after interruption. A broken streak is information, not the end of the journey.',
  },
  {
    route: '/dashboard', selector: '.ft-dashboard .ft-grid--4', eyebrow: '10 · YOUR NUMBERS',
    title: 'A few signals show the shape of your momentum.',
    body: 'Return streak, best streak, lifetime actions and active days give context without overwhelming you with analytics.',
    narration: 'These are your core signals. Return streak, best streak, lifetime actions and active days give you enough context to see the shape of your movement without turning Flow into an analytics dashboard you have to manage.',
  },
  {
    route: '/levels', selector: '#main', eyebrow: '11 · FLOW LEVELS',
    title: 'Levels show how your relationship with Flow develops.',
    body: 'Levels recognise sustained use and deeper patterns of movement rather than one isolated burst of activity.',
    narration: 'Flow Levels give a longer view. They show how your relationship with the system develops as meaningful movement becomes more established. The point is not status for its own sake, but a visible sense of development.',
  },
  {
    route: '/leaderboard', selector: '#main', eyebrow: '12 · TRIBE',
    title: 'Progress can be social without becoming punitive.',
    body: 'The Tribe makes movement visible across the community to encourage return and shared momentum, not shame people for falling behind.',
    narration: 'This is the Tribe. Flow can make movement visible across the community, but the purpose is encouragement rather than punishment. People can see momentum, return and shared movement without turning the system into a public failure table.',
  },
  {
    route: '/milestones', selector: '#main', eyebrow: '13 · MILESTONES',
    title: 'Meaningful patterns are recognised over time.',
    body: 'Milestones recognise movement, return and recovery so progress is visible even when it is not linear.',
    narration: 'Milestones recognise meaningful patterns over time. That can include movement, consistency, return and recovery. They help make progress visible even when the path has not been perfectly linear.',
  },
  {
    route: '/profile', selector: '#main', eyebrow: '14 · YOU',
    title: 'Your context stays under your control.',
    body: 'Your profile carries the personal context that helps Flow work around your reality. You can update it as your life changes.',
    narration: 'This is your profile. Your context helps Flow work around your reality, and you can change it as your life changes. The product is supposed to adapt to you, not force you to keep serving an old version of the plan.',
  },
  {
    route: '/dashboard', selector: '.ft-griot__button', eyebrow: '15 · GRIOT',
    title: 'Talk to Griot about your actual Flow.',
    body: 'Griot is the intelligent companion inside Flow Tribe. Type or speak naturally; the same conversation stays grounded in your direction, movement, constraints and history.',
    narration: 'Griot is the intelligent companion inside Flow Tribe. You can type or speak naturally, and both routes enter the same conversation. Griot works from your actual direction, movement, constraints and recent evidence, so you can talk about what is happening without translating your life into app commands.',
  },
  {
    route: '/dashboard', selector: '.ft-griot__button', eyebrow: '16 · ADAPTIVE HELP',
    title: 'Griot changes the intensity of help, not just the plan.',
    body: 'Strong momentum means lighter-touch help. Mixed movement gets contextual guidance. Constraints or low recent movement can trigger more active recovery prompts.',
    narration: 'Flow also adapts the amount of help Griot offers. When your current rhythm is strong, Griot stays light touch. When movement is mixed, it offers contextual guidance. When constraints are active or recent movement is very low, Griot can become more proactive. The aim is enough help without crowding you.',
  },
  {
    route: '/dashboard', selector: '.ft-assist', eyebrow: '17 · VOICE AND GUIDED HELP',
    title: 'Griot speaks with a small set of voices chosen for this experience.',
    body: 'Griot has one consistent server voice across desktop and mobile. Device speech is fallback only.',
    narration: 'Finally, Griot has one consistent voice across desktop and mobile rather than a changing operating system voice. The same voice reads Griot replies and guides this tour. Show me round remains self running, and you can pause, go back, replay or jump ahead whenever you want control.',
  },
];

const VOICE_PROFILES = [
  {
    id: 'warm', label: 'Griot — Warm & grounded',
    languages: ['en-NG', 'en-GB', 'en-IE', 'en-AU', 'en-US'],
    names: ['serena', 'samantha', 'ava', 'karen', 'moira', 'daniel', 'google uk english female', 'microsoft sonia'],
  },
  {
    id: 'calm', label: 'Calm Guide',
    languages: ['en-GB', 'en-IE', 'en-AU', 'en-US'],
    names: ['serena', 'moira', 'samantha', 'tessa', 'ava', 'microsoft libby', 'google uk english female'],
  },
  {
    id: 'coach', label: 'Clear Coach',
    languages: ['en-GB', 'en-US', 'en-AU'],
    names: ['daniel', 'alex', 'aaron', 'microsoft ryan', 'google uk english male', 'arthur'],
  },
];

export function MemberAssistControls() {
  const settings = loadVoiceSettings();
  const status = el('span', { class: 'ft-assist__status', attrs: { role: 'status', 'aria-live': 'polite' } });
  const voicePanel = VoicePanel(settings, status);
  const tour = ActiveGuidedTour(settings, status);
  const griot = GriotControl({ status });

  const voice = el('button', {
    class: 'ft-assist__button',
    attrs: { type: 'button', 'aria-label': 'Griot voice settings', 'aria-expanded': 'false' },
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
    griot,
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

  document.addEventListener('flowtribe:griot-speak', (event) => {
    const text = String(event.detail?.text || '').trim();
    if (text) speakText(text, settings, status);
  });

  document.addEventListener('flowtribe:tour-open', () => tour.open());

  // Unlock Web Audio from a real member gesture so asynchronous server speech
  // can play later on iOS/Safari as well as desktop browsers.
  node.addEventListener('pointerdown', primeVoicePlayback, { once: true, capture: true });
  node.addEventListener('touchstart', primeVoicePlayback, { once: true, capture: true, passive: true });
  node.addEventListener('keydown', primeVoicePlayback, { once: true, capture: true });

  return node;
}

function VoicePanel(settings, status) {
  const voiceSelect = el('select', { class: 'ft-voice-panel__select', attrs: { 'aria-label': 'Choose Griot voice' } });
  const rateValue = el('span', { class: 'ft-voice-panel__value', text: `${settings.rate.toFixed(2)}×` });
  const narration = el('input', {
    attrs: { type: 'checkbox', checked: settings.narration ? '' : null, 'aria-label': 'Speak guided tour' },
    on: { change: (event) => { settings.narration = event.target.checked; saveVoiceSettings(settings); } },
  });

  const rate = el('input', {
    class: 'ft-voice-panel__range',
    attrs: { type: 'range', min: '0.8', max: '1.15', step: '0.05', value: String(settings.rate), 'aria-label': 'Voice speed' },
    on: {
      input: (event) => {
        settings.rate = Number(event.target.value);
        rateValue.textContent = `${settings.rate.toFixed(2)}×`;
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
    text: 'Hear this voice',
    on: { click: () => speakText('Hello. I am Griot. Tell me what changed, and we will work out the next credible move together.', settings, status) },
  });

  const panel = el('div', { class: 'ft-voice-panel', attrs: { hidden: true } }, [
    el('div', { class: 'ft-voice-panel__head' }, [
      el('strong', { text: 'Griot voice' }),
      el('span', { text: 'A small set chosen for warmth, clarity and calm.' }),
    ]),
    el('label', { class: 'ft-voice-panel__field' }, [el('span', { text: 'Voice' }), voiceSelect]),
    el('label', { class: 'ft-voice-panel__field' }, [
      el('span', { class: 'ft-row ft-row--between' }, [el('span', { text: 'Pace' }), rateValue]), rate,
    ]),
    el('label', { class: 'ft-voice-panel__toggle' }, [narration, el('span', { text: 'Speak the guided tour' })]),
    preview,
  ]);

  function refreshVoices() {
    voiceSelect.replaceChildren(el('option', {
      attrs: { value: 'griot-server' },
      text: 'Griot — consistent voice',
    }));
    voiceSelect.value = 'griot-server';
    voiceSelect.disabled = true;
    settings.voiceURI = 'griot-server';
    saveVoiceSettings(settings);
  }

  panel.refreshVoices = refreshVoices;
  refreshVoices();
  if (supportsSpeech()) window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoices);
  return panel;
}

function curateVoices(allVoices) {
  const english = allVoices.filter((voice) => /^en([-_]|$)/i.test(voice.lang || ''));
  const pool = english.length ? english : allVoices;
  if (!pool.length) return [];

  const result = [];
  const used = new Set();

  const african = pool
    .filter((voice) => /^en[-_](NG|ZA|KE|GH)$/i.test(voice.lang || ''))
    .sort((a, b) => voiceQualityScore(b) - voiceQualityScore(a))[0];
  if (african) {
    result.push({ voice: african, label: 'African English' });
    used.add(african.voiceURI);
  }

  for (const profile of VOICE_PROFILES) {
    const available = pool.filter((voice) => !used.has(voice.voiceURI));
    if (!available.length) break;
    const ranked = available
      .map((voice) => ({ voice, score: scoreVoiceForProfile(voice, profile) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0]?.voice;
    if (!best) continue;
    result.push({ voice: best, label: profile.label });
    used.add(best.voiceURI);
  }

  if (!result.length) result.push({ voice: pool[0], label: 'Griot — Device voice' });
  return result.slice(0, 4);
}

function scoreVoiceForProfile(voice, profile) {
  const lang = String(voice.lang || '').replace('_', '-');
  const name = String(voice.name || '').toLowerCase();
  let score = voiceQualityScore(voice);

  const languageIndex = profile.languages.findIndex((item) => lang.toLowerCase() === item.toLowerCase());
  if (languageIndex >= 0) score += 80 - (languageIndex * 8);
  else if (/^en/i.test(lang)) score += 25;

  const nameIndex = profile.names.findIndex((item) => name.includes(item));
  if (nameIndex >= 0) score += 100 - (nameIndex * 6);
  return score;
}

function voiceQualityScore(voice) {
  const name = String(voice.name || '').toLowerCase();
  let score = 0;
  if (voice.localService === false) score += 8;
  if (voice.default) score += 10;
  if (/premium|enhanced|natural|neural|online/.test(name)) score += 35;
  if (/compact|espeak|novelty/.test(name)) score -= 35;
  return score;
}

function ActiveGuidedTour(settings, status) {
  let index = 0;
  let startRoute = '/dashboard';
  let currentTarget = null;
  let speaking = false;
  let autoplay = true;
  let advanceTimer = null;
  let stepToken = 0;

  const eyebrow = el('p', { class: 'ft-live-tour__eyebrow' });
  const title = el('h2', { class: 'ft-live-tour__title', attrs: { id: 'member-live-tour-title' } });
  const body = el('p', { class: 'ft-live-tour__body' });
  const counter = el('span', { class: 'ft-live-tour__counter' });
  const narrationState = el('span', { class: 'ft-live-tour__narration', text: 'Auto tour · narration on' });

  const back = el('button', {
    class: 'ft-live-tour__button ft-live-tour__button--quiet', attrs: { type: 'button' }, text: 'Back',
    on: { click: async () => { if (index > 0) { index -= 1; await showStep(); } } },
  });

  const pause = el('button', {
    class: 'ft-live-tour__button ft-live-tour__button--quiet', attrs: { type: 'button' }, text: 'Pause',
    on: { click: () => toggleAutoplay() },
  });

  const replay = el('button', {
    class: 'ft-live-tour__button ft-live-tour__button--quiet', attrs: { type: 'button' }, text: 'Replay voice',
    on: { click: () => { clearAdvance(); narrateCurrent(stepToken); } },
  });

  const next = el('button', {
    class: 'ft-live-tour__button ft-live-tour__button--primary', attrs: { type: 'button' }, text: 'Next now',
    on: { click: () => advance() },
  });

  const node = el('div', {
    class: 'ft-live-tour', attrs: { hidden: true, role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'member-live-tour-title' },
  }, [
    el('div', { class: 'ft-live-tour__panel' }, [
      el('div', { class: 'ft-live-tour__top' }, [
        el('div', { class: 'ft-live-tour__meta' }, [counter, narrationState]),
        el('button', {
          class: 'ft-live-tour__close', attrs: { type: 'button', 'aria-label': 'Close guided tour' }, text: '×', on: { click: close },
        }),
      ]),
      eyebrow, title, body,
      el('div', { class: 'ft-live-tour__footer' }, [back, pause, replay, next]),
    ]),
  ]);

  async function showStep() {
    const token = ++stepToken;
    const step = TOUR_STEPS[index];
    clearAdvance();
    stopSpeaking();
    clearTarget();

    eyebrow.textContent = step.eyebrow;
    title.textContent = step.title;
    body.textContent = step.body;
    counter.textContent = `${index + 1} of ${TOUR_STEPS.length}`;
    updateTourState();
    back.disabled = index === 0;
    next.textContent = index === TOUR_STEPS.length - 1 ? 'Finish now' : 'Next now';

    if (currentRoute() !== step.route) navigate(step.route);

    if (settings.narration) window.setTimeout(() => { if (token === stepToken) narrateCurrent(token); }, 180);
    else if (autoplay) scheduleAdvance(token, readingDelay(step));

    currentTarget = await waitForTarget(step.selector);
    if (token !== stepToken) return;
    if (currentTarget) {
      currentTarget.classList.add('ft-live-tour-target');
      currentTarget.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }
  }

  function narrateCurrent(token = stepToken) {
    if (!settings.narration || token !== stepToken) return;
    const step = TOUR_STEPS[index];
    speaking = true;
    speakText(step.narration, settings, status, {
      onStart: () => {
        if (token !== stepToken) return;
        speaking = true;
        narrationState.textContent = autoplay ? 'Auto tour · speaking…' : 'Paused · speaking…';
      },
      onEnd: () => {
        if (token !== stepToken) return;
        speaking = false;
        updateTourState();
        if (autoplay) scheduleAdvance(token, 900);
      },
      onError: () => {
        if (token !== stepToken) return;
        speaking = false;
        narrationState.textContent = 'Voice unavailable · auto tour';
        if (autoplay) scheduleAdvance(token, readingDelay(step));
      },
    });
  }

  function scheduleAdvance(token, delay) {
    clearAdvance();
    advanceTimer = window.setTimeout(() => {
      if (!autoplay || token !== stepToken || node.hidden) return;
      advance();
    }, delay);
  }

  async function advance() {
    clearAdvance();
    if (index === TOUR_STEPS.length - 1) { close(); return; }
    index += 1;
    await showStep();
  }

  function toggleAutoplay() {
    autoplay = !autoplay;
    pause.textContent = autoplay ? 'Pause' : 'Resume';
    updateTourState();
    if (!autoplay) clearAdvance();
    else if (!speaking) {
      if (settings.narration) narrateCurrent(stepToken);
      else scheduleAdvance(stepToken, 1000);
    }
  }

  function updateTourState() {
    pause.textContent = autoplay ? 'Pause' : 'Resume';
    narrationState.textContent = `${autoplay ? 'Auto tour' : 'Paused'} · ${settings.narration ? (speaking ? 'speaking…' : 'narration on') : 'narration off'}`;
  }

  async function open() {
    if (!node.hidden) return;
    startRoute = currentRoute();
    index = 0;
    autoplay = true;
    node.hidden = false;
    document.documentElement.classList.add('ft-live-tour-open');
    await showStep();
    pause.focus();
  }

  function close() {
    clearAdvance();
    stopSpeaking();
    clearTarget();
    node.hidden = true;
    document.documentElement.classList.remove('ft-live-tour-open');
    if (startRoute && currentRoute() !== startRoute) navigate(startRoute);
  }

  function clearAdvance() {
    if (advanceTimer) window.clearTimeout(advanceTimer);
    advanceTimer = null;
  }

  function stopSpeaking() {
    stopVoicePlayback();
    speaking = false;
  }

  function clearTarget() {
    if (currentTarget) currentTarget.classList.remove('ft-live-tour-target');
    currentTarget = null;
  }

  node.open = open;
  return node;
}

let activeVoiceAudio = null;
let activeVoiceUrl = '';
let activeVoiceSource = null;
let voiceAudioContext = null;
let voiceRequestToken = 0;

function primeVoicePlayback() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  try {
    if (!voiceAudioContext) voiceAudioContext = new AudioContextClass();
    if (voiceAudioContext.state === 'suspended') voiceAudioContext.resume().catch(() => {});
    return voiceAudioContext;
  } catch { return null; }
}

function speakText(text, settings, status, callbacks = {}) {
  const token = ++voiceRequestToken;
  stopVoicePlayback({ preserveToken: true });
  primeVoicePlayback();
  status.textContent = 'Griot is preparing voice.';

  call('griot.speak', { text: String(text || ''), rate: settings.rate }, { timeout: 35000, retry: false })
    .then((result) => {
      if (token !== voiceRequestToken) return;
      const encoded = String(result?.audioBase64 || '');
      if (!encoded) throw new Error('No speech audio returned.');
      return playServerVoice(encoded, String(result?.mimeType || 'audio/mpeg'), token, status, callbacks);
    })
    .catch(() => {
      if (token === voiceRequestToken) speakDeviceFallback(text, settings, status, callbacks, token);
    });
}

async function playServerVoice(encoded, mimeType, token, status, callbacks) {
  const binary = window.atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

  const context = primeVoicePlayback();
  if (context) {
    try {
      if (context.state === 'suspended') await context.resume();
      if (token !== voiceRequestToken || context.state !== 'running') throw new Error('Audio context unavailable');
      const buffer = await context.decodeAudioData(bytes.buffer.slice(0));
      if (token !== voiceRequestToken) return;
      const source = context.createBufferSource();
      activeVoiceSource = source;
      source.buffer = buffer;
      source.connect(context.destination);
      source.onended = () => {
        if (token !== voiceRequestToken) return;
        if (activeVoiceSource === source) activeVoiceSource = null;
        status.textContent = 'Griot voice ready.';
        callbacks.onEnd?.();
      };
      source.start(0);
      status.textContent = 'Griot is speaking.';
      callbacks.onStart?.();
      return;
    } catch { /* Fall through to HTMLAudio. */ }
  }

  return playHtmlServerAudio(bytes, mimeType, token, status, callbacks);
}

function playHtmlServerAudio(bytes, mimeType, token, status, callbacks) {
  cleanupHtmlAudio();
  activeVoiceUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const audio = new Audio();
  activeVoiceAudio = audio;
  audio.preload = 'auto';
  audio.setAttribute('playsinline', '');
  audio.src = activeVoiceUrl;
  audio.onplay = () => {
    if (token !== voiceRequestToken) return;
    status.textContent = 'Griot is speaking.';
    callbacks.onStart?.();
  };
  audio.onended = () => {
    if (token !== voiceRequestToken) return;
    cleanupHtmlAudio();
    status.textContent = 'Griot voice ready.';
    callbacks.onEnd?.();
  };
  audio.onerror = () => {
    if (token !== voiceRequestToken) return;
    cleanupHtmlAudio();
    callbacks.onError?.();
  };
  return audio.play();
}

function speakDeviceFallback(text, settings, status, callbacks, token) {
  if (!supportsSpeech()) {
    status.textContent = 'Griot voice is unavailable right now.';
    callbacks.onError?.();
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(String(text || '').replace(/\bGriot\b/gi, 'Gree-oh'));
  utterance.rate = settings.rate;
  utterance.pitch = 1;
  utterance.volume = 1;
  utterance.onstart = () => {
    if (token !== voiceRequestToken) return;
    status.textContent = 'Griot is speaking with the device fallback.';
    callbacks.onStart?.();
  };
  utterance.onend = () => {
    if (token !== voiceRequestToken) return;
    status.textContent = 'Griot voice ready.';
    callbacks.onEnd?.();
  };
  utterance.onerror = () => {
    if (token !== voiceRequestToken) return;
    status.textContent = 'Griot voice could not start.';
    callbacks.onError?.();
  };
  window.speechSynthesis.speak(utterance);
}

function cleanupHtmlAudio() {
  if (activeVoiceAudio) {
    activeVoiceAudio.onplay = null;
    activeVoiceAudio.onended = null;
    activeVoiceAudio.onerror = null;
    try { activeVoiceAudio.pause(); } catch { /* Already stopped. */ }
    activeVoiceAudio = null;
  }
  if (activeVoiceUrl) {
    URL.revokeObjectURL(activeVoiceUrl);
    activeVoiceUrl = '';
  }
}

function stopVoicePlayback({ preserveToken = false } = {}) {
  if (!preserveToken) voiceRequestToken += 1;
  if (activeVoiceSource) {
    activeVoiceSource.onended = null;
    try { activeVoiceSource.stop(); } catch { /* Already stopped. */ }
    try { activeVoiceSource.disconnect(); } catch { /* Already disconnected. */ }
    activeVoiceSource = null;
  }
  cleanupHtmlAudio();
  if (supportsSpeech()) window.speechSynthesis.cancel();
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

function readingDelay(step) {
  const words = String(step.body || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(5500, Math.min(12000, words * 320));
}

function loadVoiceSettings() {
  const defaults = { voiceURI: '', rate: 0.92, narration: true };
  try {
    const saved = JSON.parse(localStorage.getItem(VOICE_STORAGE_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return defaults;
    return {
      voiceURI: typeof saved.voiceURI === 'string' ? saved.voiceURI : '',
      rate: clampNumber(saved.rate, 0.8, 1.15, defaults.rate),
      narration: saved.narration !== false,
    };
  } catch { return defaults; }
}

function saveVoiceSettings(settings) {
  try {
    localStorage.setItem(VOICE_STORAGE_KEY, JSON.stringify({
      voiceURI: settings.voiceURI,
      rate: settings.rate,
      narration: settings.narration,
    }));
  } catch { /* Preferences are convenience only. */ }
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}
