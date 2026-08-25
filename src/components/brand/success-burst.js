/**
 * Success burst.
 *
 * Plays once when a post is logged: a drawn checkmark on a green disc with
 * eight gold rays radiating out.
 *
 * This is the reward the whole product is built around. A member posts, logs
 * it, and this is the moment that says it counted. It is deliberately the only
 * place in the app that celebrates — an animation used everywhere stops
 * meaning anything anywhere.
 *
 * Under `prefers-reduced-motion` the rays are removed and the durations
 * collapse, leaving a static checkmark that still confirms the outcome.
 *
 * @module components/brand/success-burst
 */

import { el, svg } from '../../core/dom.js';

const RAY_COUNT = 8;

/**
 * @param {Object} [props]
 * @param {string} [props.label]   Announced to assistive technology.
 * @returns {HTMLElement}
 */
export function SuccessBurst(props = {}) {
  const { label = 'Logged' } = props;

  const rays = el(
    'span',
    { class: 'ft-success-burst__rays', attrs: { 'aria-hidden': 'true' } },
    Array.from({ length: RAY_COUNT }, (unused, index) =>
      el('span', {
        class: 'ft-success-burst__ray',
        // Each ray reads its own angle from a custom property, so one shared
        // keyframe animates all eight in different directions.
        style: {
          '--ft-burst-angle': `${(360 / RAY_COUNT) * index}deg`,
          // A small stagger stops the burst looking like a single expanding
          // shape.
          animationDelay: `${120 + index * 18}ms`,
        },
      }),
    ),
  );

  const check = svg(
    'svg',
    {
      class: 'ft-success-burst__check',
      attrs: { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
    },
    svg('path', { attrs: { d: 'M20 6L9 17l-5-5' } }),
  );

  return el(
    'span',
    {
      class: 'ft-success-burst',
      attrs: { role: 'img', 'aria-label': label },
    },
    [rays, el('span', { class: 'ft-success-burst__disc' }, check)],
  );
}

export default SuccessBurst;
