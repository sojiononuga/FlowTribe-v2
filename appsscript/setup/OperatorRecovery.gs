/**
 * Emergency recovery for an existing Super Admin.
 *
 * OPERATOR ONLY. This file is never wired into 03_Router.gs and therefore
 * cannot be called over HTTP. Run operatorRecoverSuperAdmin() manually from
 * the bound Apps Script project after setting the three temporary Script
 * Properties documented below.
 */

var RECOVERY_KEYS = {
  USERNAME: 'FT_RECOVERY_USERNAME',
  TEMP_PIN: 'FT_RECOVERY_TEMP_PIN',
  CONFIRM: 'FT_RECOVERY_CONFIRM',
};

function operatorRecoverSuperAdmin() {
  var props = PropertiesService.getScriptProperties();
  var username = String(props.getProperty(RECOVERY_KEYS.USERNAME) || '').trim();
  var tempPin = String(props.getProperty(RECOVERY_KEYS.TEMP_PIN) || '');
  var confirm = String(props.getProperty(RECOVERY_KEYS.CONFIRM) || '');

  try {
    if (!username || !tempPin || !confirm) {
      throw new Error(
        'Recovery requires FT_RECOVERY_USERNAME, FT_RECOVERY_TEMP_PIN and FT_RECOVERY_CONFIRM.',
      );
    }

    var expectedConfirm = 'RESET ' + username;
    if (confirm !== expectedConfirm) {
      throw new Error('Recovery confirmation must be exactly: ' + expectedConfirm);
    }

    var usernameCheck = FtIdentity.validateUsername(username);
    if (!usernameCheck.valid) throw new Error('Username: ' + usernameCheck.message);

    AuthService.assertPinValid(tempPin, 'tempPin');

    var member = MemberRepo.findByUsernameKey(FtIdentity.usernameKey(username));
    if (!member) throw new Error('Recovery target was not found.');
    if (member.role !== ROLES.SUPER_ADMIN) {
      throw new Error('Recovery target is not a Super Admin.');
    }
    if (member.status !== MEMBER_STATUS.ACTIVE) {
      throw new Error('Recovery target is not an active Super Admin.');
    }

    var credentials = AuthService.hashNewPin(tempPin);
    MemberRepo.update(member.rowIndex, {
      pinHash: credentials.hash,
      pinSalt: credentials.salt,
      mustChangePin: true,
      failedLoginCount: 0,
      nextAttemptAt: '',
    });

    SessionService.revokeAll(member.memberId);
    CacheClient.invalidateMember(member.memberId);

    AuditRepo.append({
      actorId: 'SYSTEM_OPERATOR',
      actorRole: 'System',
      action: 'SUPER_ADMIN_RECOVERY',
      targetId: member.memberId,
      details: { username: member.username, channel: 'APPS_SCRIPT_EDITOR' },
    });

    var message =
      'Super Admin recovery completed for ' + member.username +
      '. All sessions were revoked. Log in with the temporary PIN and choose a new PIN immediately.';
    Logger.log(message);
    return message;
  } finally {
    // Recovery material is deliberately one-shot. It is removed even when a
    // recovery attempt fails, so a temporary PIN never sits in properties
    // waiting for a later accidental execution.
    props.deleteProperty(RECOVERY_KEYS.USERNAME);
    props.deleteProperty(RECOVERY_KEYS.TEMP_PIN);
    props.deleteProperty(RECOVERY_KEYS.CONFIRM);
  }
}

/** Returns a verification problem if temporary recovery material is present. */
function operatorRecoveryVerifyClean() {
  var props = PropertiesService.getScriptProperties();
  var leftovers = Object.keys(RECOVERY_KEYS).filter(function (name) {
    return Boolean(props.getProperty(RECOVERY_KEYS[name]));
  });
  return leftovers.length
    ? 'Recovery properties still present: ' + leftovers.map(function (name) { return RECOVERY_KEYS[name]; }).join(', ')
    : '';
}
