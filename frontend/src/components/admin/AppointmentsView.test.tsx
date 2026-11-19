import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { setViewportWidth } from '@/test/setup';
import { MemoryRouter } from 'react-router-dom';
import AppointmentsView from './AppointmentsView';

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
    for (const name of ['De', 'Até', 'Status', 'Profissional', 'Serviço']) expect(screen.getByLabelText(name)).toBeTruthy();
    expect(screen.getByRole('searchbox', { name: /nome, e-mail ou telefone/i })).toBeTruthy();
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
  beforeEach(() => { Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 390 }); setViewportWidth(390); });

  it('vira lista de cards, sem tabela, com as mesmas ações e filtros', () => {
    renderView();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByLabelText('Serviço')).toBeTruthy();
    const btn = screen.getByRole('button', { name: /^Confirmar:.*Maria Souza/ });
    expect(btn.className).toContain('min-h-11');
  });

  it('a busca também filtra os cards', () => {
    renderView();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'maria' } });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });
});
