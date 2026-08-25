/**
 * The component contract.
 *
 * There is no framework here, so the convention has to carry the weight. It
 * is deliberately small enough to hold in your head:
 *
 *   A component is a function that takes props and returns an HTMLElement.
 *
 *     export function Badge({ label, tone = 'neutral' }) {
 *       return el('span', { class: `ft-badge ft-badge--${tone}`, text: label });
 *     }
 *
 * A component that changes after creation attaches an `update` method, and
 * one that owns listeners or timers attaches `destroy`. `stateful()` below
 * wires both on and tracks teardown so nothing leaks.
 *
 *     export function Counter(props) {
 *       const node = el('span', { text: props.count });
 *       return stateful(node, {
 *         update: (next) => { node.textContent = next.count; },
 *       });
 *     }
 *
 * Rules that keep this from drifting into a framework:
 *
 *   1. A component never fetches. It receives data through props and reports
 *      intent through callbacks. Anything else and business logic ends up in
 *      the UI, which is the thing we were asked to avoid.
 *   2. A component never reads the store directly. Views wire the store to
 *      components; components stay reusable and testable in isolation.
 *   3. Text goes through `text:` or `textContent`. Never innerHTML. See
 *      core/dom.js for why.
 *
 * @module core/component
 */

/**
 * Attach lifecycle methods to an element.
 *
 * @template {HTMLElement} T
 * @param {T} node
 * @param {Object} [lifecycle]
 * @param {Function} [lifecycle.update]   Called with the next props.
 * @param {Function} [lifecycle.destroy]  Called on teardown, after cleanups.
 * @param {Function[]} [lifecycle.cleanups]
 *   Teardown functions — typically the return values of `on()`. Run in
 *   reverse order on destroy.
 * @returns {T} the same node, now carrying `update`/`destroy`
 */
export function stateful(node, lifecycle = {}) {
  const { update, destroy, cleanups = [] } = lifecycle;

  if (typeof update === 'function') {
    node.update = update;
  }

  node.destroy = () => {
    // Reverse order so teardown mirrors setup.
    for (let i = cleanups.length - 1; i >= 0; i -= 1) {
      try {
        cleanups[i]();
      } catch (error) {
        console.error('[component] cleanup failed', error);
      }
    }
    cleanups.length = 0;

    if (typeof destroy === 'function') destroy();

    destroyTree(node);
  };

  return node;
}

/**
 * Destroy every component descendant of a node.
 *
 * Called automatically when a `stateful` component is destroyed, and by the
 * router when a view is unmounted. Without this, a child component's
 * listeners and intervals survive its parent.
 *
 * @param {Node} root
 */
export function destroyTree(root) {
  if (!root || !root.querySelectorAll) return;

  // Snapshot first: destroy handlers may detach nodes mid-iteration.
  const nodes = Array.from(root.querySelectorAll('*'));

  for (const node of nodes) {
    if (typeof node.destroy === 'function') {
      try {
        node.destroy();
      } catch (error) {
        console.error('[component] destroy failed', error);
      }
      // Prevent a second call if this node is reached again through a parent.
      node.destroy = null;
    }
  }
}

/**
 * Replace a container's content with a component, destroying what was there.
 *
 * The router uses this for view transitions; views use it for regions that
 * swap wholesale (a loading skeleton becoming real content).
 *
 * @param {HTMLElement} container
 * @param {Node|Node[]} content
 * @returns {HTMLElement} container
 */
export function mount(container, content) {
  destroyTree(container);
  container.replaceChildren();

  const list = Array.isArray(content) ? content : [content];
  for (const node of list) {
    if (node) container.appendChild(node);
  }

  return container;
}

/**
 * Destroy a component and remove it from the DOM.
 *
 * @param {HTMLElement} node
 */
export function unmount(node) {
  if (!node) return;
  if (typeof node.destroy === 'function') node.destroy();
  else destroyTree(node);
  node.remove();
}

/**
 * Update a component if it supports updating, otherwise replace it.
 *
 * Lets a view call `refresh(slot, Component, props)` without knowing whether
 * that particular component chose to implement `update`.
 *
 * @param {HTMLElement} container  Holds exactly one component.
 * @param {Function} Component
 * @param {Object} props
 * @returns {HTMLElement} the live component node
 */
export function refresh(container, Component, props) {
  const current = container.firstElementChild;

  if (current && typeof current.update === 'function') {
    current.update(props);
    return current;
  }

  const next = Component(props);
  mount(container, next);
  return next;
}
