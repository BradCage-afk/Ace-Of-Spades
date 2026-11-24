// Best-effort scrubbing. It cannot recognise names or addresses.
const PATTERNS = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]'],
  [/\b[A-Z]{5}\d{4}[A-Z]\b/gi, '[pan]'],
  [/(?:\p{Nd}[\s-]?){9,}\p{Nd}/gu, '[number]'],
  [/(\b(?:otp|pin|cvv|password|passcode)\b\s*(?:is|:|=|-)?\s*)\p{Nd}{3,8}/giu, '$1[secret]'],
  [/(?<!\p{Nd})\p{Nd}{6}(?!\p{Nd})/gu, '[code]'],
];

export function redact(text) {
  return PATTERNS.reduce((t, [re, to]) => t.replace(re, to), String(text ?? ''));
}

// The return value is exactly what is sent, and exactly what the privacy receipt shows.
export function buildPayload({ goal, lang, snapshot, history }) {
  return {
    goal: redact(goal).slice(0, 400),
    lang,
    page: {
      host: snapshot.host,
      title: redact(snapshot.title).slice(0, 120),
      headings: snapshot.headings.map((h) => redact(h).slice(0, 100)),
    },
    elements: snapshot.elements.map((e) => ({
      id: e.id,
      role: e.role,
      label: redact(e.label).slice(0, 80),
      ...(e.options ? { options: e.options.map((o) => redact(o).slice(0, 40)) } : {}),
      ...(e.sensitive ? { sensitive: true } : {}),
    })),
    done: history.slice(-12).map((h) => redact(h).slice(0, 100)),
  };
}
