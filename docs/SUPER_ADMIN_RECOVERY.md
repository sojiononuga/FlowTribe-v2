# Sole Super Admin recovery

Use this only when the remaining active Super Admin cannot log in. It is an operator procedure, not an application feature.

## Security boundary

`operatorRecoverSuperAdmin()` is never present in the HTTP action table. It can only be run manually by someone who already controls the bound Google Apps Script project. There is no stored master PIN and no public recovery endpoint.

## Procedure

1. Open the bound Flow Tribe Apps Script project.
2. In Project Settings, add these temporary Script Properties:
   - `FT_RECOVERY_USERNAME` = the existing Super Admin username
   - `FT_RECOVERY_TEMP_PIN` = a new valid six digit temporary PIN
   - `FT_RECOVERY_CONFIRM` = `RESET <username>` exactly, for example `RESET recovery.admin`
3. Save the properties.
4. In the editor, select `operatorRecoverSuperAdmin` and click Run.
5. The function verifies that the target exists, is Active, and has the SuperAdmin role. It then replaces the PIN hash, clears login backoff, revokes every session, sets `MustChangePIN = true`, writes a `SUPER_ADMIN_RECOVERY` audit event, and deletes all three recovery properties.
6. Open Flow Tribe and log in with the temporary PIN.
7. The app must take you directly to Change PIN. Choose a new private PIN that was never stored in Script Properties.
8. Run `operatorRecoveryVerifyClean()`. It must return an empty string. If it returns any text, remove the named recovery properties immediately.

## Failure behaviour

The three recovery properties are deleted even when the recovery function refuses the request. This prevents a temporary PIN being left behind after a failed or mistyped recovery attempt. Re-enter all three properties before retrying.

The function refuses missing properties, an incorrect confirmation phrase, invalid usernames or PINs, unknown users, ordinary members, Community Managers, and inactive Super Admins.

## What must never be done

Do not add `operatorRecoverSuperAdmin` to `03_Router.gs`. Do not store a fallback or master PIN in source control. Do not put a permanent PIN in Script Properties. Do not hand-edit `PinHash` or `PinSalt` in the spreadsheet.
