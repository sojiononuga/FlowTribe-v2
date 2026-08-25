/**
 * Weekly progress ring.
 *
 * The dashboard's centrepiece: posts logged this week against the member's
 * chosen goal, whether that is 3, 5, or 7.
 *
 * The arithmetic lives here and the motion lives in CSS. The component sets
 * two custom properties — the circle's circumference and the offset for the
 * current value — and the transition on `stroke-dashoffset` does the rest on
 * the compositor. No animation loop, no per-frame JavaScript, and the ring
 * stays smooth on a mid-range phone.
 *
 * The ring turns from gold to green at the goal, so "done" is legible without
 * reading the number.
 *
 * @module components/brand/progress-ring
 */

import { cx, el, svg } from '../../core/dom.js';
import { stateful } from '../../core/component.js';

const VIEWBOX = 160;
const RADIUS = 68;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * @param {Object} props
 * @param {number} props.value             Posts logged this week.
 * @param {number} props.goal              The member's weekly goal.
 * @param {'sm'|'md'|'lg'} [props.size='md']
 * @param {boolean} [props.animate=true]   Sweep from empty on first paint.
 * @returns {HTMLElement}
 */
export function ProgressRing(props) {
  const { value, goal, size = 'md', animate = true } = props;

  const track = svg('circle', {
    class: 'ft-ring__track',
    attrs: { cx: VIEWBOX / 2, cy: VIEWBOX / 2, r: RADIUS },
  });

  const arc = svg('circle', {
    class: 'ft-ring__value',
    attrs: { cx: VIEWBOX / 2, cy: VIEWBOX / 2, r: RADIUS },
  });

  const count = el('span', { class: 'ft-ring__count' });
  const goalLabel = el('span', { class: 'ft-ring__goal' });

  const node = el(
    'div',
    {
      class: cx('ft-ring', size !== 'md' && `ft-ring--${size}`),
      // The ring is decorative; the label below states the same thing in
      // words, which is what a screen reader should read.
      attrs: { role: 'img' },
    },
    [
      svg(
        'svg',
        {
          class: 'ft-ring__svg',
          attrs: { viewBox: `0 0 ${VIEWBOX} ${VIEWBOX}`, 'aria-hidden': 'true' },
        },
        [track, arc],
      ),
      el('div', { class: 'ft-ring__label' }, [count, goalLabel]),
    ],
  );

  render(value, goal, animate);

  function render(nextValue, nextGoal, withAnimation) {
    const safeGoal = Math.max(1, Number(nextGoal) || 1);
    const safeValue = Math.max(0, Number(nextValue) || 0);

    // Capped at 1: a member who posts eight times against a goal of three has
    // a full ring, not one that wraps around and reads as almost empty.
    const fraction = Math.min(safeValue / safeGoal, 1);
    const offset = CIRCUMFERENCE * (1 - fraction);

    node.style.setProperty('--ft-ring-circumference', String(CIRCUMFERENCE));
    node.style.setProperty('--ft-ring-offset', String(offset));

    if (withAnimation) {
      // Start empty, then set the real offset on the next frame so the CSS
      // transition has two values to move between. Setting it directly would
      // paint the final state with no sweep.
      arc.style.strokeDashoffset = String(CIRCUMFERENCE);
      requestAnimationFrame(() => {
        arc.style.strokeDashoffset = String(offset);
      });
    } else {
      arc.style.strokeDashoffset = String(offset);
    }

    count.textContent = String(safeValue);
    goalLabel.textContent = `of ${safeGoal} this week`;

    node.classList.toggle('ft-ring--complete', safeValue >= safeGoal);
    node.setAttribute('aria-label', `${safeValue} of ${safeGoal} posts this week`);
  }

  return stateful(node, {
    /**
     * @param {{ value?: number, goal?: number }} next
     */
    update(next = {}) {
      const nextValue = next.value ?? Number(count.textContent);
      const nextGoal = next.goal ?? goal;
      // No re-animation on update: the transition already carries the change,
      // and resetting to empty first would look like a glitch.
      render(nextValue, nextGoal, false);
    },
  });
}

export default ProgressRing;
