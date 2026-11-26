// The guide runs here, not in the side panel, so it keeps going when the panel is closed.
// The panel only sends commands and shows the state stored in chrome.storage.session.
import { buildPayload } from './lib/redact.js';
import { validatePlan } from './lib/validator.js';
import { recordedPlan } from './lib/routes.js';
import { UI, LANGS } from './lib/ui.js';

const PROXY = 'http://localhost:8787/plan';
const MAX_PLANS = 25;
const SAVED_PLANS = 50, SAVED_FOR_MS = 24 * 3600_000;
const LOG_MAX = 80;

// action.onClicked (rather than openPanelOnActionClick) is what grants activeTab.
chrome.action.onClicked.addListener((tab) => chrome.sidePanel.open({ tabId: tab.id }));

const FRESH = { running: false, goal: '', lang: 'en', recorded: false, tabId: null, steps: [], i: 0, history: [], plans: 0, token: 0, mode: 'Ready', thinkingSince: 0, receipt: '', receiptState: 'Nothing sent yet.', note: '', error: false, log: [] };
let S = { ...FRESH };
// A service worker can be stopped when idle, so state is reloaded on wake and saved after each change.
const ready = chrome.storage.session.get('guide').then(({ guide }) => { if (guide) S = { ...FRESH, ...guide }; });
const persist = () => chrome.storage.session.set({ guide: S });
const memo = new Map();

function say(text, cls = '', small = '') {
  S.log = [...S.log, { text, cls, small }].slice(-LOG_MAX);
  persist();
}
const ui = () => UI[S.lang] || UI.en;
const setMode = (mode) => { S.mode = mode; persist(); };

function speak(text) {
  chrome.tts.stop();
  const locale = (LANGS.find((l) => l[0] === S.lang) || LANGS[0])[2];
  // remote voices send the text to a cloud service, so only on-device voices are used.
  chrome.tts.getVoices((voices) => {
    const voice = voices.find((v) => !v.remote && (v.lang || '').replace('_', '-').startsWith(S.lang));
    if (!voice) { S.note = 'No on-device voice for this language, so steps are shown as captions.'; persist(); return; }
    chrome.tts.speak(text, { voiceName: voice.voiceName, lang: locale });
  });
}

const send = (m) => chrome.tabs.sendMessage(S.tabId, m, { frameId: 0 });

async function hashOf(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
// Plans are remembered on this computer, keyed by a hash of the exact (already masked) request.
async function savedPlan(key) {
  const { plans = {} } = await chrome.storage.local.get('plans');
  const hit = plans[key];
  return hit && Date.now() - hit.t < SAVED_FOR_MS ? hit.plan : null;
}
async function savePlan(key, plan) {
  const { plans = {} } = await chrome.storage.local.get('plans');
  plans[key] = { plan, t: Date.now() };
  const keep = Object.entries(plans).filter(([, v]) => Date.now() - v.t < SAVED_FOR_MS).sort((a, b) => b[1].t - a[1].t).slice(0, SAVED_PLANS);
  await chrome.storage.local.set({ plans: Object.fromEntries(keep) });
}

async function getPlan(snapshot) {
  const ctx = { goal: S.goal, lang: S.lang, snapshot, history: S.history };
  if (S.recorded) {
    Object.assign(S, { mode: 'Recorded route (no AI)', receiptState: 'Recorded route: nothing was sent to any AI.', receipt: '' });
    persist();
    return recordedPlan(ctx) || { reply: 'Recorded routes work only on the mock portal. Turn it off to use live AI.', steps: [] };
  }
  const payload = buildPayload(ctx);
  const body = JSON.stringify(payload);
  S.receipt = JSON.stringify(payload, null, 2);
  const key = await hashOf(body);
  const remembered = memo.get(key) || await savedPlan(key);
  if (remembered) {
    Object.assign(S, { mode: 'Live AI (remembered, instant)', receiptState: 'Reused a plan from an identical earlier request: nothing new was sent. That request:' });
    persist();
    return remembered;
  }
  if (++S.plans > MAX_PLANS) throw new Error('Too many AI calls for one task. Press Stop and start again.');
  Object.assign(S, { receiptState: `${new Blob([body]).size} bytes sent to NVIDIA NIM through the local proxy:`, thinkingSince: Date.now(), mode: 'Live AI: thinking' });
  persist();
  let res, data;
  try {
    try { res = await fetch(PROXY, { method: 'POST', headers: { 'content-type': 'application/json' }, body }); }
    catch { throw new Error('The local proxy is not running. Start it, or tick "Recorded demo route" on the mock portal.'); }
    data = await res.json().catch(() => ({}));
  } finally { S.thinkingSince = 0; }
  if (!res.ok) throw new Error(data.error || 'The AI service failed.');
  S.mode = `Live AI${data.backup ? ', backup model' : ''} (${data.seconds ?? '?'}s)`;
  if (data.backup) say('The main AI was busy, so a backup model answered. It may be weaker in Indian languages.', 'warn');
  memo.set(key, data.plan);
  savePlan(key, data.plan);
  persist();
  return data.plan;
}

async function plan() {
  const token = ++S.token;
  S.error = false;
  persist();
  try {
    const tab = await chrome.tabs.get(S.tabId);
    if (!tab.url || !/^https?:/.test(tab.url)) return say('I cannot guide on this kind of page. Open a website first.', 'warn');
    const origins = [`${new URL(tab.url).protocol}//${new URL(tab.url).host}/*`];
    if (!await chrome.permissions.contains({ origins })) {
      S.error = true;
      return say(`I need your permission for ${new URL(tab.url).hostname}. Open the Saathi panel and press "Try again".`, 'warn');
    }
    await chrome.scripting.executeScript({ target: { tabId: S.tabId }, files: ['content.js'] });
    const snapshot = await send({ type: 'saathi:snapshot' });
    const raw = await getPlan(snapshot);
    if (token !== S.token || !S.running) return;
    const p = validatePlan(raw, snapshot.elements);
    if (p.rejected.length) say(`Blocked ${p.rejected.length} unsafe or unknown suggestion(s): ${[...new Set(p.rejected)].join(', ')}.`, 'warn');
    if (p.prepare.length) say(`${ui()[7]}: ${p.prepare.join(', ')}`);
    if (p.reply) { say(p.reply); speak(p.reply); }
    Object.assign(S, { steps: p.steps, i: 0 });
    persist();
    if (p.done) return stop();
    if (!p.steps.length) { if (!p.reply) say('I am not sure what to point at here. Try describing the goal differently.', 'warn'); return; }
    await show();
  } catch (e) {
    if (token !== S.token) return;
    Object.assign(S, { mode: 'Not guiding', error: true });
    say(e.message, 'warn');
  }
}

async function show() {
  const step = S.steps[S.i];
  if (!step) return plan();
  step.key = `${S.token}:${S.i}`;
  persist();
  const ok = await send({ type: 'saathi:cue', step }).catch(() => null);
  // Gone from the page: look again rather than point at the wrong thing.
  if (!ok?.ok) return plan();
  say(step.say, 'step', `Page label: ${step.label}`);
  speak(step.say);
}

function advance() {
  const step = S.steps[S.i];
  if (!step || !S.running) return;
  S.history.push(`${step.cue}: ${step.label}`);
  S.i++;
  persist();
  const token = S.token;
  // Give a click time to start a navigation, which re-plans by itself.
  setTimeout(() => { if (token === S.token && S.running) show(); }, 500);
}

function stop() {
  Object.assign(S, { running: false, error: false, steps: [] });
  S.token++;
  chrome.tts.stop();
  if (S.tabId) send({ type: 'saathi:clear' }).catch(() => {});
  persist();
}

function start({ goal, tabId, lang, recorded }) {
  if (S.tabId && S.tabId !== tabId) send({ type: 'saathi:clear' }).catch(() => {});
  Object.assign(S, { goal, tabId, lang, recorded, steps: [], i: 0, history: [], plans: 0, running: true, error: false, note: '' });
  say(goal, 'me');
  plan();
}

const COMMANDS = {
  start,
  // Same goal, from scratch, on whatever page the tab is now showing.
  restart: () => { if (!S.goal) return; send({ type: 'saathi:clear' }).catch(() => {}); Object.assign(S, { steps: [], i: 0, history: [], plans: 0, running: true }); say('Starting again from this page.'); plan(); },
  retry: () => { if (S.running) plan(); },
  repeat: () => { if (S.steps[S.i]) speak(S.steps[S.i].say); },
  stuck: () => { if (!S.running) return; S.history.push('user is stuck, explain differently'); memo.clear(); plan(); },
  next: () => { send({ type: 'saathi:clear' }).catch(() => {}); advance(); },
  stop: () => { stop(); say('Stopped.'); },
  settings: ({ lang, recorded }) => { const changed = lang !== S.lang; Object.assign(S, { lang, recorded }); persist(); if (changed && S.running) plan(); },
  clear: () => { stop(); S.log = []; persist(); },
};

chrome.runtime.onMessage.addListener((m, sender) => {
  ready.then(() => {
    if (m.type === 'saathi:command') return COMMANDS[m.name]?.(m.args || {});
    if (sender.tab?.id !== S.tabId || !S.running) return;
    if (m.key !== S.steps[S.i]?.key) return;
    if (m.type === 'saathi:done') advance();
    if (m.type === 'saathi:lost') { const t = S.token; setTimeout(() => { if (t === S.token && S.running) plan(); }, 900); }
  });
});
chrome.tabs.onUpdated.addListener((id, info) => {
  ready.then(() => {
    if (id !== S.tabId || !S.running) return;
    if (info.status === 'loading') { S.token++; S.steps = []; persist(); }
    if (info.status === 'complete') plan();
  });
});
chrome.tabs.onRemoved.addListener((id) => ready.then(() => { if (id === S.tabId && S.running) { stop(); say('The tab was closed, so I stopped.'); } }));
