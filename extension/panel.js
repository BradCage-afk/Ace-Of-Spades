import { UI, LANGS } from './lib/ui.js';

// The guide itself runs in background.js and keeps going when this panel is closed.
// This panel only sends commands and draws the state it stores.
const $ = (id) => document.getElementById(id);
const testTab = Number(new URLSearchParams(location.search).get('tab')) || null;
const command = (name, args) => chrome.runtime.sendMessage({ type: 'saathi:command', name, args });
const ui = () => UI[$('lang').value] || UI.en;
let state = {}, ticker = 0, drawn = 0;

function render(s) {
  state = s || {};
  const chat = $('chat');
  const log = state.log || [];
  if (log.length < drawn) { chat.textContent = ''; drawn = 0; }
  for (const m of log.slice(drawn)) {
    const p = document.createElement('p');
    p.className = `msg ${m.cls}`;
    p.textContent = m.text;
    if (m.small) { const sm = document.createElement('small'); sm.textContent = m.small; p.append(sm); }
    chat.append(p);
  }
  if (log.length !== drawn) chat.scrollTop = chat.scrollHeight;
  drawn = log.length;
  $('controls').hidden = !state.running;
  $('retry').hidden = !(state.running && state.error);
  $('restart').hidden = !state.goal;
  $('receiptState').textContent = state.receiptState || 'Nothing sent yet.';
  $('receipt').textContent = state.receipt || '';
  if (state.note) $('note').textContent = state.note;
  clearInterval(ticker);
  const tick = () => { $('mode').textContent = state.thinkingSince ? `Live AI: thinking ${Math.round((Date.now() - state.thinkingSince) / 1000)}s` : state.mode || 'Ready'; };
  tick();
  if (state.thinkingSince) ticker = setInterval(tick, 1000);
}
chrome.storage.session.get('guide').then(({ guide }) => {
  render(guide);
  if (guide?.goal && !$('goal').value) $('goal').value = guide.goal;
  if (guide?.lang) { $('lang').value = guide.lang; localise(); }
  if (guide) $('recorded').checked = !!guide.recorded;
});
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'session' && changes.guide) render(changes.guide.newValue); });

async function currentTab() {
  if (testTab) return chrome.tabs.get(testTab);
  return (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
}

// Asking for a site permission needs a click, so it happens here before the background takes over.
async function access(tab) {
  if (!tab?.url) return 'Click the Saathi toolbar icon on this page once, so I can read its labels.';
  if (!/^https?:/.test(tab.url)) return 'I cannot guide on this kind of page. Open a website first.';
  const origins = [`${new URL(tab.url).protocol}//${new URL(tab.url).host}/*`];
  if (await chrome.permissions.contains({ origins })) return '';
  if (await chrome.permissions.request({ origins }).catch(() => false)) return '';
  return `I need your permission for ${new URL(tab.url).hostname}. Press the button again to allow it.`;
}
const warn = (text) => { const p = document.createElement('p'); p.className = 'msg warn'; p.textContent = text; $('chat').append(p); };
const settings = () => ({ lang: $('lang').value, recorded: $('recorded').checked });

$('ask').onsubmit = async (e) => {
  e.preventDefault();
  const goal = $('goal').value.trim();
  if (!goal) return;
  const tab = await currentTab();
  const problem = await access(tab);
  if (problem) return warn(problem);
  command('start', { goal, tabId: tab.id, ...settings() });
};
$('retry').onclick = async () => { const problem = await access(await chrome.tabs.get(state.tabId).catch(() => null)); if (problem) return warn(problem); command('retry'); };
$('restart').onclick = async () => {
  const tab = await currentTab();
  const problem = await access(tab);
  if (problem) return warn(problem);
  if (state.tabId !== tab.id) return command('start', { goal: state.goal, tabId: tab.id, ...settings() });
  command('restart');
};
$('repeat').onclick = () => command('repeat');
// Stops any guidance and empties the conversation and the goal box. Remembered plans are kept.
$('clearchat').onclick = () => { $('goal').value = ''; $('note').textContent = ''; command('clear'); };
$('stuck').onclick = () => command('stuck');
$('next').onclick = () => command('next');
$('stop').onclick = () => command('stop');
$('recorded').onchange = () => command('settings', settings());
$('lang').onchange = () => { localise(); command('settings', settings()); };

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
  chrome.tts.stop();
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
  ['talk', 'send', 'repeat', 'stuck', 'next', 'stop', null, null, 'restart', 'retry', 'clearchat'].forEach((id, i) => { if (id) $(id).textContent = t[i]; });
  $('goal').placeholder = t[6];
  document.documentElement.lang = $('lang').value;
}
localise();
