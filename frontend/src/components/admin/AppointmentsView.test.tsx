import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { setViewportWidth } from '@/test/setup';
import { MemoryRouter } from 'react-router-dom';
import AppointmentsView from './AppointmentsView';
import { confirmInSafetyDialog } from '@/test/confirmDialog';

/** A busca mora na URL (?q=), então a tela precisa de um Router. */
const renderView = (url = '/admin/appointments') =>
  render(<MemoryRouter initialEntries={[url]}><AppointmentsView /></MemoryRouter>);

const updateAppointmentStatus = vi.fn(async () => {});

const base = { tenantId: 't', startTime: '09:00', endTime: '09:30', price: 50, createdAt: '' };
const tenant = {
  clients: [
    { id: 'c1', name: 'João Pereira', email: 'joao@mail.com', phone: '(11) 98888-7777' },
    { id: 'c2', name: 'Maria Souza', email: 'maria@mail.com', phone: '(21) 97777-1234' },
  ],
  professionals: [{ id: 'p1', name: 'Ana' }, { id: 'p2', name: 'Bruno' }],
  services: [{ id: 's1', name: 'Corte', duration: 30 }, { id: 's2', name: 'Barba', duration: 30 }],
  appointments: [
    { ...base, id: 'a1', clientId: 'c1', professionalId: 'p1', serviceId: 's1', date: '2026-11-10', status: 'confirmed' },
    { ...base, id: 'a2', clientId: 'c2', professionalId: 'p2', serviceId: 's2', date: '2026-11-12', status: 'pending' },
    { ...base, id: 'a3', clientId: 'c1', professionalId: 'p1', serviceId: 's2', date: '2026-11-20', status: 'completed' },
  ],
  updateAppointmentStatus,
};
vi.mock('@/context/TenantContext', () => ({ useTenant: () => tenant }));

const dataRows = () => screen.getAllByRole('row').slice(1);
const rowText = () => dataRows().map(r => r.textContent ?? '');

describe('AppointmentsView (desktop)', () => {
  beforeEach(() => { setViewportWidth(1280); Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1280 }); updateAppointmentStatus.mockClear(); });

  it('lista os agendamentos do mais recente ao mais antigo, com contagem', () => {
    renderView();
    expect(screen.getByRole('heading', { name: 'Agendamentos' })).toBeTruthy();
    expect(screen.getByText('3 agendamentos encontrados')).toBeTruthy();
    expect(rowText()[0]).toContain('20/11/2026');
    expect(rowText()[2]).toContain('10/11/2026');
  });

  it('tem filtros de período, status, profissional, serviço e busca', () => {
    renderView();
    // todos são caixas de seleção (ou campos de data), não chips
    for (const name of ['Status', 'Período', 'Profissional', 'Serviço']) expect(screen.getByLabelText(name).tagName).toBe('SELECT');
    for (const name of ['De', 'Até']) expect((screen.getByLabelText(name) as HTMLInputElement).type).toBe('date');
    expect(screen.getByRole('searchbox', { name: /nome, e-mail ou telefone/i })).toBeTruthy();
    // o painel de filtros fica sempre aberto no desktop, sem botão para abrir
    expect(screen.queryByRole('button', { name: /^Filtros/ })).toBeNull();
  });

  it('o seletor de status mostra a contagem de cada opção e filtra a lista', () => {
    renderView();
    const status = screen.getByLabelText('Status') as HTMLSelectElement;
    expect([...status.options].map(o => o.textContent)).toEqual(['Todos (3)', 'Pendentes (1)', 'Confirmados (1)', 'Concluídos (1)', 'Faltas (0)', 'Cancelados (0)']);

    fireEvent.change(status, { target: { value: 'pending' } });
    expect(dataRows()).toHaveLength(1);
    expect(rowText()[0]).toContain('Maria Souza');

    fireEvent.change(status, { target: { value: 'all' } });
    expect(dataRows()).toHaveLength(3);
  });

  it('a contagem do seletor respeita os outros filtros (busca, período, profissional, serviço)', () => {
    renderView();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'joão' } });
    const status = screen.getByLabelText('Status') as HTMLSelectElement;
    expect([...status.options].slice(0, 2).map(o => o.textContent)).toEqual(['Todos (2)', 'Pendentes (0)']);
  });

  describe('atalhos de período', () => {
    beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-12T15:00:00Z')); }); // quinta-feira
    afterEach(() => vi.useRealTimers());

    it('Hoje, Esta semana e Este mês preenchem De/Até e filtram; Todas as datas limpa', () => {
      renderView();
      const periodo = screen.getByLabelText('Período') as HTMLSelectElement;
      expect([...periodo.options].map(o => o.textContent)).toEqual(['Todas as datas', 'Hoje', 'Amanhã', 'Esta semana', 'Este mês']);

      fireEvent.change(periodo, { target: { value: 'today' } });
      expect((screen.getByLabelText('De') as HTMLInputElement).value).toBe('2026-11-12');
      expect((screen.getByLabelText('Até') as HTMLInputElement).value).toBe('2026-11-12');
      expect(dataRows()).toHaveLength(1);
      expect(rowText()[0]).toContain('Maria Souza');

      fireEvent.change(periodo, { target: { value: 'week' } }); // seg 09/11 a dom 15/11
      expect((screen.getByLabelText('De') as HTMLInputElement).value).toBe('2026-11-09');
      expect((screen.getByLabelText('Até') as HTMLInputElement).value).toBe('2026-11-15');
      expect(dataRows()).toHaveLength(2);

      fireEvent.change(periodo, { target: { value: 'month' } });
      expect(dataRows()).toHaveLength(3);
      expect(periodo.value).toBe('month');

      fireEvent.change(periodo, { target: { value: 'all' } });
      expect((screen.getByLabelText('De') as HTMLInputElement).value).toBe('');
      expect(periodo.value).toBe('all');
    });

    it('o resumo do topo mostra hoje, pendentes e próximos 7 dias, sem depender dos filtros', () => {
      renderView();
      const resumo = screen.getByLabelText('Resumo dos agendamentos');
      expect(resumo.textContent).toContain('Hoje');
      const valores = [...resumo.querySelectorAll('dd')].map(d => d.textContent);
      expect(valores).toEqual(['1', '1', '1']); // a2 (12/11, pendente) é o único de hoje e da semana; a1 é anterior e a3 é depois
      fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ninguém' } });
      expect([...resumo.querySelectorAll('dd')].map(d => d.textContent)).toEqual(['1', '1', '1']);
    });

    it('um período digitado à mão aparece como "Personalizado" no seletor', () => {
      renderView();
      fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-11-11' } });
      const periodo = screen.getByLabelText('Período') as HTMLSelectElement;
      expect(periodo.value).toBe('custom');
      expect(periodo.selectedOptions[0].textContent).toBe('Personalizado');
    });
  });
  it('filtra por período', () => {
    renderView();
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-11-11' } });
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-11-15' } });
    expect(dataRows()).toHaveLength(1);
    expect(rowText()[0]).toContain('Maria Souza');
  });

  it('filtra por status, profissional e serviço', () => {
    renderView();
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'completed' } });
    expect(dataRows()).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('Profissional'), { target: { value: 'p2' } });
    expect(rowText()[0]).toContain('Maria Souza');
    fireEvent.change(screen.getByLabelText('Profissional'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('Serviço'), { target: { value: 's2' } });
    expect(dataRows()).toHaveLength(2);
  });

  it('abre já filtrada pela busca da URL (?q=), como vem da busca global da navbar', () => {
    renderView('/admin/appointments?q=maria');
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('maria');
    expect(dataRows()).toHaveLength(1);
    expect(rowText()[0]).toContain('Maria');
  });

  it('busca por nome, e-mail e telefone', () => {
    renderView();
    const box = screen.getByRole('searchbox');
    fireEvent.change(box, { target: { value: 'maria' } });
    expect(dataRows()).toHaveLength(1);
    fireEvent.change(box, { target: { value: 'joao@mail.com' } });
    expect(dataRows()).toHaveLength(2);
    fireEvent.change(box, { target: { value: '98888' } });
    expect(dataRows()).toHaveLength(2);
  });

  it('mostra estado vazio e "Limpar filtros" restaura a lista', () => {
    renderView();
    const clear = screen.getByRole('button', { name: /limpar filtros/i });
    expect((clear as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ninguém' } });
    expect(screen.getByText(/nenhum agendamento com esses filtros/i)).toBeTruthy();
    expect(screen.getByText('Nenhum agendamento encontrado')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /limpar filtros/i })).toHaveLength(2); // o do painel e o do estado vazio
    fireEvent.click(clear);
    expect(dataRows()).toHaveLength(3);
  });

  it('avisa quando o período está invertido', () => {
    renderView();
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-11-20' } });
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-11-10' } });
    expect(screen.getByRole('alert').textContent).toMatch(/data inicial/i);
  });

  it('confirma um agendamento pendente', async () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /^Confirmar:.*Maria Souza/ }));
    await confirmInSafetyDialog();
    await waitFor(() => expect(updateAppointmentStatus).toHaveBeenCalledWith('a2', 'confirmed'));
  });

  it('conclui e marca falta sem confirmação extra', async () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /^Concluir:.*João Pereira/ }));
    await waitFor(() => expect(updateAppointmentStatus).toHaveBeenCalledWith('a1', 'completed'));
    fireEvent.click(screen.getByRole('button', { name: /^Marcar falta:.*João Pereira/ }));
    await waitFor(() => expect(updateAppointmentStatus).toHaveBeenCalledWith('a1', 'no_show'));
  });

  it('cancelar pede confirmação e só então chama a API', async () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /^Cancelar:.*Maria Souza/ }));
    expect(updateAppointmentStatus).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: 'Cancelar agendamento' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar agendamento' }));
    await waitFor(() => expect(updateAppointmentStatus).toHaveBeenCalledWith('a2', 'cancelled'));
  });

  it('agendamento concluído não tem ações', () => {
    renderView();
    expect(within(dataRows()[0]).getByText('Sem ações')).toBeTruthy();
  });
});

describe('AppointmentsView (celular)', () => {
  beforeEach(() => { Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 390 }); setViewportWidth(390); updateAppointmentStatus.mockClear(); });

  it('vira lista de cards agrupada por dia, sem tabela', () => {
    renderView();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toEqual(['Sexta, 20 de nov', 'Quinta, 12 de nov', 'Terça, 10 de nov']);
  });

  it('os filtros avançados ficam num painel que o botão Filtros abre e fecha', () => {
    renderView();
    expect(screen.queryByLabelText('Serviço')).toBeNull();
    const toggle = screen.getByRole('button', { name: /^Filtros/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    for (const name of ['De', 'Até', 'Profissional', 'Serviço']) expect(screen.getByLabelText(name)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Serviço'), { target: { value: 's2' } });
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByLabelText('1 filtro ativo')).toBeTruthy(); // contador no botão

    fireEvent.click(toggle);
    expect(screen.queryByLabelText('Serviço')).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(2); // o filtro continua valendo com o painel fechado
  });

  it('a busca também filtra os cards', () => {
    renderView();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'maria' } });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('pendente: Confirmar é a ação principal (44 px) e Concluir, Marcar falta e Cancelar vão para o menu Mais', async () => {
    renderView();
    const confirmar = screen.getByRole('button', { name: /^Confirmar:.*Maria Souza/ });
    expect(confirmar.className).toContain('min-h-11');
    expect(confirmar.className).toContain('flex-1');
    expect(screen.queryByRole('button', { name: /^Cancelar:.*Maria Souza/ })).toBeNull();

    fireEvent.keyDown(screen.getByRole('button', { name: /^Mais ações:.*Maria Souza/ }), { key: 'Enter' });
    const menu = await screen.findByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map(i => i.textContent)).toEqual(['Concluir', 'Marcar falta', 'Cancelar']);

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Cancelar' }));
    expect(updateAppointmentStatus).not.toHaveBeenCalled(); // cancelar continua pedindo confirmação
    const dialog = await screen.findByRole('dialog', { name: 'Cancelar agendamento' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar agendamento' }));
    await waitFor(() => expect(updateAppointmentStatus).toHaveBeenCalledWith('a2', 'cancelled'));
  });

  it('confirmado: Concluir é a ação principal; confirmar o pendente chama a API', async () => {
    renderView();
    expect(screen.getByRole('button', { name: /^Concluir:.*João Pereira.*10\/11/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Confirmar:.*Maria Souza/ }));
    await confirmInSafetyDialog();
    await waitFor(() => expect(updateAppointmentStatus).toHaveBeenCalledWith('a2', 'confirmed'));
  });

  it('ligar e WhatsApp do cliente ficam à mão; concluído não tem ação principal nem menu', () => {
    renderView();
    const [ligar] = screen.getAllByRole('link', { name: 'Ligar para Maria Souza' });
    expect(ligar.getAttribute('href')).toBe('tel:21977771234');
    expect(screen.getByRole('link', { name: 'Chamar Maria Souza no WhatsApp' }).getAttribute('href')).toBe('https://wa.me/5521977771234');
    const concluidoCard = screen.getAllByRole('listitem')[0]; // 20/11, concluído
    expect(within(concluidoCard).queryByRole('button')).toBeNull();
  });
});
