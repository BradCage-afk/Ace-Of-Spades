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
  try {
    const r = await fetch(UPSTREAM, {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.NVIDIA_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, temperature: 0.1, max_tokens: 4000, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: JSON.stringify(input) }] }),
      signal: AbortSignal.timeout(60_000),
    });
    // Status only: request and response bodies are never logged.
    if (!r.ok) { console.error('upstream status', r.status); return json(res, 502, { error: `AI service returned ${r.status}.` }); }
    const data = await r.json();
    return json(res, 200, { plan: parsePlan(data.choices?.[0]?.message?.content) });
  } catch (e) {
    console.error('plan failed:', e.name);
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
