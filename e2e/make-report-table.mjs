// Gera a tabela de cenários (Markdown) a partir dos results-*.json das rodadas desktop e celular.
//   node make-report-table.mjs > tabela.md
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = f => { try { return JSON.parse(fs.readFileSync(path.join(here, f), 'utf8')); } catch { return null; } };
const icon = { pass: '✅', fail: '❌', warn: '⚠️' };

const runs = { desktop: [], mobile: [] };
for (const d of Object.keys(runs)) {
  const full = read(`results-${d}.json`);
  const partials = fs.readdirSync(here).filter(n => n.startsWith(`results-${d}-`) && n.endsWith('.json')).sort().map(read); // rodadas parciais (C, F...)
  const byId = new Map();
  for (const r of full?.results ?? []) byId.set(r.id, r);
  for (const p of partials) for (const r of p?.results ?? []) if (!byId.has(r.id)) byId.set(r.id, r); // a parcial só ACRESCENTA verificações novas (a rodada completa vale; reexecutar uma fase no mesmo banco herda o estado anterior)
  runs[d] = byId;
}

const ids = [...new Set([...runs.desktop.keys(), ...runs.mobile.keys()])].filter(id => !id.endsWith('-ERRO'));
const order = id => { const m = /^([A-Z])(\d+)(.*)$/.exec(id); return m ? `${m[1]}${m[2].padStart(3, '0')}${m[3]}` : id; };
ids.sort((a, b) => order(a).localeCompare(order(b)));

const clean = s => String(s ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').slice(0, 130);
const lines = ['| ID | Verificação | Desktop | Celular | Evidência (desktop) |', '|---|---|:-:|:-:|---|'];
let section = '';
for (const id of ids) {
  const d = runs.desktop.get(id), m = runs.mobile.get(id);
  const sc = (d ?? m).scenario;
  if (sc !== section) { section = sc; lines.push(`| | **${sc}** | | | |`); }
  lines.push(`| ${id} | ${clean((d ?? m).desc)} | ${d ? icon[d.status] : '—'} | ${m ? icon[m.status] : '—'} | ${clean(d?.detail ?? m?.detail)} |`);
}
console.log(lines.join('\n'));

const count = (map, s) => [...map.values()].filter(r => r.status === s).length;
console.error(`desktop: ${count(runs.desktop, 'pass')} ok, ${count(runs.desktop, 'fail')} falhas, ${count(runs.desktop, 'warn')} ressalvas`);
console.error(`celular: ${count(runs.mobile, 'pass')} ok, ${count(runs.mobile, 'fail')} falhas, ${count(runs.mobile, 'warn')} ressalvas`);
