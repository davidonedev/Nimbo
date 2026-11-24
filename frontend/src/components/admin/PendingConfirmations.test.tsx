import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { setViewportWidth } from '@/test/setup';
import PendingConfirmations from './PendingConfirmations';

const updateAppointmentStatus = vi.fn(async () => {});
const confirmAppointments = vi.fn(async (ids: string[]) => ({ confirmed: ids.length, skipped: 0, confirmedIds: ids }));
const refresh = vi.fn(async () => {});

const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const inFuture = (min: number) => new Date(Date.now() + min * 60_000).toISOString();
const base = { tenantId: 't', professionalId: 'p1', serviceId: 's1', startTime: '17:00', endTime: '17:30', price: 45, createdAt: '' };

const tenant = {
  clients: [
    { id: 'c1', name: 'Maria Souza', phone: '(11) 98888-7777' },
    { id: 'c2', name: 'João Lima', phone: '(21) 97777-1234' },
    { id: 'c3', name: 'Ana Costa', phone: '(31) 96666-0000' },
  ],
  professionals: [{ id: 'p1', name: 'Carlos' }],
  services: [{ id: 's1', name: 'Corte' }],
  appointments: [] as Record<string, unknown>[],
  updateAppointmentStatus, confirmAppointments, refresh,
};
vi.mock('@/context/TenantContext', () => ({ useTenant: () => tenant }));

const fixtures = () => [
  // o cliente já confirmou no WhatsApp: aguarda o dono, sem prazo
  { ...base, id: 'a1', clientId: 'c1', date: tomorrow, status: 'pending', confirmBy: null, clientConfirmedAt: inFuture(-30) },
  // o cliente ainda não confirmou: tem prazo
  { ...base, id: 'a2', clientId: 'c2', date: tomorrow, status: 'pending', confirmBy: inFuture(90), clientConfirmedAt: null },
  // não devem aparecer: prazo vencido, já confirmado, data passada
  { ...base, id: 'a3', clientId: 'c3', date: tomorrow, status: 'pending', confirmBy: inFuture(-5), clientConfirmedAt: null },
  { ...base, id: 'a4', clientId: 'c3', date: tomorrow, status: 'confirmed', confirmBy: null, clientConfirmedAt: null },
  { ...base, id: 'a5', clientId: 'c3', date: '2020-01-01', status: 'pending', confirmBy: null, clientConfirmedAt: inFuture(-30) },
];

describe('PendingConfirmations', () => {
  beforeEach(() => {
    tenant.appointments = fixtures();
    updateAppointmentStatus.mockClear(); confirmAppointments.mockClear(); refresh.mockClear();
    setViewportWidth(1280);
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1280 });
  });

  it('não aparece quando não há pendentes', () => {
    tenant.appointments = [];
    const { container } = render(<PendingConfirmations />);
    expect(container.textContent).toBe('');
  });

  it('separa quem o cliente já confirmou de quem ainda não, e esconde vencidos, decididos e passados', () => {
    render(<PendingConfirmations />);
    expect(screen.getByText('Aguardando confirmação')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /O cliente já confirmou \(1\)/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Ainda não confirmou \(1\)/ })).toBeTruthy();
    expect(screen.getByText('Maria Souza')).toBeTruthy();
    expect(screen.getByText('João Lima')).toBeTruthy();
    expect(screen.queryByText('Ana Costa')).toBeNull();
    expect(screen.getByText(/horário reservado até você confirmar/)).toBeTruthy();
    expect(screen.getByText(/O cliente tem até/)).toBeTruthy();
  });

  it('cada linha tem o WhatsApp do cliente com a mensagem pronta', () => {
    render(<PendingConfirmations />);
    const link = screen.getAllByRole('link', { name: /WhatsApp/ })[0];
    expect(link.getAttribute('href')).toContain('https://wa.me/5511988887777?text=');
    expect(decodeURIComponent(link.getAttribute('href') ?? '')).toContain('Recebi seu pedido de horário (Corte)');
  });

  it('confirma um agendamento sem modal', async () => {
    render(<PendingConfirmations />);
    const group = screen.getByRole('list', { name: /já confirmou/ });
    fireEvent.click(within(group).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(updateAppointmentStatus).toHaveBeenCalledWith('a1', 'confirmed'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('confirmar em massa pede confirmação num modal de aviso; "Voltar" não confirma nada', async () => {
    render(<PendingConfirmations />);
    const bulk = () => screen.getByRole('button', { name: /Confirmar selecionados/ }) as HTMLButtonElement;
    expect(screen.queryByRole('button', { name: /Confirmar selecionados/ })).toBeNull(); // a barra só aparece ao marcar alguém

    fireEvent.click(screen.getByLabelText('Selecionar todos'));
    expect(bulk().textContent).toContain('(2)');
    fireEvent.click(bulk());

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Confirmar 2 agendamentos de uma vez\?/)).toBeTruthy();
    expect(dialog.textContent).toMatch(/sem conferir um por um/);
    expect(dialog.textContent).toMatch(/mensagem de confirmação desses clientes no WhatsApp/);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Voltar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(confirmAppointments).not.toHaveBeenCalled();
  });

  it('"Sim, confirmar" confirma todos os selecionados de uma vez e avisa o resultado', async () => {
    render(<PendingConfirmations />);
    fireEvent.click(screen.getByLabelText('Selecionar todos'));
    fireEvent.click(screen.getByRole('button', { name: /Confirmar selecionados/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Sim, confirmar 2/ }));

    await waitFor(() => expect(confirmAppointments).toHaveBeenCalledWith(['a1', 'a2']));
    expect(await screen.findByText('2 agendamentos confirmados.')).toBeTruthy();
  });

  it('"Selecionar este grupo" seleciona só os que o cliente já confirmou', () => {
    render(<PendingConfirmations />);
    const confirmedSection = screen.getByRole('heading', { name: /já confirmou/ }).closest('section') as HTMLElement;
    fireEvent.click(within(confirmedSection).getByRole('button', { name: 'Selecionar este grupo' }));
    expect(screen.getByRole('button', { name: /Confirmar selecionados \(1\)/ })).toBeTruthy();
  });

  it('a barra de confirmar em massa só aparece com algo marcado e mostra quantos', () => {
    render(<PendingConfirmations />);
    expect(screen.queryByText(/selecionado/)).toBeNull();
    fireEvent.click(screen.getByLabelText(/^Selecionar João Lima/));
    expect(screen.getByText('1 selecionado')).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/^Selecionar João Lima/));
    expect(screen.queryByText(/selecionado/)).toBeNull();
  });

  it('com um só pendente não há seleção em massa', () => {
    tenant.appointments = fixtures().slice(0, 1);
    render(<PendingConfirmations />);
    expect(screen.queryByLabelText('Selecionar todos')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Selecionar este grupo' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeTruthy();
  });

  it('o texto explicativo fica atrás de "Como funciona?"', () => {
    render(<PendingConfirmations />);
    const details = screen.getByText('Como funciona?').closest('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.textContent).toMatch(/3 horas/);
  });

  it('no celular abre recolhida, com resumo, e "Revisar" abre a lista', () => {
    setViewportWidth(390);
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 390 });
    render(<PendingConfirmations />);
    const toggle = screen.getByRole('button', { name: /Aguardando confirmação/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Maria Souza')).toBeNull();
    expect(screen.getByText(/1 já confirmou no WhatsApp/)).toBeTruthy();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Maria Souza')).toBeTruthy();
  });

  it('mostra o erro quando a confirmação em massa falha, sem sumir com a lista', async () => {
    confirmAppointments.mockRejectedValueOnce(new Error('Falha de rede'));
    render(<PendingConfirmations />);
    fireEvent.click(screen.getByLabelText('Selecionar todos'));
    fireEvent.click(screen.getByRole('button', { name: /Confirmar selecionados/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Sim, confirmar 2/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('Falha de rede');
    expect(screen.getByText('Maria Souza')).toBeTruthy();
  });
});
