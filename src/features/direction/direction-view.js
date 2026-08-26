/** Edit the destination and definition of showing up. */
import { el } from '../../core/dom.js';
import { Button, Card, Field, Input, OptionGroup } from '../../components/ui/index.js';
import { PageHeader } from '../../components/layout/index.js';
import { WEEKLY_GOALS } from '../../lib/platforms.js';
import { Icons } from '../../lib/icons.js';
import { call } from '../../core/api.js';
import { toAppError } from '../../core/errors.js';
import { getMember, updateSessionMember } from '../../core/session.js';
import { navigate } from '../../app/navigation.js';

export default function DirectionView() {
  const member = getMember() || {};
  const draft = {
    goalTitle: member.goalTitle || '',
    showingUp: member.showingUp || '',
    constraints: member.constraints || '',
    weeklyGoal: Number(member.weeklyGoal) || 3,
  };
  let busy = false;

  const goalInput = Input({ value: draft.goalTitle, maxlength: 120, iconPaths: Icons.target, onInput: (v) => { draft.goalTitle = v; goalField.update({ error: null }); } });
  const goalField = Field({ label: 'Your destination', control: goalInput, required: true, hint: 'What are you trying to achieve or become?' });
  const showingInput = Input({ value: draft.showingUp, maxlength: 160, iconPaths: Icons.check, onInput: (v) => { draft.showingUp = v; showingField.update({ error: null }); } });
  const showingField = Field({ label: 'What showing up means', control: showingInput, required: true, hint: 'The meaningful action Flow should count.' });
  const constraintsInput = Input({ value: draft.constraints, maxlength: 240, onInput: (v) => { draft.constraints = v; } });
  const constraintsField = Field({ label: 'Known constraints', control: constraintsInput, hint: 'Optional. Work, power, money, health, family, school, data…' });
  const rhythm = OptionGroup({
    name: 'weeklyGoal', value: draft.weeklyGoal, ariaLabel: 'Weekly rhythm', onChange: (v) => { draft.weeklyGoal = Number(v); },
    options: WEEKLY_GOALS.map((g) => ({ value: g.value, label: `${g.value} times`, meta: g.value === 3 ? 'Steady' : g.value === 5 ? 'Focused' : 'Daily', iconPaths: Icons.target })),
  });
  const error = el('p', { class: 'ft-auth__error', attrs: { role: 'alert', hidden: true } });
  const save = Button({ label: 'Save direction', size: 'lg', block: true, iconPaths: Icons.check });

  async function submit() {
    if (busy) return;
    const goalOk = draft.goalTitle.trim().length >= 3;
    const showingOk = draft.showingUp.trim().length >= 3;
    goalField.update({ error: goalOk ? null : 'Describe the destination.' });
    showingField.update({ error: showingOk ? null : 'Describe a meaningful action.' });
    if (!goalOk || !showingOk) return;
    busy = true; save.update({ loading: true }); error.hidden = true;
    try {
      const data = await call('member.updateGoal', draft);
      updateSessionMember(data.member);
      navigate('/dashboard');
    } catch (e) {
      error.textContent = toAppError(e).message; error.hidden = false;
    } finally {
      busy = false; save.update({ loading: false });
    }
  }
  save.addEventListener('click', submit);

  return el('div', { class: 'ft-stack ft-gap-6 ft-animate-in' }, [
    PageHeader({ eyebrow: 'Direction', title: 'Make the plan fit your life.', subtitle: 'Change the destination only when you mean to. Change the path whenever reality demands it.' }),
    Card({}, [
      goalField,
      el('div', { class: 'ft-mt-6' }, showingField),
      el('div', { class: 'ft-mt-6' }, constraintsField),
      el('div', { class: 'ft-field ft-mt-6' }, [
        el('span', { class: 'ft-field__label', text: 'Weekly rhythm' }),
        el('p', { class: 'ft-field__hint', text: 'Choose the frequency you want to return to.' }),
        rhythm,
      ]),
      error,
      el('div', { class: 'ft-mt-6' }, save),
    ]),
  ]);
}
