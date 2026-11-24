// The model's only vocabulary. There is no click, type-into, navigate or submit command.
export const CUES = ['tap', 'type', 'select', 'scroll', 'pause'];
const ROLES = {
  tap: ['link', 'button', 'checkbox', 'radio'],
  type: ['textbox', 'file'],
  select: ['select'],
};
const UNSAFE_SAY = /https?:|www\.|(?:\p{Nd}[\s-]?){9,}\p{Nd}|[<>]/iu;

const clean = (s, n) => (typeof s === 'string' && s.trim() && !UNSAFE_SAY.test(s) ? s.trim().slice(0, n) : '');

export function validatePlan(raw, elements) {
  const out = { steps: [], rejected: [], reply: '', prepare: [], done: false };
  if (!raw || typeof raw !== 'object') return { ...out, rejected: ['not an object'] };
  out.reply = clean(raw.reply, 300);
  out.prepare = (Array.isArray(raw.prepare) ? raw.prepare : []).map((p) => clean(p, 100)).filter(Boolean).slice(0, 5);
  const byId = new Map(elements.map((e) => [e.id, e]));
  for (const s of (Array.isArray(raw.steps) ? raw.steps : []).slice(0, 8)) {
    const el = byId.get(s?.targetId);
    const say = clean(s?.say, 240);
    if (!el) out.rejected.push('unknown target');
    else if (!CUES.includes(s.cue)) out.rejected.push('unknown cue');
    else if (!say) out.rejected.push('unsafe or empty text');
    else if (ROLES[s.cue] && !el.sensitive && !ROLES[s.cue].includes(el.role)) out.rejected.push('cue does not fit target');
    else out.steps.push({ targetId: el.id, cue: el.sensitive ? 'pause' : s.cue, say, label: el.label });
  }
  out.done = raw.done === true && out.steps.length === 0;
  return out;
}
