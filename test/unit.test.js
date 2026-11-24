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
  for (const s of [{ targetId: 'e9', cue: 'tap', say: 'x' }, { targetId: 'e1', cue: 'click', say: 'x' }, { targetId: 'e1', cue: 'tap', say: 'go to https://evil.example' }, { targetId: 'e1', cue: 'tap', say: 'call 98765 43210' }, { targetId: 'e3', cue: 'tap', say: 'x' }]) assert.equal(one(s).steps.length, 0, JSON.stringify(s));
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
