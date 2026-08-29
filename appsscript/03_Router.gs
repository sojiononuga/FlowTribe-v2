/**
 * The router.
 *
 * Apps Script gives exactly two entry points and no paths, so the action name
 * in the request body does the routing.
 *
 * THE ACTION TABLE IS THE SECURITY BOUNDARY.
 *
 * Every action declares the capability it requires. The dispatcher refuses
 * anything not in the table, which means an endpoint cannot exist without
 * declaring what it needs. That is deliberate: the likeliest way to ship an
 * unprotected admin endpoint is to add a handler and forget the check, and
 * this structure makes forgetting impossible rather than merely unlikely.
 *
 * `capability: null` marks a genuinely public action. There are four:
 * system.health, auth.checkUsername, auth.register, auth.login. The client
 * mirrors this list in src/core/api.js PUBLIC_ACTIONS — keep them in step.
 *
 * @see docs/api.md
 * @see docs/security-architecture.md §4
 */

/**
 * @returns {Object<string, {capability: ?string, handler: Function}>}
 */
function getActionTable_() {
  return {
    // --- System ---
    'system.health': { capability: null, handler: handleHealth_ },

    // --- Public authentication ---
    'auth.checkUsername': { capability: null, handler: AuthController.checkUsername },
    'auth.register': { capability: null, handler: AuthController.register },
    'auth.login': { capability: null, handler: AuthController.login },

    // --- Session ---
    'auth.logout': { capability: 'authenticated', handler: AuthController.logout },
    'auth.session': { capability: 'authenticated', handler: AuthController.session },
    'auth.changePin': { capability: 'pin:update:self', handler: AuthController.changePin },

    // --- Member ---
    'member.dashboard': { capability: 'dashboard:self', handler: MemberController.dashboard },
    'member.submissions': { capability: 'submission:read:self', handler: MemberController.submissions },
    'member.calendar': { capability: 'dashboard:self', handler: MemberController.calendar },
    'member.updateConsent': { capability: 'profile:update:self', handler: MemberController.updateConsent },
    'member.updateName': { capability: 'profile:update:self', handler: MemberController.updateName },
    'member.updateGoal': { capability: 'profile:update:self', handler: MemberController.updateGoal },
    'member.profile': { capability: 'profile:read:self', handler: MemberController.profile },

    // --- Griot conversational intelligence ---
    'griot.chat': { capability: 'dashboard:self', handler: GriotService.chat },
    'griot.speak': { capability: 'dashboard:self', handler: GriotService.speak },

    // --- Milestones and levels ---
    'milestones.list': { capability: 'dashboard:self', handler: MemberController.milestones },
    'milestones.markSeen': { capability: 'dashboard:self', handler: MemberController.markMilestonesSeen },
    'levels.list': { capability: 'dashboard:self', handler: MemberController.levels },

    // --- Profile, Stage 2 ---
    'profile.get': { capability: 'profile:read:self', handler: ProfileController.get },
    'profile.update': { capability: 'profile:update:self', handler: ProfileController.update },

    // --- Submissions ---
    'submission.create': { capability: 'submission:create', handler: SubmissionController.create },
    'action.create': { capability: 'submission:create', handler: SubmissionController.createAction },

    // --- Flow Adapt ---
    'adaptation.propose': { capability: 'dashboard:self', handler: AdaptationController.propose },
    'adaptation.accept': { capability: 'dashboard:self', handler: AdaptationController.accept },

    // --- Leaderboard ---
    'leaderboard.get': { capability: 'leaderboard:read', handler: LeaderboardController.get },

    // --- Admin: overview and analytics ---
    'admin.overview': { capability: 'admin:overview:read', handler: AdminController.overview },
    'admin.analytics': { capability: 'analytics:read', handler: AdminController.analytics },

    // --- Admin: members ---
    'admin.members.list': { capability: 'member:read:all', handler: AdminController.listMembers },
    'admin.members.get': { capability: 'member:read:all', handler: AdminController.getMember },
    'admin.members.update': { capability: 'member:update', handler: AdminController.updateMember },
    'admin.members.setStatus': { capability: 'member:status:set', handler: AdminController.setStatus },
    'admin.members.resetPin': { capability: 'member:pin:reset', handler: AdminController.resetPin },
    'admin.members.setRole': { capability: 'member:role:set', handler: AdminController.setRole },
    'admin.members.delete': { capability: 'member:delete', handler: AdminController.deleteMember },
    'admin.members.reconcile': { capability: 'member:update', handler: AdminController.reconcileMember },

    // --- Admin: invites ---
    'admin.invites.create': { capability: 'invite:create', handler: AdminController.createInvites },
    'admin.invites.list': { capability: 'invite:read', handler: AdminController.listInvites },
    'admin.invites.revoke': { capability: 'invite:revoke', handler: AdminController.revokeInvite },

    // --- Admin: submissions, settings, audit ---
    'admin.submissions.list': { capability: 'submission:read:all', handler: AdminController.listSubmissions },
    'admin.submissions.void': { capability: 'submission:void', handler: AdminController.voidSubmission },
    'admin.settings.get': { capability: 'settings:read', handler: AdminController.getSettings },
    'admin.settings.update': { capability: 'settings:update', handler: AdminController.updateSetting },
    'admin.audit.list': { capability: 'audit:read', handler: AdminController.listAudit },
  };
}

/**
 * POST entry point — every real request arrives here.
 *
 * The body is sent as text/plain carrying JSON. That looks wrong and is
 * deliberate: application/json makes the request non-simple, which triggers a
 * CORS preflight, and Apps Script does not answer OPTIONS. text/plain keeps it
 * a simple request so the browser can read the response.
 *
 * @param {Object} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
  var started = Date.now();
  var action = 'unknown';

  try {
    var request = parseRequest_(e);
    action = request.action;

    var result = dispatch_(request);

    Logger_.info('request', action + ' ok in ' + (Date.now() - started) + 'ms');
    return successResponse_(result.data, result.meta);
  } catch (error) {
    if (isAppError_(error)) {
      // Expected: a typed failure with copy already fit to display.
      Logger_.warn('request', action + ' -> ' + error.code, { internal: error.internal });
      return errorResponse_(error.code, error.message, { field: error.field });
    }

    // Unexpected: loud in the log, generic to the member. Nothing about
    // internal structure is inferable by probing.
    logError_('doPost:' + action, error);
    return errorResponse_('SERVER_ERROR', ERROR_MESSAGES.SERVER_ERROR);
  }
}

/**
 * GET entry point — health only, no member data.
 *
 * v1 answered stats over GET with the PIN in the query string. This exists so
 * a deployment can be verified from a browser address bar and nothing more.
 */
function doGet() {
  return successResponse_({
    service: 'Flow Tribe API',
    version: API_VERSION,
    status: 'ok',
  });
}

/**
 * Route a parsed request through the middleware chain to its handler.
 *
 * @param {Object} request
 * @returns {{data: Object, meta: Object}}
 */
function dispatch_(request) {
  var entry = getActionTable_()[request.action];
  if (!entry) throw fail_('NOT_FOUND');

  var context = {
    action: request.action,
    payload: request.payload || {},
    requestId: request.requestId || '',
    clientVersion: request.clientVersion || '',
    userAgent: request.userAgent || '',
    member: null,
    session: null,
    role: null,
    capabilities: [],
  };

  // Public actions carry no session.
  if (entry.capability === null) {
    return { data: entry.handler(context), meta: {} };
  }

  var authenticated = Authenticate.resolve(request.token);

  context.member = authenticated.member;
  context.session = authenticated.session;
  context.role = authenticated.role;
  context.capabilities = authenticated.capabilities;
  context.memberId = authenticated.member.memberId;

  PinGate.check(context, request.action);
  Authorize.check(context, entry.capability);

  return {
    data: entry.handler(context),
    meta: { sessionExpiresAt: authenticated.sessionExpiresAt },
  };
}

/**
 * Health handler.
 *
 * Lets a client verify a deployment before any feature depends on it. v1
 * shipped with a placeholder URL and only discovered it at the first
 * submission, by which point a member was already staring at a failure.
 */
function handleHealth_(context) {
  return {
    service: 'Flow Tribe API',
    version: API_VERSION,
    timezone: TIMEZONE,
    receivedRequestId: context.requestId,
    serverTime: new Date().toISOString(),
  };
}
