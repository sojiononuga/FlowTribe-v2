/**
 * The Flow Tribe logo lockup.
 *
 * THE Flo[w] TRIBE — burgundy "Flo", gold "w", a THE speech-bubble chip, and
 * a spaced TRIBE pill.
 *
 * Built in CSS rather than shipped as an image. v1 did this because the logo
 * file was thought to be missing; it is kept because the reasons turned out to
 * be good ones: it scales to any size without a second asset, it recolours
 * through tokens, it costs no request, and it stays crisp on every display.
 * The raster mark in assets/images/ is used where a real image is required —
 * favicons, share cards, anywhere outside the app.
 *
 * @module components/brand/logo
 */

import { cx, el } from '../../core/dom.js';

/**
 * @param {Object} [props]
 * @param {'sm'|'md'|'lg'} [props.size='md']
 * @param {boolean} [props.inline=false]   Horizontal, for tight app bars.
 * @returns {HTMLElement}
 */
export function Logo(props = {}) {
  const { size = 'md', inline = false } = props;

  return el(
    'span',
    {
      class: cx('ft-logo', size !== 'md' && `ft-logo--${size}`, inline && 'ft-logo--inline'),
      // The lockup is a picture of the name; screen readers get the name once.
      attrs: { role: 'img', 'aria-label': 'The Flow Tribe' },
    },
    [
      el('span', { class: 'ft-logo__mark' }, [
        el('span', { class: 'ft-logo__the', attrs: { 'aria-hidden': 'true' }, text: 'THE' }),
        el('span', { class: 'ft-logo__word', attrs: { 'aria-hidden': 'true' } }, [
          'Flo',
          el('span', { class: 'ft-logo__accent', text: 'w' }),
        ]),
      ]),
      el('span', { class: 'ft-logo__tribe', attrs: { 'aria-hidden': 'true' }, text: 'TRIBE' }),
    ],
  );
}

export default Logo;
