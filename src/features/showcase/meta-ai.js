import { el, icon } from '../../core/dom.js';
import { call } from '../../core/api.js';
import { navigate } from '../../app/navigation.js';

const HELP_STORAGE_KEY = 'flowtribe.meta.help.v1';
const CONTEXT_CACHE_MS = 30000;
const SPARKLE_PATHS = [
  'M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z',
  'M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z',
  'M5 14l.7 1.8L7.5 16.5l-1.8.7L5 19l-.7-1.8-1.8-.7 1.8-.7L5 14z',
];

export function MetaAiControl({ status } = {}) {
  const state = {
    dashboard: null,
    help: { intensity: 'standard', reason: 'I will learn from your Flow as you use it.' },
    loading: false,
    lastLoadedAt: 0,
    history: [],
    lastIntent: null,
  };

  const messages = el('div', { class: 'ft-meta-ai__messages', attrs: { role: 'log', 'aria-live': 'polite' } });
  const helpBadge = el('span', { class: 'ft-meta-ai__help-badge', text: 'Learning your Flow' });
  const input = el('textarea', {
    class: 'ft-meta-ai__input',
    attrs: {
      rows: '2',
      placeholder: 'Ask about your Flow, what is stuck, or what to do next…',
      'aria-label': 'Ask Meta AI a question',
    },
    on: {
      keydown: (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          ask(input.value);
        }
      },
    },
  });

  const panel = el('section', {
    class: 'ft-meta-ai__panel',
    attrs: { hidden: true, 'aria-label': 'Meta AI' },
  }, [
    el('div', { class: 'ft-meta-ai__head' }, [
      el('div', {}, [
        el('strong', { text: 'Meta AI' }),
        el('p', { text: 'Ask about your Flow. I use your current progress and the conversation so the help stays relevant.' }),
      ]),
      helpBadge,
    ]),
    messages,
    el('div', { class: 'ft-meta-ai__quick' }, [
      quick('What do I need to do?'),
      quick('Am I behind?'),
      quick('I am struggling'),
      quick('How can Flow help me?'),
    ]),
    el('form', {
      class: 'ft-meta-ai__composer',
      on: { submit: (event) => { event.preventDefault(); ask(input.value); } },
    }, [
      input,
      el('button', { class: 'ft-meta-ai__send', attrs: { type: 'submit' }, text: 'Ask' }),
    ]),
  ]);

  const nudge = el('button', {
    class: 'ft-meta-ai__nudge',
    attrs: { type: 'button', hidden: true },
    on: { click: () => open(true) },
  });

  const button = el('button', {
    class: 'ft-assist__button ft-meta-ai__button',
    attrs: { type: 'button', 'aria-label': 'Ask Meta AI', 'aria-expanded': 'false' },
    on: { click: () => panel.hidden ? open() : close() },
  }, [
    el('span', { class: 'ft-assist__icon ft-meta-ai__sparkle' }, icon(SPARKLE_PATHS)),
    el('span', { class: 'ft-assist__label', text: 'Ask Meta AI' }),
  ]);

  const node = el('div', { class: 'ft-meta-ai' }, [button, nudge, panel]);

  document.addEventListener('click', (event) => {
    if (!node.contains(event.target)) close();
  });
  window.addEventListener('hashchange', () => {
    if (isMemberRoute()) window.setTimeout(() => refreshContext({ proactive: true }), 650);
  });
  window.setTimeout(() => {
    if (isMemberRoute()) refreshContext({ proactive: true });
  }, 900);

  function quick(label) {
    return el('button', {
      class: 'ft-meta-ai__quick-button',
      attrs: { type: 'button' },
      text: label,
      on: { click: () => ask(label) },
    });
  }

  async function open(fromNudge = false) {
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    nudge.hidden = true;
    await refreshContext();
    if (!messages.childElementCount) {
      addMeta(fromNudge
        ? proactiveOpening(state)
        : 'Hi. Ask me what is left, what to do next, whether you are slipping, or simply tell me what is getting in the way. I will work from your current Flow rather than make you translate the problem into app language.');
    }
    input.focus();
  }

  function close() {
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  }

  async function refreshContext({ proactive = false, force = false } = {}) {
    if (state.loading) return;
    if (!force && state.dashboard && Date.now() - state.lastLoadedAt < CONTEXT_CACHE_MS) {
      if (proactive) maybeOfferNudge();
      return;
    }

    state.loading = true;
    try {
      const dashboard = await call('member.dashboard');
      state.dashboard = dashboard;
      state.lastLoadedAt = Date.now();
      state.help = assessHelp(dashboard);
      helpBadge.textContent = `${labelIntensity(state.help.intensity)} help`;
      button.dataset.helpIntensity = state.help.intensity;
      if (proactive) maybeOfferNudge();
    } catch {
      helpBadge.textContent = 'Context available when signed in';
    } finally {
      state.loading = false;
    }
  }

  async function ask(raw) {
    const question = String(raw || '').trim();
    if (!question) return;
    input.value = '';
    addUser(question);
    await refreshContext();
    const answer = answerQuestion(question, state);
    state.lastIntent = answer.intent || state.lastIntent;
    state.history.push({ role: 'user', text: question }, { role: 'assistant', text: answer.text });
    state.history = state.history.slice(-12);
    addMeta(answer.text, answer.action);
    if (status) status.textContent = 'Meta AI answered your question.';
  }

  function addUser(text) {
    messages.append(el('div', { class: 'ft-meta-ai__message ft-meta-ai__message--user' }, [
      el('span', { text }),
    ]));
    messages.scrollTop = messages.scrollHeight;
  }

  function addMeta(text, action = null) {
    const parts = [el('p', { text })];
    if (action) {
      parts.push(el('button', {
        class: 'ft-meta-ai__action',
        attrs: { type: 'button' },
        text: action.label,
        on: {
          click: () => {
            close();
            if (action.event === 'tour') {
              document.dispatchEvent(new CustomEvent('flowtribe:tour-open'));
              return;
            }
            if (action.route && currentRoute() !== action.route) navigate(action.route);
          },
        },
      }));
    }
    messages.append(el('div', { class: 'ft-meta-ai__message ft-meta-ai__message--meta' }, parts));
    messages.scrollTop = messages.scrollHeight;
  }

  function maybeOfferNudge() {
    if (state.help.intensity !== 'active') return;
    const today = localDayKey();
    const saved = loadHelpHistory();
    if (saved.lastNudge === today) return;
    const week = state.dashboard?.week || {};
    const remaining = Math.max(0, Number(week.weeklyGoal || 0) - Number(week.postsThisWeek || 0));
    nudge.textContent = remaining > 0
      ? `Meta AI: ${remaining} meaningful ${remaining === 1 ? 'move' : 'moves'} still to go. Want help?`
      : 'Meta AI: your pattern suggests a little support may help. Ask me.';
    nudge.hidden = false;
    saveHelpHistory({ ...saved, lastNudge: today });
  }

  node.open = open;
  node.refreshContext = refreshContext;
  return node;
}

function answerQuestion(question, state) {
  const q = normalise(question);
  const data = state.dashboard;
  const member = data?.member || {};
  const week = data?.week || {};
  const stats = data?.stats || {};
  const remaining = Math.max(0, Number(week.weeklyGoal || 0) - Number(week.postsThisWeek || 0));
  const nextAction = member.showingUp || 'one meaningful action that moves your goal';
  const goal = member.goalTitle || 'your chosen direction';
  const constraint = String(member.constraints || '').trim();
  const previous = state.history[state.history.length - 1]?.text || '';
  const followUp = /^(what if|and if|but|still|why|how about|what about|then|so)\b/.test(q) || q.length < 34;

  if (/\b(date|day|today|time)\b/.test(q)) {
    const now = new Date();
    return { intent: 'date', text: `Today is ${new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now)}. The time is ${new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(now)}.` };
  }

  // Explicit questions about Flow/the app must outrank conversational follow-up
  // context. Otherwise a short product question asked after a recovery exchange
  // is incorrectly interpreted as another recovery follow-up.
  if (/what can flow|what is flow|what.*app|how.*app|how can flow|help me understand/.test(q)) {
    return {
      intent: 'product',
      text: 'Flow Tribe is for keeping meaningful goals alive when real life changes the original plan. It keeps the direction visible, turns progress into a credible next action, records lightweight evidence, adapts the route when conditions change, treats recovery as progress, and uses Tribe, milestones and levels to sustain momentum without punishing interruption.',
      action: { label: 'Show me how it works', event: 'tour' },
    };
  }

  if (/struggl|stuck|overwhelm|exhaust|cant |cannot |too hard|not working|giving up|still difficult|still hard/.test(q) || (followUp && state.lastIntent === 'recovery')) {
    const constraintText = constraint ? ` You have already told Flow to plan around “${constraint}”, so that constraint should stay in the decision.` : '';
    return {
      intent: 'recovery',
      text: `Then the answer is not to push harder at the same plan. Keep the destination — ${goal} — and make the next move smaller, different, or later until it becomes credible again.${constraintText} Your current definition of showing up is “${nextAction}”. If even that is too much right now, tell Flow what changed and let Adapt propose a recovery move you can actually do.`,
      action: { label: 'Work out a recovery path', route: '/adapt' },
    };
  }

  if (/outstanding|left|remain|need to do|what do i need|tasks?/.test(q)) {
    if (!data) return { intent: 'work', text: 'I need your signed-in Flow data before I can tell you what remains.' };
    if (remaining === 0) {
      return {
        intent: 'work',
        text: `You have reached this week’s target of ${week.weeklyGoal} meaningful moves. You do not owe Flow extra work just to protect the number. If you want to keep moving, your current next action is “${nextAction}”.`,
        action: { label: 'Show up', route: '/submit' },
      };
    }
    return {
      intent: 'work',
      text: `You have ${remaining} of ${week.weeklyGoal} meaningful ${remaining === 1 ? 'move' : 'moves'} still to complete this week. Your current next action is “${nextAction}”. Flow does not currently keep a separate dated task register, so I will not pretend there are task records I cannot see.`,
      action: { label: 'Do the next action', route: '/submit' },
    };
  }

  if (/behind|late|running late|missed|slipping|catch up|recover/.test(q)) {
    const context = constraint ? ` You have also told Flow to plan around “${constraint}”.` : '';
    return {
      intent: 'recovery',
      text: `You do not need to repair the whole plan at once. Preserve the goal — ${goal} — and reduce the next move until it is credible today.${context} Flow Adapt is for exactly this situation: tell it what changed, inspect the revised route, and accept only the recovery move that still makes sense.`,
      action: { label: 'Adapt this path', route: '/adapt' },
    };
  }

  if (/next|what should i do|complete this|how do i complete|how do i do/.test(q)) {
    return {
      intent: 'next',
      text: `Your current next action is “${nextAction}”. Do the smallest complete version of that action in one sitting, then record what moved. If that action is no longer realistic, do not force it — adapt the path instead.`,
      action: { label: 'Show up now', route: '/submit' },
    };
  }

  if (/progress|momentum|streak|how am i doing|status/.test(q)) {
    if (!data) return { intent: 'progress', text: 'I need your signed-in Flow data before I can read your progress.' };
    return { intent: 'progress', text: `You have recorded ${week.postsThisWeek || 0} of ${week.weeklyGoal || 0} meaningful moves this week. Your current return streak is ${stats.currentWeekStreak || 0} ${Number(stats.currentWeekStreak || 0) === 1 ? 'week' : 'weeks'}, with ${stats.allTimePosts || 0} lifetime actions. I am currently using ${labelIntensity(state.help.intensity).toLowerCase()} help because ${state.help.reason}` };
  }

  if (/goal|direction|destination/.test(q)) {
    return {
      intent: 'goal',
      text: `Your current direction is “${goal}”. Flow keeps that destination visible while allowing the route to change when reality changes.`,
      action: { label: 'Review direction', route: '/direction' },
    };
  }

  if (/milestone|level|achievement/.test(q)) {
    const level = data?.level?.name || 'your current Flow Level';
    const earned = data?.milestones?.totalEarned;
    return {
      intent: 'milestone',
      text: `You are at ${level}${Number.isFinite(Number(earned)) ? ` and have earned ${earned} milestones` : ''}. Milestones recognise meaningful patterns of movement and recovery; Levels show how your relationship with Flow develops over time.`,
      action: { label: 'See milestones', route: '/milestones' },
    };
  }

  if (/tribe|leaderboard|community|people/.test(q)) {
    return {
      intent: 'tribe',
      text: 'The Tribe makes movement visible across the community so people can encourage return and momentum. It is designed to make progress social without turning people into a public failure table.',
      action: { label: 'Open Tribe', route: '/leaderboard' },
    };
  }

  if (/voice|speak|talk|narrat/.test(q)) {
    return { intent: 'voice', text: 'Use Voice in the header to choose an available device voice, change speed and pitch, preview it, and turn guided-tour narration on or off.' };
  }

  if (/why\b/.test(q) && state.lastIntent) {
    return {
      intent: state.lastIntent,
      text: `Because Flow is trying to protect useful movement rather than force compliance with an old plan. ${previous ? `The last thing we were working from was: “${previous.slice(0, 160)}${previous.length > 160 ? '…' : ''}”` : ''}`.trim(),
    };
  }

  if (/help|what can you|meta ai|ask/.test(q)) {
    return { intent: 'help', text: 'You do not need to phrase things as commands. Tell me what is happening — for example, “I have no energy today”, “I missed two days”, “I do not know where to start”, or “I have finished the target but want to keep going”. I will relate that back to your current Flow.' };
  }

  return {
    intent: 'conversation',
    text: `I do not want to turn that into a canned answer. Tell me what part is difficult — the goal itself, the next action “${nextAction}”, the time available, or something else that changed — and I will help you work out the next credible move.`,
    action: { label: 'Adapt what changed', route: '/adapt' },
  };
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
  return { intensity: 'standard', reason: 'you are moving, but there is still useful room for contextual guidance' };
}

function proactiveOpening(state) {
  const data = state.dashboard;
  if (!data) return 'I noticed you may benefit from a little more help. Tell me what has changed and I’ll work from there.';
  const remaining = Math.max(0, Number(data.week?.weeklyGoal || 0) - Number(data.week?.postsThisWeek || 0));
  return remaining > 0
    ? `I’m offering more active help because ${state.help.reason}. You have ${remaining} meaningful ${remaining === 1 ? 'move' : 'moves'} still to go this week. Ask me what to do next or tell me what is getting in the way.`
    : `I’m offering more active help because ${state.help.reason}. Tell me what feels stuck and I’ll point you to the right recovery move.`;
}

function labelIntensity(value) {
  if (value === 'active') return 'Active';
  if (value === 'light') return 'Light-touch';
  return 'Standard';
}

function normalise(value) {
  return String(value || '').toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ').trim();
}

function currentRoute() {
  const hash = window.location.hash || '#/dashboard';
  return hash.startsWith('#') ? hash.slice(1).split('?')[0] : hash;
}

function isMemberRoute() {
  const route = (window.location.hash || '').replace(/^#/, '').split('?')[0];
  return route && !['/login', '/register', '/demo', '/welcome', '/help/pin', '/change-pin'].includes(route);
}

function localDayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function loadHelpHistory() {
  try {
    return JSON.parse(localStorage.getItem(HELP_STORAGE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function saveHelpHistory(value) {
  try {
    localStorage.setItem(HELP_STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* Adaptive help remains functional without persistent storage. */
  }
}