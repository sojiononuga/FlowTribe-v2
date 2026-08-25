/**
 * Request parsing and response shaping.
 *
 * Every response leaving the server is built here, so the envelope is
 * consistent and no handler can accidentally return a raw sheet row.
 *
 * WHY EVERY RESPONSE IS HTTP 200
 * Apps Script cannot set a status code on a ContentService response, and its
 * own failures return an HTML error page rather than JSON. So success lives in
 * the envelope's `ok` flag and the client reads that, never a status code.
 * Given the constraint, being explicit beats pretending otherwise.
 *
 * @see docs/api.md §2
 */

/**
 * Parse an incoming POST body.
 *
 * @param {Object} e the Apps Script event object
 * @returns {{action, token, payload, requestId, clientVersion, userAgent}}
 * @throws {AppError} VALIDATION_FAILED
 */
function parseRequest_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw fail_('VALIDATION_FAILED', 'Empty request.');
  }

  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (error) {
    throw fail_('VALIDATION_FAILED', 'Malformed request.');
  }

  if (!body || typeof body !== 'object' || !body.action || typeof body.action !== 'string') {
    throw fail_('VALIDATION_FAILED', 'Malformed request.');
  }

  return {
    action: body.action,
    token: typeof body.token === 'string' ? body.token : null,
    payload: body.payload && typeof body.payload === 'object' ? body.payload : {},
    requestId: typeof body.requestId === 'string' ? body.requestId.slice(0, 64) : '',
    clientVersion: typeof body.clientVersion === 'string' ? body.clientVersion.slice(0, 20) : '',
    // Best-effort only; Apps Script does not expose a real user agent.
    userAgent: typeof body.userAgent === 'string' ? body.userAgent.slice(0, 120) : '',
  };
}

/**
 * @param {Object} data
 * @param {Object} [meta]
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function successResponse_(data, meta) {
  var envelope = {
    ok: true,
    data: data || {},
    meta: {
      serverTime: new Date().toISOString(),
      version: API_VERSION,
    },
  };

  if (meta) {
    Object.keys(meta).forEach(function (key) {
      envelope.meta[key] = meta[key];
    });
  }

  return jsonOutput_(envelope);
}

/**
 * @param {string} code
 * @param {string} message member-facing, already in the brand voice
 * @param {Object} [options] { field }
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function errorResponse_(code, message, options) {
  var error = { code: code, message: message };
  if (options && options.field) error.field = options.field;

  return jsonOutput_({
    ok: false,
    error: error,
    meta: { serverTime: new Date().toISOString(), version: API_VERSION },
  });
}

function jsonOutput_(envelope) {
  return ContentService.createTextOutput(JSON.stringify(envelope)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

/**
 * Log an unexpected failure.
 *
 * Everything the server knows goes here and nowhere else. The browser gets a
 * generic message; this is what makes the failure diagnosable afterwards.
 */
function logError_(scope, error, details) {
  var parts = ['[' + scope + ']', error && error.message ? error.message : String(error)];

  if (error && error.failedStep) parts.push('step=' + error.failedStep);
  if (error && error.stack) parts.push(error.stack);
  if (details) parts.push(JSON.stringify(details));

  console.error(parts.join(' | '));
}
