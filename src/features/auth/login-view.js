/**
 * Login.
 *
 * Two fields. The PIN input auto-submits when the sixth digit lands, so the
 * common path never requires reaching for a button — the fastest way to open
 * an app you use daily is not to have to finish opening it.
 *
 * @module features/auth/login-view
 */

import { el, focusFirst } from '../../core/dom.js';
import { Button, Field, Input, PinInput } from '../../components/ui/index.js';
import { Logo } from '../../components/brand/index.js';
import { call } from '../../core/api.js';
import { saveSession } from '../../core/session.js';
import { toAppError } from '../../core/errors.js';
import { navigate } from '../../app/navigation.js';
import { config } from '../../core/config.js';

export default function LoginView() {
  let username = '';
  let pin = '';
  let busy = false;

  const usernameInput = Input({
    name: 'username',
    placeholder: 'david',
    autocomplete: 'username',
    onInput: (value) => {
      username = value;
      usernameField.update({ error: null });
    },
  });

  const usernameField = Field({
    label: 'Username',
    control: usernameInput,
    required: true,
  });

  const pinInput = PinInput({
    ariaLabel: 'Six digit PIN',
    onChange: (value) => {
      pin = value;
      if (value.length < 6) pinField.update({ error: null });
    },
    onComplete: () => {
      // Auto-submit on the sixth digit. If the username is missing we do not
      // fire — that would surface an error the member has not caused yet.
      if (username.trim()) submit();
    },
  });

  const pinField = Field({
    label: 'PIN',
    control: pinInput,
    required: true,
  });

  const submitButton = Button({
    label: 'Log in',
    size: 'lg',
    block: true,
    type: 'submit',
  });

  const formError = el('p', {
    class: 'ft-auth__error',
    attrs: { role: 'alert', hidden: true },
  });

  async function submit() {
    if (busy) return;

    if (!username.trim()) {
      usernameField.update({ error: 'Enter your username.' });
      focusFirst(usernameField);
      return;
    }

    if (pin.length !== 6) {
      pinField.update({ error: 'Your PIN is 6 digits.' });
      return;
    }

    busy = true;
    submitButton.update({ loading: true });
    formError.hidden = true;

    try {
      const data = await call('auth.login', { username, pin });
      saveSession(data);

      // A reset PIN outranks the role hint. The server will refuse every
      // action but the change itself, so sending an admin to the admin shell
      // here would just show them a frame full of failing panels.
      if (data.mustChangePin) {
        navigate('/change-pin', { replace: true });
        return;
      }

      // Role-based routing. The server decides where this member belongs and
      // returns `redirect`; the client does not inspect the role itself.
      //
      // A hint only — it changes which screen opens, never what anyone is
      // allowed to do. Every action is authorised server-side regardless.
      if (data.redirect === 'admin') {
        window.location.href = `${config.app.adminEntry}#/`;
        return;
      }

      navigate('/dashboard', { replace: true });
    } catch (error) {
      const appError = toAppError(error);
      formError.textContent = appError.message;
      formError.hidden = false;
      pinInput.update({ invalid: true });
      pin = '';
    } finally {
      busy = false;
      submitButton.update({ loading: false });
    }
  }

  const form = el(
    'form',
    {
      class: 'ft-auth__form',
      on: {
        submit: (event) => {
          event.preventDefault();
          submit();
        },
      },
    },
    [usernameField, pinField, formError, submitButton],
  );

  return el('div', { class: 'ft-auth ft-animate-in' }, [
    el('div', { class: 'ft-auth__brand' }, Logo({ size: 'lg' })),
    el('h1', { class: 'ft-auth__title', text: 'Welcome back' }),
    el('p', { class: 'ft-auth__subtitle', text: 'Your goal, progress, and next useful move are waiting.' }),
    form,
    el('div', { class: 'ft-auth__foot' }, [
      el('p', { class: 'ft-text-sm ft-text-muted' }, [
        'Forgot your PIN? ',
        el('a', {
          attrs: { href: '#/help/pin' },
          text: 'We can reset it.',
        }),
      ]),
      el('p', { class: 'ft-text-sm ft-text-muted ft-mt-2' }, [
        'Have an invite code? ',
        el('a', { attrs: { href: '#/register' }, text: 'Create your account' }),
      ]),
    ]),
  ]);
}
