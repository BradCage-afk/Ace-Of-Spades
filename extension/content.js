// Reads labels and draws cues. Never calls click(), focus(), submit() or sets a value.
(() => {
  if (window.__saathi) return;
  window.__saathi = true;

  const SELECTOR = 'a[href],button,input,select,textarea,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=radio],[role=textbox],[role=combobox]';
  const SENSITIVE = /\b(otp|one[- ]time|captcha|password|passcode|pin|cvv|aadhaar|aadhar|card number|pay|payment|place order|buy now|final submit|submit)\b|पासवर्ड|ओटीपी|आधार|भुगतान|जमा करें|ಪಾಸ್‌ವರ್ಡ್|ಒಟಿಪಿ|ಆಧಾರ್|ಪಾವತಿ|ಸಲ್ಲಿಸಿ/i;
  const MAX_ITEMS = 80;
  let refs = new Map();
  let active = null;
  let frame = 0;
  let host, root;

  const text = (n) => (n?.textContent || '').replace(/\s+/g, ' ').trim();
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05 && !el.disabled;
  };

  function* deep(node) {
    for (const el of node.querySelectorAll('*')) {
      if (el === host) continue;
      if (el.matches(SELECTOR)) yield el;
      if (el.shadowRoot) yield* deep(el.shadowRoot);
    }
  }

  function role(el) {
    const r = el.getAttribute('role');
    const t = (el.type || '').toLowerCase();
    if (el.tagName === 'SELECT') return 'select';
    if (t === 'checkbox' || r === 'checkbox') return 'checkbox';
    if (t === 'radio' || r === 'radio') return 'radio';
    if (t === 'file') return 'file';
    if (el.tagName === 'TEXTAREA' || r === 'textbox') return 'textbox';
    if (el.tagName === 'INPUT') return ['submit', 'button', 'reset', 'image'].includes(t) ? 'button' : 'textbox';
    if (el.tagName === 'A' || r === 'link') return 'link';
    return 'button';
  }

  function label(el, kind) {
    const aria = el.getAttribute('aria-label');
    if (aria) return aria.trim();
    const by = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean).map((id) => text(document.getElementById(id))).join(' ');
    if (by) return by;
    if (el.labels?.length) {
      // A label can wrap its control, whose text (e.g. a textarea's) must not leak in.
      const copy = el.labels[0].cloneNode(true);
      copy.querySelectorAll('input,select,textarea,[contenteditable]').forEach((n) => n.remove());
      if (text(copy)) return text(copy);
    }
    if (el.tagName === 'INPUT' && kind === 'button') return el.value || el.alt || 'button';
    if (['textbox', 'select', 'file', 'checkbox', 'radio'].includes(kind)) return el.placeholder || el.title || el.name || 'unlabelled field';
    if (el.isContentEditable) return el.title || 'editable area';
    return text(el) || el.title || el.querySelector('img[alt]')?.alt || '';
  }

  function sensitive(el, name) {
    if (el.type === 'password') return true;
    if (/one-time-code|^cc-|current-password|new-password/.test(el.autocomplete || '')) return true;
    if (SENSITIVE.test(name)) return true;
    const t = (el.type || '').toLowerCase();
    return (t === 'submit' || t === 'image') && el.form?.method === 'post';
  }

  function snapshot() {
    refs = new Map();
    const found = [];
    for (const el of deep(document)) {
      if (!visible(el)) continue;
      const kind = role(el);
      const name = label(el, kind).slice(0, 100);
      if (!name) continue;
      found.push({ el, kind, name, near: Math.abs(el.getBoundingClientRect().top) });
    }
    // The items nearest the screen, in page order: a shorter list is faster for the AI to read.
    const kept = found.length > MAX_ITEMS ? new Set([...found].sort((a, b) => a.near - b.near).slice(0, MAX_ITEMS)) : new Set(found);
    const elements = found.filter((f) => kept.has(f)).map((f, i) => {
      const id = `e${i + 1}`;
      refs.set(id, f.el);
      const item = { id, role: f.kind, label: f.name };
      if (sensitive(f.el, f.name)) item.sensitive = true;
      if (f.kind === 'select') item.options = [...f.el.options || []].slice(0, 12).map(text);
      return item;
    });
    const headings = [...document.querySelectorAll('h1,h2,h3')].filter(visible).map(text).filter(Boolean).slice(0, 12);
    return { host: location.host, title: document.title, headings, elements, total: found.length };
  }

  function mount() {
    if (host?.isConnected) return;
    host = document.createElement('div');
    host.id = 'saathi-overlay';
    host.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      .ring{position:fixed;border:4px solid #f2a11b;border-radius:10px;box-shadow:0 0 0 4px #1b1a2e99,0 0 24px #f2a11b;box-sizing:border-box}
      .ring.pause{border-color:#d9363e;box-shadow:0 0 0 4px #fff,0 0 24px #d9363e}
      .dot{position:fixed;width:26px;height:26px;margin:-13px;border-radius:50%;background:#f2a11bcc;border:2px solid #1b1a2e}
      .dot::after{content:"";position:absolute;inset:-2px;border-radius:50%;border:3px solid #f2a11b;animation:rip 1.2s ease-out infinite}
      .tip{position:fixed;max-width:min(320px,calc(100vw - 24px));box-sizing:border-box;background:#1b1a2e;color:#fff;font:600 16px/1.4 system-ui,sans-serif;padding:10px 14px;border-radius:12px;border:2px solid #f2a11b}
      .arrow{position:fixed;left:50%;margin-left:-38px;width:76px;height:76px;border-radius:50%;background:#1b1a2e;color:#f2a11b;border:4px solid #f2a11b;font:700 42px/72px system-ui;text-align:center;box-sizing:border-box}
      .down{bottom:24px;animation:down 1s ease-in-out infinite}.up{top:24px;animation:up 1s ease-in-out infinite}
      .caret{position:fixed;width:4px;height:26px;background:#f2a11b;animation:blink 1s steps(2) infinite}
      [hidden]{display:none}
      @keyframes rip{to{transform:scale(2.6);opacity:0}}@keyframes down{50%{transform:translateY(-16px)}}@keyframes up{50%{transform:translateY(16px)}}@keyframes blink{50%{opacity:0}}
      @media(prefers-reduced-motion:reduce){*,*::after{animation:none!important}}
    </style><div class="ring" hidden></div><div class="dot" hidden></div><div class="caret" hidden></div><div class="arrow" hidden></div><div class="tip" hidden></div>`;
    document.documentElement.append(host);
  }

  function clear() {
    cancelAnimationFrame(frame);
    active = null;
    host?.remove();
  }

  const done = () => {
    if (!active) return;
    const step = active.step;
    clear();
    chrome.runtime.sendMessage({ type: 'saathi:done', key: step.key }).catch(() => {});
  };

  function draw() {
    if (!active) return;
    const { el, step } = active;
    if (!el.isConnected) {
      const key = step.key;
      clear();
      chrome.runtime.sendMessage({ type: 'saathi:lost', key }).catch(() => {});
      return;
    }
    mount();
    const q = (c) => root.querySelector(c);
    const r = el.getBoundingClientRect();
    const mid = r.top + r.height / 2;
    const off = mid < 0 ? 'up' : mid > innerHeight ? 'down' : '';
    if (step.cue === 'scroll' && !off) return done();
    const ring = q('.ring'), dot = q('.dot'), caret = q('.caret'), arrow = q('.arrow'), tip = q('.tip');
    arrow.hidden = !off;
    if (off) { arrow.className = `arrow ${off}`; arrow.textContent = off === 'up' ? '↑' : '↓'; }
    ring.hidden = !!off;
    dot.hidden = !!off || step.cue !== 'tap';
    caret.hidden = !!off || step.cue !== 'type';
    ring.className = `ring ${step.cue === 'pause' ? 'pause' : ''}`;
    Object.assign(ring.style, { left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` });
    Object.assign(dot.style, { left: `${r.left + r.width / 2}px`, top: `${mid}px` });
    Object.assign(caret.style, { left: `${r.left + 10}px`, top: `${mid - 13}px` });
    tip.hidden = false;
    tip.textContent = `${step.cue === 'pause' ? '✋ ' : step.cue === 'select' ? '▾ ' : ''}${step.say}`;
    const h = tip.offsetHeight, w = tip.offsetWidth;
    const top = off === 'down' ? innerHeight - h - 116 : off === 'up' ? 116 : r.bottom + 14 + h < innerHeight ? r.bottom + 14 : Math.max(8, r.top - h - 14);
    const left = off ? (innerWidth - w) / 2 : Math.min(Math.max(12, r.left), innerWidth - w - 12);
    Object.assign(tip.style, { left: `${left}px`, top: `${top}px` });
    frame = requestAnimationFrame(draw);
  }

  function cue(step) {
    const el = refs.get(step.targetId);
    if (!el?.isConnected || !visible(el)) return false;
    clear();
    active = { el, step };
    draw();
    return true;
  }

  // isTrusted: only real user actions count, not events fired by page scripts.
  const hits = (e) => active && e.isTrusted && (e.composedPath().includes(active.el) || [...active.el.labels || []].some((l) => e.composedPath().includes(l)));
  document.addEventListener('click', (e) => {
    if (!hits(e)) return;
    const kind = role(active.el);
    if (active.step.cue === 'tap' || (active.step.cue === 'pause' && ['button', 'link'].includes(kind))) done();
  }, true);
  document.addEventListener('change', (e) => {
    if (!hits(e)) return;
    // Only whether the field is filled is checked; the value goes nowhere.
    const kind = role(active.el);
    if (['textbox', 'select', 'file'].includes(kind) && active.el.value) done();
  }, true);

  chrome.runtime.onMessage.addListener((m, _s, reply) => {
    if (m.type === 'saathi:snapshot') reply(snapshot());
    else if (m.type === 'saathi:cue') reply({ ok: cue(m.step) });
    else if (m.type === 'saathi:clear') { clear(); reply({ ok: true }); }
  });
})();
