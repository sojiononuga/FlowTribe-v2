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
 * movement selector waited five seconds before falling back. This guard keeps
 * the tour coupled to the visible feature even when a route renders its data
 * asynchronously.
 */
export function installTourQualityGuards() {
  let lastTarget = null;

  const retarget = () => {
    // Compatibility alias for the tour's original movement-history selector.
    document.querySelectorAll('.ft-calendar:not(.ft-activity-calendar)').forEach((node) => {
      node.classList.add('ft-activity-calendar');
    });

    const liveTour = document.querySelector('.ft-live-tour:not([hidden])');
    const main = document.querySelector('#main.ft-live-tour-target');
    if (main) main.classList.remove('ft-live-tour-target');

    if (!liveTour) {
      if (lastTarget) lastTarget.classList.remove('ft-live-tour-target');
      lastTarget = null;
      return;
    }

    const selector = TARGETS[currentRoute()];
    if (!selector) return;

    const target = document.querySelector(selector);
    if (!target) return;

    if (lastTarget && lastTarget !== target) lastTarget.classList.remove('ft-live-tour-target');
    if (!target.classList.contains('ft-live-tour-target')) {
      target.classList.add('ft-live-tour-target');
      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }
    lastTarget = target;
  };

  const observer = new MutationObserver(retarget);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'hidden'],
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
