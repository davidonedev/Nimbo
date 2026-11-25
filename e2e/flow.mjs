// Teste de ponta a ponta: cliente → dono/profissional → serviço concluído (sem pagamento).
//   node flow.mjs [mobile|desktop] [--only A,B,...] [--resume]
// Pré-requisito: a pilha isolada no ar (node stack.mjs up). Escreve results-<device>.json e capturas em screenshots/.
import fs from 'node:fs';
import path from 'node:path';
import { URLS } from './stack.mjs';
import {
  api, check, dayBR, here, launch, login, newPage, nowBR, overflowX, pageErrors, record, results, section, shot, sleep, slotAfter, sql, unique, wa, warn,
} from './lib.mjs';

const device = process.argv.includes('mobile') ? 'mobile' : 'desktop';
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg >= 0 ? process.argv[onlyArg + 1].split(',') : null;
const tag = `${device[0]}-${unique}`;

/** Estado compartilhado entre as fases. */
export const S = {
  slug: `e2e-${tag}`,
  owner: { name: 'Dono E2E', email: `dono-${tag}@e2e.test`, password: 'senha-e2e-123', phone: '(11) 98888-7001' },
  businessName: `Barbearia E2E ${tag}`,
  address: 'Rua dos Testes, 100, Centro, São Paulo',
  waKey: 'chave-e2e', waInstance: 'instancia-e2e',
  token: null, user: null, tenantId: null,
};

const STATE_FILE = path.join(here, '.run', `state-${device}.json`);
const saveState = () => { fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true }); fs.writeFileSync(STATE_FILE, JSON.stringify(S, null, 2)); };
if (process.argv.includes('--resume') && fs.existsSync(STATE_FILE)) Object.assign(S, JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')));

/** Abre uma página já logada (injeta a sessão no sessionStorage, como o app faz). */
async function loggedPage(browser, who, name) {
  const { ctx, page } = await newPage(browser, device, name);
  await ctx.addInitScript(s => { try { sessionStorage.setItem('agendepro_session', JSON.stringify(s)); } catch { /* sem storage */ } }, { token: who.token, user: who.user });
  return { ctx, page };
}

const phases = {};
const phase = (id, fn) => { phases[id] = fn; };
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

// ═══ A. Preparação do estabelecimento (pela interface) ═══════════════════════════
phase('A', async ({ browser }) => {
  section('A. Preparação do estabelecimento');
  if (!S.token) {
    const { ctx, page } = await newPage(browser, device, 'dono');
    try {
      // A1 cadastro do dono
      await page.goto(`${URLS.front}/signup`, { waitUntil: 'networkidle' });
      await page.getByText('Tenho um negócio').click();
      await page.getByRole('button', { name: /Continuar/ }).click();
      await page.getByLabel('Nome completo').fill(S.owner.name);
      await page.getByLabel('E-mail').fill(S.owner.email);
      await page.getByLabel('Telefone').fill(S.owner.phone);
      await page.getByPlaceholder('Mín. 6 caracteres').fill(S.owner.password);
      await page.getByPlaceholder('Repita a senha').fill(S.owner.password);
      await page.getByLabel('Nome do estabelecimento').fill(S.businessName);
      await page.getByLabel('Endereço').fill(S.address);
      await page.getByLabel('URL do seu perfil').fill(S.slug);
      await shot(page, `A1-signup-${tag}`);
      await page.getByRole('button', { name: /Criar minha conta/ }).click();
      const created = await page.getByText('Conta criada com sucesso!').waitFor({ timeout: 30_000 }).then(() => true).catch(() => false);
      check('A1', 'Cadastro do dono pela tela /signup', created, created ? `slug ${S.slug}` : 'a tela de sucesso não apareceu');
      if (!created) { await shot(page, `A1-falha-${tag}`); return; }

      // A2 login
      await page.getByRole('button', { name: /Ir para o login/ }).click();
      await page.getByLabel('E-mail').fill(S.owner.email);
      await page.getByPlaceholder('••••••••').fill(S.owner.password);
      await page.getByRole('button', { name: /^Entrar/ }).click();
      const inPanel = await page.waitForURL(/\/admin\/dashboard/, { timeout: 30_000 }).then(() => true).catch(() => false);
      check('A2', 'Login do dono leva ao painel', inPanel, page.url());
      if (!inPanel) { await shot(page, `A2-falha-${tag}`); return; }
      await page.waitForTimeout(3500); // o painel segura ~2 s em skeleton depois do login
      const ox = await overflowX(page);
      const emptyShot = await shot(page, `A3-painel-vazio-${tag}`);
      check('A3', 'Painel vazio sem rolagem horizontal', ox <= 0, `overflowX=${ox}; captura ${emptyShot}`);

      const r = await login(S.owner.email, S.owner.password);
      S.token = r.token; S.user = r.user; S.tenantId = r.user?.tenantId ?? null;
      check('A4', 'API de login devolve token e tenant', !!S.token && !!S.tenantId, `status ${r.status}`);
      saveState();
    } finally { await ctx.close(); }
  }
  if (!S.token) return;

  const { ctx: c2, page: p } = await loggedPage(browser, { token: S.token, user: S.user }, 'dono-config');
  try {
    // A5 integração WhatsApp (aponta para o servidor falso)
    await p.goto(`${URLS.front}/admin/settings/portal`, { waitUntil: 'networkidle' });
    await p.locator('#wa-url').fill(URLS.whatsapp);
    await p.locator('#wa-key').fill(S.waKey);
    await p.locator('#wa-instance').fill(S.waInstance);
    await p.getByRole('button', { name: /Salvar configuração WhatsApp/ }).click();
    const waSaved = await p.getByText('Salvo!').first().waitFor({ timeout: 15_000 }).then(() => true).catch(() => false);
    const dbUrl = sql(`select whatsapp_api_url from tenants where slug='${S.slug}'`)[0]?.[0];
    const ch = await api('GET', '/admin/notifications/channels', undefined, S.token);
    check('A5', 'Integração WhatsApp salva pela tela e reconhecida pelo backend', waSaved && dbUrl === URLS.whatsapp && ch.data?.whatsappAuto === true,
      `salvo=${waSaved}; banco=${dbUrl}; whatsappAuto=${ch.data?.whatsappAuto}`);

    // A6 primeiro serviço pela tela
    await p.goto(`${URLS.front}/admin/services`, { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: /Novo Serviço/ }).click();
    await p.getByPlaceholder('Ex: Corte masculino').fill('Corte E2E');
    await p.getByPlaceholder('50.00').fill('45');
    await p.getByPlaceholder('30', { exact: true }).fill('30');
    await p.getByRole('button', { name: 'Criar Serviço' }).click();
    const svcShown = await p.getByText('Corte E2E', { exact: true }).first().waitFor({ timeout: 15_000 }).then(() => true).catch(() => false);
    check('A6', 'Serviço criado pela tela aparece na lista', svcShown);
    await shot(p, `A6-servicos-${tag}`);

    // A6b demais serviços por API (preparação)
    await api('POST', '/admin/services', { name: 'Barba E2E', price: 35, duration: 30, category: 'Barba' }, S.token);
    await api('POST', '/admin/services', { name: 'Corte + Barba E2E', price: 70, duration: 60, category: 'Combo' }, S.token);
    const list = await api('GET', '/admin/services', undefined, S.token);
    S.services = Object.fromEntries((list.data ?? []).map(s => [s.name, s.id]));
    check('A6b', 'Três serviços cadastrados (Corte, Barba, Combo)', Object.keys(S.services).length === 3, JSON.stringify(Object.keys(S.services)));

    // A7 profissional pela tela, com foto e SEM marcar serviços (deve atender todos)
    await p.goto(`${URLS.front}/admin/professionals`, { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: /Novo Profissional/ }).click();
    await p.locator('input[type=file]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: PNG_1X1 });
    await p.getByPlaceholder('Ex: Carlos Silva').fill('Ronald E2E');
    await p.getByPlaceholder('Ex: Barbeiro').fill('Barbeiro');
    await shot(p, `A7-profissional-form-${tag}`);
    await p.getByRole('button', { name: 'Criar profissional' }).click();
    const proShown = await p.getByText('Ronald E2E').first().waitFor({ timeout: 15_000 }).then(() => true).catch(() => false);
    const dupAlert = await p.getByText(/Registro duplicado/).count();
    const row = sql(`select p.id, coalesce(length(p.photo_url),0), (select count(*) from professional_services l where l.professional_id=p.id) from professionals p where p.name='Ronald E2E' and p.tenant_id='${S.tenantId}'`)[0] ?? [];
    S.ronaldId = row[0];
    check('A7', 'Profissional criado pela tela, com foto e sem "Registro duplicado"', proShown && dupAlert === 0 && Number(row[1]) > 0, `foto ${row[1]} caracteres; alerta duplicado=${dupAlert}`);
    check('A7b', 'Profissional criado sem marcar serviços atende todos os 3', Number(row[2]) === 3, `vínculos=${row[2]}`);

    // A8 horários 24 h todos os dias (só para este teste) e um segundo profissional, só do Corte, com login
    await api('PATCH', `/admin/professionals/${S.ronaldId}`, { workingHoursStart: '00:00', workingHoursEnd: '23:59', workingDays: ALL_DAYS }, S.token);
    S.marcos = { email: `marcos-${tag}@e2e.test`, password: 'prof-e2e-123' };
    const m = await api('POST', '/admin/professionals', {
      name: 'Marcos E2E', specialty: 'Barbeiro', workingHoursStart: '00:00', workingHoursEnd: '23:59', workingDays: ALL_DAYS,
      serviceIds: [S.services['Corte E2E']], email: S.marcos.email, password: S.marcos.password,
    }, S.token);
    S.marcosId = m.data?.id;
    check('A8', 'Segundo profissional (só Corte, com login) criado', [200, 201].includes(m.status), `status ${m.status}`);

    // A9 antecedência mínima pela tela (novo componente): 1 hora
    await p.goto(`${URLS.front}/admin/settings/schedule`, { waitUntil: 'networkidle' });
    await p.getByRole('radio', { name: /^1 hora/ }).click();
    const preview = await p.getByRole('status').filter({ hasText: /Agora são/ }).innerText().catch(() => '');
    await p.getByRole('button', { name: 'Salvar', exact: true }).click();
    await p.getByText('Salvo!').first().waitFor({ timeout: 15_000 }).catch(() => {});
    const adv = sql(`select min_advance_minutes from tenants where slug='${S.slug}'`)[0]?.[0];
    check('A9', 'Antecedência de 1 hora salva pela tela, com prévia em palavras', adv === '60' && /primeiro horário/.test(preview), `banco=${adv}; prévia=${preview.replace(/\n/g, ' ').slice(0, 90)}`);
    saveState();
  } finally { await c2.close(); }
});

// ─── ajudantes do cliente ─────────────────────────────────────────────────────────
const RUN = unique.slice(-3);
const ANA = `Ana Cliente ${RUN}`;
const BIA = `Bia Combo ${RUN}`;
let phoneSeq = 0;
const phone = () => {
  phoneSeq += 1;
  const mid = String(parseInt(unique, 36) % 10_000).padStart(4, '0');
  const d = `119${mid}${String(phoneSeq).padStart(4, '0')}`.slice(0, 11);
  return { masked: `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`, digits: d };
};
const waCode = msg => /\b(\d{6})\b/.exec(msg?.text ?? '')?.[1] ?? null;

/** Percorre a página pública até a tela de dados: serviços → horário → /dados. Devolve o texto do horário escolhido. */
async function pickServiceAndSlot(page, slug, serviceNames, slotIndex = 6) {
  await page.goto(`${URLS.front}/${slug}`, { waitUntil: 'networkidle' });
  if (serviceNames.length === 1) {
    await page.locator('.bk-service-main', { hasText: serviceNames[0] }).first().click();
  } else {
    for (const n of serviceNames) await page.getByRole('button', { name: new RegExp(`Adicionar ${n} ao agendamento`) }).click();
    await page.getByRole('button', { name: /Continuar/ }).click();
  }
  await page.waitForURL(/horario/, { timeout: 15_000 });
  await page.waitForSelector('.bk-slot', { timeout: 20_000 });
  // à noite sobram poucos horários (e combos precisam de mais tempo): usa o índice pedido ou o último que existir
  const count = await page.locator('.bk-slot').count();
  const slot = page.locator('.bk-slot').nth(Math.min(slotIndex, count - 1));
  const text = (await slot.innerText()).trim();
  await slot.click();
  await page.waitForURL(/dados/, { timeout: 15_000 });
  return text;
}
async function fillContact(page, name, ph) {
  await page.getByLabel(/Nome completo/).fill(name);
  await page.getByLabel(/Celular/).fill(ph.masked);
}
const apptsOf = (where = '1=1') => sql(`select a.id, a.status, a.date, a.start_time, a.end_time, c.name, s.name, p.name from appointments a join clients c on c.id=a.client_id join services s on s.id=a.service_id join professionals p on p.id=a.professional_id where a.tenant_id='${S.tenantId}' and ${where} order by a.date, a.start_time`);

// ═══ B. Cliente agenda (página pública) ═══════════════════════════════════════════
phase('B', async ({ browser }) => {
  section('B. Cliente agenda pela página pública');
  if (!S.token) { warn('B0', 'Fase A não rodou; pulando B'); return; }
  const { ctx, page } = await newPage(browser, device, 'cliente');
  try {
    // B1 página pública carrega, com serviços e preços
    await page.goto(`${URLS.front}/${S.slug}`, { waitUntil: 'networkidle' });
    const seen = await page.locator('.bk-service').count();
    const ox = await overflowX(page);
    const img = await shot(page, `B1-servicos-${tag}`);
    check('B1', 'Página pública lista os 3 serviços sem rolagem horizontal', seen === 3 && ox <= 0, `serviços=${seen}; overflowX=${ox}; ${img}`);

    // B2 validação: enviar vazio e telefone inválido
    await pickServiceAndSlot(page, S.slug, ['Corte E2E']);
    await page.getByRole('button', { name: 'Confirmar agendamento' }).click();
    await page.waitForTimeout(500);
    const emptyErr = (await page.locator('.bk-error, [role=alert], .bk-field-error').count()) > 0;
    await shot(page, `B2-validacao-${tag}`);
    check('B2', 'Formulário vazio mostra erro e não envia', emptyErr && page.url().includes('dados'));
    await fillContact(page, ANA, { masked: '(11) 123' });
    await page.getByRole('button', { name: 'Confirmar agendamento' }).click();
    await page.waitForTimeout(500);
    check('B2b', 'Telefone inválido não avança', page.url().includes('dados'), page.url());

    // B3 reserva com código de WhatsApp
    S.clienteAna = phone();
    await wa.clear();
    await fillContact(page, ANA, S.clienteAna);
    await page.getByRole('button', { name: 'Confirmar agendamento' }).click();
    await page.waitForURL(/codigo/, { timeout: 20_000 }).catch(() => {});
    const onCode = page.url().includes('codigo');
    const msg = await wa.waitFor(wa.to(S.clienteAna.digits), 20_000);
    const code = waCode(msg);
    check('B3', 'Reserva com WhatsApp pede o código e o backend o envia ao WhatsApp', onCode && !!code, `na tela de código=${onCode}; código recebido=${code ?? 'nenhum'}`);
    await shot(page, `B3-codigo-${tag}`);
    if (onCode && code) {
      await page.locator('#bk-code').fill('000000');
      await page.getByRole('button', { name: /Confirmar|Verificar/ }).last().click();
      await page.waitForTimeout(1200);
      const stillCode = page.url().includes('codigo');
      const wrongMsg = (await page.locator('.bk-alert, [role=alert], .bk-error').count()) > 0;
      check('B3b', 'Código errado é recusado com aviso', stillCode && wrongMsg, `na tela de código=${stillCode}; aviso=${wrongMsg}`);
      await page.locator('#bk-code').fill(code);
      await page.getByRole('button', { name: /Confirmar|Verificar/ }).last().click();
      const done = await page.getByText('Agendamento confirmado!').waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
      await shot(page, `B3c-confirmado-${tag}`);
      const rows = apptsOf(`c.name='${ANA}'`);
      check('B3c', 'Código certo conclui a reserva; agendamento nasce PENDENTE no banco', done && rows.length === 1 && rows[0][1] === 'pending', `linhas=${JSON.stringify(rows[0] ?? null)}`);
      S.anaApptId = rows[0]?.[0];
    }

    // B4 aparelho reconhecido: nova reserva do mesmo navegador sem pedir código
    await wa.clear();
    await pickServiceAndSlot(page, S.slug, ['Barba E2E'], 9);
    // o preenchimento chega de uma consulta ao servidor ("possession"): espera até 6 s antes de dizer que não veio
    let prefilled = '';
    for (let i = 0; i < 12 && !prefilled; i++) { prefilled = await page.getByLabel(/Nome completo/).inputValue().catch(() => ''); if (!prefilled) await sleep(500); }
    await page.getByRole('button', { name: 'Confirmar agendamento' }).click();
    const doneDirect = await page.getByText('Agendamento confirmado!').waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
    const codeAsked = (await wa.all()).some(m => /\d{6}/.test(m.text) && wa.to(S.clienteAna.digits)(m));
    let diag = '';
    if (!doneDirect) {
      const storage = await page.evaluate(() => Object.keys(localStorage).join(','));
      const body = (await page.locator('main').innerText().catch(() => '')).replace(/\n/g, ' ').slice(0, 160);
      diag = `; url=${page.url()}; storage=${storage}; texto=${body}`;
      await shot(page, `B4-falha-${tag}`);
    }
    check('B4', 'Aparelho reconhecido: 2ª reserva sai direto, com dados preenchidos e sem novo código', doneDirect && !codeAsked && prefilled.length > 0, `preenchido="${prefilled}"; novo código=${codeAsked}${diag}`);
    S.anaAppt2 = apptsOf(`c.name='${ANA}'`).map(r => r[0]);

    // B5 serviço encadeado (Corte + Barba): mesmo profissional, horários seguidos
    const bia = phone(); await wa.clear();
    const { ctx: ctx2, page: page2 } = await newPage(browser, device, 'cliente2');
    try {
      await pickServiceAndSlot(page2, S.slug, ['Corte E2E', 'Barba E2E'], 4);
      const proShown = await page2.locator('.bk-staff, .bk-with, .bk-summary').first().innerText().catch(() => '');
      await fillContact(page2, BIA, bia);
      await page2.getByRole('button', { name: 'Confirmar agendamento' }).click();
      await page2.waitForURL(/codigo/, { timeout: 20_000 });
      const m2 = await wa.waitFor(wa.to(bia.digits), 20_000);
      await page2.locator('#bk-code').fill(waCode(m2) ?? '');
      await page2.getByRole('button', { name: /Confirmar|Verificar/ }).last().click();
      await page2.getByText('Agendamento confirmado!').waitFor({ timeout: 20_000 });
      const rows = apptsOf(`c.name='${BIA}'`);
      const chained = rows.length === 2 && rows[0][4] === rows[1][3] && rows[0][7] === rows[1][7];
      check('B5', 'Dois serviços viram 2 agendamentos seguidos com o mesmo profissional', chained, JSON.stringify(rows.map(r => [r[6], r[3], r[4], r[7]])));
      await shot(page2, `B5-combo-${tag}`);
    } finally { await ctx2.close(); }

    // B6 antecedência mínima de 1 h: nenhum horário de hoje antes de agora + 60 min
    const today = (await import('./lib.mjs')).nowBR().date;
    const sl = await api('GET', `/public/${S.slug}/book/slots?serviceIds=${S.services['Corte E2E']}&date=${today}`);
    const now = (await import('./lib.mjs')).nowBR(60).time;
    const early = (sl.data ?? []).filter(t => t < now);
    check('B6', 'Antecedência de 1 h: nenhum horário de hoje antes de agora + 60 min', sl.status === 200 && early.length === 0 && (sl.data ?? []).length > 0, `horários hoje=${(sl.data ?? []).length}; antes do limite=${early.length}; limite ${now}`);

    // B7 horário bloqueado pelo dono some para aquele profissional
    const tomorrow = (await import('./lib.mjs')).dayBR(1);
    const blk = await api('POST', '/admin/blocked-slots', { professionalId: S.ronaldId, date: tomorrow, startTime: '10:00', endTime: '11:00', reason: 'E2E almoço' }, S.token);
    const slR = await api('GET', `/public/${S.slug}/book/slots?serviceIds=${S.services['Corte E2E']}&date=${tomorrow}&professionalId=${S.ronaldId}`);
    const slAny = await api('GET', `/public/${S.slug}/book/slots?serviceIds=${S.services['Corte E2E']}&date=${tomorrow}`);
    check('B7', 'Bloqueio do dono tira o horário do profissional, mas outro profissional ainda atende', [200, 201].includes(blk.status) && !(slR.data ?? []).includes('10:00') && (slAny.data ?? []).includes('10:00'), `bloqueio ${blk.status}; Ronald tem 10:00=${(slR.data ?? []).includes('10:00')}; "qualquer" tem 10:00=${(slAny.data ?? []).includes('10:00')}`);

    // B8 portal pausado
    await api('PATCH', '/admin/settings', { isOpen: false }, S.token);
    await page.goto(`${URLS.front}/${S.slug}`, { waitUntil: 'networkidle' });
    const paused = await page.getByText('Agendamentos pausados').count();
    await shot(page, `B8-pausado-${tag}`);
    await api('PATCH', '/admin/settings', { isOpen: true }, S.token);
    check('B8', 'Com o estabelecimento fechado a página mostra "Agendamentos pausados"', paused > 0);
  } finally { await ctx.close(); }
  saveState();
});

// ═══ N. Estabelecimento SEM WhatsApp (modo pendente) ═══════════════════════════════
phase('N', async ({ browser }) => {
  section('N. Estabelecimento sem WhatsApp (pedido pendente)');
  const slug = `e2e-nowa-${tag}`;
  const owner = { email: `semwa-${tag}@e2e.test`, password: 'senha-e2e-123' };
  const reg = await api('POST', '/public/register/business', {
    ownerName: 'Dona Sem WhatsApp', email: owner.email, password: owner.password, phone: '(11) 97777-0001',
    businessName: `Studio Sem WA ${tag}`, address: 'Rua Pendente, 1', slug,
  });
  const lg = await login(owner.email, owner.password);
  S.nowa = { slug, ...owner, token: lg.token, user: lg.user };
  check('N1', 'Segundo estabelecimento criado (sem WhatsApp configurado)', [200, 201].includes(reg.status) && !!lg.token, `cadastro ${reg.status}`);
  if (!lg.token) return;
  const t = lg.token;
  const sv = await api('POST', '/admin/services', { name: 'Corte Pendente', price: 50, duration: 30 }, t);
  const pr = await api('POST', '/admin/professionals', { name: 'Pro Pendente', specialty: 'Cabeleireiro', workingHoursStart: '00:00', workingHoursEnd: '23:59', workingDays: ALL_DAYS, serviceIds: [sv.data?.id] }, t);
  S.nowa.serviceId = sv.data?.id; S.nowa.proId = pr.data?.id; S.nowa.tenantId = lg.user?.tenantId;
  const ch = await api('GET', '/admin/notifications/channels', undefined, t);
  check('N2', 'Sem WhatsApp configurado o backend informa whatsappAuto=false', ch.data?.whatsappAuto === false, JSON.stringify(ch.data));

  const { ctx, page } = await newPage(browser, device, 'cliente-nowa');
  try {
    // N3 cliente reserva: sem WhatsApp não há código, o pedido fica pendente e pede "Confirmar no WhatsApp"
    const ph = phone();
    await pickServiceAndSlot(page, slug, ['Corte Pendente'], 5);
    await fillContact(page, `Caio Pendente ${RUN}`, ph);
    await page.getByRole('button', { name: 'Confirmar agendamento' }).click();
    const pending = await page.getByText('Falta só um passo!').waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
    const href = await page.getByRole('link', { name: /Confirmar no WhatsApp/ }).getAttribute('href').catch(() => null);
    const decoded = href ? decodeURIComponent(href) : '';
    await shot(page, `N3-falta-um-passo-${tag}`);
    check('N3', 'Sem WhatsApp: tela "Falta só um passo!" com botão para o WhatsApp do estabelecimento', pending && /wa\.me\/5511977770001/.test(href ?? ''), `link=${decoded.slice(0, 140)}`);
    const row = sql(`select a.id, a.status, a.confirm_by is not null, a.client_confirmed_at is not null from appointments a join clients c on c.id=a.client_id where c.name='Caio Pendente ${RUN}'`)[0] ?? [];
    check('N4', 'Pedido nasce PENDENTE com prazo para o cliente confirmar', row[1] === 'pending' && row[2] === 't', `status=${row[1]}; prazo=${row[2]}`);
    S.nowa.caioId = row[0];

    // N5 cliente toca em "Confirmar no WhatsApp": o servidor registra e o prazo deixa de valer
    await page.getByRole('link', { name: /Confirmar no WhatsApp/ }).click();
    await page.waitForTimeout(1500);
    const row2 = sql(`select a.client_confirmed_at is not null, a.confirm_by is not null from appointments a where a.id='${S.nowa.caioId}'`)[0] ?? [];
    check('N5', 'Ao tocar em "Confirmar no WhatsApp" o servidor registra a confirmação do cliente', row2[0] === 't', `client_confirmed_at=${row2[0]}; confirm_by=${row2[1]}`);
  } finally { await ctx.close(); }

  // N6 dois clientes disputam o mesmo horário: só um vence
  const slotsR = await api('GET', `/public/${slug}/book/slots?serviceIds=${S.nowa.serviceId}&date=${dayBR(2)}`);
  const hhmm = (slotsR.data ?? [])[3];
  const body = (n, p) => ({ name: n, phone: p.masked, serviceIds: [S.nowa.serviceId], date: dayBR(2), startTime: hhmm });
  const [r1, r2] = await Promise.all([api('POST', `/public/${slug}/book`, body(`Disputa A ${RUN}`, phone())), api('POST', `/public/${slug}/book`, body(`Disputa B ${RUN}`, phone()))]);
  const statuses = [r1.status, r2.status].sort();
  check('N6', 'Dois pedidos simultâneos para o mesmo horário: um é aceito e o outro recebe conflito (409)', statuses[0] === 200 && statuses[1] === 409, `respostas=${JSON.stringify([r1.status, r2.status])}; horário ${hhmm}`);

  // N7 pedido que ninguém confirma vence e libera o horário (prazo de 3 min configurado na pilha)
  const ph3 = phone();
  const slot7 = (slotsR.data ?? [])[6];
  const r7 = await api('POST', `/public/${slug}/book`, { name: `Expira ${RUN}`, phone: ph3.masked, serviceIds: [S.nowa.serviceId], date: dayBR(2), startTime: slot7 });
  S.nowa.expiry = { name: `Expira ${RUN}`, slot: slot7, date: dayBR(2), createdAt: Date.now(), status: r7.status };
  check('N7a', 'Pedido para teste de vencimento criado (será conferido na fase E)', r7.status === 200, `status ${r7.status}`);

  // N8 profissional sem vínculo: o cliente vê um aviso claro (caso do Max Barber)
  await api('PATCH', `/admin/professionals/${S.nowa.proId}`, { serviceIds: [] }, t);
  const { ctx: c8, page: p8 } = await newPage(browser, device, 'cliente-sem-vinculo');
  try {
    await p8.goto(`${URLS.front}/${slug}`, { waitUntil: 'networkidle' });
    const msg = await p8.getByText(/ainda não está disponível/).count();
    const old = await p8.getByText(/faz todos esses serviços juntos/).count();
    await shot(p8, `N8-sem-vinculo-${tag}`);
    check('N8', 'Profissional sem serviço vinculado: mensagem clara, sem o erro "serviços juntos"', msg > 0 && old === 0, `aviso=${msg}; mensagem antiga=${old}`);
  } finally { await c8.close(); }
  await api('PATCH', `/admin/professionals/${S.nowa.proId}`, { serviceIds: [S.nowa.serviceId] }, t);

  // N9 o dono (sem WhatsApp) confirma pela tela: o modal explica, e depois aparece o link de reserva e o caminho para ativar
  const dslots = await api('GET', `/public/${slug}/book/slots?serviceIds=${S.nowa.serviceId}&date=${dayBR(2)}`);
  const dph = phone();
  const dora = await api('POST', `/public/${slug}/book`, { name: `Dora ${RUN}`, phone: dph.masked, serviceIds: [S.nowa.serviceId], professionalId: null, date: dayBR(2), startTime: (dslots.data ?? [])[9] });
  const doraId = dora.data?.booking?.items?.[0]?.id;
  await api('POST', `/public/${slug}/book/client-confirmed`, { appointmentIds: [doraId] });
  const { ctx: c9, page: p9 } = await loggedPage(browser, { token: S.nowa.token, user: S.nowa.user }, 'dono-sem-whatsapp');
  try {
    await p9.goto(`${URLS.front}/admin/appointments`, { waitUntil: 'networkidle' });
    await openPendingBox(p9);
    await p9.locator('li').filter({ hasText: `Dora ${RUN}` }).getByRole('button', { name: 'Confirmar', exact: true }).first().click();
    const dlg9 = safetyDialog(p9);
    await dlg9.waitFor({ timeout: 10_000 });
    await dlg9.getByText(/enviada automaticamente|não está ativo/).waitFor({ timeout: 8_000 }).catch(() => {});
    const dlgTxt = await dlg9.innerText();
    await shot(p9, `N9-modal-sem-whatsapp-${tag}`);
    await dlg9.getByRole('button', { name: 'Sim, confirmar' }).click();
    const conf9 = await waitStatus(doraId, 'confirmed');
    const link9 = await p9.getByRole('link', { name: /Avisar Dora no WhatsApp/ }).waitFor({ timeout: 30_000 }).then(() => true).catch(() => false);
    const href9 = link9 ? await p9.getByRole('link', { name: /Avisar Dora no WhatsApp/ }).getAttribute('href') : '';
    const enable9 = await p9.getByRole('link', { name: 'Ativar o envio automático' }).getAttribute('href').catch(() => null);
    await shot(p9, `N9-reserva-sem-whatsapp-${tag}`);
    check('N9', 'Sem WhatsApp: modal avisa que não é automático; depois de confirmar aparece o botão "Avisar" (wa.me) e o caminho para ativar',
      /não está ativo/.test(dlgTxt) && conf9 && link9 && (href9 ?? '').includes('wa.me/55' + dph.digits) && enable9 === '/admin/settings/portal#whatsapp',
      `modal="${dlgTxt.replace(/\s+/g, ' ').slice(0, 110)}"; confirmado=${conf9}; link=${(href9 ?? '').slice(0, 40)}; ativar=${enable9}`);
  } finally { await c9.close(); }
  saveState();
});

// ─── ajudantes do dono ───────────────────────────────────────────────────────────
let slotSeq = 0;
/** Cliente reserva (com código de WhatsApp) via API; devolve os ids dos agendamentos criados (PENDENTES). */
async function bookVerified(name, { svc = 'Corte E2E', pro = null, day = 2 } = {}) {
  const ph = phone();
  const date = dayBR(day);
  const sl = await api('GET', `/public/${S.slug}/book/slots?serviceIds=${S.services[svc]}&date=${date}${pro ? `&professionalId=${pro}` : ''}`);
  slotSeq += 1;
  const startTime = (sl.data ?? [])[(slotSeq * 3) % Math.max(1, (sl.data ?? []).length)];
  const r = await api('POST', `/public/${S.slug}/book`, { name, phone: ph.masked, serviceIds: [S.services[svc]], professionalId: pro, date, startTime });
  const msg = await wa.waitFor(wa.to(ph.digits), 20_000);
  const code = waCode(msg);
  const v = await api('POST', `/public/${S.slug}/book/verify`, { challengeId: r.data?.challengeId, code });
  const ids = (v.data?.booking?.items ?? []).map(i => i.id);
  return { name, first: name.split(' ')[0], ph, ids, id: ids[0], clientId: v.data?.client?.id, deviceToken: v.data?.deviceToken ?? null, date, startTime, status: v.status };
}
const dev = token => ({ 'X-Device-Token': token });
const statusOf = id => sql(`select status from appointments where id='${id}'`)[0]?.[0];
const waitStatus = async (id, want, ms = 15_000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (statusOf(id) === want) return true; await sleep(500); } return false; };
const outboxOf = (id, event) => sql(`select channel, status, coalesce(last_error,''), attempts from notification_outbox where appointment_id='${id}' and event='${event}' order by channel`);
const ownerSession = () => ({ token: S.token, user: S.user });
const ownerPhoneDigits = '11988887001';
/** Garante a caixa "Aguardando confirmação" aberta (no celular ela abre recolhida). */
async function openPendingBox(page) {
  const btn = page.getByRole('button', { name: /Aguardando confirmação/ });
  await btn.waitFor({ timeout: 15_000 });
  if ((await btn.getAttribute('aria-expanded')) === 'false') await btn.click();
}
const safetyDialog = page => page.getByRole('dialog', { name: /Confirmar agendamento\?/ });

// ═══ C. Dono recebe e decide ══════════════════════════════════════════════════════
phase('C', async ({ browser }) => {
  section('C. Dono recebe o pedido, confirma e o cliente é avisado');
  if (!S.token) { warn('C0', 'Fase A não rodou; pulando C'); return; }
  await wa.clear();

  // C1 aviso de novo pedido ao dono (WhatsApp) quando o cliente confirma o código
  const dani = await bookVerified(`Dani ${RUN}`, { pro: S.ronaldId });
  const ownerMsg = await wa.waitFor(m => wa.to(ownerPhoneDigits)(m) && /pedido|agendamento/i.test(m.text), 30_000);
  check('C1', 'Novo pedido: o dono recebe aviso no WhatsApp do estabelecimento', !!ownerMsg, ownerMsg ? ownerMsg.text.replace(/\n/g, ' | ').slice(0, 150) : 'nenhuma mensagem ao dono');
  const bellRow = outboxOf(dani.id, 'NEW_REQUEST');
  check('C1b', 'O aviso ao dono passou pela fila (WhatsApp enviado; e-mail ignorado por falta de SMTP)', bellRow.some(r => r[0] === 'WHATSAPP' && r[1] === 'SENT') && bellRow.some(r => r[0] === 'EMAIL' && r[1] === 'SKIPPED'), JSON.stringify(bellRow));

  const edu = await bookVerified(`Edu ${RUN}`, { pro: S.ronaldId });
  const fabi = await bookVerified(`Fabi ${RUN}`, { pro: S.ronaldId });
  const gui = await bookVerified(`Gui ${RUN}`, { pro: S.ronaldId });
  const hugo = await bookVerified(`Hugo ${RUN}`, { pro: S.ronaldId });
  const iara = await bookVerified(`Iara ${RUN}`, { pro: S.ronaldId });
  S.cli = { dani, edu, fabi, gui, hugo, iara };
  check('C1c', '6 clientes reservaram com código e os agendamentos estão PENDENTES', [dani, edu, fabi, gui, hugo, iara].every(c => c.id && statusOf(c.id) === 'pending'), [dani, edu, fabi, gui, hugo, iara].map(c => statusOf(c.id)).join(','));

  const { ctx, page } = await loggedPage(browser, ownerSession(), 'dono');
  try {
    // C2 Agendamentos mostra os pendentes
    await page.goto(`${URLS.front}/admin/appointments`, { waitUntil: 'networkidle' });
    await openPendingBox(page);
    const pendDb = Number(sql(`select count(*) from appointments where tenant_id='${S.tenantId}' and status='pending'`)[0][0]);
    const summary = await page.getByLabel('Resumo dos agendamentos').innerText().catch(() => '');
    const boxCount = await page.getByRole('button', { name: /Aguardando confirmação/ }).innerText();
    await shot(page, `C2-agendamentos-pendentes-${tag}`);
    check('C2', 'Agendamentos mostra os pendentes no resumo e na caixa "Aguardando confirmação"', summary.includes(String(pendDb)) && boxCount.includes(String(pendDb)), `pendentes no banco=${pendDb}; resumo="${summary.replace(/\n/g, ' ')}"; caixa="${boxCount.replace(/\n/g, ' ')}"`);

    const sumN = Number((/(\d+)\s*Pendentes/.exec(summary) ?? /Pendentes\s*(\d+)/.exec(summary) ?? [])[1]);
    const boxN = Number((/(\d+)/.exec(boxCount) ?? [])[1]);
    check('C2d', 'Contador "Pendentes" do resumo é igual ao número da caixa "Aguardando confirmação" (mesma regra)', Number.isFinite(sumN) && sumN === boxN && sumN === pendDb, `resumo=${sumN}; caixa=${boxN}; banco=${pendDb}`);

    // o sino avisa pedidos que CHEGAM com o painel aberto (consulta a cada 30 s): cria um agora, com a tela já carregada
    const nara = await bookVerified(`Nara ${RUN}`, { pro: S.ronaldId });
    const bell = await page.getByRole('button', { name: /Notificações \(\d+ nova/ }).first().waitFor({ timeout: 45_000 }).then(() => true).catch(() => false);
    const bellLabel = await page.getByRole('button', { name: /^Notificações/ }).first().getAttribute('aria-label').catch(() => null);
    await shot(page, `C2b-sino-${tag}`);
    check('C2b', 'Sino do painel indica um pedido que chega com a tela aberta (consulta a cada 30 s)', bell && !!nara.id, `rótulo do sino="${bellLabel}"`);
    // C2c o aviso do sino mostra QUEM pediu (cliente novo ainda não está na lista carregada ao abrir a tela)
    await page.getByRole('button', { name: /^Notificações/ }).first().click();
    await page.waitForTimeout(800);
    const bellText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    const hasName = bellText.includes(nara.name);
    const dash = /Novo agendamento[^.]{0,40}—/.test(bellText) || /— · Corte E2E/.test(bellText);
    await shot(page, `C2c-sino-aberto-${tag}`);
    check('C2c', 'O aviso de novo pedido (sino e aviso flutuante) mostra o nome do cliente', hasName && !dash, hasName ? 'nome presente' : `sem o nome; texto do aviso="${(bellText.match(/Novo agendamento.{0,70}/) ?? [''])[0]}"`);
    await page.keyboard.press('Escape');

    // C3 modal de segurança: Voltar não confirma; Sim confirma e o cliente é avisado sozinho
    const rowBtn = c => page.locator('li').filter({ hasText: c.name }).getByRole('button', { name: 'Confirmar', exact: true }).first();
    await rowBtn(dani).click();
    const dialog = safetyDialog(page);
    const opened = await dialog.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
    if (opened) await dialog.getByText(/enviada automaticamente|não está ativo/).waitFor({ timeout: 8_000 }).catch(() => {}); // o aviso vem de uma consulta ao servidor
    const dialogText = opened ? await dialog.innerText() : '';
    await shot(page, `C3-modal-seguranca-${tag}`);
    check('C3', 'Confirmar abre o modal de segurança com cliente e aviso do envio automático', opened && dialogText.includes(dani.name) && /enviada automaticamente/.test(dialogText), dialogText.replace(/\n/g, ' ').slice(0, 160));
    await dialog.getByRole('button', { name: 'Voltar' }).click();
    await page.waitForTimeout(800);
    check('C3b', '"Voltar" fecha o modal e nada muda no banco', (await dialog.count()) === 0 && statusOf(dani.id) === 'pending', `status=${statusOf(dani.id)}`);
    await wa.clear();
    await rowBtn(dani).click();
    await safetyDialog(page).getByRole('button', { name: 'Sim, confirmar' }).click();
    const t0 = Date.now();
    const confirmed = await waitStatus(dani.id, 'confirmed');
    const msgDani = await wa.waitFor(wa.to(dani.ph.digits), 30_000);
    const latency = msgDani ? Math.round((new Date(msgDani.at).getTime() - t0) / 100) / 10 : null;
    check('C3c', '"Sim, confirmar" muda para CONFIRMADO e a mensagem sai sozinha ao cliente', confirmed && !!msgDani && /confirmado/.test(msgDani.text ?? ''), `latência até o WhatsApp ≈ ${latency}s; texto="${(msgDani?.text ?? '').replace(/\n/g, ' ').slice(0, 170)}"`);
    const banner = await page.getByText(new RegExp(`Confirmação enviada para ${dani.first}`)).waitFor({ timeout: 25_000 }).then(() => true).catch(() => false);
    await shot(page, `C3d-faixa-enviada-${tag}`);
    check('C3d', 'A tela mostra "Confirmação enviada para X pelo WhatsApp" (sem botão de reserva)', banner && (await page.getByRole('link', { name: new RegExp(`Avisar ${dani.first} no WhatsApp`) }).count()) === 0);
    const outDani = outboxOf(dani.id, 'APPROVED');
    check('C3e', 'Fila: aprovação ao cliente com WhatsApp ENVIADO', outDani.some(r => r[0] === 'WHATSAPP' && r[1] === 'SENT'), JSON.stringify(outDani));

    // C4 WhatsApp fora do ar: a confirmação funciona, a tela oferece o link e a fila tenta de novo depois
    await wa.fail(true); await wa.clear();
    await page.reload({ waitUntil: 'networkidle' }); await openPendingBox(page);
    await rowBtn(edu).click();
    await safetyDialog(page).getByRole('button', { name: 'Sim, confirmar' }).click();
    const confEdu = await waitStatus(edu.id, 'confirmed');
    const linkEdu = await page.getByRole('link', { name: new RegExp(`Avisar ${edu.first} no WhatsApp`) }).waitFor({ timeout: 30_000 }).then(() => true).catch(() => false);
    await shot(page, `C4-falha-whatsapp-${tag}`);
    const outEdu = outboxOf(edu.id, 'APPROVED');
    check('C4', 'WhatsApp fora do ar: o agendamento é confirmado e a tela oferece o link "Avisar X" como reserva', confEdu && linkEdu, `confirmado=${confEdu}; link=${linkEdu}; fila=${JSON.stringify(outEdu)}`);
    check('C4b', 'Fila guarda o erro e a mensagem continua PENDENTE para nova tentativa', outEdu.some(r => r[0] === 'WHATSAPP' && r[1] === 'PENDING' && r[2] !== ''), JSON.stringify(outEdu));
    await wa.fail(false);
    S.retry = { phone: edu.ph.digits, since: Date.now(), name: edu.name };

    // C5 confirmação em massa de dois pendentes escolhidos
    await wa.clear();
    await page.reload({ waitUntil: 'networkidle' }); await openPendingBox(page);
    await page.getByLabel(new RegExp(`^Selecionar ${fabi.name}`)).check();
    await page.getByLabel(new RegExp(`^Selecionar ${gui.name}`)).check();
    await page.getByRole('button', { name: /Confirmar selecionados \(2\)/ }).click();
    const bulkDialog = page.getByRole('dialog');
    const bulkText = await bulkDialog.innerText();
    await shot(page, `C5-massa-modal-${tag}`);
    await bulkDialog.getByRole('button', { name: /Sim, confirmar 2/ }).click();
    const both = (await waitStatus(fabi.id, 'confirmed')) && (await waitStatus(gui.id, 'confirmed'));
    const mFabi = await wa.waitFor(wa.to(fabi.ph.digits), 30_000);
    const mGui = await wa.waitFor(wa.to(gui.ph.digits), 30_000);
    check('C5', 'Confirmação em massa: modal de aviso, 2 confirmados e 1 mensagem para cada cliente', /sem conferir um por um/.test(bulkText) && both && !!mFabi && !!mGui, `confirmados=${both}; msgs=${!!mFabi},${!!mGui}`);

    // C6 recusa de um pendente (Agendamentos → Cancelar): o cliente recebe a mensagem de recusa
    await wa.clear();
    await page.reload({ waitUntil: 'networkidle' });
    if (device === 'mobile') {
      await page.getByRole('button', { name: new RegExp(`^Mais ações: ${hugo.name}`) }).click();
      await page.getByRole('menuitem', { name: 'Cancelar' }).click();
    } else {
      await page.getByRole('button', { name: new RegExp(`^Cancelar: ${hugo.name}`) }).click();
    }
    await page.getByRole('dialog', { name: 'Cancelar agendamento' }).getByRole('button', { name: 'Cancelar agendamento' }).click();
    const cancelledHugo = await waitStatus(hugo.id, 'cancelled');
    const mHugo = await wa.waitFor(wa.to(hugo.ph.digits), 30_000);
    check('C6', 'Recusar um pendente: vira CANCELADO e o cliente recebe a mensagem de recusa com o link para reagendar', cancelledHugo && /Não conseguimos atender/.test(mHugo?.text ?? '') && (mHugo?.text ?? '').includes(S.slug), `cancelado=${cancelledHugo}; texto="${(mHugo?.text ?? '').replace(/\n/g, ' ').slice(0, 150)}"`);

    // C7 cancelamento pelo dono de um agendamento já confirmado
    await wa.clear();
    await page.reload({ waitUntil: 'networkidle' });
    if (device === 'mobile') {
      await page.getByRole('button', { name: new RegExp(`^Mais ações: ${dani.name}`) }).click();
      await page.getByRole('menuitem', { name: 'Cancelar' }).click();
    } else {
      await page.getByRole('button', { name: new RegExp(`^Cancelar: ${dani.name}`) }).click();
    }
    await page.getByRole('dialog', { name: 'Cancelar agendamento' }).getByRole('button', { name: 'Cancelar agendamento' }).click();
    const cancelledDani = await waitStatus(dani.id, 'cancelled');
    const mDani = await wa.waitFor(wa.to(dani.ph.digits), 30_000);
    check('C7', 'Dono cancela um confirmado: CANCELADO e o cliente é avisado do cancelamento', cancelledDani && /foi cancelado/.test(mDani?.text ?? ''), `texto="${(mDani?.text ?? '').replace(/\n/g, ' ').slice(0, 140)}"`);

    // C8 tela desatualizada: o pedido muda no servidor e o dono ainda vê "pendente"
    await page.reload({ waitUntil: 'networkidle' }); await openPendingBox(page);
    await api('PATCH', `/admin/appointments/${iara.id}/status`, { status: 'cancelled' }, S.token);
    await rowBtn(iara).click();
    await safetyDialog(page).getByRole('button', { name: 'Sim, confirmar' }).click();
    const errBanner = await page.getByRole('alert').first().waitFor({ timeout: 15_000 }).then(() => true).catch(() => false);
    const errText = errBanner ? (await page.getByRole('alert').first().innerText()).replace(/\n/g, ' ') : '';
    await shot(page, `C8-tela-desatualizada-${tag}`);
    check('C8', 'Confirmar algo já decidido: o servidor recusa (409), o banco não muda e a tela explica o erro', errBanner && statusOf(iara.id) === 'cancelled', `alerta="${errText.slice(0, 140)}"`);
  } finally { await ctx.close(); }
  saveState();
});

const digitsOf = s => String(s ?? '').replace(/[^\d,]/g, '');
const money = v => `R$ ${Number(v).toFixed(2).replace('.', ',')}`;

// ═══ D. Profissional ══════════════════════════════════════════════════════════════
phase('D', async ({ browser }) => {
  section('D. Profissional aceita e recusa só os pedidos dele');
  if (!S.token) { warn('D0', 'Fase A não rodou; pulando D'); return; }
  const ju = await bookVerified(`Ju ${RUN}`, { pro: S.marcosId });
  const kai = await bookVerified(`Kai ${RUN}`, { pro: S.marcosId });
  const lia = await bookVerified(`Lia ${RUN}`, { pro: S.ronaldId }); // do colega: Marcos NÃO pode ver
  S.pro = { ju, kai, lia };
  const profLogin = await login(S.marcos.email, S.marcos.password);
  S.marcos.token = profLogin.token;

  const { ctx, page } = await newPage(browser, device, 'profissional');
  try {
    await page.goto(`${URLS.front}/login`, { waitUntil: 'networkidle' });
    await page.getByLabel('E-mail').fill(S.marcos.email);
    await page.getByPlaceholder('••••••••').fill(S.marcos.password);
    await page.getByRole('button', { name: /^Entrar/ }).click();
    const inPortal = await page.waitForURL(/\/professional\//, { timeout: 30_000 }).then(() => true).catch(() => false);
    check('D1', 'Profissional entra pelo login e cai no portal dele', inPortal, page.url());
    await page.goto(`${URLS.front}/professional/agenda`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Minha Agenda' }).waitFor({ timeout: 20_000 });
    await page.waitForTimeout(1200);
    const verTodos = page.getByRole('button', { name: /^Ver todos/ });
    if (await verTodos.count()) await verTodos.click(); // a caixa de pendentes mostra 2 por vez
    const text = await page.locator('main').innerText();
    const ownSeen = text.includes(ju.name) && text.includes(kai.name);
    const colleagueSeen = text.includes(lia.name) || [S.cli?.edu, S.cli?.fabi, S.cli?.gui].some(c => c && text.includes(c.name));
    await shot(page, `D2-minha-agenda-${tag}`);
    check('D2', 'Profissional vê os pedidos dele e NENHUM do colega', ownSeen && !colleagueSeen, `vê os dele=${ownSeen}; vê do colega=${colleagueSeen}`);
    const ox = await overflowX(page);
    check('D2b', 'Minha Agenda sem rolagem horizontal', ox <= 0, `overflowX=${ox}`);

    // D3 aceitar com o modal de segurança
    await wa.clear();
    await page.getByRole('button', { name: new RegExp(`^Aceitar: ${ju.name}`) }).click();
    const dlg = safetyDialog(page);
    const opened = await dlg.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
    if (opened) await dlg.getByText(/enviada automaticamente|não está ativo/).waitFor({ timeout: 8_000 }).catch(() => {}); // o aviso vem de uma consulta ao servidor
    const dlgText = opened ? await dlg.innerText() : '';
    await shot(page, `D3-modal-profissional-${tag}`);
    check('D3', 'Aceitar abre o modal de segurança também para o profissional', opened && dlgText.includes(ju.name) && /enviada automaticamente/.test(dlgText), dlgText.replace(/\n/g, ' ').slice(0, 140));
    await dlg.getByRole('button', { name: 'Voltar' }).click();
    await page.waitForTimeout(600);
    check('D3b', '"Voltar" não confirma', statusOf(ju.id) === 'pending');
    await page.getByRole('button', { name: new RegExp(`^Aceitar: ${ju.name}`) }).click();
    await safetyDialog(page).getByRole('button', { name: 'Sim, confirmar' }).click();
    const okJu = await waitStatus(ju.id, 'confirmed');
    const mJu = await wa.waitFor(wa.to(ju.ph.digits), 30_000);
    const bannerJu = await page.getByText(new RegExp(`Confirmação enviada para ${ju.first}`)).waitFor({ timeout: 25_000 }).then(() => true).catch(() => false);
    check('D3c', 'Profissional confirma: CONFIRMADO, mensagem automática ao cliente e aviso na tela dele', okJu && /confirmado/.test(mJu?.text ?? '') && bannerJu, `confirmado=${okJu}; msg=${!!mJu}; faixa=${bannerJu}`);

    // D4 recusar com confirmação
    await wa.clear();
    await page.getByRole('button', { name: new RegExp(`^Recusar: ${kai.name}`) }).click();
    const refuse = page.getByRole('dialog', { name: 'Confirmar cancelamento' });
    const refuseOpen = await refuse.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
    await refuse.getByRole('button', { name: 'Confirmar' }).click();
    const okKai = await waitStatus(kai.id, 'cancelled');
    const mKai = await wa.waitFor(wa.to(kai.ph.digits), 30_000);
    check('D4', 'Profissional recusa (com confirmação): CANCELADO e o cliente recebe a recusa', refuseOpen && okKai && /Não conseguimos atender/.test(mKai?.text ?? ''), `modal=${refuseOpen}; cancelado=${okKai}; msg=${!!mKai}`);
  } finally { await ctx.close(); }

  // D5/D6 limites de acesso do profissional (API)
  const own = await api('PATCH', `/professional/appointments/${lia.id}/status`, { status: 'confirmed' }, S.marcos.token);
  check('D5', 'Profissional não consegue mexer no agendamento do colega (403)', own.status === 403, `status ${own.status}`);
  const adm = await api('GET', '/admin/appointments', undefined, S.marcos.token);
  check('D6', 'Profissional não acessa as rotas do dono (403)', adm.status === 403, `status ${adm.status}`);
  saveState();
});

// ═══ E. Do atendimento à finalização, lembretes, vencimento e números ═══════════════
phase('E', async ({ browser }) => {
  section('E. Atendimento, finalização, lembretes e conferência dos números');
  if (!S.token) { warn('E0', 'Fase A não rodou; pulando E'); return; }
  await wa.clear();
  const lara = await bookVerified(`Lara ${RUN}`, { pro: S.ronaldId });
  const fabi = S.cli?.fabi;
  const ju = S.pro?.ju;
  for (const c of [lara]) await api('PATCH', `/admin/appointments/${c.id}/status`, { status: 'confirmed' }, S.token);
  await wa.waitFor(m => wa.to(lara.ph.digits)(m) && /confirmado/.test(m.text), 20_000); // a aprovação sai sozinha; só depois limpa para medir o resto
  await wa.clear();

  const { ctx, page } = await loggedPage(browser, ownerSession(), 'dono-atendimento');
  try {
    await page.goto(`${URLS.front}/admin/appointments`, { waitUntil: 'networkidle' });
    // E1 concluir
    await page.getByRole('button', { name: new RegExp(`^Concluir: ${lara.name}`) }).click();
    const done = await waitStatus(lara.id, 'completed');
    await page.waitForTimeout(3000);
    const spam = (await wa.all()).filter(wa.to(lara.ph.digits));
    check('E1', 'Dono conclui o atendimento: COMPLETED, sem mensagem desnecessária ao cliente', done && spam.length === 0, `status=${statusOf(lara.id)}; mensagens ao cliente=${spam.length}`);
    // E2 falta
    if (fabi) {
      if (device === 'mobile') {
        await page.getByRole('button', { name: new RegExp(`^Mais ações: ${fabi.name}`) }).click();
        await page.getByRole('menuitem', { name: 'Marcar falta' }).click();
      } else {
        await page.getByRole('button', { name: new RegExp(`^Marcar falta: ${fabi.name}`) }).click();
      }
      const ns = await waitStatus(fabi.id, 'no_show');
      check('E2', 'Dono marca falta: NO_SHOW', ns, `status=${statusOf(fabi.id)}`);
    }
    await shot(page, `E2-agendamentos-depois-${tag}`);
  } finally { await ctx.close(); }

  // E3 estados finais não voltam atrás (API)
  const t1 = await api('PATCH', `/admin/appointments/${lara.id}/status`, { status: 'confirmed' }, S.token);
  const t2 = await api('PATCH', `/admin/appointments/${lara.id}/status`, { status: 'cancelled' }, S.token);
  const t3 = fabi ? await api('PATCH', `/admin/appointments/${fabi.id}/status`, { status: 'confirmed' }, S.token) : { status: 409 };
  check('E3', 'Concluído não volta (409) nem cancela (409); falta não volta a confirmado (409)', t1.status === 409 && t2.status === 409 && t3.status === 409, `concluído→confirmado ${t1.status}; concluído→cancelado ${t2.status}; falta→confirmado ${t3.status}`);

  // E4 profissional conclui (Ju foi confirmada na fase D)
  if (ju && statusOf(ju.id) === 'confirmed') {
    const { ctx: cp, page: pp } = await loggedPage(browser, { token: S.marcos.token, user: (await login(S.marcos.email, S.marcos.password)).user }, 'prof-atendimento');
    try {
      await pp.goto(`${URLS.front}/professional/agenda`, { waitUntil: 'networkidle' });
      await pp.getByRole('group', { name: 'Visão' }).getByRole('button', { name: /^Todos/ }).click();
      await pp.getByRole('button', { name: new RegExp(`^Concluir: ${ju.name}`) }).click();
      const okJu = await waitStatus(ju.id, 'completed');
      check('E4', 'Profissional conclui o atendimento dele: COMPLETED', okJu, `status=${statusOf(ju.id)}`);
    } finally { await cp.close(); }
  } else warn('E4', 'Sem agendamento confirmado do profissional (fase D não rodou)');

  // E5 lembretes: confirmado a ~2 h e a ~24 h recebe 1 lembrete; pendente e cancelado não
  const now = nowBR(); const toMin = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const nowMin = toMin(now.time);
  const pickSlot = async (date, lo, hi, svc = 'Corte E2E', pro = S.ronaldId) => {
    const sl = await api('GET', `/public/${S.slug}/book/slots?serviceIds=${S.services[svc]}&date=${date}&professionalId=${pro}`);
    return (sl.data ?? []).find(t => { const dm = (date === now.date ? 0 : (date === dayBR(1) ? 1440 : 2880)) + toMin(t) - nowMin; return dm >= lo && dm <= hi; });
  };
  const bookAt = async (name, date, startTime, pro) => {
    const ph = phone();
    const r = await api('POST', `/public/${S.slug}/book`, { name, phone: ph.masked, serviceIds: [S.services['Corte E2E']], professionalId: pro, date, startTime });
    const code = waCode(await wa.waitFor(wa.to(ph.digits), 20_000));
    const v = await api('POST', `/public/${S.slug}/book/verify`, { challengeId: r.data?.challengeId, code });
    return { name, first: name.split(' ')[0], ph, id: v.data?.booking?.items?.[0]?.id, date, startTime };
  };
  const slot2h = await pickSlot(now.date, 60, 140) ?? await pickSlot(dayBR(1), 60 + (1440 - nowMin), 140 + (1440 - nowMin));
  const slot24h = await pickSlot(dayBR(1), 21 * 60, 24 * 60, 'Corte E2E', S.marcosId);
  if (!slot2h || !slot24h) { warn('E5', 'Não achei horários nas janelas de 2 h e 24 h para testar lembretes', `2h=${slot2h}; 24h=${slot24h}`); }
  else {
    const day2h = (toMin(slot2h) + (0) - nowMin) >= 0 && (await api('GET', `/public/${S.slug}/book/slots?serviceIds=${S.services['Corte E2E']}&date=${now.date}&professionalId=${S.ronaldId}`)).data?.includes(slot2h) ? now.date : dayBR(1);
    const r2 = await bookAt(`Remi ${RUN}`, day2h, slot2h, S.ronaldId);            // confirmado → recebe
    const r3 = await bookAt(`Pedro ${RUN}`, day2h, slot2h === '00:00' ? '00:30' : (await pickSlot(day2h, 60, 140) === slot2h ? slot2h : slot2h), S.marcosId); // pendente → não recebe
    const r4 = await bookAt(`Cris ${RUN}`, dayBR(1), slot24h, S.marcosId);         // confirmado a ~24 h → recebe "amanhã"
    for (const c of [r2, r4]) await api('PATCH', `/admin/appointments/${c.id}/status`, { status: 'confirmed' }, S.token);
    await wa.clear();
    const gotRemi = await wa.waitFor(m => wa.to(r2.ph.digits)(m) && /Daqui a pouco|Lembrete/.test(m.text), 70_000);
    const gotCris = await wa.waitFor(m => wa.to(r4.ph.digits)(m) && /Lembrete/.test(m.text), 70_000);
    await sleep(35_000); // duas rodadas a mais do agendador: nada pode repetir
    const all = await wa.all();
    const countRemi = all.filter(m => wa.to(r2.ph.digits)(m) && /Daqui a pouco|Lembrete/.test(m.text)).length;
    const countCris = all.filter(m => wa.to(r4.ph.digits)(m) && /Lembrete/.test(m.text)).length;
    const pedro = all.filter(m => wa.to(r3.ph.digits)(m) && /Daqui a pouco|Lembrete/.test(m.text)).length;
    check('E5', 'Lembrete de 2 h: o confirmado recebe uma única vez', !!gotRemi && countRemi === 1, `recebeu=${!!gotRemi}; vezes=${countRemi}; texto="${(gotRemi?.text ?? '').replace(/\n/g, ' ').slice(0, 120)}"`);
    check('E5b', 'Lembrete de 24 h: o confirmado recebe uma única vez, com "amanhã"', !!gotCris && countCris === 1 && /amanhã/.test(gotCris?.text ?? ''), `recebeu=${!!gotCris}; vezes=${countCris}; texto="${(gotCris?.text ?? '').replace(/\n/g, ' ').slice(0, 120)}"`);
    check('E5c', 'Pedido ainda PENDENTE não recebe lembrete', pedro === 0, `lembretes=${pedro}`);
  }

  // E6 números batem entre banco e telas
  const q = s => sql(s)[0]?.[0] ?? '0';
  const completedSum = Number(q(`select coalesce(sum(price),0) from appointments where tenant_id='${S.tenantId}' and status='completed'`));
  const cancNo = Number(q(`select count(*) from appointments where tenant_id='${S.tenantId}' and status in ('cancelled','no_show') and updated_at >= now() - interval '7 days'`));
  const counts = Object.fromEntries(sql(`select status, count(*) from appointments where tenant_id='${S.tenantId}' group by 1`).map(r => [r[0], Number(r[1])]));
  const { ctx: c6, page: p6 } = await loggedPage(browser, ownerSession(), 'dono-numeros');
  try {
    await p6.goto(`${URLS.front}/admin/dashboard`, { waitUntil: 'networkidle' });
    await p6.waitForTimeout(4500);
    const dash = await p6.locator('main').innerText();
    await shot(p6, `E6-painel-${tag}`);
    const revShown = digitsOf(dash).includes(digitsOf(completedSum.toFixed(2).replace('.', ',')));
    const cardTxt = await p6.locator('text=Cancelamentos e faltas recentes').first().locator('xpath=ancestor::div[contains(@class,"rounded")][1]').innerText().catch(() => '');
    check('E6', 'Painel: "Receita Total" = soma dos concluídos no banco', revShown, `banco=${money(completedSum)}`);
    check('E6b', 'Painel: cancelamentos + faltas dos últimos 7 dias batem com o banco', cardTxt.replace(/\s/g, '').includes(String(cancNo)), `banco=${cancNo}; card="${cardTxt.replace(/\n/g, ' ').slice(0, 80)}"`);

    await p6.goto(`${URLS.front}/admin/appointments`, { waitUntil: 'networkidle' });
    const opts = await p6.getByLabel('Status').evaluate(el => [...el.options].map(o => o.textContent));
    const want = { Pendentes: counts.pending ?? 0, Confirmados: counts.confirmed ?? 0, Concluídos: counts.completed ?? 0, Faltas: counts.no_show ?? 0, Cancelados: counts.cancelled ?? 0 };
    const okOpts = Object.entries(want).every(([k, v]) => opts.some(o => o === `${k} (${v})`));
    check('E6c', 'Agendamentos: contagem de cada status no filtro = banco', okOpts, `banco=${JSON.stringify(want)}; tela=${JSON.stringify(opts)}`);

    await p6.goto(`${URLS.front}/admin/reports`, { waitUntil: 'networkidle' });
    await p6.getByRole('radio', { name: 'Ano' }).click();
    await p6.waitForTimeout(800);
    const rep = await p6.locator('main').innerText();
    await shot(p6, `E6d-relatorio-${tag}`);
    const yearSum = Number(q(`select coalesce(sum(price),0) from appointments where tenant_id='${S.tenantId}' and status='completed' and date like '${now.date.slice(0, 4)}-%'`));
    check('E6d', 'Relatórios (Ano): receita = soma dos concluídos do ano no banco', digitsOf(rep).includes(digitsOf(yearSum.toFixed(2).replace('.', ','))), `banco=${money(yearSum)}`);
  } finally { await c6.close(); }

  // E6e faturamento do profissional
  const marcosSum = Number(q(`select coalesce(sum(a.price),0) from appointments a join professionals p on p.id=a.professional_id where p.name='Marcos E2E' and p.tenant_id='${S.tenantId}' and a.status='completed' and a.date like '${now.date.slice(0, 7)}-%'`));
  const { ctx: c7, page: p7 } = await loggedPage(browser, { token: S.marcos.token, user: (await login(S.marcos.email, S.marcos.password)).user }, 'prof-faturamento');
  try {
    await p7.goto(`${URLS.front}/professional/revenue`, { waitUntil: 'networkidle' });
    await p7.waitForTimeout(1500);
    const pr = await p7.locator('main').innerText();
    await shot(p7, `E6e-faturamento-prof-${tag}`);
    check('E6e', 'Faturamento do profissional (mês) = concluídos dele no banco', digitsOf(pr).includes(digitsOf(marcosSum.toFixed(2).replace('.', ','))), `banco=${money(marcosSum)}`);
  } finally { await c7.close(); }

  // E7 nova tentativa da fila depois que o WhatsApp voltou (fase C4)
  if (S.retry) {
    const m = await wa.waitFor(wa.to(S.retry.phone), 120_000);
    check('E7', 'Depois que o WhatsApp volta, a fila reenvia a confirmação que tinha falhado (C4)', !!m && /confirmado/.test(m?.text ?? ''), m ? `entregue ${Math.round((new Date(m.at).getTime() - S.retry.since) / 1000)} s após o WhatsApp voltar` : 'não reenviou em 120 s');
  }

  // E8 pedido pendente que ninguém confirma vence e libera o horário (estabelecimento sem WhatsApp)
  if (S.nowa?.expiry) {
    const ex = S.nowa.expiry;
    const waitMs = Math.max(0, ex.createdAt + 4.5 * 60_000 - Date.now());
    if (waitMs > 0) { console.log(`  aguardando ${Math.round(waitMs / 1000)} s para o prazo de 3 min vencer...`); await sleep(waitMs); }
    const rows = sql(`select a.status from appointments a join clients c on c.id=a.client_id where c.name='${ex.name}'`);
    const slots = await api('GET', `/public/${S.nowa.slug}/book/slots?serviceIds=${S.nowa.serviceId}&date=${ex.date}`);
    const caio = sql(`select status from appointments where id='${S.nowa.caioId}'`)[0]?.[0];
    check('E8', 'Pedido sem confirmação vence e o horário volta a ficar livre', (rows.length === 0 || rows[0][0] === 'cancelled') && (slots.data ?? []).includes(ex.slot), `linhas=${JSON.stringify(rows)}; horário livre=${(slots.data ?? []).includes(ex.slot)}`);
    check('E8b', 'Quem já tocou em "Confirmar no WhatsApp" (Caio) NÃO vence: segue pendente aguardando o dono', caio === 'pending', `status=${caio}`);
  }
  saveState();
});

// ═══ F. Cliente depois de agendar ═════════════════════════════════════════════════
phase('F', async ({ browser }) => {
  section('F. Cliente cancela e reagenda');
  if (!S.token) { warn('F0', 'Fase A não rodou; pulando F'); return; }
  await wa.clear();
  const nina = await bookVerified(`Nina ${RUN}`, { pro: S.ronaldId, day: 3 });
  check('F0b', 'Confirmação por código devolve o X-Device-Token do aparelho (prova de posse)', !!nina.deviceToken && nina.deviceToken.length >= 30, `token=${nina.deviceToken ? nina.deviceToken.length + ' caracteres' : 'nenhum'}`);

  // F1 listar: exige o token do aparelho (G2) e devolve só os do dono
  const noTok = await api('GET', `/public/${S.slug}/my-appointments?clientId=${nina.clientId}`);
  const mine = await api('GET', `/public/${S.slug}/my-appointments?clientId=${nina.clientId}`, undefined, undefined, dev(nina.deviceToken));
  const mine2 = await api('GET', `/public/${S.slug}/book/my-appointments`, undefined, undefined, dev(nina.deviceToken));
  const noTok2 = await api('GET', `/public/${S.slug}/book/my-appointments`);
  check('F1', 'Listar "meus agendamentos": sem token 403 DEVICE_REQUIRED; com o token do aparelho 200 (por clientId e por /book/my-appointments)',
    noTok.status === 403 && noTok.raw?.code === 'DEVICE_REQUIRED' && noTok2.status === 403 && mine.status === 200 && mine2.status === 200 && JSON.stringify(mine.data).includes(nina.id) && JSON.stringify(mine2.data).includes(nina.id),
    `sem token=${noTok.status}/${noTok.raw?.code}; /book sem token=${noTok2.status}; com token=${mine.status}; /book com token=${mine2.status}`);

  const newSlots = await api('GET', `/public/${S.slug}/book/slots?serviceIds=${S.services['Corte E2E']}&date=${dayBR(3)}&professionalId=${S.ronaldId}`);
  const target = (newSlots.data ?? []).find(t => t !== nina.startTime);

  // F2a remarcar para data passada / além de 60 dias dá 400 INVALID_DATE e nada muda
  const rsPast = await api('PATCH', `/public/${S.slug}/appointments/${nina.id}/reschedule`, { date: dayBR(-1), startTime: '10:00' }, undefined, dev(nina.deviceToken));
  const rsFar = await api('PATCH', `/public/${S.slug}/appointments/${nina.id}/reschedule`, { date: dayBR(250), startTime: '10:00' }, undefined, dev(nina.deviceToken));
  const unchanged = sql(`select date, start_time from appointments where id='${nina.id}'`)[0] ?? [];
  check('F2a', 'Remarcar para ontem ou para daqui a 250 dias é recusado (400 INVALID_DATE) e o agendamento não muda',
    rsPast.status === 400 && rsPast.raw?.code === 'INVALID_DATE' && rsFar.status === 400 && rsFar.raw?.code === 'INVALID_DATE' && unchanged[0] === nina.date && unchanged[1]?.startsWith(nina.startTime),
    `ontem=${rsPast.status}/${rsPast.raw?.code}; +250=${rsFar.status}/${rsFar.raw?.code}; no banco=${unchanged.join(' ')}`);

  const rsNoTok = await api('PATCH', `/public/${S.slug}/appointments/${nina.id}/reschedule`, { clientId: nina.clientId, date: dayBR(3), startTime: target });
  const rs = await api('PATCH', `/public/${S.slug}/appointments/${nina.id}/reschedule`, { date: dayBR(3), startTime: target }, undefined, dev(nina.deviceToken)); // clientId opcional
  const after = sql(`select status, start_time from appointments where id='${nina.id}'`)[0] ?? [];
  const ownerResched = await wa.waitFor(m => wa.to(ownerPhoneDigits)(m) && /remarc/i.test(m.text), 30_000);
  check('F2', 'Cliente remarca (com o token, sem clientId): o horário muda e o dono é avisado; sem token é 403', rsNoTok.status === 403 && rs.status === 200 && after[1]?.startsWith(target) && !!ownerResched, `sem token=${rsNoTok.status}; com token=${rs.status}; novo horário=${after[1]}; status depois=${after[0]}; aviso ao dono=${!!ownerResched}`);

  await wa.clear();
  const cnNoTok = await api('PATCH', `/public/${S.slug}/appointments/${nina.id}/cancel`, { clientId: nina.clientId });
  const cn = await api('PATCH', `/public/${S.slug}/appointments/${nina.id}/cancel`, {}, undefined, dev(nina.deviceToken)); // clientId opcional
  const ownerCancel = await wa.waitFor(m => wa.to(ownerPhoneDigits)(m) && /cancel/i.test(m.text), 30_000);
  const freed = await api('GET', `/public/${S.slug}/book/slots?serviceIds=${S.services['Corte E2E']}&date=${dayBR(3)}&professionalId=${S.ronaldId}`);
  check('F3', 'Cliente cancela (com o token): CANCELADO, o dono é avisado e o horário volta a ficar livre; sem token é 403', cnNoTok.status === 403 && cn.status === 200 && statusOf(nina.id) === 'cancelled' && !!ownerCancel && (freed.data ?? []).includes(target), `sem token=${cnNoTok.status}; com token=${cn.status}; aviso ao dono=${!!ownerCancel}; horário livre=${(freed.data ?? []).includes(target)}`);

  // F5 remarcar um agendamento que o dono já tinha confirmado: volta a PENDENTE (dono aprova de novo), sem prazo, e o dono é avisado
  const otto = await bookVerified(`Otto ${RUN}`, { pro: S.ronaldId, day: 3 });
  await api('PATCH', `/admin/appointments/${otto.id}/status`, { status: 'confirmed' }, S.token);
  const ottoSlots = await api('GET', `/public/${S.slug}/book/slots?serviceIds=${S.services['Corte E2E']}&date=${dayBR(3)}&professionalId=${S.ronaldId}`);
  const ottoTarget = (ottoSlots.data ?? []).find(x => x !== otto.startTime);
  const ottoBefore = statusOf(otto.id);
  await wa.clear();
  const ottoRs = await api('PATCH', `/public/${S.slug}/appointments/${otto.id}/reschedule`, { date: dayBR(3), startTime: ottoTarget }, undefined, dev(otto.deviceToken));
  const ottoAfter = sql(`select status, start_time, confirm_by is null, client_confirmed_at is not null from appointments where id='${otto.id}'`)[0] ?? [];
  const ottoOwnerMsg = await wa.waitFor(m => wa.to(ownerPhoneDigits)(m) && /remarc/i.test(m.text), 30_000);
  check('F5', 'Remarcar um CONFIRMADO: volta a PENDENTE (confirm_by nulo, client_confirmed_at preenchido) e o dono é avisado',
    ottoBefore === 'confirmed' && ottoRs.status === 200 && ottoAfter[0] === 'pending' && ottoAfter[1]?.startsWith(ottoTarget) && ottoAfter[2] === 't' && ottoAfter[3] === 't' && !!ottoOwnerMsg,
    `antes=${ottoBefore}; resposta=${ottoRs.status}; depois=${ottoAfter.join(',')}; dono avisado=${!!ottoOwnerMsg}`);

  // F6 remarcar passa por toda a validação de um agendamento novo: o mesmo horário é recusado e nada muda
  const ottoSame = await api('PATCH', `/public/${S.slug}/appointments/${otto.id}/reschedule`, { date: dayBR(3), startTime: ottoTarget }, undefined, dev(otto.deviceToken));
  check('F6', 'Remarcar para o mesmo dia e horário atuais é recusado (400 SAME_SLOT) e o agendamento fica como estava',
    ottoSame.status === 400 && ottoSame.raw?.code === 'SAME_SLOT' && statusOf(otto.id) === 'pending',
    `resposta=${ottoSame.status}/${ottoSame.raw?.code}; status=${statusOf(otto.id)}`);

  // F4 "Meus agendamentos": a tela nova é testada no navegador pelo QA 2; aqui só o contrato da API (o token de Otto lista só o dele)
  const ottoList = await api('GET', `/public/${S.slug}/book/my-appointments`, undefined, undefined, dev(otto.deviceToken));
  const ottoIds = (ottoList.data ?? []).map(x => x.id);
  check('F4', 'GET /book/my-appointments com o token de um cliente lista os agendamentos dele e não os de outro', ottoList.status === 200 && ottoIds.includes(otto.id) && !ottoIds.includes(nina.id), `status=${ottoList.status}; ids=${ottoIds.length}; tem o de outro cliente=${ottoIds.includes(nina.id)}`);
  saveState();
});

// ═══ G. Regressão dos problemas já conhecidos ══════════════════════════════════════
phase('G', async () => {
  section('G. Regressão de problemas conhecidos (só observação)');
  if (!S.nowa?.token) { warn('G0', 'Fase N não rodou; pulando G'); return; }
  const slug = S.nowa.slug;
  // G1 vazamento de dados de cliente existente no modo pendente
  const ph = { masked: '(11) 97777-9999' };
  await api('POST', `/public/${slug}/book`, { name: `Vítima ${RUN}`, phone: ph.masked, serviceIds: [S.nowa.serviceId], professionalId: null, date: dayBR(3), startTime: (await api('GET', `/public/${slug}/book/slots?serviceIds=${S.nowa.serviceId}&date=${dayBR(3)}`)).data?.[2] });
  const atk = await api('POST', `/public/${slug}/book`, { name: 'Atacante', phone: ph.masked, serviceIds: [S.nowa.serviceId], professionalId: null, date: dayBR(3), startTime: (await api('GET', `/public/${slug}/book/slots?serviceIds=${S.nowa.serviceId}&date=${dayBR(3)}`)).data?.[4] });
  const leak = JSON.stringify(atk.data ?? {}).includes(`Vítima ${RUN}`) || JSON.stringify(atk.data ?? {}).includes('97777');
  check('G1', 'Pedido pendente não devolve nome/telefone/id do cliente já cadastrado', !leak && (atk.data?.client?.id ?? null) === null, `resposta=${JSON.stringify(atk.data?.client ?? null)}`);

  // G2 prova de posse (X-Device-Token) para cancelar/remarcar/listar
  const fixed = await bookVerified(`Teresa ${RUN}`, { pro: S.ronaldId, day: 4 });
  const outro = await bookVerified(`Ulisses ${RUN}`, { pro: S.ronaldId, day: 4 });
  const stolen = await api('PATCH', `/public/${S.slug}/appointments/${fixed.id}/cancel`, { clientId: fixed.clientId }); // só o UUID, sem token
  const stolenR = await api('PATCH', `/public/${S.slug}/appointments/${fixed.id}/reschedule`, { clientId: fixed.clientId, date: dayBR(5), startTime: fixed.startTime });
  const stolenL = await api('GET', `/public/${S.slug}/my-appointments?clientId=${fixed.clientId}`);
  const otherTok = await api('PATCH', `/public/${S.slug}/appointments/${fixed.id}/cancel`, { clientId: fixed.clientId }, undefined, dev(outro.deviceToken)); // token de OUTRO cliente + clientId da vítima
  const otherTok2 = await api('PATCH', `/public/${S.slug}/appointments/${fixed.id}/cancel`, {}, undefined, dev(outro.deviceToken)); // token de outro, sem clientId: o agendamento não é dele
  const fakeTok = await api('PATCH', `/public/${S.slug}/appointments/${fixed.id}/cancel`, {}, undefined, dev('token-inventado-0123456789012345678901234567890'));
  const crossTenant = await api('GET', `/public/${slug}/book/my-appointments`, undefined, undefined, dev(fixed.deviceToken)); // token válido, mas de OUTRO estabelecimento
  const still = statusOf(fixed.id);
  const denied = [stolen, stolenR, stolenL, otherTok, fakeTok, crossTenant];
  check('G2', 'Cancelar/remarcar/listar exigem o token do MESMO cliente: sem token, token de outro cliente, inventado e de outro estabelecimento dão 403 DEVICE_REQUIRED e nada muda',
    denied.every(r => r.status === 403 && r.raw?.code === 'DEVICE_REQUIRED') && otherTok2.status === 404 && still !== 'cancelled',
    `sem token: cancelar=${stolen.status} remarcar=${stolenR.status} listar=${stolenL.status}; token de outro+clientId=${otherTok.status}; token de outro sem clientId=${otherTok2.status}/${otherTok2.raw?.code}; inventado=${fakeTok.status}; outro estabelecimento=${crossTenant.status}; status do agendamento=${still}`);

  // G8 remarcar para um horário que outro cliente já ocupa (mesmo profissional e dia): 409, e nada muda
  const intoTaken = await api('PATCH', `/public/${S.slug}/appointments/${fixed.id}/reschedule`, { date: outro.date, startTime: outro.startTime }, undefined, dev(fixed.deviceToken));
  const fixedRow = sql(`select date, start_time from appointments where id='${fixed.id}'`)[0] ?? [];
  check('G8', 'Remarcar para um horário já ocupado por outro cliente é recusado (409 SCHEDULE_CONFLICT) e o agendamento não muda',
    intoTaken.status === 409 && intoTaken.raw?.code === 'SCHEDULE_CONFLICT' && fixedRow[0] === fixed.date && fixedRow[1]?.startsWith(fixed.startTime),
    `resposta=${intoTaken.status}/${intoTaken.raw?.code}; no banco=${fixedRow.join(' ')}`);

  // G9 celular (WhatsApp) obrigatório: cadastro do portal e cliente criado pelo dono
  const regNoPhone = await api('POST', `/public/${S.slug}/register/client`, { name: 'Sem Celular', email: `semcel-${tag}@e2e.test`, password: 'senha123' });
  const regBadPhone = await api('POST', `/public/${S.slug}/register/client`, { name: 'Celular Curto', email: `curto-${tag}@e2e.test`, phone: '99999-888', password: 'senha123' });
  const cliNoPhone = await api('POST', '/admin/clients', { name: 'Admin Sem Celular', email: `adm-semcel-${tag}@e2e.test` }, S.token);
  const created = sql(`select count(*) from clients where email in ('semcel-${tag}@e2e.test','curto-${tag}@e2e.test','adm-semcel-${tag}@e2e.test')`)[0]?.[0];
  check('G9', 'Celular (WhatsApp) é obrigatório: cadastro do portal sem celular e com celular curto, e cliente do dono sem celular, são recusados e nada é gravado',
    regNoPhone.status >= 400 && regNoPhone.status < 500 && regBadPhone.status === 400 && regBadPhone.raw?.code === 'INVALID_PHONE' && cliNoPhone.status >= 400 && cliNoPhone.status < 500 && created === '0',
    `portal sem celular=${regNoPhone.status}; celular curto=${regBadPhone.status}/${regBadPhone.raw?.code}; dono sem celular=${cliNoPhone.status}; gravados=${created}`);

  // G3 datas inválidas no /book
  const yesterday = await api('POST', `/public/${slug}/book`, { name: 'Passado', phone: '(11) 96666-1111', serviceIds: [S.nowa.serviceId], professionalId: null, date: dayBR(-1), startTime: '10:00' });
  const far = await api('POST', `/public/${slug}/book`, { name: 'Longe', phone: '(11) 96666-2222', serviceIds: [S.nowa.serviceId], professionalId: null, date: dayBR(250), startTime: '10:00' });
  const stored = sql(`select a.date, a.status from appointments a join clients c on c.id=a.client_id where c.name in ('Passado','Longe') order by a.date`);
  check('G3', 'Reserva pública rejeita data passada e data além de 60 dias com 400 INVALID_DATE e nada é gravado', yesterday.status === 400 && yesterday.raw?.code === 'INVALID_DATE' && far.status === 400 && far.raw?.code === 'INVALID_DATE' && stored.length === 0, `ontem=${yesterday.status}; +250 dias=${far.status}; gravados no banco=${JSON.stringify(stored)}`);

  // G4 endpoints antigos removidos
  const legacy = await api('POST', `/public/${slug}/booking`, { name: 'x' });
  check('G4', 'Endpoint antigo /booking não existe mais', [404, 405].includes(legacy.status), `status ${legacy.status}`);

  // G5 admin cadastra agendamento no passado
  const past = await api('POST', '/admin/appointments', { clientName: 'Retroativo', clientEmail: `retro-${tag}@e2e.test`, clientPhone: '(11) 95555-0001', professionalId: S.ronaldId, serviceId: S.services['Corte E2E'], date: dayBR(-2), startTime: '10:00' }, S.token);
  const pastHour = nowBR(-120);
  const past2 = await api('POST', '/admin/appointments', { clientName: 'Retroativo2', clientEmail: `retro2-${tag}@e2e.test`, clientPhone: '(11) 95555-0002', professionalId: S.ronaldId, serviceId: S.services['Corte E2E'], date: pastHour.date, startTime: pastHour.time }, S.token);
  const retro = sql(`select count(*) from appointments a join clients c on c.id=a.client_id where c.name like 'Retroativo%'`)[0]?.[0];
  check('G5', 'Admin não cria agendamento no passado (ontem e há 2 h): 400 INVALID_DATE e nada gravado', past.status === 400 && past.raw?.code === 'INVALID_DATE' && past2.status === 400 && past2.raw?.code === 'INVALID_DATE' && retro === '0', `dia passado=${past.status}/${past.raw?.code}; há 2 h=${past2.status}/${past2.raw?.code}; gravados=${retro}`);

  // G6 isolamento entre estabelecimentos
  const foreign = await api('PATCH', `/admin/appointments/${S.cli?.edu?.id ?? fixed.id}/status`, { status: 'cancelled' }, S.nowa.token);
  const list = await api('GET', '/admin/appointments', undefined, S.nowa.token);
  check('G6', 'Dono de outro estabelecimento não vê nem altera agendamentos alheios', [403, 404].includes(foreign.status) && !JSON.stringify(list.data ?? []).includes(fixed.id), `alterar=${foreign.status}; lista contém o alheio=${JSON.stringify(list.data ?? []).includes(fixed.id)}`);

  // G7 sem login
  const anon = await api('GET', '/admin/appointments');
  check('G7', 'Sem login as rotas do dono respondem 401/403', [401, 403].includes(anon.status), `status ${anon.status}`);
  saveState();
});

// ═══ H. Pendente com horário já passado vira cancelado sozinho ═════════════════════
// Não há como CRIAR um pendente no passado pela API (G3/G5): o roteiro cria pela API e RECUA a data/hora direto no banco isolado
// (nimbo-e2e-pg, só o agendamento criado aqui), como se o tempo tivesse passado. O backend sobe com APP_PENDING_EXPIRY_CHECK_MS=5000
// (stack.mjs), então o agendador roda a cada 5 s em vez de 60 s; a folga (app.pending.past-grace-minutes) fica no padrão, 15 min.
phase('H', async () => {
  section('H. Pendente que já passou do horário é cancelado sozinho');
  if (!S.token) { warn('H0', 'Fase A não rodou; pulando M'); return; }
  const setWhen = (id, w) => sql(`update appointments set date='${w.date}', start_time='${w.time}' where id='${id}' returning id`);
  const older = nowBR(-25), recent = nowBR(-5);
  const old = await bookVerified(`Helena ${RUN}`, { pro: S.marcosId, day: 5 });      // pendente, horário passou há 25 min
  const grace = await bookVerified(`Igor ${RUN}`, { pro: S.marcosId, day: 5 });      // pendente, passou há 5 min (dentro da folga)
  const conf = await bookVerified(`Joana ${RUN}`, { pro: S.marcosId, day: 5 });      // CONFIRMADO, passou há 25 min (não é pendente)
  const fut = await bookVerified(`Kleber ${RUN}`, { pro: S.marcosId, day: 5 });      // pendente no futuro
  await api('PATCH', `/admin/appointments/${conf.id}/status`, { status: 'confirmed' }, S.token);
  setWhen(old.id, older); setWhen(grace.id, recent); setWhen(conf.id, older);
  const goneOld = await waitStatus(old.id, 'cancelled', 40_000);
  await sleep(6000); // mais um ciclo do agendador (5 s) para os demais provarem que NÃO foram tocados
  const sts = { grace: statusOf(grace.id), conf: statusOf(conf.id), fut: statusOf(fut.id) };
  check('H1', 'Pendente cujo horário passou há 25 min vira CANCELADO sozinho (agendador de pendentes)', goneOld, `status=${statusOf(old.id)}`);
  check('H2', 'Dentro da folga de 15 min (5 min atrás) continua pendente; confirmado e pendente futuro não são tocados', sts.grace === 'pending' && sts.conf === 'confirmed' && sts.fut === 'pending', `folga=${sts.grace}; confirmado=${sts.conf}; futuro=${sts.fut}`);
  // H3 o cancelamento automático avisa o cliente (WhatsApp) e o dono
  const toClientCancel = await wa.waitFor(m => wa.to(old.ph.digits)(m) && /cancelado automaticamente/i.test(m.text), 30_000);
  const toOwnerCancel = await wa.waitFor(m => wa.to(ownerPhoneDigits)(m) && /cancelado automaticamente/i.test(m.text) && m.text.includes(old.name), 30_000);
  check('H3', 'Pedido cancelado sozinho porque o horário passou: o cliente e o dono recebem o aviso no WhatsApp',
    !!toClientCancel && !!toOwnerCancel, `cliente avisado=${!!toClientCancel}; dono avisado=${!!toOwnerCancel}`);

  // H4 aviso 24 h antes: pendente que o cliente já deixou com o estabelecimento e falta menos de 24 h (20 h)
  const warned = await bookVerified(`Lia ${RUN}`, { pro: S.marcosId, day: 5 });
  setWhen(warned.id, nowBR(60 * 20));
  const toClientWarn = await wa.waitFor(m => wa.to(warned.ph.digits)(m) && /ainda aguarda a confirmação/i.test(m.text), 30_000);
  const toOwnerWarn = await wa.waitFor(m => wa.to(ownerPhoneDigits)(m) && /ainda não foi aprovado/i.test(m.text) && m.text.includes(warned.name), 30_000);
  await sleep(6000); // mais um ciclo: o aviso não pode repetir
  const sentWarn = (await wa.all()).filter(m => /ainda aguarda a confirmação/i.test(m.text) && wa.to(warned.ph.digits)(m)).length;
  const stamps = { warned: sql(`select expiry_warned_at is not null from appointments where id='${warned.id}'`)[0]?.[0], far: sql(`select expiry_warned_at is not null from appointments where id='${fut.id}'`)[0]?.[0] };
  check('H4', 'Pendente que falta menos de 24 h: cliente e dono recebem o aviso de cancelamento automático uma única vez; o que está a dias de distância não é avisado',
    !!toClientWarn && !!toOwnerWarn && sentWarn === 1 && stamps.warned === 't' && stamps.far === 'f',
    `cliente=${!!toClientWarn}; dono=${!!toOwnerWarn}; mensagens ao cliente=${sentWarn}; carimbo do avisado=${stamps.warned}; carimbo do futuro=${stamps.far}`);
  saveState();
});

// ═══ M. "Meus agendamentos" (cliente com aparelho reconhecido: ver, remarcar, cancelar) ═══════════════
phase('M', async ({ browser }) => {
  section('M. Meus agendamentos (aparelho reconhecido)');
  if (!S.token || !S.services) { warn('M0', 'Fase A não rodou; pulando M'); return; }
  const svc = S.services['Corte E2E'];
  const li = (page, name) => page.locator('li.bk-appt').filter({ hasText: name });
  const sameWidth = async (page, id, desc) => { const ox = await overflowX(page); return check(id, desc, ox <= 0, `overflowX=${ox}`); };

  // cliente novo, pelo navegador: agenda com código do WhatsApp (o aparelho passa a ser reconhecido)
  const NAME = `Meus ${RUN}`;
  const ph = phone();
  const { ctx, page } = await newPage(browser, device, 'cliente-meus');
  try {
    const dayFar = dayBR(5);
    await page.goto(`${URLS.front}/${S.slug}/horario?s=${svc}&d=${dayFar}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.bk-slot', { timeout: 20_000 });
    const nSlots = await page.locator('.bk-slot').count();
    const slotBtn = page.locator('.bk-slot').nth(Math.min(8, nSlots - 1));
    const bookedTime = (await slotBtn.innerText()).trim();
    await slotBtn.click();
    await page.waitForURL(/dados/, { timeout: 15_000 });
    await wa.clear();
    await fillContact(page, NAME, ph);
    await page.getByRole('button', { name: 'Confirmar agendamento' }).click();
    await page.waitForURL(/codigo/, { timeout: 20_000 });
    const code = waCode(await wa.waitFor(wa.to(ph.digits), 20_000));
    await page.locator('#bk-code').fill(code ?? '');
    await page.getByRole('button', { name: /Confirmar|Verificar/ }).last().click();
    const done = await page.getByText('Agendamento confirmado!').waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
    const row = apptsOf(`c.name='${NAME}'`)[0] ?? [];
    const apptId = row[0];
    check('M0', 'Preparação: cliente agenda pelo navegador com código e o aparelho fica reconhecido', done && !!apptId && row[1] === 'pending', `agendamento=${JSON.stringify(row.slice(0, 5))}`);
    if (!apptId) return;

    // H1 StepDone → "Ver meus agendamentos"
    const toMine = page.getByRole('link', { name: /Ver meus agendamentos/ });
    const hasEntry = await toMine.count();
    await shot(page, `M1-done-entrada-${tag}`);
    await toMine.click();
    await page.waitForURL(/meus-agendamentos/, { timeout: 15_000 });
    await li(page, 'Corte E2E').first().waitFor({ timeout: 15_000 }).catch(() => {});
    const card = li(page, 'Corte E2E').first();
    const cardTxt = (await card.innerText().catch(() => '')).replace(/\n/g, ' ');
    await shot(page, `M1-meus-agendamentos-${tag}`);
    check('M1', 'Tela de confirmação oferece "Ver meus agendamentos" e a lista mostra o agendamento (serviço, dia, hora, situação)', hasEntry === 1 && /Corte E2E/.test(cardTxt) && cardTxt.includes(bookedTime) && /Aguardando confirmação/.test(cardTxt), `entrada=${hasEntry}; cartão="${cardTxt.slice(0, 130)}"`);
    await sameWidth(page, 'M1b', 'Meus agendamentos sem rolagem horizontal');

    // H2 o aparelho segue reconhecido: o cabeçalho da página inicial mostra o atalho; recarregar a lista mantém tudo
    await page.goto(`${URLS.front}/${S.slug}`, { waitUntil: 'networkidle' });
    const headLink = page.getByRole('link', { name: /^Meus agendamentos$/ });
    await headLink.waitFor({ timeout: 10_000 }).catch(() => {});
    const headSeen = await headLink.count();
    await shot(page, `M2-atalho-cabecalho-${tag}`);
    await headLink.click().catch(() => {});
    await page.waitForURL(/meus-agendamentos/, { timeout: 10_000 }).catch(() => {});
    await li(page, 'Corte E2E').first().waitFor({ timeout: 15_000 }).catch(() => {});
    await page.reload({ waitUntil: 'networkidle' });
    const afterReload = await li(page, 'Corte E2E').count();
    check('M2', 'Aparelho reconhecido: link "Meus agendamentos" no cabeçalho abre a lista (e ela sobrevive a recarregar)', headSeen === 1 && afterReload >= 1 && page.url().includes('meus-agendamentos'), `link=${headSeen}; cartões depois de recarregar=${afterReload}`);
    const hiddenOnPage = await page.getByRole('link', { name: /^Meus agendamentos$/ }).count();
    check('M2b', 'Dentro da própria tela o atalho do cabeçalho some (sem link para si mesmo)', hiddenOnPage === 0, `links=${hiddenOnPage}`);

    // H3 REMARCAR um agendamento CONFIRMADO: o novo horário vale, mas volta a PENDENTE e o dono é avisado
    await api('PATCH', `/admin/appointments/${apptId}/status`, { status: 'confirmed' }, S.token);
    await page.reload({ waitUntil: 'networkidle' });
    const tagConf = /Confirmado/.test((await li(page, 'Corte E2E').first().innerText().catch(() => '')));
    await wa.clear();
    await li(page, 'Corte E2E').first().getByRole('button', { name: /Remarcar/ }).click();
    await page.getByRole('heading', { name: /Remarcar horário/ }).waitFor({ timeout: 10_000 });
    await page.waitForSelector('.bk-slot', { timeout: 20_000 });
    await shot(page, `M3-remarcar-escolha-${tag}`);
    await sameWidth(page, 'M3a', 'Remarcar (escolha de dia e horário) sem rolagem horizontal');
    // escolhe outro DIA (o dia seguinte ao atual na faixa) e um horário diferente do atual
    const days = page.locator('.bk-day:not([disabled])');
    const nDays = await days.count();
    await days.nth(Math.min(2, nDays - 1)).click();
    await page.waitForSelector('.bk-slot', { timeout: 20_000 });
    const slots2 = page.locator('.bk-slot');
    const n2 = await slots2.count();
    const newSlot = slots2.nth(Math.min(3, n2 - 1));
    const newTime = (await newSlot.innerText()).trim();
    await newSlot.click();
    const confirmBox = page.getByRole('group', { name: 'Confirmar remarcação' });
    await confirmBox.waitFor({ timeout: 10_000 });
    const confirmTxt = (await confirmBox.innerText()).replace(/\n/g, ' ');
    await shot(page, `M3-remarcar-confirmar-${tag}`);
    await sameWidth(page, 'M3b', 'Remarcar (confirmação) sem rolagem horizontal');
    // "Escolher outro" volta à escolha sem alterar nada no banco
    await confirmBox.getByRole('button', { name: 'Escolher outro' }).click();
    await page.waitForSelector('.bk-slot', { timeout: 15_000 });
    const untouched = apptsOf(`a.id='${apptId}'`)[0] ?? [];
    check('M3c', '"Escolher outro" na confirmação não muda nada no banco', untouched[1] === 'confirmed' && untouched[3].startsWith(bookedTime), `banco=${JSON.stringify(untouched.slice(1, 4))}`);
    await page.locator('.bk-slot').nth(Math.min(3, (await page.locator('.bk-slot').count()) - 1)).click();
    await page.getByRole('group', { name: 'Confirmar remarcação' }).getByRole('button', { name: 'Confirmar remarcação' }).click();
    const notice = await page.getByText(/Pedimos uma nova confirmação ao estabelecimento/).waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
    await shot(page, `M3-remarcado-${tag}`);
    const after = apptsOf(`a.id='${apptId}'`)[0] ?? [];
    const ownerMsg = await wa.waitFor(m => wa.to(ownerPhoneDigits)(m) && /remarc/i.test(m.text), 30_000);
    check('M3', 'Remarcar confirmado: novo horário no banco, status volta a PENDENTE, aviso "nova confirmação" na tela e dono avisado no WhatsApp',
      tagConf && notice && after[1] === 'pending' && after[3].startsWith(newTime) && (after[2] !== untouched[2] || after[3] !== untouched[3]) && !!ownerMsg && /nova confirmação|confirmar de novo/.test(confirmTxt),
      `etiqueta confirmado=${tagConf}; aviso=${notice}; banco=${JSON.stringify(after.slice(1, 4))} (era ${untouched[2]} ${untouched[3]}); dono avisado=${!!ownerMsg}; texto="${confirmTxt.slice(0, 120)}"`);
    await sameWidth(page, 'M3d', 'Lista depois de remarcar sem rolagem horizontal');

    // H4 CANCELAR: confirmação inline ("Manter horário" não cancela; "Sim, cancelar" cancela, libera o horário e avisa o dono)
    await wa.clear();
    const mineCard = li(page, 'Corte E2E').first();
    await mineCard.getByRole('button', { name: /Cancelar/ }).click();
    const ask = page.getByRole('group', { name: 'Confirmar cancelamento' });
    await ask.waitFor({ timeout: 10_000 });
    await shot(page, `M4-cancelar-confirmar-${tag}`);
    await ask.getByRole('button', { name: 'Manter horário' }).click();
    const keptStatus = apptsOf(`a.id='${apptId}'`)[0]?.[1];
    check('M4a', '"Manter horário" não cancela nada', keptStatus === 'pending', `status=${keptStatus}`);
    await li(page, 'Corte E2E').first().getByRole('button', { name: /Cancelar/ }).click();
    await page.getByRole('group', { name: 'Confirmar cancelamento' }).getByRole('button', { name: 'Sim, cancelar' }).click();
    const cancelNotice = await page.getByText(/Agendamento cancelado/).waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
    const cancelled = await waitStatus(apptId, 'cancelled');
    const ownerCancel = await wa.waitFor(m => wa.to(ownerPhoneDigits)(m) && /cancel/i.test(m.text), 30_000);
    const histTxt = (await page.locator('main').innerText().catch(() => '')).replace(/\n/g, ' ');
    await shot(page, `M4-cancelado-${tag}`);
    check('M4', 'Cancelar: banco CANCELADO, aviso na tela, cartão vai para o Histórico e o dono é avisado no WhatsApp', cancelNotice && cancelled && !!ownerCancel && /Histórico/.test(histTxt) && /Cancelado/.test(histTxt), `aviso=${cancelNotice}; banco=${statusOf(apptId)}; dono avisado=${!!ownerCancel}`);
    await sameWidth(page, 'M4b', 'Lista com histórico sem rolagem horizontal');

    // H5 faltando menos de 1 hora: sem botões, com explicação (o horário é ajustado no banco ISOLADO do teste)
    const soon = nowBR(30);
    await page.goto(`${URLS.front}/${S.slug}/horario?s=${svc}&d=${dayBR(5)}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.bk-slot', { timeout: 20_000 });
    await page.locator('.bk-slot').nth(Math.min(12, (await page.locator('.bk-slot').count()) - 1)).click();
    await page.waitForURL(/dados/, { timeout: 15_000 });
    let pre = '';
    for (let i = 0; i < 12 && !pre; i++) { pre = await page.getByLabel(/Nome completo/).inputValue().catch(() => ''); if (!pre) await sleep(500); }
    await page.getByRole('button', { name: 'Confirmar agendamento' }).click();
    const done2 = await page.getByText('Agendamento confirmado!').waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
    const id2 = (apptsOf(`c.name='${NAME}' and a.status<>'cancelled'`)[0] ?? [])[0];
    check('M5a', 'Aparelho reconhecido agenda de novo sem pedir código (preparação do cenário "menos de 1 h")', done2 && !!id2, `agendamento=${id2}`);
    if (id2) {
      sql(`update appointments set date='${soon.date}', start_time='${soon.time}', status='confirmed' where id='${id2}'`);
      await page.getByRole('link', { name: /Ver meus agendamentos/ }).click();
      await page.waitForURL(/meus-agendamentos/, { timeout: 15_000 });
      await li(page, 'Corte E2E').first().waitFor({ timeout: 15_000 });
      const c2 = li(page, 'Corte E2E').first();
      const txt2 = (await c2.innerText()).replace(/\n/g, ' ');
      const btns = await c2.getByRole('button').count();
      await shot(page, `M5-menos-de-1h-${tag}`);
      check('M5', 'Faltando menos de 1 h: o cartão não tem botões e explica que é preciso falar com o estabelecimento', btns === 0 && /menos de 1 hora/.test(txt2), `botões=${btns}; texto="${txt2.slice(0, 150)}"`);
      await sameWidth(page, 'M5b', 'Cartão "menos de 1 h" sem rolagem horizontal');
      // a regra também vale no servidor: cancelar à força é recusado
      const token = await page.evaluate(s => localStorage.getItem(`nimbo_device_${s}`), S.slug);
      const forced = await api('PATCH', `/public/${S.slug}/appointments/${id2}/cancel`, {}, undefined, { 'X-Device-Token': token ?? '' });
      check('M5c', 'O servidor também recusa cancelar com menos de 1 h (400)', forced.status === 400 && statusOf(id2) === 'confirmed', `resposta=${forced.status}; status=${statusOf(id2)}`);
    }

    // H7 token inválido (aparelho "esquecido"): mensagem amigável em vez de erro técnico
    await page.evaluate(s => localStorage.setItem(`nimbo_device_${s}`, 'token-invalido'), S.slug);
    await page.goto(`${URLS.front}/${S.slug}/meus-agendamentos`, { waitUntil: 'networkidle' });
    const bad = await page.getByText(/Confirme seu celular para gerenciar seus agendamentos/).waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
    check('M7', 'Token do aparelho inválido: mensagem amigável "Confirme seu celular", sem erro técnico', bad, (await page.locator('main').innerText().catch(() => '')).replace(/\n/g, ' ').slice(0, 120));
  } finally { await ctx.close(); }

  // H6 aparelho SEM prova de posse (navegador novo): pede para confirmar o celular e leva ao início
  const { ctx: c6, page: p6 } = await newPage(browser, device, 'cliente-sem-token');
  try {
    await p6.goto(`${URLS.front}/${S.slug}`, { waitUntil: 'networkidle' });
    await sleep(1000);
    const noHeadLink = await p6.getByRole('link', { name: /^Meus agendamentos$/ }).count();
    await p6.goto(`${URLS.front}/${S.slug}/meus-agendamentos`, { waitUntil: 'networkidle' });
    const msg = await p6.getByText(/Confirme seu celular para gerenciar seus agendamentos/).waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
    const goHome = p6.getByRole('button', { name: 'Ir para o início' });
    const hasBtn = await goHome.count();
    await shot(p6, `M6-sem-token-${tag}`);
    const ox = await overflowX(p6);
    if (hasBtn) await goHome.click();
    await p6.waitForTimeout(800);
    const atHome = new URL(p6.url()).pathname.replace(/\/$/, '') === `/${S.slug}`;
    check('M6', 'Aparelho sem token: sem atalho no cabeçalho; a tela diz "Confirme seu celular" e o botão leva ao início', noHeadLink === 0 && msg && hasBtn === 1 && atHome && ox <= 0, `atalho=${noHeadLink}; mensagem=${msg}; botão=${hasBtn}; voltou ao início=${atHome}; overflowX=${ox}`);
  } finally { await c6.close(); }
  saveState();
});

// ═══ execução ═══════════════════════════════════════════════════════════════════
async function main() {
  const browser = await launch();
  try {
    for (const id of Object.keys(phases)) {
      if (only && !only.includes(id)) continue;
      try { await phases[id]({ browser }); }
      catch (e) { record(`${id}-ERRO`, `A fase ${id} parou por exceção`, 'fail', e.message.split('\n')[0]); console.error(e.stack); }
      saveState();
    }
  } finally { await browser.close(); }

  const out = path.join(here, only ? `results-${device}-${only.join('')}.json` : `results-${device}.json`);
  fs.writeFileSync(out, JSON.stringify({ device, tag, at: new Date().toISOString(), S: { ...S, token: undefined }, results, pageErrors }, null, 2));
  const n = s => results.filter(r => r.status === s).length;
  for (const e of pageErrors) console.log('  erro de página:', e.page, e.msg.slice(0, 160));
  console.log(`\nResumo (${device}): ${n('pass')} ok · ${n('fail')} falhas · ${n('warn')} ressalvas · ${pageErrors.length} erros de página → ${path.basename(out)}`);
}
main();
