/**
 * Catalog display metadata.
 *
 * DISPLAY ONLY — the same line this project draws everywhere else.
 *
 * The server owns what a milestone is, how it is judged, and whether a member
 * has earned it. It returns `category`, `iconId`, `name`, `description`,
 * `rarity`, `progress`, and `target`. This file holds the two things that are
 * purely presentational and would otherwise be scattered across screens:
 *
 *   1. the ORDER categories appear in, and their human labels
 *   2. a fallback ladder for Flow Levels, used only for ordering and icons
 *      before a response arrives
 *
 * Nothing here decides anything. If this file disagreed with the server, the
 * server would still be right — the worst outcome is a section rendered in the
 * wrong order, never a wrong unlock.
 *
 * @module lib/catalog
 */

/**
 * Milestone categories, in the order they appear on the Milestones screen.
 *
 * Ordered deliberately: the categories a new member can reach come first, so
 * the screen opens on what is within reach rather than on what is far away.
 * `id` matches `MilestoneCatalog.Category` on the server.
 */
export const MILESTONE_CATEGORIES = [
  { id: 'GettingStarted', label: 'Getting started' },
  { id: 'Consistency', label: 'Consistency' },
  { id: 'WeeklyExcellence', label: 'Weekly excellence' },
  { id: 'Posting', label: 'Meaningful action' },
  { id: 'Community', label: 'Community' },
];

/**
 * @param {string} id
 * @returns {string} the human label, falling back to the raw id
 */
export function categoryLabel(id) {
  const match = MILESTONE_CATEGORIES.find((category) => category.id === id);
  return match ? match.label : id;
}

/**
 * Rarity display order and label.
 *
 * The server stores the rarity string; this decides how it is shown.
 */
export const RARITY = {
  Common: { label: 'Common', order: 1 },
  Uncommon: { label: 'Uncommon', order: 2 },
  Rare: { label: 'Rare', order: 3 },
  Legendary: { label: 'Legendary', order: 4 },
};

/**
 * @param {string} rarity
 * @returns {string}
 */
export function rarityLabel(rarity) {
  return RARITY[rarity] ? RARITY[rarity].label : String(rarity || '');
}

/**
 * Flow Level icon ids, in ladder order.
 *
 * The server returns each level's own `iconId`, so this is only a fallback for
 * a level whose row was edited to an unknown icon — the ladder still renders
 * rather than showing a gap.
 */
export const LEVEL_ICON_ORDER = [
  'leaf',
  'pen',
  'hammer',
  'mountain',
  'compass',
  'star',
];

/**
 * @param {number} sortOrder 1-based
 * @returns {string} an icon id that always exists
 */
export function fallbackLevelIcon(sortOrder) {
  return LEVEL_ICON_ORDER[Math.max(0, Math.min(sortOrder - 1, LEVEL_ICON_ORDER.length - 1))];
}

/* Legacy catalog rows remain the compatibility engine in production. These
   display adapters generalise their language without changing ids, unlock
   rules, existing member history, or the spreadsheet schema. */
const MILESTONE_PRESENTATION = {
  'first-step': { name: 'First Step', description: 'You recorded your first meaningful action.' },
  'posts-10': { name: '10 Actions', description: 'Ten meaningful actions recorded.' },
  'posts-50': { name: '50 Actions', description: 'Fifty meaningful actions recorded.' },
  'posts-100': { name: '100 Actions', description: 'One hundred meaningful actions recorded.' },
  'posts-250': { name: '250 Actions', description: 'Two hundred and fifty meaningful actions recorded.' },
  'posts-500': { name: '500 Actions', description: 'Five hundred meaningful actions recorded.' },
};

const LEVEL_PRESENTATION = {
  creator: { name: 'Mover', description: 'You are turning intention into visible action.' },
  'consistent-creator': { name: 'Momentum Builder', description: 'Returning has become part of how you move.' },
};

export function presentMilestone(milestone) {
  if (!milestone) return milestone;
  const byId = MILESTONE_PRESENTATION[milestone.milestoneId];
  if (byId) return { ...milestone, ...byId };

  // Newly-unlocked evaluator results predate the API row mapper and may carry
  // `id` instead of `milestoneId`. The name fallback also protects manually
  // edited legacy spreadsheets during the transition.
  const id = milestone.id || Object.keys(MILESTONE_PRESENTATION).find((key) => {
    const legacyName = key === 'first-step' ? 'First Step' : `${key.split('-')[1]} Posts`;
    return milestone.name === legacyName;
  });
  const display = MILESTONE_PRESENTATION[id];
  if (display) return { ...milestone, ...display };

  return {
    ...milestone,
    name: String(milestone.name || '').replace(/\bPosts\b/g, 'Actions'),
    description: String(milestone.description || '').replace(/\bposts?\b/gi, (word) => word[0] === word[0].toUpperCase() ? 'Action' : 'action'),
  };
}

export function presentLevel(level) {
  if (!level) return level;
  const byId = LEVEL_PRESENTATION[level.levelId || level.id];
  if (byId) return { ...level, ...byId };
  if (level.name === 'Creator') return { ...level, ...LEVEL_PRESENTATION.creator };
  if (level.name === 'Consistent Creator') return { ...level, ...LEVEL_PRESENTATION['consistent-creator'] };
  return level;
}
