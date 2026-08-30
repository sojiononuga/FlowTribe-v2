import { el, icon } from '../../core/dom.js';
import { call } from '../../core/api.js';
import { navigate } from '../../app/navigation.js';

const HELP_STORAGE_KEY = 'flowtribe.griot.help.v1';
const PREF_STORAGE_KEY = 'flowtribe.griot.preferences.v1';
const CONTEXT_CACHE_MS = 30000;
const MAX_HISTORY = 10;

const SPARKLE_PATHS = [
  'M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z',
  'M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z',
  'M5 14l.7 1.8L7.5 16.5l-1.8.7L5 19l-.7-1.8-1.8-.7 1.8-.7L5 14z',
];

const MIC_PATHS = [
  'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z',
  'M19 10v2a7 7 0 0 1-14 0v-2',
  'M12 19v3',
  'M8 22h8',
];

const SPEAKER_PATHS = [
  'M11 5 6 9H2v6h4l5 4V5z',
  'M15.5 8.5a5 5 0 0 1 0 7',
  'M18 6a8 8 0 0 1 0 12',
];

export function GriotControl({ status } = {}) {
  const preferences = loadPreferences();
  const state = {
    dashboard: null,
    help: { intensity: 'standard', reason: 'I will learn from your Flow as you use it.' },
    loadingContext: false,
    asking: false,
    lastLoadedAt: 0,
    history: [],
    recognition: null,
    listening: false,
    preferences,
  };

  const messages = el('div', {
    class: 'ft-meta-ai__messages',
    attrs: { role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversation with Griot' },
  });
  const helpBadge = el('span', { class: 'ft-meta-ai__help-badge', text: 'Learning your Flow' });
  const input = el('textarea', {
    class: 'ft-meta-ai__input',
    attrs: {
      rows: '2',
      placeholder: 'Tell Griot what is happening, or ask what to do next…',
      'aria-label': 'Ask Griot a question',
      enterkeyhint: 'send',
    },
    on: {
      keydown: (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          ask(input.value, { spoken: false });
        }
      },
    },
  });

  const micButton = el('button', {
    class: 'ft-meta-ai__mic',
    attrs: { type: 'button', 'aria-label': 'Talk to Griot', 'aria-pressed': 'false' },
    on: { click: () => toggleListening() },
  }, [el('span', { class: 'ft-meta-ai__mic-icon' }, icon(MIC_PATHS))]);

  const speakButton = el('button', {
    class: 'ft-meta-ai__speak-toggle',
    attrs: {
      type: 'button',
      'aria-label': 'Speak Griot replies',
      'aria-pressed': String(state.preferences.speakReplies),
      title: 'Speak replies',
    },
    on: {
      click: () => {
        state.preferences.speakReplies = !state.preferences.speakReplies;
        speakButton.setAttribute('aria-pressed', String(state.preferences.speakReplies));
        savePreferences(state.preferences);
        announce(state.preferences.speakReplies ? 'Griot will speak replies.' : 'Griot replies will stay silent.');
      },
    },
  }, [el('span', { class: 'ft-meta-ai__mic-icon' }, icon(SPEAKER_PATHS))]);

  const sendButton = el('button', {
    class: 'ft-meta-ai__send',
    attrs: { type: 'submit' },
    text: 'Send',
  });

  const panel = el('section', {
    class: 'ft-meta-ai__panel ft-griot__panel',
    attrs: { hidden: true, 'aria-label': 'Griot', role: 'dialog', 'aria-modal': 'false' },
  }, [
    el('div', { class: 'ft-meta-ai__head' }, [
      el('div', {}, [
        el('strong', { text: 'Griot' }),
        el('p', { text: 'Your Flow companion. Talk naturally — Griot works from your direction, progress, constraints and this conversation.' }),
      ]),
      el('div', { class: 'ft-griot__head-actions' }, [helpBadge, speakButton]),
    ]),
    messages,
    el('div', { class: 'ft-meta-ai__quick' }, [
      quick('What should I focus on now?'),
      quick('I am falling behind'),
      quick('Something changed'),
      quick('Talk me through my Flow'),
    ]),
    el('form', {
      class: 'ft-meta-ai__composer',
      on: { submit: (event) => { event.preventDefault(); ask(input.value, { spoken: false }); } },
    }, [
      micButton,
      input,
      sendButton,
    ]),
  ]);

  const nudge = el('button', {
    class: 'ft-meta-ai__nudge',
    attrs: { type: 'button', hidden: true },
    on: { click: () => open(true) },
  });

  const button = el('button', {
    class: 'ft-assist__button ft-meta-ai__button ft-griot__button',
    attrs: { type: 'button', 'aria-label': 'Ask Griot', 'aria-expanded': 'false' },
    on: { click: () => panel.hidden ? open() : close() },
  }, [
    el('span', { class: 'ft-assist__icon ft-meta-ai__sparkle' }, icon(SPARKLE_PATHS)),
    el('span', { class: 'ft-assist__label', text: 'Ask Griot' }),
  ]);

  const node = el('div', { class: 'ft-meta-ai ft-griot' }, [button, nudge, panel]);

  configureRecognition();
  syncVisualViewport();

  document.addEventListener('click', (event) => {
    if (!node.contains(event.target) && !panel.hidden && !isCompactViewport()) close();
  });
  window.addEventListener('hashchange', () => {
    if (isMemberRoute()) window.setTimeout(() => refreshContext({ proactive: true }), 650);
  });
  window.visualViewport?.addEventListener('resize', syncVisualViewport);
  window.visualViewport?.addEventListener('scroll', syncVisualViewport);
  window.setTimeout(() => {
    if (isMemberRoute()) refreshContext({ proactive: true });
  }, 900);

  function quick(label) {
    return el('button', {
      class: 'ft-meta-ai__quick-button',
      attrs: { type: 'button' },
      text: label,
      on: { click: () => ask(label, { spoken: false }) },
    });
  }

  async function open(fromNudge = false) {
    panel.hidden = false;
    document.documentElement.classList.add('ft-griot-open');
    button.setAttribute('aria-expanded', 'true');
    nudge.hidden = true;
    syncVisualViewport();
    await refreshContext();
    if (!messages.childElementCount) {
      addGriot(fromNudge
        ? proactiveOpening(state)
        : 'Hi — I’m Griot. Tell me what you are trying to move, what changed, or what feels stuck. You do not need to translate it into app language.');
    }
    input.focus({ preventScroll: true });
  }

  function close() {
    stopListening();
    panel.hidden = true;
    document.documentElement.classList.remove('ft-griot-open');
    button.setAttribute('aria-expanded', 'false');
  }

  async function refreshContext({ proactive = false, force = false } = {}) {
    if (state.loadingContext) return;
    if (!force && state.dashboard && Date.now() - state.lastLoadedAt < CONTEXT_CACHE_MS) {
      if (proactive) maybeOfferNudge();
      return;
    }

    state.loadingContext = true;
    try {
      const dashboard = await call('member.dashboard');
      state.dashboard = dashboard;
      state.lastLoadedAt = Date.now();
      state.help = assessHelp(dashboard);
      helpBadge.textContent = `${labelIntensity(state.help.intensity)} help`;
      button.dataset.helpIntensity = state.help.intensity;
      if (proactive) maybeOfferNudge();
    } catch {
      helpBadge.textContent = 'Signed-in context';
    } finally {
      state.loadingContext = false;
    }
  }

  async function ask(raw, { spoken = false } = {}) {
    const question = String(raw || '').trim();
    if (!question || state.asking) return;

    state.asking = true;
    stopListening();
    input.value = '';
    input.disabled = true;
    sendButton.disabled = true;
    micButton.disabled = true;
    addUser(question);
    const thinking = addThinking();
    announce('Griot is thinking.');

    try {
      const result = await call('griot.chat', {
        message: question,
        history: state.history.slice(-MAX_HISTORY),
        route: currentRoute(),
      }, { timeout: 35000, retry: false });

      thinking.remove();
      const text = String(result?.text || '').trim();
      if (!text) throw new Error('Griot returned an empty reply.');

      const action = normaliseAction(result?.action);
      state.history.push(
        { role: 'user', text: question },
        { role: 'assistant', text },
      );
      state.history = state.history.slice(-(MAX_HISTORY * 2));
      addGriot(text, action);

      if (spoken || state.preferences.speakReplies) {
        document.dispatchEvent(new CustomEvent('flowtribe:griot-speak', { detail: { text } }));
      }
      announce('Griot answered.');
    } catch (error) {
      thinking.remove();
      addGriot(conversationFailure(error));
      announce('Griot could not answer just now.');
    } finally {
      state.asking = false;
      input.disabled = false;
      sendButton.disabled = false;
      micButton.disabled = !state.recognition;
      window.setTimeout(() => input.focus({ preventScroll: true }), 0);
    }
  }

  function addUser(text) {
    messages.append(el('div', { class: 'ft-meta-ai__message ft-meta-ai__message--user' }, [
      el('span', { text }),
    ]));
    scrollConversation();
  }

  function addGriot(text, action = null) {
    const parts = [el('p', { text })];
    if (action) {
      parts.push(el('button', {
        class: 'ft-meta-ai__action',
        attrs: { type: 'button' },
        text: action.label,
        on: { click: () => performAction(action) },
      }));
    }
    messages.append(el('div', { class: 'ft-meta-ai__message ft-meta-ai__message--meta ft-griot__message' }, parts));
    scrollConversation();
  }

  function addThinking() {
    const bubble = el('div', {
      class: 'ft-meta-ai__message ft-meta-ai__message--meta ft-griot__thinking',
      attrs: { 'aria-label': 'Griot is thinking' },
    }, [
      el('span', { text: 'Thinking' }),
      el('span', { class: 'ft-griot__thinking-dots', text: '···' }),
    ]);
    messages.append(bubble);
    scrollConversation();
    return bubble;
  }

  function performAction(action) {
    if (action.event === 'tour') {
      close();
      document.dispatchEvent(new CustomEvent('flowtribe:tour-open'));
      return;
    }
    if (action.route) {
      if (currentRoute() !== action.route) navigate(action.route);
      if (!isCompactViewport()) close();
    }
  }

  function configureRecognition() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      micButton.disabled = true;
      micButton.title = 'Speech input is not available in this browser';
      return;
    }

    const recognition = new Recognition();
    recognition.lang = navigator.language || 'en-GB';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      state.listening = true;
      micButton.classList.add('is-listening');
      micButton.setAttribute('aria-pressed', 'true');
      input.placeholder = 'Listening… speak naturally';
      announce('Listening.');
    };
    recognition.onresult = (event) => {
      let transcript = '';
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const value = event.results[i][0]?.transcript || '';
        transcript += value;
        if (event.results[i].isFinal) finalTranscript += value;
      }
      if (transcript.trim()) input.value = transcript.trim();
      if (finalTranscript.trim()) {
        window.setTimeout(() => ask(finalTranscript.trim(), { spoken: true }), 0);
      }
    };
    recognition.onerror = (event) => {
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        announce('I could not hear that clearly. You can try again or type instead.');
      }
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    state.recognition = recognition;
  }

  function toggleListening() {
    if (!state.recognition || state.asking) return;
    if (state.listening) {
      stopListening();
      return;
    }
    try {
      state.recognition.start();
    } catch {
      stopListening();
    }
  }

  function stopListening() {
    if (!state.recognition || !state.listening) return;
    try { state.recognition.stop(); } catch { /* Browser already stopped it. */ }
    setListening(false);
  }

  function setListening(value) {
    state.listening = value;
    micButton.classList.toggle('is-listening', value);
    micButton.setAttribute('aria-pressed', String(value));
    input.placeholder = 'Tell Griot what is happening, or ask what to do next…';
  }

  function maybeOfferNudge() {
    if (state.help.intensity !== 'active') return;
    const today = localDayKey();
    const saved = loadHelpHistory();
    if (saved.lastNudge === today) return;
    const week = state.dashboard?.week || {};
    const remaining = Math.max(0, Number(week.weeklyGoal || 0) - Number(week.postsThisWeek || 0));
    nudge.textContent = remaining > 0
      ? `Griot: ${remaining} meaningful ${remaining === 1 ? 'move' : 'moves'} still to go. Want to work it through?`
      : 'Griot: your recent pattern suggests a little support may help. Talk to me.';
    nudge.hidden = false;
    saveHelpHistory({ ...saved, lastNudge: today });
  }

  function syncVisualViewport() {
    const viewport = window.visualViewport;
    const height = viewport?.height || window.innerHeight;
    const offsetTop = viewport?.offsetTop || 0;
    document.documentElement.style.setProperty('--ft-griot-vv-height', `${Math.round(height)}px`);
    document.documentElement.style.setProperty('--ft-griot-vv-offset', `${Math.round(offsetTop)}px`);
  }

  function scrollConversation() {
    messages.scrollTop = messages.scrollHeight;
  }

  function announce(text) {
    if (status) status.textContent = text;
  }

  node.open = open;
  node.refreshContext = refreshContext;
  node.ask = ask;
  return node;
}

// Compatibility export for older isolated tests and cached modules.
export const MetaAiControl = GriotControl;

function normaliseAction(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const allowedRoutes = new Set(['/submit', '/adapt', '/direction', '/leaderboard', '/milestones', '/levels', '/profile', '/dashboard']);
  if (raw.event === 'tour') return { event: 'tour', label: String(raw.label || 'Show me around') };
  const route = String(raw.route || '');
  if (!allowedRoutes.has(route)) return null;
  return { route, label: String(raw.label || actionLabel(route)).slice(0, 60) };
}

function actionLabel(route) {
  const labels = {
    '/submit': 'Show up now',
    '/adapt': 'Adapt this path',
    '/direction': 'Review direction',
    '/leaderboard': 'Open Tribe',
    '/milestones': 'See milestones',
    '/levels': 'See Flow Levels',
    '/profile': 'Open profile',
    '/dashboard': 'Back to your Flow',
  };
  return labels[route] || 'Open';
}

function conversationFailure(error) {
  const message = String(error?.message || '');
  if (/session/i.test(message)) return 'Your Flow session has ended. Sign in again and I will pick up from there.';
  if (/rate|slow down/i.test(message)) return 'I have had quite a few questions in a short burst. Give me a moment, then carry on — the conversation is still here.';
  return 'I could not reach the intelligence behind Griot just now. Your Flow is still safe. Try again in a moment, or keep typing here and continue when the connection returns.';
}

function assessHelp(data) {
  if (!data) return { intensity: 'standard', reason: 'I do not have enough recent Flow data yet.' };
  const week = data.week || {};
  const stats = data.stats || {};
  const member = data.member || {};
  const recent = Array.isArray(data.recent) ? data.recent : [];
  const goal = Math.max(1, Number(week.weeklyGoal || 1));
  const posts = Number(week.postsThisWeek || 0);
  const ratio = posts / goal;
  const streak = Number(stats.currentWeekStreak || 0);

  if (member.constraints || (posts === 0 && recent.length === 0) || (ratio < 0.34 && streak === 0)) {
    return {
      intensity: 'active',
      reason: member.constraints
        ? 'you have an active constraint and Flow should stay closer'
        : 'recent movement is low and a more active recovery prompt may help',
    };
  }
  if (ratio >= 1 && streak >= 2) {
    return { intensity: 'light', reason: 'you are meeting the current rhythm consistently, so Flow can stay out of the way' };
  }
  return { intensity: 'standard', reason: 'you are moving, but contextual guidance may still help' };
}

function proactiveOpening(state) {
  const data = state.dashboard;
  if (!data) return 'I noticed you may benefit from a little more help. Tell me what changed and I will work from there.';
  const week = data.week || {};
  const member = data.member || {};
  const remaining = Math.max(0, Number(week.weeklyGoal || 0) - Number(week.postsThisWeek || 0));
  if (member.constraints) return `You have an active constraint in your Flow. Tell me what is happening now and we can work out a credible next move around it.`;
  if (remaining > 0) return `You still have ${remaining} meaningful ${remaining === 1 ? 'move' : 'moves'} in this week’s rhythm. If that feels unrealistic now, tell me what changed rather than forcing the old plan.`;
  return 'Your current pattern suggests a little support may be useful. Tell me what is getting in the way and we can work it through.';
}

function labelIntensity(value) {
  if (value === 'light') return 'Light-touch';
  if (value === 'active') return 'Active';
  return 'Contextual';
}

function normalise(value) {
  return String(value || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function loadHelpHistory() {
  try { return JSON.parse(localStorage.getItem(HELP_STORAGE_KEY) || '{}') || {}; } catch { return {}; }
}

function saveHelpHistory(value) {
  try { localStorage.setItem(HELP_STORAGE_KEY, JSON.stringify(value)); } catch { /* Non-critical convenience. */ }
}

function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREF_STORAGE_KEY) || '{}') || {};
    return { speakReplies: saved.speakReplies !== false };
  } catch {
    return { speakReplies: true };
  }
}

function savePreferences(value) {
  try { localStorage.setItem(PREF_STORAGE_KEY, JSON.stringify(value)); } catch { /* Non-critical convenience. */ }
}

function localDayKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function currentRoute() {
  const hash = window.location.hash || '#/dashboard';
  return hash.startsWith('#') ? hash.slice(1).split('?')[0] : hash;
}

function isMemberRoute() {
  return !['/login', '/register', '/welcome'].includes(currentRoute());
}

function isCompactViewport() {
  return window.matchMedia?.('(max-width: 720px)').matches || window.innerWidth <= 720;
}
