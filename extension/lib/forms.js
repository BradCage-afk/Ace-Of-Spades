// Plans a form on the device, without the AI: unfilled fields top to bottom, then the submit button.
// Forms are predictable, so this is instant and keeps the AI for finding the way between pages.
const T = {
  en: { textbox: (l) => `Type your ${l} here.`, file: (l) => `Choose the file for ${l}.`, select: (l) => `Choose ${l} from this list.`, checkbox: (l) => `Read this. If it is true, tick "${l}".`, radio: (l) => `Choose "${l}" if it applies to you.`, submit: (l) => `When everything is filled, tap ${l}.`, pause: (l) => `${l}: please do this step yourself, privately.` },
  hi: { textbox: (l) => `यहाँ ${l} लिखें।`, file: (l) => `${l} के लिए फ़ाइल चुनें।`, select: (l) => `इस सूची से ${l} चुनें।`, checkbox: (l) => `इसे पढ़ें। सही हो तो "${l}" पर टिक करें।`, radio: (l) => `अगर लागू हो तो "${l}" चुनें।`, submit: (l) => `सब भरने के बाद ${l} पर टैप करें।`, pause: (l) => `${l}: यह कदम खुद, अकेले में करें।` },
  kn: { textbox: (l) => `ಇಲ್ಲಿ ${l} ಬರೆಯಿರಿ.`, file: (l) => `${l} ಗಾಗಿ ಫೈಲ್ ಆಯ್ಕೆ ಮಾಡಿ.`, select: (l) => `ಈ ಪಟ್ಟಿಯಿಂದ ${l} ಆಯ್ಕೆ ಮಾಡಿ.`, checkbox: (l) => `ಇದನ್ನು ಓದಿ. ಸರಿಯಾಗಿದ್ದರೆ "${l}" ಟಿಕ್ ಮಾಡಿ.`, radio: (l) => `ಅನ್ವಯಿಸಿದರೆ "${l}" ಆಯ್ಕೆ ಮಾಡಿ.`, submit: (l) => `ಎಲ್ಲವನ್ನೂ ತುಂಬಿದ ನಂತರ ${l} ಒತ್ತಿ.`, pause: (l) => `${l}: ಈ ಹಂತವನ್ನು ನೀವೇ, ಖಾಸಗಿಯಾಗಿ ಮಾಡಿ.` },
};
const FIELD = ['textbox', 'select', 'file', 'checkbox', 'radio'];
const SEARCH = /search|खोज|ಹುಡುಕ/i;

export function formPlan(snapshot, lang) {
  const t = T[lang] || T.en;
  const forms = new Map();
  for (const e of snapshot.elements) {
    if (e.form === undefined) continue;
    if (!forms.has(e.form)) forms.set(e.form, []);
    forms.get(e.form).push(e);
  }
  // The biggest form on the page, if it is a real form rather than a search box.
  const items = [...forms.values()].sort((a, b) => b.filter((e) => FIELD.includes(e.role)).length - a.filter((e) => FIELD.includes(e.role)).length)[0] || [];
  const fields = items.filter((e) => FIELD.includes(e.role) && !SEARCH.test(e.label));
  if (fields.length < 2) return null;
  const steps = fields.filter((e) => !e.filled).map((e) => ({ targetId: e.id, cue: e.role === 'select' ? 'select' : e.role === 'checkbox' || e.role === 'radio' ? 'tap' : 'type', say: (e.sensitive ? t.pause : t[e.role])(e.label) }));
  const submit = items.find((e) => e.submit);
  if (submit) steps.push({ targetId: submit.id, cue: 'tap', say: (submit.sensitive ? t.pause : t.submit)(submit.label) });
  return { reply: '', prepare: [], steps, done: false };
}

// When the AI is unavailable: point at the one link whose words best match the goal. A rough fallback, labelled as such.
const WORDS = {
  scholarship: /छात्रवृत्ति|स्कॉलरशिप|ವಿದ್ಯಾರ್ಥಿ ?ವೇತನ|ಸ್ಕಾಲರ್/, tax: /कर|टैक्स|ತೆರಿಗೆ|ಟ್ಯಾಕ್ಸ್/, property: /संपत्ति|प्रॉपर्टी|ಆಸ್ತಿ/, grievance: /शिकायत|ದೂರು/,
  birth: /जन्म|ಜನನ/, certificate: /प्रमाण|ಪ್ರಮಾಣ/, status: /स्थिति|स्टेटस|ಸ್ಥಿತಿ/, track: /ट्रैक|ಟ್ರ್ಯಾಕ್/,
};
const stem = (w) => w.toLowerCase().replace(/(ies|es|s)$/, '');
export function keywordPlan(snapshot, goal, lang) {
  const words = new Set((goal.toLowerCase().match(/[a-z]{4,}/g) || []).map(stem));
  for (const [w, re] of Object.entries(WORDS)) if (re.test(goal)) words.add(w);
  if (!words.size) return null;
  const scored = snapshot.elements
    .filter((e) => (e.role === 'link' || e.role === 'button') && !e.sensitive)
    .map((e) => ({ e, n: (e.label.toLowerCase().match(/[a-z]{4,}/g) || []).map(stem).filter((w) => words.has(w)).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  if (!scored.length || scored[1]?.n === scored[0].n) return null;
  const say = { en: `Tap ${scored[0].e.label}.`, hi: `${scored[0].e.label} पर टैप करें।`, kn: `${scored[0].e.label} ಒತ್ತಿ.` };
  return { reply: '', prepare: [], steps: [{ targetId: scored[0].e.id, cue: 'tap', say: say[lang] || say.en }], done: false };
}
