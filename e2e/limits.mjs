// Checagem dos limites de taxa REAIS (application.yml): login 30/IP e auth 60/IP por 15 min.
// O flow.mjs roda com os limites elevados (SPRING_APPLICATION_JSON do stack.mjs); aqui o backend é reiniciado SEM sobrescrever nada:
//   node stack.mjs restart-backend --real-limits   (com E2E_DB_PORT igual ao do "up", se mudou)
//   node limits.mjs
//   node stack.mjs restart-backend                 (volta aos limites elevados)
// Usa e-mails diferentes a cada tentativa (credencial errada, 401) para não esbarrar no limite de 5 falhas por e-mail.
import { api, check, section, results } from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { here } from './lib.mjs';

section('L. Limites de taxa reais');
const stamp = Date.now().toString(36);
const statuses = [];
for (let i = 1; i <= 32; i++) {
  const r = await api('POST', '/auth/login', { email: `limite-${stamp}-${i}@e2e.test`, password: 'senha-errada-123' });
  statuses.push(r.status);
}
const firstBlock = statuses.findIndex(s => s === 429) + 1; // 1-based; 0 = nunca bloqueou
check('L1', '30 logins seguidos do mesmo IP NÃO dão 429; o 31º é bloqueado (login-capacity 30)', firstBlock === 31 && statuses.slice(0, 30).every(s => s === 401), `primeiro 429 na tentativa ${firstBlock || 'nenhuma'}; status das 30 primeiras=${[...new Set(statuses.slice(0, 30))].join(',')}`);

// 12 logins seguidos (o antigo teto era 10) já ficam cobertos por L1 (tentativas 11 e 12 = 401).
check('L2', 'As tentativas 11 a 30 (acima do antigo teto de 10) passam sem 429', statuses.slice(10, 30).every(s => s !== 429), `status 11..30=${[...new Set(statuses.slice(10, 30))].join(',')}`);

const out = path.join(here, 'results-desktop-L.json');
fs.writeFileSync(out, JSON.stringify({ device: 'desktop', at: new Date().toISOString(), results, pageErrors: [] }, null, 2));
console.log('→', path.basename(out));
