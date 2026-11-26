import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SYSTEM, parsePlan } from './prompt.js';

const ROOT = new URL('..', import.meta.url);
const ENV = fileURLToPath(new URL('.env', ROOT));
if (existsSync(ENV)) process.loadEnvFile(ENV);
const PORT = Number(process.env.PORT) || 8787;
const MODEL = process.env.MODEL || 'minimaxai/minimax-m3.1-flash';
const UPSTREAM = process.env.UPSTREAM || 'https://integrate.api.nvidia.com/v1/chat/completions';
// Short reasoning and a small output budget are the main speed levers for a reasoning model.
const REASONING = process.env.REASONING ?? 'low';
const MAX_TOKENS = Number(process.env.MAX_TOKENS) || 900;
let sendReasoning = Boolean(REASONING);
const PAGES = new Set(['index.html', 'apply.html', 'review.html', 'done.html', 'style.css']);
let hits = [];

const json = (res, code, data) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data));

async function readBody(req) {
  let body = '';
  for await (const c of req) { body += c; if (body.length > 64_000) throw new Error('too large'); }
  return JSON.parse(body);
}

async function plan(req, res) {
  // Only the extension may spend the key; ordinary web pages cannot.
  if (!/^chrome-extension:\/\//.test(req.headers.origin || '')) return json(res, 403, { error: 'Extension only.' });
  hits = hits.filter((t) => Date.now() - t < 60_000);
  if (hits.length >= 20) return json(res, 429, { error: 'Too many requests. Wait a minute.' });
  hits.push(Date.now());
  if (!process.env.NVIDIA_API_KEY) return json(res, 503, { error: 'No NVIDIA key set. Use the recorded demo route, or add the key to .env.' });
  let input;
  try { input = await readBody(req); } catch { return json(res, 400, { error: 'Bad request.' }); }
  if (typeof input?.goal !== 'string' || !Array.isArray(input?.elements)) return json(res, 400, { error: 'Bad request.' });
  const started = Date.now();
  const call = () => fetch(UPSTREAM, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.NVIDIA_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, temperature: 0.1, max_tokens: MAX_TOKENS,
      ...(sendReasoning ? { chat_template_kwargs: { reasoning_effort: REASONING } } : {}),
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: JSON.stringify(input) }],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  try {
    let r = await call();
    // A model that rejects the reasoning setting is retried once without it, and not sent it again.
    if (r.status === 400 && sendReasoning) { sendReasoning = false; console.error('reasoning setting rejected; continuing without it'); r = await call(); }
    if ([429, 500, 502, 503, 504].includes(r.status)) { await new Promise((ok) => setTimeout(ok, 800)); r = await call(); }
    // Status and timing only: request and response bodies are never logged.
    const sec = ((Date.now() - started) / 1000).toFixed(1);
    if (!r.ok) { console.error('upstream status', r.status, `${sec}s`); return json(res, 502, { error: `AI service returned ${r.status}.` }); }
    const data = await r.json();
    const plan = parsePlan(data.choices?.[0]?.message?.content);
    console.log(`plan ok ${sec}s, ${data.usage?.completion_tokens ?? '?'} output tokens`);
    return json(res, 200, { plan, seconds: Number(sec) });
  } catch (e) {
    console.error('plan failed:', e.name, `${((Date.now() - started) / 1000).toFixed(1)}s`);
    return json(res, 502, { error: e.name === 'TimeoutError' ? 'The AI took too long.' : 'The AI reply could not be used.' });
  }
}

export const server = http.createServer(async (req, res) => {
  const path = req.url.split('?')[0];
  if (req.method === 'POST' && path === '/plan') return plan(req, res);
  if (path === '/') return res.writeHead(302, { location: '/portal/index.html' }).end();
  const file = path.replace(/^\/portal\//, '');
  if (!path.startsWith('/portal/') || !PAGES.has(file)) return res.writeHead(404).end('Not found');
  const type = file.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8';
  res.writeHead(200, { 'content-type': type }).end(await readFile(new URL(`mock-portal/${file}`, ROOT)));
});

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  server.listen(PORT, '127.0.0.1', () => console.log(`Mock portal: http://localhost:${PORT}  AI key: ${process.env.NVIDIA_API_KEY ? 'set' : 'not set'}`));
}
