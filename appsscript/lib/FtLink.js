/**
 * Link validation and normalisation. PURE — no Apps Script APIs.
 *
 * SERVER-ONLY BY DESIGN. This decides whether a post counts toward a streak and
 * a public leaderboard, so it must not be editable by the person it judges. The
 * client holds platform labels and icons; it does not hold this allowlist.
 */

var FtLink = (function () {
  /**
   * Registrable domains per platform.
   *
   * Matching is by domain suffix, never substring. A naive
   * `url.includes('linkedin.com')` accepts `notlinkedin.com`,
   * `linkedin.com.evil.co`, and `evil.com/?u=linkedin.com` — and the
   * leaderboard this feeds is what decides public recognition.
   */
  var PLATFORM_DOMAINS = {
    LinkedIn: ['linkedin.com', 'lnkd.in'],
    X: ['x.com', 'twitter.com', 't.co'],
    Instagram: ['instagram.com', 'instagr.am'],
    TikTok: ['tiktok.com'],
    YouTube: ['youtube.com', 'youtu.be'],
  };

  /** Tracking parameters stripped before comparison. */
  var TRACKING_PARAMS = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
    'fbclid', 'gclid', 'igshid', 'si', 'ref', 'ref_src', 'ref_url', 'trk', 'trackingId',
    'rdt', 'originalSubdomain', 'mibextid', '_r', '_t',
  ];

  /**
   * Parse a URL into its pieces without relying on the `URL` constructor.
   *
   * Apps Script's V8 runtime does provide `URL`, but a hand-rolled parse keeps
   * this file usable by the browser test harness under identical rules and
   * makes the accepted shapes explicit rather than delegated.
   *
   * @param {string} raw
   * @returns {{ok:boolean, protocol?:string, host?:string, path?:string, query?:string}}
   */
  function parse(raw) {
    var text = String(raw || '').trim();
    if (!text) return { ok: false };

    var match = text.match(/^(https?):\/\/([^/?#\s]+)([^?#\s]*)(\?[^#\s]*)?/i);
    if (!match) return { ok: false };

    var host = match[2].toLowerCase();

    // Strip credentials and port; neither is meaningful for identifying a post.
    host = host.replace(/^[^@]*@/, '').replace(/:\d+$/, '');
    if (!host || host.indexOf('.') === -1) return { ok: false };
    if (/\s/.test(host)) return { ok: false };

    return {
      ok: true,
      protocol: match[1].toLowerCase(),
      host: host,
      path: match[3] || '/',
      query: match[4] ? match[4].slice(1) : '',
    };
  }

  /**
   * Does a host belong to a platform?
   *
   * True for an exact match or a subdomain — `www.linkedin.com` and
   * `uk.linkedin.com` both count; `notlinkedin.com` does not, because the
   * check requires a dot before the domain.
   *
   * @param {string} host
   * @param {string} platform
   * @returns {boolean}
   */
  function hostMatchesPlatform(host, platform) {
    var domains = PLATFORM_DOMAINS[platform];
    if (!domains) return false;

    var clean = String(host || '').toLowerCase().replace(/^www\./, '');

    return domains.some(function (domain) {
      return clean === domain || clean.slice(-(domain.length + 1)) === '.' + domain;
    });
  }

  /**
   * Validate a submitted link against a member's registered platform.
   *
   * @param {string} raw
   * @param {string} platform
   * @returns {{valid:boolean, code?:string, host?:string}}
   *   `code` is `INVALID_URL` or `PLATFORM_MISMATCH`.
   */
  function validate(raw, platform) {
    var parsed = parse(raw);
    if (!parsed.ok) return { valid: false, code: 'INVALID_URL' };

    if (!hostMatchesPlatform(parsed.host, platform)) {
      return { valid: false, code: 'PLATFORM_MISMATCH', host: parsed.host };
    }

    return { valid: true, host: parsed.host };
  }

  /**
   * Normalise a URL to a comparison key.
   *
   * Two links to the same post should collide even when one carries tracking
   * parameters and the other does not. Without this, a member could re-log the
   * same post by copying it from a different place.
   *
   *   lowercase host, `www.` removed
   *   fragment removed
   *   trailing slash removed
   *   tracking parameters removed
   *   remaining parameters sorted, so order does not create a false difference
   *
   * @param {string} raw
   * @returns {string} empty when unparseable
   */
  function normaliseKey(raw) {
    var parsed = parse(raw);
    if (!parsed.ok) return '';

    var host = parsed.host.replace(/^www\./, '');
    var path = parsed.path.replace(/\/+$/, '');

    var kept = [];
    if (parsed.query) {
      parsed.query.split('&').forEach(function (pair) {
        if (!pair) return;
        var name = pair.split('=')[0];
        if (TRACKING_PARAMS.indexOf(name) !== -1) return;
        kept.push(pair);
      });
    }

    kept.sort();

    return host + path + (kept.length ? '?' + kept.join('&') : '');
  }

  /**
   * @param {string} platform
   * @returns {string[]} the domains accepted for a platform
   */
  function domainsFor(platform) {
    return (PLATFORM_DOMAINS[platform] || []).slice();
  }

  /** @returns {string[]} every supported platform id */
  function platforms() {
    return Object.keys(PLATFORM_DOMAINS);
  }

  return {
    parse: parse,
    hostMatchesPlatform: hostMatchesPlatform,
    validate: validate,
    normaliseKey: normaliseKey,
    domainsFor: domainsFor,
    platforms: platforms,
  };
})();

if (typeof module !== 'undefined') module.exports = FtLink;
