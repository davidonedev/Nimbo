// Servidor falso da Evolution API (WhatsApp). Só grava o que o backend tentou enviar; nada sai de verdade.
//   POST /message/sendText/:instance   corpo { number, text }, cabeçalho apikey  → grava e responde 201
//   GET  /__sent                       lista o que foi gravado
//   DELETE /__sent                     limpa
//   POST /__mode                       { fail: true|false } → com fail, responde 500 (prova de reenvio e fallback)
import http from 'node:http';

const PORT = Number(process.env.FAKE_EVOLUTION_PORT ?? 4599);
const sent = [];
let fail = false;

const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const readBody = req => new Promise(resolve => { let d = ''; req.on('data', c => d += c); req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } }); });

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET' && url.pathname === '/__health') return json(res, 200, { ok: true });
  if (req.method === 'GET' && url.pathname === '/__sent') return json(res, 200, sent);
  if (req.method === 'DELETE' && url.pathname === '/__sent') { sent.length = 0; return json(res, 200, { cleared: true }); }
  if (req.method === 'POST' && url.pathname === '/__mode') { fail = !!(await readBody(req)).fail; return json(res, 200, { fail }); }

  const m = /^\/message\/sendText\/([^/]+)$/.exec(url.pathname);
  if (req.method === 'POST' && m) {
    const body = await readBody(req);
    if (fail) return json(res, 500, { error: 'falha simulada' });
    sent.push({ at: new Date().toISOString(), instance: m[1], apikey: req.headers.apikey ?? null, number: String(body.number ?? ''), text: String(body.text ?? '') });
    return json(res, 201, { key: { id: `fake-${sent.length}` }, status: 'PENDING' });
  }
  json(res, 404, { error: 'rota desconhecida' });
}).listen(PORT, '127.0.0.1', () => console.log(`[fake-evolution] ouvindo em http://127.0.0.1:${PORT}`));
