/**
 * Component gallery.
 *
 * A development tool. Renders every token and component on one page so the
 * design system can be reviewed as a whole, and so a change to a shared
 * component is verified everywhere at once rather than discovered on one
 * screen weeks later.
 *
 * Not part of the shipped application and not referenced by it.
 *
 * @module gallery
 */

import { el, icon } from './core/dom.js';
import { health, isConfigured } from './core/api.js';
import {
  Logo,
  ProgressRing,
  StatCard,
  StreakFlame,
  RankPrompt,
  SuccessBurst,
  ActivityCalendar,
  intensityScale,
  MilestoneBadge,
  MilestoneCard,
  NextMilestone,
  LevelChip,
  LevelTrack,
  LevelProgress,
} from './components/brand/index.js';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  InputStatus,
  OptionGroup,
  PinInput,
  Select,
  Skeleton,
  SkeletonText,
  Spinner,
  Switch,
  confirmModal,
  openModal,
  toastError,
  toastInfo,
  toastSuccess,
} from './components/ui/index.js';
import { PageHeader, Section } from './components/layout/index.js';
import { Icons } from './lib/icons.js';
import { PLATFORM_LIST, WEEKLY_GOALS } from './lib/platforms.js';
import { weeklyProgressMessage } from './lib/format.js';

const root = document.getElementById('gallery');

/* -------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------- */

function section(title, children, note) {
  return el('section', { class: 'gal-section' }, [
    el('h2', { class: 'gal-title', text: title }),
    note ? el('p', { class: 'gal-note', text: note }) : null,
    ...(Array.isArray(children) ? children : [children]),
  ]);
}

function row(children) {
  return el('div', { class: 'gal-row' }, children);
}

function swatches(name, steps) {
  return el(
    'div',
    { class: 'gal-swatches ft-mb-6' },
    steps.map((step) =>
      el('div', { class: 'gal-swatch' }, [
        el('div', {
          class: 'gal-swatch__chip',
          style: { background: `var(--ft-${name}-${step})` },
        }),
        el('div', { class: 'gal-swatch__name', text: String(step) }),
      ]),
    ),
  );
}

/* -------------------------------------------------------------------------
 * Sections
 * ---------------------------------------------------------------------- */

root.appendChild(
  PageHeader({
    eyebrow: 'Phase 1',
    title: 'Component gallery',
    subtitle: 'Every token and primitive in the Flow Tribe design system.',
  }),
);

// --- Diagnostics -----------------------------------------------------------

const healthLine = el('span', {
  class: 'ft-text-sm ft-text-muted',
  text: isConfigured() ? 'Checking deployment…' : 'No Apps Script URL configured yet.',
});

if (isConfigured()) {
  health().then((result) => {
    healthLine.textContent = result.ok
      ? `Backend reachable — version ${result.version || 'unknown'}`
      : `Backend unreachable — ${result.error}`;
    healthLine.className = `ft-text-sm ${result.ok ? 'ft-text-success' : 'ft-text-danger'}`;
  });
}

root.appendChild(
  section(
    'Deployment',
    el('div', { class: 'gal-panel' }, healthLine),
    'The API client reports configuration state explicitly. v1 shipped with a placeholder URL and ' +
      'only discovered it at the first submission.',
  ),
);

// --- Colour ----------------------------------------------------------------

root.appendChild(
  section('Colour — burgundy', swatches('burgundy', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
    '600 is the brand colour. The scale exists so tints and shades are chosen, not improvised.'),
);

root.appendChild(
  section('Colour — gold', swatches('gold', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
    'Gold is an accent, never a surface. It marks progress and achievement so those moments stay special.'),
);

root.appendChild(
  section('Colour — neutral', swatches('neutral', [0, 25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
    'Warm-tinted rather than pure grey, so they sit with burgundy instead of fighting it.'),
);

// --- Typography ------------------------------------------------------------

root.appendChild(
  section('Typography', [
    el('h1', { text: 'Welcome back, David' }),
    el('h2', { class: 'ft-mt-3', text: 'Your week so far' }),
    el('h3', { class: 'ft-mt-3', text: 'Log a post' }),
    el('p', { class: 'ft-mt-3', text: 'Body text at 16px, the size the rest of the scale is built around.' }),
    el('p', { class: 'ft-text-sm ft-text-secondary ft-mt-2', text: 'Secondary text at 14px.' }),
    el('p', { class: 'ft-text-xs ft-text-muted ft-mt-2', text: 'Hints and metadata at 12px.' }),
    el('p', { class: 'ft-numeral ft-mt-4', style: { fontSize: 'var(--ft-text-4xl)' }, text: '1,284' }),
  ], 'System font stack — nothing downloaded, nothing blocking first paint. Numerals use tabular figures so they do not jitter when they change.'),
);

// --- Logo ------------------------------------------------------------------

root.appendChild(
  section('Logo', row([Logo({ size: 'sm' }), Logo(), Logo({ size: 'lg' }), Logo({ size: 'sm', inline: true })]),
    'Built in CSS: scales to any size, recolours through tokens, costs no request.'),
);

// --- Buttons ---------------------------------------------------------------

const loadingDemo = Button({ label: 'Click to load', variant: 'secondary' });
loadingDemo.addEventListener('click', () => {
  loadingDemo.update({ loading: true });
  setTimeout(() => loadingDemo.update({ loading: false }), 1600);
});

root.appendChild(
  section('Buttons', [
    row([
      Button({ label: 'Primary' }),
      Button({ label: 'Secondary', variant: 'secondary' }),
      Button({ label: 'Ghost', variant: 'ghost' }),
      Button({ label: 'Danger', variant: 'danger' }),
      Button({ label: 'Accent', variant: 'accent' }),
    ]),
    row([
      Button({ label: 'Small', size: 'sm' }),
      Button({ label: 'Medium' }),
      Button({ label: 'Large', size: 'lg' }),
      Button({ label: 'With icon', iconPaths: Icons.plus }),
      Button({ label: 'Disabled', disabled: true }),
      loadingDemo,
    ]),
    Button({ label: "Submit today's post", size: 'lg', block: true, iconPaths: Icons.plus }),
  ], 'Full-width is the default shape for a primary action on mobile: a thumb should never have to aim.'),
);

// --- Form controls ---------------------------------------------------------

const usernameStatus = InputStatus({ state: 'available' });

const errorField = Field({
  label: 'Invite code',
  required: true,
  control: Input({ placeholder: 'ABCD2345', iconPaths: Icons.ticket }),
  hint: 'The code you were sent. It works once.',
  error: "That invite code has already been used.",
});

root.appendChild(
  section('Form controls', [
    Field({
      label: 'Full name',
      required: true,
      control: Input({ placeholder: 'David Okafor' }),
      hint: 'This is the name shown on your dashboard and the leaderboard.',
    }),
    el('div', { class: 'ft-mt-4' }, Field({
      label: 'Username',
      required: true,
      control: Input({ placeholder: 'david.okafor', suffix: usernameStatus }),
      hint: 'Letters, numbers, dots and underscores. You will log in with this.',
    })),
    el('div', { class: 'ft-mt-4' }, errorField),
    el('div', { class: 'ft-mt-4' }, Field({
      label: 'Weekly goal',
      control: Select({
        options: WEEKLY_GOALS.map((goal) => ({ value: goal.value, label: goal.label })),
        value: 3,
      }),
    })),
    el('div', { class: 'ft-mt-6' }, [
      el('p', { class: 'ft-field__label ft-mb-2', text: 'Preferred platform' }),
      OptionGroup({
        name: 'gallery-platform',
        value: 'LinkedIn',
        ariaLabel: 'Preferred platform',
        options: PLATFORM_LIST.map((platform) => ({
          value: platform.id,
          label: platform.label,
          iconPaths: platform.iconPaths,
          color: platform.color,
        })),
      }),
    ]),
    el('div', { class: 'ft-mt-6' }, [
      el('p', { class: 'ft-field__label ft-mb-2', text: 'Weekly goal' }),
      OptionGroup({
        name: 'gallery-goal',
        value: 3,
        ariaLabel: 'Weekly goal',
        options: WEEKLY_GOALS.map((goal) => ({
          value: goal.value,
          label: goal.label,
          meta: goal.meta,
          iconPaths: Icons.target,
        })),
      }),
    ]),
    el('div', { class: 'ft-mt-6' }, Switch({ label: 'Feature me in shoutouts and on the leaderboard', checked: true })),
  ], 'Option cards replace a dropdown where the choice is part of committing to something. Both produce the same value.'),
);

// --- PIN -------------------------------------------------------------------

const pin = PinInput({ ariaLabel: 'Six digit PIN' });
const pinEcho = el('p', { class: 'ft-text-xs ft-text-muted ft-mt-2', text: 'Digits entered: 0' });
pin.addEventListener('input', () => {
  pinEcho.textContent = `Digits entered: ${pin.getValue().length}`;
});

root.appendChild(
  section('PIN input', [
    Field({ label: 'Choose a 6-digit PIN', required: true, control: pin, hint: 'Paste works. Backspace steps back.' }),
    pinEcho,
  ], 'Segmented entry shows progress and makes a mistyped digit cheap to fix. Boxes are masked; the tint carries the progress.'),
);

// --- Progress & stats ------------------------------------------------------

const ring = ProgressRing({ value: 2, goal: 3 });
const ringMessage = el('p', { class: 'ft-text-sm ft-text-secondary ft-text-center ft-mt-3', text: weeklyProgressMessage(2, 3) });

let ringValue = 2;
const ringButton = Button({ label: 'Log a post', variant: 'secondary', size: 'sm' });
ringButton.addEventListener('click', () => {
  ringValue = ringValue >= 3 ? 0 : ringValue + 1;
  ring.update({ value: ringValue });
  ringMessage.textContent = weeklyProgressMessage(ringValue, 3);
});

root.appendChild(
  section('Progress ring', [
    el('div', { class: 'ft-row ft-row--center ft-gap-6 ft-row--wrap' }, [
      el('div', { class: 'ft-text-center' }, [ring, ringMessage]),
      ProgressRing({ value: 7, goal: 7, size: 'sm' }),
      ProgressRing({ value: 1, goal: 5, size: 'sm' }),
    ]),
    el('div', { class: 'ft-row ft-row--center ft-mt-4' }, ringButton),
  ], 'The arithmetic is in JS, the motion is in CSS. The ring turns green at the goal so "done" reads without the number.'),
);

root.appendChild(
  section('Stat cards', [
    el('div', { class: 'ft-grid ft-grid--4' }, [
      StatCard({ label: 'Current streak', value: 4, meta: 'weeks', iconPaths: Icons.flame }),
      StatCard({ label: 'Longest streak', value: 9, meta: 'weeks', iconPaths: Icons.medal }),
      StatCard({ label: 'All-time posts', value: 128, iconPaths: Icons.chart }),
      StatCard({ label: 'Leaderboard', value: null, meta: 'this week', iconPaths: Icons.trophy }),
    ]),
    el('div', { class: 'ft-mt-4' }, RankPrompt()),
    row([StreakFlame({ weeks: 4 }), StreakFlame({ weeks: 0, active: false })]),
  ], 'A member with no posts this week has no rank — the prompt replaces the number rather than showing a zero.'),
);

// --- Feedback --------------------------------------------------------------

root.appendChild(
  section('Success', [
    el('div', { class: 'ft-row ft-row--center' }, SuccessBurst()),
    el('p', { class: 'ft-text-center ft-text-sm ft-text-secondary ft-mt-3', text: 'Reload to replay.' }),
  ], 'The only celebratory animation in the app. Used once, when a post is logged, so it keeps meaning something.'),
);

root.appendChild(
  section('Badges and avatars', [
    row([
      Badge({ label: 'Active', tone: 'success', dot: true }),
      Badge({ label: 'Paused', tone: 'warning', dot: true }),
      Badge({ label: 'Super Admin', tone: 'brand' }),
      Badge({ label: 'Community Manager', tone: 'info' }),
      Badge({ label: 'Unused', tone: 'accent' }),
      Badge({ label: 'Revoked', tone: 'danger' }),
    ]),
    row([
      Avatar({ name: 'David Okafor', size: 'sm' }),
      Avatar({ name: 'Amaka Obi' }),
      Avatar({ name: 'Iyanuoluwa Grace Ilesanmi', size: 'lg' }),
      Avatar({ name: 'Tunde', size: 'xl' }),
    ]),
  ], 'Avatars render initials. The src prop is already accepted so photos become a schema change, not a UI rewrite.'),
);

root.appendChild(
  section('Loading states', [
    row([Spinner({ size: 'sm' }), Spinner(), Spinner({ size: 'lg' })]),
    el('div', { class: 'ft-mt-4' }, Card({}, [
      el('div', { class: 'ft-row ft-gap-3 ft-mb-4' }, [
        Skeleton({ variant: 'circle', width: '2.5rem', height: '2.5rem' }),
        el('div', { class: 'ft-grow' }, [Skeleton({ variant: 'title', width: '40%' })]),
      ]),
      SkeletonText(3),
    ])),
  ], 'Skeletons shaped like the content they stand in for make a wait feel shorter than a spinner does.'),
);

root.appendChild(
  section('Empty state', Card({}, EmptyState({
    title: 'No posts logged yet',
    message: 'Once you log your first post it shows up here, and your streak begins.',
    iconPaths: Icons.inbox,
    action: Button({ label: 'Log your first post', size: 'sm' }),
  }))),
);

// --- Overlays --------------------------------------------------------------

const modalButton = Button({ label: 'Open modal', variant: 'secondary' });
modalButton.addEventListener('click', () => {
  const cancel = Button({ label: 'Cancel', variant: 'ghost' });
  const reset = Button({ label: 'Reset PIN', variant: 'danger' });

  const modal = openModal({
    title: 'Reset this PIN?',
    content: el('p', {
      text:
        'David will be asked to choose a new PIN the next time they log in. ' +
        'Every active session ends immediately.',
    }),
    actions: [cancel, reset],
  });

  cancel.addEventListener('click', () => modal.close());
  reset.addEventListener('click', () => {
    modal.close();
    toastSuccess('PIN reset. David will set a new one at next login.');
  });
});

const confirmButton = Button({ label: 'Open confirm', variant: 'secondary' });
confirmButton.addEventListener('click', async () => {
  const agreed = await confirmModal({
    title: 'Suspend this member?',
    message: 'They will not be able to log in or submit posts until reactivated.',
    confirmLabel: 'Suspend',
    destructive: true,
  });
  toastInfo(agreed ? 'Confirmed' : 'Dismissed');
});

root.appendChild(
  section('Overlays', [
    row([
      modalButton,
      confirmButton,
      Button({ label: 'Success toast', variant: 'ghost', onClick: () => toastSuccess('Logged. Your streak is safe.') }),
      Button({ label: 'Error toast', variant: 'ghost', onClick: () => toastError('This account is registered for LinkedIn posts only.') }),
      Button({ label: 'Info toast', variant: 'ghost', onClick: () => toastInfo('Nothing to see here.') }),
    ]),
  ], 'Modals are a bottom sheet on phones and a centred dialog above 480px — the same component, switched in CSS.'),
);

// --- Cards -----------------------------------------------------------------

root.appendChild(
  section('Cards', [
    el('div', { class: 'ft-grid ft-grid--3' }, [
      Card({ title: 'Default' }, el('p', { class: 'ft-text-sm ft-text-secondary', text: 'The standard surface.' })),
      Card({ title: 'Raised', variant: 'raised' }, el('p', { class: 'ft-text-sm ft-text-secondary', text: 'One step forward.' })),
      Card({ title: 'Brand', variant: 'brand' }, el('p', { class: 'ft-text-sm', text: 'For moments that need weight.' })),
    ]),
  ]),
);

// --- Icons -----------------------------------------------------------------

root.appendChild(
  section('Icons',
    el('div', { class: 'ft-row ft-row--wrap ft-gap-4' },
      Object.entries(Icons).map(([name, paths]) =>
        el('div', { class: 'ft-text-center', style: { width: '4rem' } }, [
          el('div', { class: 'ft-row ft-row--center', style: { color: 'var(--ft-burgundy-600)' } },
            icon(paths, undefined)),
          el('div', { class: 'ft-text-xs ft-text-muted', style: { marginTop: '4px' }, text: name }),
        ]),
      ),
    ),
    'Inline SVG built from path data. No request, no icon font, and stroke: currentColor means they inherit hover states for free.'),
);

/* -------------------------------------------------------------------------
 * Phase 4 additions
 * ---------------------------------------------------------------------- */

// --- Activity Calendar -----------------------------------------------------

const calCounts = {};
{
  const today = new Date();
  for (let i = 0; i < 180; i += 1) {
    const d = new Date(today.getTime() - i * 86400000);
    // A believable rhythm: mostly weekdays, with a gap around day 60–75.
    const gap = i > 58 && i < 76;
    if (!gap && [1, 3, 5].includes(d.getDay()) && Math.random() > 0.25) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      calCounts[key] = Math.random() > 0.85 ? 2 : 1;
    }
  }
}

const calToday = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

const calFrom = (() => {
  const d = new Date(Date.now() - 181 * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

root.appendChild(
  section(
    'Activity calendar',
    Card({}, ActivityCalendar({ from: calFrom, to: calToday, counts: calCounts, today: calToday })),
    'Binary today; the counts are already counts, so colour intensity later is a different scale function and nothing else. ' +
      'Scrolls inside its own box, pinned to the current week.',
  ),
);

root.appendChild(
  section(
    'Activity calendar — intensity scale',
    Card({}, ActivityCalendar({
      from: calFrom,
      to: calToday,
      counts: calCounts,
      today: calToday,
      scale: intensityScale,
      showLegend: true,
    })),
    'The same data and the same component, with a four-step scale passed in. This is the future-compatibility seam, demonstrated rather than described.',
  ),
);

// --- Milestones ------------------------------------------------------------

const demoMilestones = [
  { id: 'a', name: 'First Step', iconId: 'footprint', rarity: 'Common', unlocked: true, progress: 1, target: 1 },
  { id: 'b', name: '30 Active Days', iconId: 'calendarDays', rarity: 'Uncommon', unlocked: true, progress: 30, target: 30 },
  { id: 'c', name: '100 Posts', iconId: 'archive', rarity: 'Rare', unlocked: false, progress: 53, target: 100 },
  { id: 'd', name: '500 Posts', iconId: 'crown', rarity: 'Legendary', unlocked: false, progress: 53, target: 500 },
];

root.appendChild(
  section(
    'Milestones',
    [
      row([
        MilestoneBadge({ iconId: 'footprint', unlocked: true, rarity: 'Common' }),
        MilestoneBadge({ iconId: 'calendarDays', unlocked: true, rarity: 'Uncommon' }),
        MilestoneBadge({ iconId: 'trophy', unlocked: true, rarity: 'Rare' }),
        MilestoneBadge({ iconId: 'crown', unlocked: true, rarity: 'Legendary' }),
        MilestoneBadge({ iconId: 'archive', unlocked: false }),
      ]),
      el('div', { class: 'ft-milestone-grid ft-mt-4' }, demoMilestones.map((m) => MilestoneCard({ milestone: m }))),
      el('div', { class: 'ft-mt-4' }, NextMilestone({ milestone: demoMilestones[2] })),
    ],
    'Rarity is restrained — only Legendary gets a gradient, so it stays rare visually as well as by definition. Locked milestones still show their name and progress: members should always know what they are working toward.',
  ),
);

// --- Flow Levels -----------------------------------------------------------

const demoLevels = [
  { id: 'seedling', name: 'Seedling', description: "You've started. That's the hardest part.", iconId: 'seedling', requiredPosts: 0, requiredPerfectWeeks: 0 },
  { id: 'creator', name: 'Creator', description: "You're publishing regularly now.", iconId: 'pen', requiredPosts: 10, requiredPerfectWeeks: 1 },
  { id: 'builder', name: 'Builder', description: "You've built a habit that holds.", iconId: 'hammer', requiredPosts: 50, requiredPerfectWeeks: 4 },
  { id: 'consistent-creator', name: 'Consistent Creator', description: 'Consistency is who you are, not what you do.', iconId: 'rings', requiredPosts: 100, requiredPerfectWeeks: 12 },
  { id: 'community-leader', name: 'Community Leader', description: 'Others follow your example without being asked.', iconId: 'beacon', requiredPosts: 250, requiredPerfectWeeks: 26 },
  { id: 'tribe-legend', name: 'Tribe Legend', description: 'A full year of showing up. Legendary.', iconId: 'laurel', requiredPosts: 500, requiredPerfectWeeks: 52 },
];

root.appendChild(
  section(
    'Flow Levels',
    [
      row([
        LevelChip({ name: 'Seedling', iconId: 'seedling' }),
        LevelChip({ name: 'Builder', iconId: 'hammer' }),
        LevelChip({ name: 'Tribe Legend', iconId: 'laurel', size: 'sm' }),
      ]),
      el('div', { class: 'ft-mt-4' }, Card({}, LevelProgress({
        next: {
          name: 'Consistent Creator',
          posts: { current: 53, target: 100 },
          perfectWeeks: { current: 9, target: 12 },
        },
      }))),
      el('div', { class: 'ft-mt-4' }, Card({}, LevelTrack({ levels: demoLevels, currentId: 'builder' }))),
    ],
    'Both requirements are shown, because a member held back by weeks rather than posts should be able to see that. One combined percentage would hide it.',
  ),
);

root.appendChild(
  Section({ title: 'End of gallery' }, el('p', {
    class: 'ft-text-sm ft-text-muted',
    text: 'Phases 1 and 4. Every component here is used by a real screen.',
  })),
);
