/**
 * DOM helpers.
 *
 * The whole application builds its UI through `el()` and `svg()`. Nothing
 * anywhere assigns `innerHTML`.
 *
 * That is a security decision, not a style preference. Session tokens live in
 * localStorage, which any script on the origin can read, so the app's safety
 * depends on it having no XSS. Member-controlled text — full names, usernames,
 * bios, submitted links — is rendered on admin screens where a payload would
 * execute with an administrator's session. Routing every string through
 * `textContent` makes that class of bug impossible rather than unlikely.
 *
 * @module core/dom
 */

/** SVG elements must be created in their own namespace. */
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Create an element.
 *
 * @param {string} tag
 * @param {Object} [props]
 *   Recognised keys:
 *     class      {string|string[]}  className; falsy entries in an array are dropped
 *     text       {string|number}    textContent — the only way to set text
 *     dataset    {Object}           data-* attributes
 *     style      {Object}           inline styles, camelCase or custom properties
 *     attrs      {Object}           any attribute; null/false/undefined removes it
 *     on         {Object}           event listeners, e.g. { click: fn }
 *     ref        {Function}         called with the element once built
 *   Any other key is set as a DOM property when the element has one
 *   (`value`, `disabled`, `checked`), otherwise as an attribute.
 * @param {Array|Node|string} [children]
 * @returns {HTMLElement}
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  applyProps(node, props);
  appendChildren(node, children);
  return node;
}

/**
 * Create an SVG element. Same signature as `el`.
 *
 * @param {string} tag
 * @param {Object} [props]
 * @param {Array|Node|string} [children]
 * @returns {SVGElement}
 */
export function svg(tag, props = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  applyProps(node, props, true);
  appendChildren(node, children);
  return node;
}

/**
 * Build an inline SVG icon from path data.
 *
 * Icons are inline rather than a sprite sheet or an icon font: no extra
 * request, and `stroke: currentColor` means an icon inherits its parent's
 * colour automatically, so hover and active states need no icon-specific CSS.
 *
 * @param {string|string[]} paths  One or more `d` attributes.
 * @param {Object} [options]
 * @param {string} [options.class]
 * @param {string} [options.viewBox='0 0 24 24']
 * @param {boolean} [options.filled=false]  Fill the paths instead of stroking.
 * @returns {SVGElement}
 */
export function icon(paths, options = {}) {
  const { class: className, viewBox = '0 0 24 24', filled = false } = options;
  const list = Array.isArray(paths) ? paths : [paths];

  return svg(
    'svg',
    {
      class: className,
      attrs: {
        viewBox,
        fill: filled ? 'currentColor' : 'none',
        stroke: filled ? 'none' : 'currentColor',
        'stroke-width': filled ? '0' : '2',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        // Icons are decorative; the accessible name comes from the control
        // that contains them.
        'aria-hidden': 'true',
        focusable: 'false',
      },
    },
    list.map((d) => svg('path', { attrs: { d } })),
  );
}

/**
 * Remove every child of a node.
 *
 * @param {Node} node
 * @returns {Node} the same node, for chaining
 */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/**
 * Replace a node's children in one operation.
 *
 * @param {Node} node
 * @param {Array|Node|string} children
 * @returns {Node}
 */
export function replaceChildren(node, children) {
  clear(node);
  appendChildren(node, children);
  return node;
}

/**
 * Attach an event listener and return a function that removes it.
 *
 * Returning the teardown makes cleanup hard to forget: a component collects
 * these and calls them in `destroy()`.
 *
 * @param {EventTarget} target
 * @param {string} type
 * @param {Function} handler
 * @param {Object|boolean} [options]
 * @returns {Function} unsubscribe
 */
export function on(target, type, handler, options) {
  target.addEventListener(type, handler, options);
  return () => target.removeEventListener(type, handler, options);
}

/**
 * Toggle a class based on a condition.
 *
 * @param {Element} node
 * @param {string} className
 * @param {boolean} active
 */
export function toggleClass(node, className, active) {
  node.classList.toggle(className, Boolean(active));
}

/**
 * Join class names, dropping anything falsy.
 *
 * Lets components write `cx('ft-btn', variant && `ft-btn--${variant}`)`
 * without building a string by hand each time.
 *
 * @param {...(string|false|null|undefined)} names
 * @returns {string}
 */
export function cx(...names) {
  return names.filter(Boolean).join(' ');
}

/**
 * Restart a CSS animation that is already applied.
 *
 * Re-adding a class does nothing if the browser has not repainted, so the
 * class is removed, layout is read to force a reflow, and it is re-added.
 * Used for the field shake on a repeated validation error.
 *
 * @param {Element} node
 * @param {string} className
 */
export function restartAnimation(node, className) {
  node.classList.remove(className);
  void node.offsetWidth; // forced reflow — intentional
  node.classList.add(className);
}

/**
 * Move keyboard focus into a container, preferring the first focusable child.
 *
 * @param {HTMLElement} container
 */
export function focusFirst(container) {
  const target = container.querySelector(
    'input:not([disabled]), select:not([disabled]), textarea:not([disabled]),' +
      ' button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
  );
  if (target) target.focus();
  else container.focus();
}

/**
 * Trap Tab within a container and return a teardown.
 *
 * Required for modals: without it, tabbing walks out of the dialog and into
 * the page behind, which is disorienting for keyboard and screen-reader users.
 *
 * @param {HTMLElement} container
 * @returns {Function} release
 */
export function trapFocus(container) {
  const selector =
    'input:not([disabled]), select:not([disabled]), textarea:not([disabled]),' +
    ' button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

  const handler = (event) => {
    if (event.key !== 'Tab') return;

    const focusable = Array.from(container.querySelectorAll(selector)).filter(
      (node) => node.offsetParent !== null,
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return on(container, 'keydown', handler);
}

/* -------------------------------------------------------------------------
 * Internals
 * ---------------------------------------------------------------------- */

function applyProps(node, props, isSvg = false) {
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;

    switch (key) {
      case 'class':
        applyClass(node, value, isSvg);
        break;

      case 'text':
        node.textContent = String(value);
        break;

      case 'dataset':
        for (const [dataKey, dataValue] of Object.entries(value)) {
          if (dataValue !== undefined && dataValue !== null) {
            node.dataset[dataKey] = String(dataValue);
          }
        }
        break;

      case 'style':
        applyStyle(node, value);
        break;

      case 'attrs':
        for (const [attr, attrValue] of Object.entries(value)) {
          setAttribute(node, attr, attrValue);
        }
        break;

      case 'on':
        for (const [type, handler] of Object.entries(value)) {
          if (typeof handler === 'function') node.addEventListener(type, handler);
        }
        break;

      case 'ref':
        if (typeof value === 'function') value(node);
        break;

      default:
        // Prefer the DOM property when one exists (value, checked, disabled),
        // since properties reflect live state while attributes only seed it.
        if (!isSvg && key in node) node[key] = value;
        else setAttribute(node, key, value);
    }
  }
}

function applyClass(node, value, isSvg) {
  const className = Array.isArray(value) ? value.filter(Boolean).join(' ') : value;
  if (!className) return;
  // SVG elements have a read-only `className`; they must go through setAttribute.
  if (isSvg) node.setAttribute('class', className);
  else node.className = className;
}

function applyStyle(node, styles) {
  for (const [prop, value] of Object.entries(styles)) {
    if (value === undefined || value === null) continue;
    // Custom properties must be set through setProperty, not assignment.
    if (prop.startsWith('--')) node.style.setProperty(prop, String(value));
    else node.style[prop] = value;
  }
}

function setAttribute(node, name, value) {
  if (value === false || value === null || value === undefined) {
    node.removeAttribute(name);
  } else if (value === true) {
    node.setAttribute(name, '');
  } else {
    node.setAttribute(name, String(value));
  }
}

function appendChildren(node, children) {
  const list = Array.isArray(children) ? children : [children];

  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;

    if (Array.isArray(child)) {
      appendChildren(node, child);
    } else if (child instanceof Node) {
      node.appendChild(child);
    } else {
      // Strings become text nodes. This is the path that makes injected
      // markup inert.
      node.appendChild(document.createTextNode(String(child)));
    }
  }
}
