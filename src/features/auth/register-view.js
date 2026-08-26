/**
 * Registration for universal Flow.
 *
 * The account begins with a destination, a definition of showing up, and a
 * realistic rhythm. Content creation is one possible goal, not the product.
 */

import { cx, el, focusFirst } from '../../core/dom.js';
import { Button, Field, Input, InputStatus, OptionGroup, PinInput, Switch } from '../../components/ui/index.js';
import { Logo } from '../../components/brand/index.js';
import { WEEKLY_GOALS } from '../../lib/platforms.js';
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

const STEPS = ['You', 'Your direction', 'Your invite'];

export default function RegisterView() {
  const draft = {
    fullName: '',
    username: '',
    pin: '',
    pinConfirm: '',
    platform: 'Flow',
    goalTitle: '',
    showingUp: '',
    constraints: '',
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

  const fullNameInput = Input({
    placeholder: 'David Okafor',
    autocomplete: 'name',
    onInput: (value) => {
      draft.fullName = value;
      fullNameField.update({ error: null });
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
    hint: 'This is how your Tribe will know you.',
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
    hint: 'You will use this to log in.',
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
    onChange: (value) => { draft.pin = value; pinField.update({ error: null }); },
  });
  const pinField = Field({
    label: 'Choose a 6-digit PIN',
    control: pinInput,
    required: true,
    hint: 'Make it memorable. You will use it to log in.',
  });

  const pinConfirmInput = PinInput({
    ariaLabel: 'Confirm your PIN',
    onChange: (value) => { draft.pinConfirm = value; pinConfirmField.update({ error: null }); },
  });
  const pinConfirmField = Field({ label: 'Confirm your PIN', control: pinConfirmInput, required: true });

  const goalTitleInput = Input({
    placeholder: 'Launch my first business',
    maxlength: 120,
    iconPaths: Icons.target,
    onInput: (value) => { draft.goalTitle = value; goalTitleField.update({ error: null }); },
  });
  const goalTitleField = Field({
    label: 'What are you moving toward?',
    control: goalTitleInput,
    required: true,
    hint: 'A meaningful destination, not a task list.',
  });

  const showingUpInput = Input({
    placeholder: 'Spend focused time building, testing or talking to customers',
    maxlength: 160,
    iconPaths: Icons.check,
    onInput: (value) => { draft.showingUp = value; showingUpField.update({ error: null }); },
  });
  const showingUpField = Field({
    label: 'What does showing up look like?',
    control: showingUpInput,
    required: true,
    hint: 'Define the action Flow should count as progress.',
  });

  const constraintsInput = Input({
    placeholder: 'Work, school, power, data, money, family…',
    maxlength: 240,
    onInput: (value) => { draft.constraints = value; },
  });
  const constraintsField = Field({
    label: 'Anything Flow should plan around?',
    control: constraintsInput,
    hint: 'Optional. Your plan should fit your real life.',
  });

  const goalGroup = OptionGroup({
    name: 'weeklyGoal',
    value: draft.weeklyGoal,
    ariaLabel: 'Weekly rhythm',
    onChange: (value) => { draft.weeklyGoal = Number(value); },
    options: WEEKLY_GOALS.map((goal) => ({
      value: goal.value,
      label: `${goal.value} times`,
      meta: goal.value === 3 ? 'Steady' : goal.value === 5 ? 'Focused' : 'Daily',
      iconPaths: Icons.target,
    })),
  });

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
    label: 'Feature me in Tribe shoutouts and recognition',
    checked: false,
    onChange: (checked) => { draft.consentFeature = checked; },
  });

  function renderProgress() {
    progress.replaceChildren(...STEPS.map((label, index) => el('li', {
      class: cx('ft-steps__item', index === step && 'ft-steps__item--current', index < step && 'ft-steps__item--done'),
      attrs: { 'aria-current': index === step ? 'step' : null },
      text: label,
    })));
  }

  function renderStep() {
    formError.hidden = true;
    renderProgress();

    if (step === 0) {
      body.replaceChildren(fullNameField, usernameField, pinField, pinConfirmField);
    } else if (step === 1) {
      body.replaceChildren(
        goalTitleField,
        el('div', { class: 'ft-mt-6' }, showingUpField),
        el('div', { class: 'ft-mt-6' }, constraintsField),
        el('div', { class: 'ft-field ft-mt-6' }, [
          el('span', { class: 'ft-field__label', text: 'How often do you want to show up each week?' }),
          el('p', { class: 'ft-field__hint', text: 'Choose a rhythm you can recover back to, not a perfect-week fantasy.' }),
          goalGroup,
        ]),
      );
    } else {
      body.replaceChildren(
        inviteField,
        el('div', { class: 'ft-consent ft-mt-6' }, [
          consentSwitch,
          el('p', { class: 'ft-field__hint', text: 'We ask before celebrating you publicly. You can change this later.' }),
        ]),
      );
    }

    backButton.hidden = step === 0;
    nextButton.update({ label: step === STEPS.length - 1 ? 'Start my Flow' : 'Continue' });
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
      for (const [field, result] of checks) {
        field.update({ error: result.valid ? null : result.message });
        if (!result.valid) ok = false;
      }
      return ok;
    }

    if (step === 1) {
      const goalOk = draft.goalTitle.trim().length >= 3;
      const showingOk = draft.showingUp.trim().length >= 3;
      goalTitleField.update({ error: goalOk ? null : 'Tell Flow what you are trying to achieve.' });
      showingUpField.update({ error: showingOk ? null : 'Tell Flow what a meaningful action looks like.' });
      return goalOk && showingOk;
    }

    const result = validateInviteCode(draft.inviteCode);
    inviteField.update({ error: result.valid ? null : result.message });
    return result.valid;
  }

  async function advance() {
    if (busy || !validateStep()) return;
    if (step < STEPS.length - 1) { goTo(step + 1); return; }

    busy = true;
    nextButton.update({ loading: true });
    formError.hidden = true;
    try {
      const data = await call('auth.register', draft);
      saveSession(data);
      navigate('/welcome', { replace: true });
    } catch (error) {
      const appError = toAppError(error);
      if (appError.field === 'inviteCode') inviteField.update({ error: appError.message });
      else if (appError.field === 'username') { goTo(0); usernameField.update({ error: appError.message }); }
      else if (appError.field === 'goalTitle' || appError.field === 'showingUp') { goTo(1); formError.textContent = appError.message; formError.hidden = false; }
      else { formError.textContent = appError.message; formError.hidden = false; }
    } finally {
      busy = false;
      nextButton.update({ loading: false });
    }
  }

  renderStep();

  return el('div', { class: 'ft-auth ft-animate-in' }, [
    el('div', { class: 'ft-auth__brand' }, Logo({ size: 'lg' })),
    el('h1', { class: 'ft-auth__title', text: 'Start your Flow' }),
    el('p', { class: 'ft-auth__subtitle', text: 'Set a direction that can survive real life.' }),
    progress, body, formError, footer,
    el('p', { class: 'ft-text-sm ft-text-muted ft-text-center ft-mt-6' }, [
      'Already a member? ', el('a', { attrs: { href: '#/login' }, text: 'Log in' }),
    ]),
  ]);
}
