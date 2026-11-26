import { buildPayload } from './lib/redact.js';
import { validatePlan } from './lib/validator.js';
import { recordedPlan } from './lib/routes.js';

const PROXY = 'http://localhost:8787/plan';
const MAX_PLANS = 25;
// Only the first three have recorded text; the rest rely on the live model and are untested.
const LANGS = [['en', 'English', 'en-IN'], ['hi', 'हिन्दी', 'hi-IN'], ['kn', 'ಕನ್ನಡ', 'kn-IN'], ['ta', 'தமிழ் (untested)', 'ta-IN'], ['te', 'తెలుగు (untested)', 'te-IN'], ['ml', 'മലയാളം (untested)', 'ml-IN'], ['mr', 'मराठी (untested)', 'mr-IN'], ['bn', 'বাংলা (untested)', 'bn-IN'], ['gu', 'ગુજરાતી (untested)', 'gu-IN'], ['pa', 'ਪੰਜਾਬੀ (untested)', 'pa-IN']];
const UI = {
  en: ['Hold to talk', 'Guide me', 'Repeat', "I'm stuck", 'Done, next', 'Stop', 'What do you want to do here?', 'Keep ready'],
  hi: ['दबाकर बोलें', 'रास्ता दिखाएँ', 'दोहराएँ', 'मैं अटक गया/गई', 'हो गया, आगे', 'रोकें', 'आप यहाँ क्या करना चाहते हैं?', 'तैयार रखें'],
  kn: ['ಒತ್ತಿ ಹಿಡಿದು ಮಾತನಾಡಿ', 'ದಾರಿ ತೋರಿಸಿ', 'ಮತ್ತೆ ಹೇಳಿ', 'ನನಗೆ ಸಿಗುತ್ತಿಲ್ಲ', 'ಆಯಿತು, ಮುಂದೆ', 'ನಿಲ್ಲಿಸಿ', 'ನೀವು ಇಲ್ಲಿ ಏನು ಮಾಡಬೇಕು?', 'ಸಿದ್ಧವಾಗಿಡಿ'],
};
const $ = (id) => document.getElementById(id);
const testTab = Number(new URLSearchParams(location.search).get('tab')) || null;
const S = { goal: '', tabId: null, steps: [], i: 0, history: [], token: 0, plans: 0, running: false };
const cache = new Map();
const SAVED_PLANS = 50, SAVED_FOR_MS = 24 * 3600_000;
let ticker = 0;

// Plans are remembered on this computer, keyed by a hash of the exact (already masked) request.
async function hashOf(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
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
function thinking(on) {
  clearInterval(ticker);
  if (!on) return;
  const start = Date.now();
  const tick = () => { $('mode').textContent = `Live AI: thinking ${Math.round((Date.now() - start) / 1000)}s`; };
  tick();
  ticker = setInterval(tick, 1000);
}

const ui = () => UI[$('lang').value] || UI.en;
const locale = () => LANGS.find((l) => l[0] === $('lang').value)[2];

function say(text, cls = '', small = '') {
  const p = document.createElement('p');
  p.className = `msg ${cls}`;
  p.textContent = text;
  if (small) { const s = document.createElement('small'); s.textContent = small; p.append(s); }
  $('chat').append(p);
  $('chat').scrollTop = $('chat').scrollHeight;
}

function speak(text) {
  speechSynthesis.cancel();
  // localService only: other voices send the text to a cloud service.
  const voice = speechSynthesis.getVoices().find((v) => v.localService && v.lang.replace('_', '-').startsWith($('lang').value));
  if (!voice) { $('note').textContent = 'No on-device voice for this language, so steps are shown as captions.'; return; }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = locale();
  u.voice = voice;
  speechSynthesis.speak(u);
}

async function currentTab() {
  if (testTab) return chrome.tabs.get(testTab);
  return (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
}
const send = (m) => chrome.tabs.sendMessage(S.tabId, m, { frameId: 0 });

async function ensureAccess(tab, mayAsk) {
  if (!tab.url) return 'Click the Saathi toolbar icon on this page once, so I can read its labels.';
  if (!/^https?:/.test(tab.url)) return 'I cannot guide on this kind of page. Open a website first.';
  const origins = [`${new URL(tab.url).protocol}//${new URL(tab.url).host}/*`];
  if (await chrome.permissions.contains({ origins })) return '';
  if (mayAsk && await chrome.permissions.request({ origins }).catch(() => false)) return '';
  return `I need your permission for ${new URL(tab.url).hostname}. Press "Guide me" again to allow it.`;
}

async function getPlan(snapshot) {
  const ctx = { goal: S.goal, lang: $('lang').value, snapshot, history: S.history };
  if ($('recorded').checked) {
    $('mode').textContent = 'Recorded route (no AI)';
    $('receiptState').textContent = 'Recorded route: nothing was sent to any AI.';
    $('receipt').textContent = '';
    return recordedPlan(ctx) || { reply: 'Recorded routes work only on the mock portal. Turn it off to use live AI.', steps: [] };
  }
  const payload = buildPayload(ctx);
  const body = JSON.stringify(payload);
  $('receipt').textContent = JSON.stringify(payload, null, 2);
  const key = await hashOf(body);
  const remembered = cache.get(key) || await savedPlan(key);
  if (remembered) {
    $('mode').textContent = 'Live AI (remembered, instant)';
    $('receiptState').textContent = 'Reused a plan from an identical earlier request: nothing new was sent. That request:';
    return remembered;
  }
  if (++S.plans > MAX_PLANS) throw new Error('Too many AI calls for one task. Press Stop and start again.');
  $('receiptState').textContent = `${new Blob([body]).size} bytes sent to NVIDIA NIM through the local proxy:`;
  thinking(true);
  let res, data;
  try {
    try { res = await fetch(PROXY, { method: 'POST', headers: { 'content-type': 'application/json' }, body }); }
    catch { throw new Error('The local proxy is not running. Start it, or tick "Recorded demo route" on the mock portal.'); }
    data = await res.json().catch(() => ({}));
  } finally { thinking(false); }
  if (!res.ok) throw new Error(data.error || 'The AI service failed.');
  $('mode').textContent = `Live AI (${data.seconds ?? '?'}s)`;
  cache.set(key, data.plan);
  savePlan(key, data.plan);
  return data.plan;
}

async function plan(mayAsk = false) {
  const token = ++S.token;
  $('retry').hidden = true;
  try {
    const tab = await chrome.tabs.get(S.tabId);
    const problem = await ensureAccess(tab, mayAsk);
    if (problem) return say(problem, 'warn');
    await chrome.scripting.executeScript({ target: { tabId: S.tabId }, files: ['content.js'] });
    const snapshot = await send({ type: 'saathi:snapshot' });
    const raw = await getPlan(snapshot);
    if (token !== S.token || !S.running) return;
    const p = validatePlan(raw, snapshot.elements);
    if (p.rejected.length) say(`Blocked ${p.rejected.length} unsafe or unknown suggestion(s): ${[...new Set(p.rejected)].join(', ')}.`, 'warn');
    if (p.prepare.length) say(`${ui()[7]}: ${p.prepare.join(', ')}`);
    if (p.reply) { say(p.reply); speak(p.reply); }
    S.steps = p.steps; S.i = 0;
    if (p.done) return stop();
    if (!p.steps.length) { if (!p.reply) say('I am not sure what to point at here. Try describing the goal differently.', 'warn'); return; }
    await show();
  } catch (e) {
    if (token !== S.token) return;
    $('mode').textContent = 'Not guiding';
    say(e.message, 'warn');
    $('retry').hidden = false;
  }
}

async function show() {
  const step = S.steps[S.i];
  if (!step) return plan();
  step.key = `${S.token}:${S.i}`;
  const ok = await send({ type: 'saathi:cue', step }).catch(() => null);
  // Gone from the page: look again rather than point at the wrong thing.
  if (!ok?.ok) return plan();
  say(step.say, 'step', `Page label: ${step.label}`);
  speak(step.say);
}

async function advance() {
  const step = S.steps[S.i];
  if (!step || !S.running) return;
  S.history.push(`${step.cue}: ${step.label}`);
  save();
  S.i++;
  const token = S.token;
  // Give a click time to start a navigation, which re-plans by itself.
  setTimeout(() => { if (token === S.token && S.running) show(); }, 500);
}

function stop() {
  S.running = false; S.token++;
  $('controls').hidden = true;
  speechSynthesis.cancel();
  if (S.tabId) send({ type: 'saathi:clear' }).catch(() => {});
  chrome.storage.session.remove('task');
}
const save = () => chrome.storage.session.set({ task: { goal: S.goal, tabId: S.tabId, history: S.history } });

chrome.runtime.onMessage.addListener((m, sender) => {
  if (sender.tab?.id !== S.tabId || !S.running) return;
  if (m.key !== S.steps[S.i]?.key) return;
  if (m.type === 'saathi:done') advance();
  if (m.type === 'saathi:lost') { const t = S.token; setTimeout(() => { if (t === S.token && S.running) plan(); }, 900); }
});
chrome.tabs.onUpdated.addListener((id, info) => {
  if (id !== S.tabId || !S.running) return;
  if (info.status === 'loading') { S.token++; S.steps = []; }
  if (info.status === 'complete') plan();
});

$('ask').onsubmit = async (e) => {
  e.preventDefault();
  const goal = $('goal').value.trim();
  if (!goal) return;
  const tab = await currentTab();
  Object.assign(S, { goal, tabId: tab.id, steps: [], i: 0, history: [], plans: 0, running: true });
  say(goal, 'me');
  $('controls').hidden = false;
  save();
  plan(true);
};
$('retry').onclick = () => S.running && plan();
$('repeat').onclick = () => S.steps[S.i] && speak(S.steps[S.i].say);
$('stuck').onclick = () => { S.history.push('user is stuck, explain differently'); cache.clear(); plan(); };
$('next').onclick = () => { send({ type: 'saathi:clear' }).catch(() => {}); advance(); };
$('stop').onclick = () => { stop(); say('Stopped.'); };

// Push to talk, transcribed on this computer. The text goes in the box so the user can check it before sending.
const WHISPER = { en: 'english', hi: 'hindi', kn: 'kannada', ta: 'tamil', te: 'telugu', ml: 'malayalam', mr: 'marathi', bn: 'bengali', gu: 'gujarati', pa: 'punjabi' };
let worker = null, rec = null, held = false;
function voice() {
  if (!worker) {
    worker = new Worker('voice-worker.js', { type: 'module' });
    worker.onerror = () => { $('note').textContent = 'On-device voice could not start. Please type.'; worker = null; };
    worker.onmessage = ({ data }) => {
      if (data.ready) return;
      if (data.progress !== undefined) $('note').textContent = `First use: downloading the voice model (${data.file} ${data.progress}%). Your audio is not uploaded.`;
      else if (data.error) $('note').textContent = `On-device voice failed: ${data.error}. Please type.`;
      else { $('goal').value = data.text; $('note').textContent = data.text ? 'Check what I heard, then press Guide me.' : 'I did not hear anything. Try again or type.'; }
    };
  }
  return worker;
}
// Load the voice model in the background when the panel opens, but only if it was already downloaded.
caches.open('transformers-cache')
  .then((c) => c.keys())
  .then((keys) => { if (keys.some((k) => k.url.includes('whisper-base'))) voice().postMessage({ warm: true }); })
  .catch(() => {});
function transcribe(audio) {
  voice();
  $('note').textContent = 'Transcribing on this computer...';
  worker.postMessage({ audio, language: WHISPER[$('lang').value] }, [audio.buffer]);
}
async function startTalk() {
  if (held) return;
  held = true;
  speechSynthesis.cancel();
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { held = false; return chrome.tabs.create({ url: chrome.runtime.getURL('mic.html') }); }
  const close = () => stream.getTracks().forEach((t) => t.stop());
  // Released while the microphone was still opening.
  if (!held) return close();
  const chunks = [];
  const r = rec = new MediaRecorder(stream);
  const limit = setTimeout(endTalk, 25_000);
  r.ondataavailable = (e) => chunks.push(e.data);
  r.onstop = async () => {
    clearTimeout(limit);
    close();
    $('talk').classList.remove('on');
    const ctx = new AudioContext({ sampleRate: 16000 });
    try { transcribe((await ctx.decodeAudioData(await new Blob(chunks).arrayBuffer())).getChannelData(0).slice()); }
    catch { $('note').textContent = 'Too short. Hold the button while you speak.'; }
    finally { ctx.close(); }
  };
  r.start();
  $('talk').classList.add('on');
}
function endTalk() {
  held = false;
  if (rec?.state === 'recording') rec.stop();
  rec = null;
}
$('talk').onpointerdown = (e) => { $('talk').setPointerCapture(e.pointerId); startTalk(); };
$('talk').onpointerup = endTalk;
$('talk').onpointercancel = endTalk;
$('talk').onkeydown = (e) => { if ([' ', 'Enter'].includes(e.key) && !e.repeat) { e.preventDefault(); startTalk(); } };
$('talk').onkeyup = endTalk;
$('talk').onblur = endTalk;

for (const [v, name] of LANGS) $('lang').add(new Option(name, v));
function localise() {
  const t = ui();
  ['talk', 'send', 'repeat', 'stuck', 'next', 'stop'].forEach((id, i) => { $(id).textContent = t[i]; });
  $('goal').placeholder = t[6];
  document.documentElement.lang = $('lang').value;
}
$('lang').onchange = () => { localise(); if (S.running) plan(); };
localise();
speechSynthesis.getVoices();
chrome.storage.session.get('task').then(({ task }) => { if (task) $('goal').value = task.goal; });
