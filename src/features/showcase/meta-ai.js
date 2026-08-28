import { el, icon } from '../../core/dom.js';
import { call } from '../../core/api.js';
import { navigate } from '../../app/navigation.js';

const HELP_STORAGE_KEY = 'flowtribe.meta.help.v1';
const SPARKLE_PATHS = [
  'M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z',
  'M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z',
  'M5 14l.7 1.8L7.5 16.5l-1.8.7L5 19l-.7-1.8-1.8-.7 1.8-.7L5 14z',
];

export function MetaAiControl({ status } = {}) {
  const state = {
    dashboard: null,
    profile: null,
    help: { intensity: 'standard', reason: 'I will learn from your Flow as you use it.' },
    loading: false,
  };

  const messages = el('div', { class: 'ft-meta-ai__messages', attrs: { role: 'log', 'aria-live': 'polite' } });
  const helpBadge = el('span', { class: 'ft-meta-ai__help-badge', text: 'Learning your Flow' });
  const input = el('input', {
    class: 'ft-meta-ai__input',
    attrs: {
      type: 'text',
      placeholder: 'Ask about your Flow, progress, date, or what to do next…',
      'aria-label': 'Ask Meta AI a question',
      autocomplete: 'off',
    },
  });

  const panel = el('section', {
    class: 'ft-meta-ai__panel',
    attrs: { hidden: true, 'aria-label': 'Meta AI' },
  }, [
    el('div', { class: 'ft-meta-ai__head' }, [
      el('div', {}, [
        el('strong', { text: 'Meta AI' }),
        el('p', { text: 'Ask about your Flow. I answer from your actual progress and context.' }),
      ]),
      helpBadge,
    ]),
    messages,
    el('div', { class: 'ft-meta-ai__quick' }, [
      quick('What do I need to do?'),
      quick('Am I behind?'),
      quick('What should I do next?'),
      quick('What can Flow do?'),
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
        : `Hi. I’m Meta AI. I can explain Flow, tell you where you are, show what remains this week, help you recover when you’re slipping, and take you to the right part of the app.`);
    }
    input.focus();
  }

  function close() {
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  }

  async function refreshContext({ proactive = false } = {}) {
    if (state.loading) return;
    state.loading = true;
    try {
      const [dashboard, profile] = await Promise.all([
        call('member.dashboard'),
        call('profile.get').catch(() => null),
      ]);
      state.dashboard = dashboard;
      state.profile = profile;
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
    addMeta(answer.text, answer.action);
    status && (status.textContent = 'Meta AI answered your question.');
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
        on: { click: () => { close(); navigate(action.route); } },
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

  if (/\b(date|day|today|time)\b/.test(q)) {
    const now = new Date();
    return { text: `Today is ${new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now)}. The time is ${new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(now)}.` };
  }

  if (/outstanding|left|remain|need to do|what do i need|tasks?/.test(q)) {
    if (!data) return { text: 'I need your signed-in Flow data before I can tell you what remains.' };
    if (remaining === 0) return { text: `You have reached this week’s target of ${week.weeklyGoal} meaningful moves. Your next useful action is still “${nextAction}” if you want to keep momentum going.`, action: { label: 'Show up', route: '/submit' } };
    return { text: `You have ${remaining} of ${week.weeklyGoal} meaningful ${remaining === 1 ? 'move' : 'moves'} still to complete this week. Your current next action is “${nextAction}”. Flow does not currently store a separate dated task list, so I will not invent one.`, action: { label: 'Do the next action', route: '/submit' } };
  }

  if (/behind|late|running late|missed|slipping|catch up|recover/.test(q)) {
    const context = member.constraints ? ` You have also told Flow to plan around: ${member.constraints}.` : '';
    return { text: `Don’t try to repair the whole plan at once. Preserve the goal — ${goal} — and reduce the next move until it is credible today.${context} Use Flow Adapt to tell me what changed; Flow will propose a smaller recovery path and you choose whether to accept it.`, action: { label: 'Adapt this path', route: '/adapt' } };
  }

  if (/next|what should i do|complete this|how do i complete|how do i do/.test(q)) {
    return { text: `Your next action is “${nextAction}”. Make it concrete enough to finish in one sitting, do that piece, then record it in Show up. If the action is no longer realistic, adapt the path instead of forcing the old plan.`, action: { label: 'Show up now', route: '/submit' } };
  }

  if (/progress|momentum|streak|how am i doing|status/.test(q)) {
    if (!data) return { text: 'I need your signed-in Flow data before I can read your progress.' };
    return { text: `You have recorded ${week.postsThisWeek || 0} of ${week.weeklyGoal || 0} meaningful moves this week. Your current return streak is ${stats.currentWeekStreak || 0} ${Number(stats.currentWeekStreak || 0) === 1 ? 'week' : 'weeks'}, with ${stats.allTimePosts || 0} lifetime actions. My current help setting is ${labelIntensity(state.help.intensity).toLowerCase()} because ${state.help.reason}` };
  }

  if (/goal|direction|destination/.test(q)) {
    return { text: `Your current direction is “${goal}”. Flow keeps the destination visible while allowing the route to change when reality changes.`, action: { label: 'Review direction', route: '/direction' } };
  }

  if (/milestone|level|achievement/.test(q)) {
    const level = data?.level?.name || 'your current Flow Level';
    const earned = data?.milestones?.totalEarned;
    return { text: `You are at ${level}${Number.isFinite(Number(earned)) ? ` and have earned ${earned} milestones` : ''}. Milestones recognise meaningful patterns of movement and recovery; Levels show how your relationship with Flow is developing over time.`, action: { label: 'See milestones', route: '/milestones' } };
  }

  if (/tribe|leaderboard|community|people/.test(q)) {
    return { text: 'The Tribe makes movement visible across the community so people can encourage return and momentum. It is not designed to punish people for falling behind.', action: { label: 'Open Tribe', route: '/leaderboard' } };
  }

  if (/voice|speak|talk|narrat/.test(q)) {
    return { text: 'Use Voice in the header to choose an available device voice, change speed and pitch, preview it, and turn guided-tour narration on or off.' };
  }

  if (/what can flow|what is flow|what.*app|how.*work|help me understand/.test(q)) {
    return { text: 'Flow Tribe helps you keep meaningful goals moving when life changes the plan. It keeps your direction visible, reduces progress to useful next actions, records evidence without heavy admin, adapts the route when conditions change, makes recovery part of progress, and adds Tribe, milestones and levels for sustained momentum.', action: { label: 'Show me round', route: '/dashboard' } };
  }

  if (/help|what can you|meta ai|ask/.test(q)) {
    return { text: 'Ask me about your next action, what remains this week, whether you are slipping, how to recover, your goal, progress, streak, milestones, the Tribe, today’s date, or where a Flow feature lives. I stay grounded in the Flow data the app actually has.' };
  }

  return { text: `I can help with your actual Flow rather than guess. Try asking “What do I need to do?”, “Am I behind?”, “What should I do next?”, “What is my progress?”, “What date is it?”, or “How does Flow Adapt work?”` };
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
    return { intensity: 'active', reason: member.constraints ? 'you have an active constraint and Flow should stay closer' : 'recent movement is low and a more active recovery prompt may help' };
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

function isMemberRoute() {
  const route = (window.location.hash || '').replace(/^#/, '').split('?')[0];
  return route && !['/login', '/register', '/demo', '/welcome', '/help/pin', '/change-pin'].includes(route);
}

function localDayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function loadHelpHistory() {
  try { return JSON.parse(localStorage.getItem(HELP_STORAGE_KEY) || '{}') || {}; }
  catch { return {}; }
}

function saveHelpHistory(value) {
  try { localStorage.setItem(HELP_STORAGE_KEY, JSON.stringify(value)); }
  catch { /* Adaptive help remains functional without persistent storage. */ }
}
