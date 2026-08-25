/**
 * Empty-state illustrations.
 *
 * Flat, friendly, minimal — the style the Design System asks for, and
 * explicitly not cartoon characters, 3D, gradients, or busy backgrounds. Each
 * one is a small inline SVG drawn on a 96×96 grid and rendered at 64px, the
 * specified empty-state size.
 *
 * TWO COLOURS, BOTH INHERITED
 * Strokes use `currentColor`, so an illustration takes the colour of whatever
 * contains it — exactly like the icon set. Fills use `--ft-illus-fill`, a soft
 * brand tint that the empty-state component sets. That means a single pair of
 * CSS values themes every illustration, and none of them carries a hex.
 *
 * WHY THESE ARE NOT ICONS
 * An icon labels a thing. An illustration fills a silence. Empty states are
 * where a member is most likely to feel they have fallen behind, so the job
 * here is to make the screen look intentional rather than broken — and to
 * point at the action that resolves it.
 *
 * @module lib/illustrations
 */

import { svg } from '../core/dom.js';

/* -------------------------------------------------------------------------
 * Primitives
 * ---------------------------------------------------------------------- */

const stroke = (tag, attrs) =>
  svg(tag, {
    attrs: {
      ...attrs,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': attrs['stroke-width'] || 3,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    },
  });

const solid = (tag, attrs) =>
  svg(tag, { attrs: { ...attrs, fill: 'var(--ft-illus-fill)', stroke: 'none' } });

/* -------------------------------------------------------------------------
 * The set
 * ---------------------------------------------------------------------- */

/**
 * Each entry returns the SVG children for its scene. Keyed so a view can name
 * an illustration the same way it names an icon.
 */
export const Illustrations = {
  /** No posts logged yet — a page waiting to be written on. */
  noPosts: () => [
    solid('rect', { x: 22, y: 16, width: 52, height: 64, rx: 8 }),
    stroke('rect', { x: 22, y: 16, width: 52, height: 64, rx: 8 }),
    stroke('path', { d: 'M34 36h28' }),
    stroke('path', { d: 'M34 48h28' }),
    stroke('path', { d: 'M34 60h16' }),
  ],

  /** No milestones yet — an empty badge, not a broken one. */
  noMilestones: () => [
    solid('circle', { cx: 48, cy: 40, r: 22 }),
    stroke('circle', { cx: 48, cy: 40, r: 22 }),
    stroke('path', { d: 'M38 60 32 84l16-9 16 9-6-24' }),
    stroke('path', { d: 'M48 31l3.4 6.9 7.6 1.1-5.5 5.4 1.3 7.6-6.8-3.6-6.8 3.6 1.3-7.6-5.5-5.4 7.6-1.1z' }),
  ],

  /** No recent activity — a calendar with the days still to come. */
  noActivity: () => [
    solid('rect', { x: 16, y: 24, width: 64, height: 56, rx: 8 }),
    stroke('rect', { x: 16, y: 24, width: 64, height: 56, rx: 8 }),
    stroke('path', { d: 'M16 42h64' }),
    stroke('path', { d: 'M34 16v14' }),
    stroke('path', { d: 'M62 16v14' }),
    stroke('path', { d: 'M32 56h.1' }),
    stroke('path', { d: 'M48 56h.1' }),
    stroke('path', { d: 'M64 56h.1' }),
    stroke('path', { d: 'M32 68h.1' }),
    stroke('path', { d: 'M48 68h.1' }),
  ],

  /** Empty leaderboard — a podium nobody has stepped onto. */
  emptyLeaderboard: () => [
    solid('rect', { x: 38, y: 30, width: 20, height: 50, rx: 4 }),
    stroke('rect', { x: 38, y: 30, width: 20, height: 50, rx: 4 }),
    stroke('rect', { x: 14, y: 48, width: 20, height: 32, rx: 4 }),
    stroke('rect', { x: 62, y: 56, width: 20, height: 24, rx: 4 }),
    stroke('path', { d: 'M48 14v8' }),
  ],

  /** Nothing matched a search or filter. */
  noResults: () => [
    solid('circle', { cx: 42, cy: 42, r: 22 }),
    stroke('circle', { cx: 42, cy: 42, r: 22 }),
    stroke('path', { d: 'M58 58 78 78' }),
    stroke('path', { d: 'M34 42h16' }),
  ],
};

/**
 * Build an illustration element.
 *
 * @param {string} name  A key of `Illustrations`.
 * @param {Object} [options]
 * @param {string} [options.class]
 * @returns {SVGElement|null} null when the name is unknown, so a missing
 *   illustration degrades to no illustration rather than to a broken screen.
 */
export function illustration(name, options = {}) {
  const scene = Illustrations[name];
  if (!scene) return null;

  return svg(
    'svg',
    {
      class: options.class,
      attrs: {
        viewBox: '0 0 96 96',
        // Decorative. The empty state's own title carries the meaning.
        'aria-hidden': 'true',
        focusable: 'false',
      },
    },
    scene(),
  );
}

export default Illustrations;
