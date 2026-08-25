/**
 * Platform display metadata.
 *
 * DISPLAY ONLY. This file holds labels, icons, and brand colours — the things
 * needed to draw a platform on screen.
 *
 * It deliberately does NOT contain the hostname allowlist that decides whether
 * a submitted link belongs to a member's registered platform. That rule
 * determines whether a post counts toward a streak and a public leaderboard,
 * so it lives on the server where it cannot be edited by the person it judges.
 * The client shows the server's verdict; it never reaches its own.
 *
 * The ordering here is the order platforms appear during registration.
 *
 * @module lib/platforms
 */

/**
 * @readonly
 * @enum {string}
 */
export const Platform = {
  LINKEDIN: 'LinkedIn',
  X: 'X',
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  YOUTUBE: 'YouTube',
};

/**
 * @typedef {Object} PlatformMeta
 * @property {string} id
 * @property {string} label      As shown to members
 * @property {string} hint       Example of what a link looks like
 * @property {string} color      The platform's own brand colour
 * @property {string[]} iconPaths  SVG path data for lib/icons
 */

/** @type {Record<string, PlatformMeta>} */
export const PLATFORMS = {
  [Platform.LINKEDIN]: {
    id: Platform.LINKEDIN,
    label: 'LinkedIn',
    hint: 'linkedin.com/posts/…',
    color: '#0A66C2',
    iconPaths: [
      'M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z',
      'M6 9H2v12h4z',
      'M4 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
    ],
  },
  [Platform.X]: {
    id: Platform.X,
    label: 'X',
    hint: 'x.com/you/status/…',
    color: '#000000',
    iconPaths: ['M4 4l16 16M20 4L4 20'],
  },
  [Platform.INSTAGRAM]: {
    id: Platform.INSTAGRAM,
    label: 'Instagram',
    hint: 'instagram.com/p/…',
    color: '#E4405F',
    iconPaths: [
      'M2 7a5 5 0 0 1 5-5h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5z',
      'M16 11.4A4 4 0 1 1 12.6 8 4 4 0 0 1 16 11.4z',
      'M17.5 6.5h.01',
    ],
  },
  [Platform.TIKTOK]: {
    id: Platform.TIKTOK,
    label: 'TikTok',
    hint: 'tiktok.com/@you/video/…',
    color: '#010101',
    iconPaths: [
      'M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5',
    ],
  },
  [Platform.YOUTUBE]: {
    id: Platform.YOUTUBE,
    label: 'YouTube',
    hint: 'youtube.com/watch?v=… or youtu.be/…',
    color: '#FF0000',
    iconPaths: [
      'M22.5 6.4a2.8 2.8 0 0 0-2-2C18.8 4 12 4 12 4s-6.8 0-8.5.4a2.8 2.8 0 0 0-2 2A29 29 0 0 0 1 12a29 29 0 0 0 .5 5.6 2.8 2.8 0 0 0 2 2C5.2 20 12 20 12 20s6.8 0 8.5-.4a2.8 2.8 0 0 0 2-2A29 29 0 0 0 23 12a29 29 0 0 0-.5-5.6z',
      'M10 15.5l6-3.5-6-3.5z',
    ],
  },
};

/** Registration order. */
export const PLATFORM_LIST = [
  PLATFORMS[Platform.LINKEDIN],
  PLATFORMS[Platform.X],
  PLATFORMS[Platform.INSTAGRAM],
  PLATFORMS[Platform.TIKTOK],
  PLATFORMS[Platform.YOUTUBE],
];

/**
 * Look up a platform, tolerating an unknown value.
 *
 * Returns a usable placeholder rather than throwing, so a row written before
 * a platform was renamed still renders instead of breaking the screen.
 *
 * @param {string} id
 * @returns {PlatformMeta}
 */
export function getPlatform(id) {
  return (
    PLATFORMS[id] || {
      id: id || 'Unknown',
      label: id || 'Unknown',
      hint: '',
      color: 'var(--ft-neutral-400)',
      iconPaths: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z'],
    }
  );
}

/**
 * Weekly goal options.
 *
 * Lives here rather than being written into the registration screen so the
 * dashboard, the admin edit form, and any future analytics filter all read
 * the same list. Adding a goal is one entry.
 */
export const WEEKLY_GOALS = [
  { value: 3, label: '3 posts', meta: 'A steady rhythm' },
  { value: 5, label: '5 posts', meta: 'Most weekdays' },
  { value: 7, label: 'Daily', meta: 'Every single day' },
];

/**
 * @param {number} goal
 * @returns {string} the label for a goal value
 */
export function goalLabel(goal) {
  const match = WEEKLY_GOALS.find((option) => option.value === goal);
  return match ? match.label : `${goal} posts`;
}
