/**
 * Layout components: the app shell, top bar, bottom navigation, page header,
 * and the admin ⇄ member mode switch.
 *
 * These are structural and stateless — they take content and arrange it. The
 * decisions about *what* goes in them (which nav items, which title) belong to
 * the shells in src/, not here.
 *
 * @module components/layout
 */

import { cx, el, icon } from '../../core/dom.js';
import { stateful } from '../../core/component.js';
import { Icons } from '../../lib/icons.js';
import { config } from '../../core/config.js';

/* -------------------------------------------------------------------------
 * App shell
 * ---------------------------------------------------------------------- */

/**
 * The outer frame. Every screen mounts into its outlet.
 *
 * @param {Object} [props]
 * @param {HTMLElement} [props.topBar]
 * @param {HTMLElement} [props.bottomNav]
 * @param {'app'|'centered'} [props.variant='app']
 *   'centered' is the auth layout — a single card, vertically centred, no nav.
 * @param {'sm'|'md'|'lg'|'xl'} [props.width='md']
 * @returns {HTMLElement} shell; `.outlet` is where views mount
 */
export function AppShell(props = {}) {
  const { topBar, bottomNav, variant = 'app', width = 'md' } = props;

  const outlet = el('main', {
    class: cx('ft-shell__main', 'ft-container', width !== 'md' && `ft-container--${width}`),
    id: 'main',
  });

  const node = el(
    'div',
    {
      class: cx(
        'ft-shell',
        variant === 'centered' && 'ft-shell--centered',
        !bottomNav && 'ft-shell--no-nav',
      ),
    },
    [
      // Lets a keyboard user jump past the navigation straight to content.
      el('a', { class: 'ft-skip-link', attrs: { href: '#main' }, text: 'Skip to content' }),
      topBar || null,
      outlet,
      bottomNav || null,
    ],
  );

  node.outlet = outlet;
  return node;
}

/* -------------------------------------------------------------------------
 * Top bar
 * ---------------------------------------------------------------------- */

/**
 * @param {Object} [props]
 * @param {HTMLElement} [props.brand]      Usually the logo.
 * @param {string} [props.title]           Used instead of the brand on subpages.
 * @param {Function} [props.onBack]        Renders a back button.
 * @param {HTMLElement[]} [props.actions]
 * @returns {HTMLElement}
 */
export function TopBar(props = {}) {
  const { brand, title, onBack, actions = [] } = props;

  const titleNode = title ? el('span', { class: 'ft-topbar__title', text: title }) : null;

  const node = el('header', { class: 'ft-topbar' }, [
    el('div', { class: 'ft-topbar__start' }, [
      onBack
        ? el(
            'button',
            {
              class: 'ft-topbar__back',
              type: 'button',
              attrs: { 'aria-label': 'Go back' },
              on: { click: onBack },
            },
            icon(Icons.chevronLeft),
          )
        : null,
      titleNode || brand || null,
    ]),
    el('div', { class: 'ft-topbar__end' }, actions),
  ]);

  return stateful(node, {
    update(next = {}) {
      if (next.title !== undefined && titleNode) titleNode.textContent = next.title;
    },
  });
}

/* -------------------------------------------------------------------------
 * Bottom navigation
 * ---------------------------------------------------------------------- */

/**
 * Primary navigation.
 *
 * Fixed to the bottom on phones, where a thumb reaches it, and folded into a
 * horizontal row on desktop. The primary action sits in the middle as a raised
 * circle: the single most important thing a member does, always within reach.
 *
 * @param {Object} props
 * @param {Array<{id: string, label: string, href: string, iconPaths: string[], cta?: boolean}>} props.items
 * @param {string} [props.activeId]
 * @returns {HTMLElement}
 */
export function BottomNav(props) {
  const { items, activeId } = props;

  const links = new Map();

  const node = el(
    'nav',
    { class: 'ft-bottomnav', attrs: { 'aria-label': 'Main' } },
    items.map((item) => {
      const link = el(
        'a',
        {
          class: item.cta ? 'ft-bottomnav__cta' : 'ft-bottomnav__item',
          attrs: {
            href: item.href,
            'aria-label': item.cta ? item.label : null,
            'aria-current': item.id === activeId ? 'page' : null,
          },
        },
        [
          icon(item.iconPaths, { class: item.cta ? undefined : 'ft-bottomnav__icon' }),
          // The label is always in the markup, and CSS decides whether it is
          // seen. On mobile the CTA is a bare circle, so it is hidden there;
          // in the desktop sidebar it is a labelled row like every other item.
          // Rendering it conditionally would mean the component had to know
          // which layout it was in.
          el('span', { class: item.cta ? 'ft-bottomnav__cta-label' : null, text: item.label }),
        ],
      );

      links.set(item.id, link);
      return link;
    }),
  );

  return stateful(node, {
    /**
     * @param {{ activeId?: string }} next
     */
    update(next = {}) {
      if (next.activeId === undefined) return;

      for (const [id, link] of links) {
        if (id === next.activeId) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
    },
  });
}

/* -------------------------------------------------------------------------
 * Page header
 * ---------------------------------------------------------------------- */

/**
 * @param {Object} props
 * @param {string} props.title
 * @param {string} [props.eyebrow]
 * @param {string} [props.subtitle]
 * @param {HTMLElement[]} [props.actions]
 * @returns {HTMLElement}
 */
export function PageHeader(props) {
  const { title, eyebrow, subtitle, actions = [] } = props;

  return el('div', { class: 'ft-pagehead' }, [
    el('div', {}, [
      eyebrow ? el('p', { class: 'ft-pagehead__eyebrow', text: eyebrow }) : null,
      el('h1', { class: 'ft-pagehead__title', text: title }),
      subtitle ? el('p', { class: 'ft-pagehead__subtitle', text: subtitle }) : null,
    ]),
    actions.length ? el('div', { class: 'ft-pagehead__actions' }, actions) : null,
  ]);
}

/* -------------------------------------------------------------------------
 * Section
 * ---------------------------------------------------------------------- */

/**
 * A titled block within a page.
 *
 * @param {Object} props
 * @param {string} props.title
 * @param {HTMLElement} [props.action]
 * @param {Array|HTMLElement} [children]
 * @returns {HTMLElement}
 */
export function Section(props, children = []) {
  const { title, action } = props;

  return el('section', { class: 'ft-section' }, [
    el('div', { class: 'ft-section__header' }, [
      el('h2', { class: 'ft-section__title', text: title }),
      action || null,
    ]),
    ...(Array.isArray(children) ? children : [children]),
  ]);
}

/* -------------------------------------------------------------------------
 * Mode switch
 * ---------------------------------------------------------------------- */

/**
 * The My Dashboard ⇄ Admin switch.
 *
 * Community Managers and Super Admins are members too: they have streaks, they
 * appear on the leaderboard, they log posts. This is how they move between
 * their own dashboard and the admin control centre.
 *
 * Because the two shells are separate documents on the same origin, this is a
 * real navigation rather than a client-side route. The session token in
 * localStorage carries across untouched. It costs a page load, which is
 * appropriate here — this is a deliberate, infrequent change of mode, and the
 * load makes that boundary legible rather than hiding it.
 *
 * @param {Object} props
 * @param {'toAdmin'|'toMember'} props.direction
 * @returns {HTMLElement}
 */
export function ModeSwitch(props) {
  const { direction } = props;

  const toAdmin = direction === 'toAdmin';

  const label = toAdmin ? 'Admin' : 'My Dashboard';
  const href = toAdmin
    ? `${config.app.adminEntry}#/`
    : `${config.app.memberEntry}#/dashboard`;

  return el(
    'a',
    {
      class: 'ft-modeswitch',
      attrs: { href, 'aria-label': toAdmin ? 'Go to admin dashboard' : 'Go to my dashboard' },
    },
    [
      el('span', { class: 'ft-modeswitch__icon' }, icon(toAdmin ? Icons.shield : Icons.home)),
      el('span', { class: 'ft-modeswitch__label', text: label }),
    ],
  );
}
