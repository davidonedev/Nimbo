import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { setViewportWidth } from '@/test/setup';
import ProfAgendaView from './ProfAgendaView';
import { appt, day, profContext } from './testFixtures';

const updateAppointmentStatus = vi.fn(async () => {});
const cancelAppointment = vi.fn(async () => {});
let ctx = profContext();
vi.mock('@/context/ProfessionalContext', () => ({ useProfessional: () => ctx }));

const setWidth = (w: number) => { setViewportWidth(w); Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: w }); };
const setup = () => render(<ProfAgendaView />);
/** Cartões da lista (a caixa de pendentes também usa <li>, mas fica de fora). */
const cards = () => screen.getAllByRole('listitem').filter(li => !li.closest('ul[aria-label="Aguardando sua confirmação"]'));
const view = (name: RegExp | string) => within(screen.getByRole('group', { name: 'Visão' })).getByRole('button', { name });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-17T12:00:00'));
  updateAppointmentStatus.mockClear(); cancelAppointment.mockClear();
  ctx = profContext({
    updateAppointmentStatus, cancelAppointment, addAppointment: vi.fn(),
    appointments: [
      appt('a1', 'p1', 'c1', day(0), '14:00', 'confirmed'),
      appt('a2', 'p1', 'c2', day(0), '09:00', 'pending'),
      appt('a3', 'p1', 'c1', day(2), '10:00', 'confirmed'),
      appt('a4', 'p1', 'c2', day(-3), '10:00', 'completed'),
      appt('a5', 'p1', 'c2', day(-1), '16:00', 'cancelled'),
      appt('a6', 'p2', 'c3', day(0), '11:00', 'confirmed'),   // colega: nunca aparece
    ],
  });
});
afterEach(() => vi.useRealTimers());

describe('Minha Agenda (celular)', () => {
  beforeEach(() => setWidth(390));

  it('abre em Hoje, em ordem de horário, sem os agendamentos da colega e sem os cancelados', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Minha Agenda' })).toBeTruthy();
    expect(view(/^Hoje/).getAttribute('aria-pressed')).toBe('true');
    const cards = within(screen.getByRole('region', { name: /^Hoje/ })).getAllByRole('listitem');
    expect(cards.map(c => c.textContent)).toEqual([expect.stringContaining('09:00'), expect.stringContaining('14:00')]);
    expect(screen.queryByText('Carla Colega')).toBeNull();
  });

  it('as visões têm contagem e trocam a lista (Próximos, Anteriores, Todos)', () => {
    setup();
    expect(view('Hoje 2')).toBeTruthy();
    expect(view('Próximos 1')).toBeTruthy();
    expect(view('Anteriores 1')).toBeTruthy(); // o cancelado de ontem não conta
    expect(view('Todos 5')).toBeTruthy();

    fireEvent.click(view(/^Próximos/));
    expect(cards()).toHaveLength(1);
    fireEvent.click(view(/^Todos/));
    expect(cards()).toHaveLength(5); // inclui o cancelado
  });

  it('o resumo do topo mostra hoje, próximos e a receita dos concluídos', () => {
    setup();
    const resumo = screen.getByLabelText('Resumo da agenda');
    expect([...resumo.querySelectorAll('dd')].map(d => d.textContent?.replace(/\s/g, ' '))).toEqual(['2', '1', expect.stringContaining('80,00')]);
  });

  it('pedidos aguardando ficam numa caixa à parte, com Aceitar e Recusar', async () => {
    setup();
    const box = screen.getByRole('list', { name: 'Aguardando sua confirmação' });
    expect(within(box).getAllByRole('listitem')).toHaveLength(1);

    fireEvent.click(within(box).getByRole('button', { name: /^Aceitar:.*Bruno Alves/ }));
    await waitFor(() => expect(updateAppointmentStatus).toHaveBeenCalledWith('a2', 'confirmed'));

    fireEvent.click(within(box).getByRole('button', { name: /^Recusar:.*Bruno Alves/ }));
    expect(cancelAppointment).not.toHaveBeenCalled(); // recusar pede confirmação
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toMatch(/recusar este agendamento/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(cancelAppointment).toHaveBeenCalledWith('a2'));
  });

  it('cartão: ação principal em destaque e o resto no menu Mais', async () => {
    setup();
    const concluir = screen.getByRole('button', { name: /^Concluir:.*Ana Lima/ });
    expect(concluir.className).toContain('min-h-11');
    fireEvent.click(concluir);
    await waitFor(() => expect(updateAppointmentStatus).toHaveBeenCalledWith('a1', 'completed'));

    fireEvent.keyDown(screen.getAllByRole('button', { name: /^Mais ações:.*Ana Lima/ })[0], { key: 'Enter' });
    const menu = await screen.findByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map(i => i.textContent)).toEqual(['Marcar falta', 'Cancelar']);
  });

  it('os filtros ficam num painel que abre e fecha, e Limpar volta tudo', () => {
    setup();
    expect(screen.queryByLabelText('De')).toBeNull();
    const toggle = screen.getByRole('button', { name: /^Filtros/ });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(within(screen.getByRole('group', { name: 'Status' })).getByRole('button', { name: /^Confirmados/ }));
    expect(cards()).toHaveLength(1); // só o confirmado de hoje
    expect(screen.getByLabelText('1 filtro ativo')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Limpar filtros/ }));
    expect(cards()).toHaveLength(2);
  });

  it('busca por cliente ou serviço e mostra o vazio com orientação', () => {
    setup();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ninguém' } });
    expect(screen.getByText(/Nenhum agendamento com esses filtros/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(cards()).toHaveLength(2);
  });

  it('Hoje vazio oferece ir para os próximos', () => {
    ctx = profContext({ updateAppointmentStatus, cancelAppointment, appointments: [appt('a3', 'p1', 'c1', day(2), '10:00', 'confirmed')] });
    setup();
    expect(screen.getByText('Nenhum agendamento para hoje.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ver próximos (1)' }));
    expect(cards()).toHaveLength(1);
  });

  it('erro do servidor ao trocar o status aparece na tela', async () => {
    updateAppointmentStatus.mockRejectedValueOnce(new Error('falhou'));
    setup();
    fireEvent.click(screen.getByRole('button', { name: /^Concluir:.*Ana Lima/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível atualizar o agendamento');
  });
});

describe('Minha Agenda (desktop)', () => {
  beforeEach(() => setWidth(1280));

  it('mostra uma tabela com as ações como botões, sem o <select> com "Salvar" por linha', async () => {
    setup();
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull();

    fireEvent.click(within(rows[0]).getByRole('button', { name: /^Confirmar:/ }));
    await waitFor(() => expect(updateAppointmentStatus).toHaveBeenCalledWith('a2', 'confirmed'));
  });

  it('no desktop os filtros ficam sempre abertos', () => {
    setup();
    expect(screen.queryByRole('button', { name: /^Filtros/ })).toBeNull();
    expect(screen.getByLabelText('De')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Status' })).toBeTruthy();
  });
});
