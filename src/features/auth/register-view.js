/**
 * Registration — Stage 1.
 *
 * Eight fields is a lot to face at once, so it is split into three steps with
 * a progress indicator. Each step asks one kind of question: who you are, what
 * you are committing to, and proof you were invited.
 *
 * The emotional job of this screen is "I can do this" — the first step of the
 * journey in docs/product-vision.md. Three short steps read as easy; one long
 * form reads as paperwork.
 *
 * @module features/auth/register-view
 */

import { cx, el, focusFirst } from '../../core/dom.js';
import { Button, Field, Input, InputStatus, OptionGroup, PinInput, Switch } from '../../components/ui/index.js';
import { Logo } from '../../components/brand/index.js';
import { PLATFORM_LIST, WEEKLY_GOALS } from '../../lib/platforms.js';
import { Icons } from '../../lib/icons.js';
import { call } from '../../core/api.js';
import { saveSession } from '../../core/session.js';
import { toAppError } from '../../core/errors.js';
import {
  validateFullName,
  validateInviteCode,
  validatePin,
  validatePinConfirmation,
  validateUsername,
  suggestUsername,
} from '../../lib/validators.js';
import { navigate } from '../../app/navigation.js';

const STEPS = ['You', 'Your commitment', 'Your invite'];

export default function RegisterView() {
  const draft = {
    fullName: '',
    username: '',
    pin: '',
    pinConfirm: '',
    platform: 'LinkedIn',
    weeklyGoal: 3,
    inviteCode: '',
    consentFeature: false,
  };

  let step = 0;
  let busy = false;
  let usernameEdited = false;

  const body = el('div', { class: 'ft-auth__form' });
  const formError = el('p', { class: 'ft-auth__error', attrs: { role: 'alert', hidden: true } });

  const progress = el('ol', { class: 'ft-steps' });

  const backButton = Button({ label: 'Back', variant: 'ghost', onClick: () => goTo(step - 1) });
  const nextButton = Button({ label: 'Continue', size: 'lg', block: true, onClick: () => advance() });

  const footer = el('div', { class: 'ft-auth__actions' }, [backButton, nextButton]);

  /* ---- Step 1: identity ---- */

  const fullNameInput = Input({
    placeholder: 'David Okafor',
    autocomplete: 'name',
    onInput: (value) => {
      draft.fullName = value;
      fullNameField.update({ error: null });
      // Offer a username derived from their name, until they edit it
      // themselves — a small courtesy that removes a decision.
      if (!usernameEdited) {
        draft.username = suggestUsername(value);
        usernameInput.update({ value: draft.username });
      }
    },
  });

  const fullNameField = Field({
    label: 'Your full name',
    control: fullNameInput,
    required: true,
    hint: 'This is the name shown on your dashboard and the leaderboard.',
  });

  const usernameStatus = InputStatus({ state: 'idle' });

  const usernameInput = Input({
    placeholder: 'david.okafor',
    autocomplete: 'username',
    suffix: usernameStatus,
    onInput: (value) => {
      usernameEdited = true;
      draft.username = value;
      usernameField.update({ error: null });
      checkUsername(value);
    },
  });

  const usernameField = Field({
    label: 'Choose a username',
    control: usernameInput,
    required: true,
    hint: 'You will log in with this. Letters, numbers, dots and underscores.',
  });

  let checkTimer = null;
  function checkUsername(value) {
    clearTimeout(checkTimer);

    const result = validateUsername(value);
    if (!result.valid) {
      usernameStatus.update({ state: 'idle' });
      return;
    }

    usernameStatus.update({ state: 'checking' });
    checkTimer = setTimeout(async () => {
      try {
        const data = await call('auth.checkUsername', { username: value });
        usernameStatus.update({ state: data.available ? 'available' : 'taken' });
      } catch {
        usernameStatus.update({ state: 'idle' });
      }
    }, 450);
  }

  const pinInput = PinInput({
    ariaLabel: 'Choose a six digit PIN',
    onChange: (value) => {
      draft.pin = value;
      pinField.update({ error: null });
    },
  });

  const pinField = Field({
    label: 'Choose a 6-digit PIN',
    control: pinInput,
    required: true,
    hint: 'You will use this every time you log in. Make it memorable.',
  });

  const pinConfirmInput = PinInput({
    ariaLabel: 'Confirm your PIN',
    onChange: (value) => {
      draft.pinConfirm = value;
      pinConfirmField.update({ error: null });
    },
  });

  const pinConfirmField = Field({
    label: 'Confirm your PIN',
    control: pinConfirmInput,
    required: true,
  });

  /* ---- Step 2: commitment ---- */

  const platformGroup = OptionGroup({
    name: 'platform',
    value: draft.platform,
    ariaLabel: 'Preferred platform',
    onChange: (value) => {
      draft.platform = value;
    },
    options: PLATFORM_LIST.map((platform) => ({
      value: platform.id,
      label: platform.label,
      iconPaths: platform.iconPaths,
      color: platform.color,
    })),
  });

  const goalGroup = OptionGroup({
    name: 'weeklyGoal',
    value: draft.weeklyGoal,
    ariaLabel: 'Weekly goal',
    onChange: (value) => {
      draft.weeklyGoal = Number(value);
    },
    options: WEEKLY_GOALS.map((goal) => ({
      value: goal.value,
      label: goal.label,
      meta: goal.meta,
      iconPaths: Icons.target,
    })),
  });

  /* ---- Step 3: invite ---- */

  const inviteInput = Input({
    placeholder: 'CREATE99',
    iconPaths: Icons.ticket,
    maxlength: 12,
    onInput: (value) => {
      draft.inviteCode = value.toUpperCase();
      inviteInput.update({ value: draft.inviteCode });
      inviteField.update({ error: null });
    },
  });

  const inviteField = Field({
    label: 'Your invite code',
    control: inviteInput,
    required: true,
    hint: 'Flow Tribe is invite-only. Your code works once.',
  });

  const consentSwitch = Switch({
    label: 'Feature me in shoutouts and on the leaderboard',
    checked: false,
    onChange: (checked) => {
      draft.consentFeature = checked;
    },
  });

  /* ---- Step machinery ---- */

  function renderProgress() {
    progress.replaceChildren(
      ...STEPS.map((label, index) =>
        el('li', {
          class: cx(
            'ft-steps__item',
            index === step && 'ft-steps__item--current',
            index < step && 'ft-steps__item--done',
          ),
          attrs: { 'aria-current': index === step ? 'step' : null },
          text: label,
        }),
      ),
    );
  }

  function renderStep() {
    formError.hidden = true;
    renderProgress();

    if (step === 0) {
      body.replaceChildren(fullNameField, usernameField, pinField, pinConfirmField);
    } else if (step === 1) {
      body.replaceChildren(
        el('div', { class: 'ft-field' }, [
          el('span', { class: 'ft-field__label', text: 'Where will you post?' }),
          el('p', { class: 'ft-field__hint', text: 'Pick one platform and stay with it. Focus beats spread.' }),
          platformGroup,
        ]),
        el('div', { class: 'ft-field ft-mt-6' }, [
          el('span', { class: 'ft-field__label', text: 'How often, each week?' }),
          el('p', { class: 'ft-field__hint', text: 'Choose what you can keep. You can change it later.' }),
          goalGroup,
        ]),
      );
    } else {
      body.replaceChildren(
        inviteField,
        el('div', { class: 'ft-consent ft-mt-6' }, [
          consentSwitch,
          el('p', {
            class: 'ft-field__hint',
            text: 'We celebrate members publicly. This is us asking first — you can change it any time.',
          }),
        ]),
      );
    }

    backButton.hidden = step === 0;
    nextButton.update({ label: step === STEPS.length - 1 ? 'Create my account' : 'Continue' });

    focusFirst(body);
  }

  function goTo(next) {
    step = Math.max(0, Math.min(next, STEPS.length - 1));
    renderStep();
  }

  function validateStep() {
    if (step === 0) {
      const checks = [
        [fullNameField, validateFullName(draft.fullName)],
        [usernameField, validateUsername(draft.username)],
        [pinField, validatePin(draft.pin)],
        [pinConfirmField, validatePinConfirmation(draft.pin, draft.pinConfirm)],
      ];

      let ok = true;
      // Every failing field is marked at once. Revealing errors one at a time
      // turns one correction pass into four.
      for (const [field, result] of checks) {
        field.update({ error: result.valid ? null : result.message });
        if (!result.valid) ok = false;
      }
      return ok;
    }

    if (step === 2) {
      const result = validateInviteCode(draft.inviteCode);
      inviteField.update({ error: result.valid ? null : result.message });
      return result.valid;
    }

    return true;
  }

  async function advance() {
    if (busy) return;
    if (!validateStep()) return;

    if (step < STEPS.length - 1) {
      goTo(step + 1);
      return;
    }

    busy = true;
    nextButton.update({ loading: true });
    formError.hidden = true;

    try {
      const data = await call('auth.register', draft);
      saveSession(data);
      navigate('/welcome', { replace: true });
    } catch (error) {
      const appError = toAppError(error);

      if (appError.field === 'inviteCode') {
        inviteField.update({ error: appError.message });
      } else if (appError.field === 'username') {
        goTo(0);
        usernameField.update({ error: appError.message });
      } else {
        formError.textContent = appError.message;
        formError.hidden = false;
      }
    } finally {
      busy = false;
      nextButton.update({ loading: false });
    }
  }

  renderStep();

  return el('div', { class: 'ft-auth ft-animate-in' }, [
    el('div', { class: 'ft-auth__brand' }, Logo({ size: 'lg' })),
    el('h1', { class: 'ft-auth__title', text: 'Join the tribe' }),
    el('p', { class: 'ft-auth__subtitle', text: 'Three short steps and you are in.' }),
    progress,
    body,
    formError,
    footer,
    el('p', { class: 'ft-text-sm ft-text-muted ft-text-center ft-mt-6' }, [
      'Already a member? ',
      el('a', { attrs: { href: '#/login' }, text: 'Log in' }),
    ]),
  ]);
}
