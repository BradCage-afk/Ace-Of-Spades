import test from 'node:test';
import assert from 'node:assert/strict';
import { redact, buildPayload } from '../extension/lib/redact.js';
import { validatePlan } from '../extension/lib/validator.js';
import { parsePlan } from '../server/prompt.js';

const els = [{ id: 'e1', role: 'link', label: 'Apply' }, { id: 'e2', role: 'textbox', label: 'OTP', sensitive: true }, { id: 'e3', role: 'textbox', label: 'Name' }];
const one = (step) => validatePlan({ steps: [step] }, els);

test('redacts common identifiers, including Indic digits', () => {
  const t = redact('a@b.com ABCDE1234F 1234 5678 9012 otp is 4321 ९८७६५४३२१० 123456');
  for (const bad of ['a@b', 'ABCDE', '5678', '4321', '९८७', '123456']) assert.ok(!t.includes(bad), bad);
});
test('payload carries no unexpected element fields', () => {
  const p = buildPayload({ goal: 'x', lang: 'en', history: [], snapshot: { host: 'h', title: 't', headings: [], elements: [{ id: 'e1', role: 'textbox', label: 'Name', value: 'SECRET' }] } });
  assert.ok(!JSON.stringify(p).includes('SECRET'));
});
test('rejects invented targets, commands and unsafe speech', () => {
  for (const s of [{ targetId: 'e9', cue: 'tap', say: 'x' }, { targetId: 'e1', cue: 'click', say: 'x' }, { targetId: 'e1', cue: 'tap', say: 'go to https://evil.example' }, { targetId: 'e1', cue: 'tap', say: 'call 98765 43210' }]) assert.equal(one(s).steps.length, 0, JSON.stringify(s));
});
test('sensitive targets always become pause', () => assert.equal(one({ targetId: 'e2', cue: 'type', say: 'x' }).steps[0].cue, 'pause'));
test('valid step passes and done needs no steps', () => {
  const r = validatePlan({ done: true, steps: [{ targetId: 'e1', cue: 'tap', say: 'Tap Apply' }] }, els);
  assert.equal(r.steps.length, 1); assert.equal(r.done, false);
});
test('parses fenced replies and rejects junk', () => {
  assert.deepEqual(parsePlan('<think>{}</think>```json\n{"steps":[]}\n```'), { steps: [] });
  assert.throws(() => parsePlan('sorry'));
});
test('action cue follows the target role', () => {
  assert.equal(one({ targetId: 'e3', cue: 'tap', say: 'Tap the name box' }).steps[0].cue, 'type');
  assert.equal(one({ targetId: 'e1', cue: 'type', say: 'Apply here' }).steps[0].cue, 'tap');
  assert.equal(one({ targetId: 'e1', cue: 'scroll', say: 'Scroll to Apply' }).steps[0].cue, 'scroll');
});
import { formPlan, keywordPlan } from '../extension/lib/forms.js';
const formPage = { elements: [
  { id: 'e1', role: 'link', label: 'Home' },
  { id: 'e2', role: 'textbox', label: 'Applicant name', form: 0, filled: true },
  { id: 'e3', role: 'select', label: 'Course level', form: 0, filled: false },
  { id: 'e4', role: 'textbox', label: 'One-time password (OTP)', form: 0, filled: false, sensitive: true },
  { id: 'e5', role: 'button', label: 'Continue', form: 0, submit: true },
] };
test('form helper skips filled fields, pauses on sensitive ones, ends at submit', () => {
  const p = formPlan(formPage, 'en');
  assert.deepEqual(p.steps.map((s) => [s.targetId, s.cue]), [['e3', 'select'], ['e4', 'type'], ['e5', 'tap']]);
  assert.match(p.steps[1].say, /yourself/);
  assert.equal(validatePlan(p, formPage.elements).steps[1].cue, 'pause');
});
test('form helper ignores pages without a real form', () => {
  assert.equal(formPlan({ elements: [{ id: 'e1', role: 'textbox', label: 'Search', form: 0 }, { id: 'e2', role: 'button', label: 'Go', form: 0, submit: true }] }, 'en'), null);
  assert.equal(formPlan({ elements: [{ id: 'e1', role: 'link', label: 'Apply' }] }, 'en'), null);
});
test('form fields never reach the AI payload', () => {
  const p = buildPayload({ goal: 'x', lang: 'en', history: [], snapshot: { host: 'h', title: 't', headings: [], elements: formPage.elements } });
  assert.ok(!/filled|submit|form"/.test(JSON.stringify(p)));
});
test('keyword fallback picks one clear match, including from Hindi', () => {
  const home = { elements: [{ id: 'e1', role: 'link', label: 'Property tax' }, { id: 'e2', role: 'link', label: 'Student scholarships' }, { id: 'e3', role: 'link', label: 'Pay now', sensitive: true }] };
  assert.equal(keywordPlan(home, 'I want to pay property tax', 'en').steps[0].targetId, 'e1');
  assert.equal(keywordPlan(home, 'छात्रवृत्ति के लिए आवेदन', 'hi').steps[0].targetId, 'e2');
  assert.equal(keywordPlan(home, 'hello there', 'en'), null);
});
