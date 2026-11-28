// Sobe e derruba a pilha local ISOLADA do teste de ponta a ponta:
//   Postgres descartável (container nimbo-e2e-pg, porta 5434) + backend (3399) + frontend/Vite (5199) + WhatsApp falso (4599).
// Não usa o banco de desenvolvimento (5433) nem o backend de desenvolvimento (3334).
//
//   node stack.mjs up      [--jar <caminho do agendepro-backend.jar>]
//   node stack.mjs down
//   node stack.mjs status
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const run = path.join(here, '.run');
const PIDS = path.join(run, 'pids.json');
const JAR_FILE = path.join(run, 'jar.txt');

export const PORTS = { db: Number(process.env.E2E_DB_PORT ?? 5434), backend: 3399, front: 5199, whatsapp: 4599 };
export const URLS = {
  front: `http://localhost:${PORTS.front}`,
  api: `http://localhost:${PORTS.backend}/api`,
  health: `http://localhost:${PORTS.backend}/health`,
  whatsapp: `http://127.0.0.1:${PORTS.whatsapp}`,
};
const CONTAINER = 'nimbo-e2e-pg';

const arg = name => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const readPids = () => { try { return JSON.parse(fs.readFileSync(PIDS, 'utf8')); } catch { return {}; } };
const savePids = p => { fs.mkdirSync(run, { recursive: true }); fs.writeFileSync(PIDS, JSON.stringify(p, null, 2)); };

async function waitFor(label, check, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try { if (await check()) return; } catch { /* ainda subindo */ }
    await sleep(1000);
  }
  throw new Error(`${label} não ficou pronto em ${Math.round(timeoutMs / 1000)} s (veja ${run})`);
}

function start(name, cmd, args, opts) {
  fs.mkdirSync(run, { recursive: true });
  const out = fs.openSync(path.join(run, `${name}.log`), 'w');
  const child = spawn(cmd, args, { ...opts, detached: true, windowsHide: true, stdio: ['ignore', out, out] });
  child.unref();
  const pids = readPids(); pids[name] = child.pid; savePids(pids);
  return child.pid;
}

function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { process.kill(-pid, 'SIGTERM'); } catch { /* já parou */ } }
}

async function http200(url) { const r = await fetch(url); return r.ok; }

/**
 * Sobe o backend. Por padrão SOBE os limites de taxa (o roteiro faz dezenas de logins pelo mesmo IP).
 * realLimits=true NÃO sobrescreve nenhum limite: vale o application.yml (login 30/IP, auth 60/IP, falhas por e-mail 5),
 * usado só pela checagem de limites (limits.mjs).
 * APP_PENDING_EXPIRY_CHECK_MS=5000: o agendador de pendentes roda a cada 5 s (padrão 60 s) para o roteiro não esperar.
 */
async function startBackend(jar, { realLimits }) {
  const work = path.join(run, 'backend-cwd'); fs.mkdirSync(work, { recursive: true });
  const relaxed = { app: { 'rate-limit': { 'auth-capacity': 100000, 'api-capacity': 100000, 'login-capacity': 100000, 'forgot-password-capacity': 100000, 'reset-password-capacity': 100000, 'email-change-capacity': 100000, 'access-help-capacity': 100000, 'login-failures-per-email': 1000 } } };
  start('backend', 'java', ['-jar', jar], {
    cwd: work,
    env: {
      ...process.env,
      PORT: String(PORTS.backend),
      DB_URL: `jdbc:postgresql://localhost:${PORTS.db}/agendepro_e2e`, DB_USERNAME: 'postgres', DB_PASSWORD: 'e2e',
      JWT_SECRET: 'e2e-jwt-secret-only-for-local-tests-0123456789-abcdefghijklmnopqrstuvwxyz',
      CORS_ALLOWED_ORIGINS: `${URLS.front},http://127.0.0.1:${PORTS.front}`,
      APP_URL: URLS.front,
      SEED_ENABLED: 'false',
      PENDING_CONFIRM_MINUTES: '3',
      REMINDERS_INTERVAL_MS: '15000',
      APP_PENDING_EXPIRY_CHECK_MS: '5000',
      // o stdout do java iniciado destacado no Windows não chega ao backend.log: grava o log da aplicação num arquivo próprio
      LOGGING_FILE_NAME: path.join(run, 'backend-app.log'),
      BOOKING_MAX_ATTEMPTS_PER_IP: '1000',
      ...(realLimits ? {} : { SPRING_APPLICATION_JSON: JSON.stringify(relaxed) }),
      APP_REMINDERS_QUIET_HOURS_ENABLED: 'false', // o teste roda a qualquer hora; a regra de 22h–7h tem teste próprio
      WHATSAPP_ALLOW_PRIVATE_URLS: 'true', // o WhatsApp falso fica em 127.0.0.1; em produção essa chave nunca é ligada (anti-SSRF)
      SMTP_USER: '', SMTP_PASS: '', WHATSAPP_DEFAULT_API_URL: '', WHATSAPP_DEFAULT_API_KEY: '', WHATSAPP_DEFAULT_INSTANCE: '',
    },
  });
  await waitFor('Backend', () => http200(URLS.health), 180_000);
}

/** Reinicia só o backend (mesmo banco), p. ex. com os limites de taxa REAIS: node stack.mjs restart-backend --real-limits */
export async function restartBackend() {
  const pids = readPids(); killTree(pids.backend);
  await sleep(2000);
  const jar = fs.readFileSync(JAR_FILE, 'utf8').trim();
  await startBackend(jar, { realLimits: process.argv.includes('--real-limits') });
  console.log('backend reiniciado', process.argv.includes('--real-limits') ? '(limites reais)' : '(limites elevados)');
}

export async function up() {
  const jar = path.resolve(arg('--jar') ?? path.join(repo, 'backend-java', 'target', 'agendepro-backend.jar'));
  if (!fs.existsSync(jar)) throw new Error(`jar do backend não encontrado: ${jar}. Gere com "./mvnw -DskipTests package" em backend-java (ou passe --jar).`);

  // 1) Postgres descartável
  spawnSync('docker', ['rm', '-f', CONTAINER], { stdio: 'ignore' });
  const d = spawnSync('docker', ['run', '-d', '--name', CONTAINER, '-e', 'POSTGRES_PASSWORD=e2e', '-e', 'POSTGRES_DB=agendepro_e2e', '-p', `${PORTS.db}:5432`, 'postgres:16-alpine'], { encoding: 'utf8' });
  if (d.status !== 0) throw new Error(`docker run falhou: ${d.stderr}`);
  await waitFor('Postgres', () => spawnSync('docker', ['exec', CONTAINER, 'pg_isready', '-U', 'postgres', '-d', 'agendepro_e2e']).status === 0, 60_000);
  await sleep(2000); // o pg_isready responde antes do init terminar

  // 2) WhatsApp falso
  start('whatsapp', process.execPath, [path.join(here, 'fake-evolution.mjs')], { cwd: here, env: { ...process.env, FAKE_EVOLUTION_PORT: String(PORTS.whatsapp) } });
  await waitFor('WhatsApp falso', () => http200(`${URLS.whatsapp}/__health`), 15_000);

  // 3) Backend (roda numa pasta vazia, para NÃO importar o .env do desenvolvimento)
  fs.mkdirSync(run, { recursive: true }); fs.writeFileSync(JAR_FILE, jar);
  await startBackend(jar, { realLimits: false });

  // 4) Frontend
  start('front', process.execPath, [path.join(repo, 'frontend', 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(PORTS.front), '--strictPort'], {
    cwd: path.join(repo, 'frontend'), env: { ...process.env, VITE_API_URL: URLS.api },
  });
  await waitFor('Frontend', () => http200(`http://127.0.0.1:${PORTS.front}`), 60_000);
  console.log('pilha pronta:', JSON.stringify({ ...URLS, banco: `localhost:${PORTS.db}` }));
}

export function down() {
  const pids = readPids();
  for (const [name, pid] of Object.entries(pids)) { killTree(pid); console.log(`parado: ${name} (${pid})`); }
  savePids({});
  spawnSync('docker', ['rm', '-f', CONTAINER], { stdio: 'ignore' });
  console.log(`container ${CONTAINER} removido`);
}

export async function status() {
  const check = async (n, u) => { try { return `${n}: ${(await fetch(u)).status}`; } catch { return `${n}: fora do ar`; } };
  console.log([await check('backend', URLS.health), await check('frontend', `http://127.0.0.1:${PORTS.front}`), await check('whatsapp falso', `${URLS.whatsapp}/__health`)].join(' | '));
}

const cmd = process.argv[2];
if (import.meta.url === new URL(process.argv[1], 'file:').href || process.argv[1]?.endsWith('stack.mjs')) {
  if (cmd === 'up') up().catch(e => { console.error(e.message); process.exit(1); });
  else if (cmd === 'restart-backend') restartBackend().catch(e => { console.error(e.message); process.exit(1); });
  else if (cmd === 'down') down();
  else if (cmd === 'status') status();
  else console.log('uso: node stack.mjs up [--jar <arquivo>] | restart-backend [--real-limits] | down | status');
}
