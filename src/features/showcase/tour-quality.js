const TARGETS = {
  '/direction': '.ft-card',
  '/levels': '.ft-level-hero',
  '/leaderboard': '.ft-leaderboard--full, .ft-tabs',
  '/milestones': '.ft-milestone-summary',
  '/profile': '.ft-profile-head',
};

/**
 * Quality guard around the guided tour.
 *
 * The tour predates several of the current view class names. When a stale
 * selector resolved to #main it outlined the entire workspace, and the old
 * movement selector waited five seconds before falling back. This small guard
 * keeps the tour coupled to the visible feature without changing product data
 * or route behaviour.
 */
export function installTourQualityGuards() {
  const retarget = () => {
    // Compatibility alias for the tour's original movement-history selector.
    document.querySelectorAll('.ft-calendar:not(.ft-activity-calendar)').forEach((node) => {
      node.classList.add('ft-activity-calendar');
    });

    const main = document.querySelector('#main.ft-live-tour-target');
    if (!main) return;

    const route = currentRoute();
    const selector = TARGETS[route];
    const target = selector ? document.querySelector(selector) : null;
    if (!target || target === main) {
      main.classList.remove('ft-live-tour-target');
      return;
    }

    main.classList.remove('ft-live-tour-target');
    target.classList.add('ft-live-tour-target');
    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  };

  const observer = new MutationObserver(retarget);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class'],
  });

  document.addEventListener('flowtribe:tour-open', () => {
    const trigger = document.querySelector('[aria-label="Show me round Flow Tribe"]');
    if (trigger) trigger.click();
  });

  window.addEventListener('hashchange', () => window.setTimeout(retarget, 60));
  retarget();

  return () => observer.disconnect();
}

function currentRoute() {
  const hash = window.location.hash || '#/dashboard';
  return hash.startsWith('#') ? hash.slice(1).split('?')[0] : hash;
}
