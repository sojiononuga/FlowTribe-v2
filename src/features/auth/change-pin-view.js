/**
 * Change PIN.
 *
 * WHY THIS SCREEN EXISTS
 * `auth.changePin` has been implemented on the server since Phase 5a, and
 * until now nothing could call it. That left the only account-recovery path in
 * the product as a dead end: an admin resets a forgotten PIN, `MustChangePin`
 * is set, and `PinGate` then refuses every action except this one — so the
 * member logs in successfully and can do precisely nothing. The forgot-PIN
 * screen even promises "you choose a new one the moment you log in".
 *
 * This screen is that promise.
 *
 * TWO ENTRY POINTS, ONE SCREEN
 *   1. Forced — an admin reset the PIN. `mustChangePin` is set, the member
 *      cannot leave, and the copy explains why they are here.
 *   2. Voluntary — a member changing a PIN they still know.
 *
 * The difference is entirely in the copy and whether an escape route is
 * offered. The request is identical, and the server does not care which case
 * it is: it verifies the current PIN either way. A forced change is not a
 * lower bar.
 *
 * AFTER A SUCCESSFUL CHANGE
 * The server revokes every session, including this one, and returns
 * `reauthenticate: true`. So the client clears its session and returns to
 * login rather than pretending the old token still works.
 *
 * @module features/auth/change-pin-view
 */

import { el } from '../../core/dom.js';
import { Button, Card, Field, PinInput, toastSuccess } from '../../components/ui/index.js';
import { Logo } from '../../components/brand/index.js';
import { call } from '../../core/api.js';
import { clearSession, mustChangePin } from '../../core/session.js';
import { toAppError } from '../../core/errors.js';
import { navigate } from '../../app/navigation.js';

export default function ChangePinView() {
  const forced = mustChangePin();

  let busy = false;

  const currentInput = PinInput({
    ariaLabel: forced ? 'Enter the temporary PIN you were given' : 'Enter your current PIN',
    autoFocus: true,
    onChange: () => currentField.update({ error: null }),
  });

  const currentField = Field({
    label: forced ? 'Temporary PIN' : 'Current PIN',
    control: currentInput,
    required: true,
    hint: forced ? 'The one the team sent you.' : undefined,
  });

  const newInput = PinInput({
    ariaLabel: 'Choose a new six digit PIN',
    onChange: () => newField.update({ error: null }),
  });

  const newField = Field({
    label: 'New PIN',
    control: newInput,
    required: true,
    hint: 'Six digits. Avoid repeats and runs like 111111 or 123456.',
  });

  const confirmInput = PinInput({
    ariaLabel: 'Confirm your new PIN',
    onChange: () => confirmField.update({ error: null }),
  });

  const confirmField = Field({
    label: 'Confirm new PIN',
    control: confirmInput,
    required: true,
  });

  const formError = el('p', {
    class: 'ft-auth__error',
    attrs: { role: 'alert', hidden: true },
  });

  const submitButton = Button({
    label: 'Set my new PIN',
    type: 'submit',
    size: 'lg',
    block: true,
  });

  /**
   * The client mirrors only what it can check without judging the member:
   * that the fields are filled and that the two new entries match. PIN policy
   * — length, repeats, sequences, common values — is the server's call and is
   * reported from its response, so the rule lives in exactly one place.
   */
  async function submit(event) {
    event.preventDefault();
    if (busy) return;

    const currentPin = currentInput.getValue();
    const newPin = newInput.getValue();
    const newPinConfirm = confirmInput.getValue();

    formError.hidden = true;

    if (!currentPin || !newPin || !newPinConfirm) {
      formError.textContent = 'Fill in all three fields to continue.';
      formError.hidden = false;
      return;
    }

    if (newPin !== newPinConfirm) {
      confirmField.update({ error: 'The two PINs do not match.' });
      confirmInput.clear();
      return;
    }

    busy = true;
    submitButton.update({ loading: true });

    try {
      await call('auth.changePin', { currentPin, newPin, newPinConfirm });

      // Every session was revoked server-side, this one included. Clearing
      // locally keeps the client honest rather than holding a token the server
      // has already forgotten.
      clearSession();
      toastSuccess('PIN updated. Log in with your new one.');
      navigate('/login', { replace: true });
    } catch (error) {
      const appError = toAppError(error);

      if (appError.field === 'currentPin') currentField.update({ error: appError.message });
      else if (appError.field === 'newPin') newField.update({ error: appError.message });
      else {
        formError.textContent = appError.message;
        formError.hidden = false;
      }

      // Never leave a rejected PIN sitting in the boxes.
      currentInput.clear();
      newInput.clear();
      confirmInput.clear();
      currentInput.focusFirst();
    } finally {
      busy = false;
      submitButton.update({ loading: false });
    }
  }

  return el('div', { class: 'ft-auth ft-animate-in' }, [
    el('div', { class: 'ft-auth__brand' }, Logo({ size: 'lg' })),

    el('h1', {
      class: 'ft-auth__title',
      text: forced ? 'Set a new PIN' : 'Change your PIN',
    }),
    el('p', {
      class: 'ft-auth__subtitle',
      text: forced
        ? 'Your PIN was reset by the team, so they know the temporary one. Choose a new one and only you will.'
        : 'Choose a new 6-digit PIN. You will use it the next time you log in.',
    }),

    Card({}, [
      el('form', { class: 'ft-auth__form', on: { submit } }, [
        currentField,
        newField,
        confirmField,
        formError,
        submitButton,
      ]),
    ]),

    el('p', {
      class: 'ft-text-sm ft-text-muted ft-mt-4 ft-text-center',
      text: 'Your streak, milestones, and calendar are untouched by a PIN change.',
    }),

    // A forced change offers logout rather than "cancel": there is nowhere to
    // cancel to, and pretending otherwise is how the loop started.
    el('div', { class: 'ft-mt-4' }, Button({
      label: forced ? 'Log out instead' : 'Cancel',
      variant: 'ghost',
      block: true,
      onClick: async () => {
        if (forced) {
          await call('auth.logout').catch(() => {});
          clearSession();
          navigate('/login', { replace: true });
          return;
        }
        navigate('/profile');
      },
    })),
  ]);
}
