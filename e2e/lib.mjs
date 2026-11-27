// Ferramentas do teste de ponta a ponta: API, banco (somente leitura), WhatsApp falso, navegador e registro de resultados.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { URLS } from './stack.mjs';

export const here = path.dirname(fileURLToPath(import.meta.url));
export const SHOTS = path.join(here, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

export const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── resultados ─────────────────────────────────────────────────────────────────
export const results = [];
const icon = { pass: '✅', fail: '❌', warn: '⚠️' };
let scenario = '';
export const section = name => { scenario = name; console.log(`\n── ${name}`); };
/** Registra uma verificação. status: 'pass' | 'fail' | 'warn'. */
export function record(id, desc, status, detail = '') {
  results.push({ scenario, id, desc, status, detail: String(detail ?? '') });
  console.log(`${icon[status]} ${id} ${desc}${detail ? ` — ${String(detail).slice(0, 200)}` : ''}`);
}
export const check = (id, desc, ok, detail = '') => { record(id, desc, ok ? 'pass' : 'fail', detail); return !!ok; };
export const warn = (id, desc, detail = '') => record(id, desc, 'warn', detail);

// ─── API do backend ─────────────────────────────────────────────────────────────
export async function api(method, route, body, token, extraHeaders = {}) {
  const res = await fetch(`${URLS.api}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null; try { json = await res.json(); } catch { /* sem corpo */ }
  return { status: res.status, data: json?.data ?? json, raw: json };
}
export async function login(email, password) {
  const r = await api('POST', '/auth/login', { email, password });
  return { ...r, token: r.data?.token ?? r.data?.accessToken ?? null, user: r.data?.user ?? null };
}

// ─── banco (somente leitura) ────────────────────────────────────────────────────
export function sql(query) {
  const r = spawnSync('docker', ['exec', 'nimbo-e2e-pg', 'psql', '-U', 'postgres', '-d', 'agendepro_e2e', '-tA', '-F', '|', '-c', query], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`psql: ${r.stderr}`);
  return r.stdout.trim().split('\n').filter(Boolean).map(l => l.split('|'));
}

// ─── WhatsApp falso ─────────────────────────────────────────────────────────────
export const wa = {
  all: async () => (await fetch(`${URLS.whatsapp}/__sent`)).json(),
  clear: async () => { await fetch(`${URLS.whatsapp}/__sent`, { method: 'DELETE' }); },
  fail: async on => { await fetch(`${URLS.whatsapp}/__mode`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fail: on }) }); },
  /** Espera chegar uma mensagem que satisfaça `pred`; devolve-a ou null no tempo limite. */
  async waitFor(pred, ms = 30_000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const hit = (await wa.all()).find(pred);
      if (hit) return hit;
      await sleep(1000);
    }
    return null;
  },
  to: phone => m => m.number.endsWith(String(phone).replace(/\D/g, '').slice(-9)),
};

// ─── datas (America/Sao_Paulo) ──────────────────────────────────────────────────
const fmtDate = d => d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const fmtTime = d => d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false });
export const nowBR = (offsetMinutes = 0) => { const d = new Date(Date.now() + offsetMinutes * 60_000); return { date: fmtDate(d), time: fmtTime(d) }; };
export const dayBR = n => fmtDate(new Date(Date.now() + n * 86_400_000));
/** Arredonda para cima ao próximo múltiplo de 30 min. */
export function slotAfter(offsetMinutes) {
  const d = new Date(Date.now() + offsetMinutes * 60_000);
  const [h, m] = fmtTime(d).split(':').map(Number);
  const total = Math.ceil((h * 60 + m) / 30) * 30;
  const day = total >= 1440 ? fmtDate(new Date(d.getTime() + 86_400_000)) : fmtDate(d);
  const t = total % 1440;
  return { date: day, time: `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` };
}

// ─── navegador ──────────────────────────────────────────────────────────────────
export const VIEWPORTS = { mobile: { width: 390, height: 844 }, desktop: { width: 1280, height: 900 } };
export const pageErrors = [];

export async function launch() {
  return chromium.launch({ channel: 'chrome', headless: true });
}
export async function newPage(browser, device, name) {
  const ctx = await browser.newContext({
    viewport: VIEWPORTS[device], locale: 'pt-BR', timezoneId: 'America/Sao_Paulo',
    deviceScaleFactor: device === 'mobile' ? 2 : 1, serviceWorkers: 'block',
  });
  await ctx.route('https://wa.me/**', r => r.fulfill({ status: 200, body: 'wa.me (interceptado: nada é aberto de verdade)' }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|challenges\.cloudflare\.com/, r => r.fulfill({ status: 200, body: '' }));
  const page = await ctx.newPage();
  page.on('pageerror', e => pageErrors.push({ page: name, msg: e.message }));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource.*(400|401|403|404|409|422)/.test(m.text())) pageErrors.push({ page: name, msg: `console: ${m.text().slice(0, 200)}` }); });
  return { ctx, page };
}
export async function shot(page, name) {
  await page.waitForTimeout(500);
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return path.relative(here, file).replace(/\\/g, '/');
}
export async function overflowX(page) { return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); }

export const unique = (Date.now() % 100_000_000).toString(36);
export const uniquePhone = seed => `(11) 9${String(40000000 + (Number.parseInt(seed, 36) % 59999999)).slice(0, 4)}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
