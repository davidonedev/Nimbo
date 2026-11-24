import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { setViewportWidth } from '@/test/setup';
import { WeekStrip } from './WeekStrip';
import { CancellationsCard } from './CancellationsCard';

const base = { tenantId: 't', endTime: '10:00', price: 50, createdAt: '' };
const tenant = {
  clients: [{ id: 'c1', name: 'João Pereira' }, { id: 'c2', name: 'Maria Souza' }],
  professionals: [{ id: 'p1', name: 'Ana' }],
  services: [{ id: 's1', name: 'Corte' }],
  appointments: [
    { ...base, id: 'a2', clientId: 'c2', professionalId: 'p1', serviceId: 's1', date: '2026-11-26', startTime: '14:00', endTime: '14:30', status: 'pending' },
    { ...base, id: 'a1', clientId: 'c1', professionalId: 'p1', serviceId: 's1', date: '2026-11-26', startTime: '09:00', endTime: '09:30', status: 'confirmed' },
    { ...base, id: 'a3', clientId: 'c1', professionalId: 'p1', serviceId: 's1', date: '2026-11-26', startTime: '11:00', endTime: '11:30', status: 'cancelled' },
    { ...base, id: 'a4', clientId: 'c1', professionalId: 'p1', serviceId: 's1', date: '2026-11-27', startTime: '10:00', endTime: '10:30', status: 'completed' },
  ],
};
vi.mock('@/context/TenantContext', () => ({ useTenant: () => tenant }));

const week = [
  { date: '2026-11-24', count: 0 }, { date: '2026-11-25', count: 0 }, { date: '2026-11-26', count: 2 },
  { date: '2026-11-27', count: 1 }, { date: '2026-11-28', count: 0 }, { date: '2026-11-29', count: 0 }, { date: '2026-11-30', count: 0 },
];

const renderStrip = () => render(<WeekStrip week={week} today="2026-11-24" loading={false} error={false} onRetry={() => {}} />);

describe('WeekStrip: Próximos 7 dias', () => {
  beforeEach(() => setViewportWidth(390));

  it('mostra os 7 dias com a quantidade em texto e o total da semana', () => {
    renderStrip();
    expect(screen.getAllByRole('button')).toHaveLength(7);
    expect(screen.getByRole('button', { name: 'Qui, dia 26: 2 agendamentos' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sex, dia 27: 1 agendamento' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ter, dia 24 (hoje): livre' }).getAttribute('aria-current')).toBe('date');
    expect(screen.getByText('na semana', { exact: false }).textContent).toContain('3 agendamentos');
  });

  it('tocar num dia abre todos os agendamentos dele, por horário e sem os cancelados', () => {
    renderStrip();
    fireEvent.click(screen.getByRole('button', { name: 'Qui, dia 26: 2 agendamentos' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Quinta-feira, 26 de novembro')).toBeTruthy();
    expect(within(dialog).getByText('2 agendamentos')).toBeTruthy();
    const items = within(dialog).getAllByRole('listitem').map(li => li.textContent ?? '');
    expect(items).toHaveLength(2);
    expect(items[0]).toContain('João Pereira');
    expect(items[0]).toContain('09:00');
    expect(items[0]).toContain('Confirmado');
    expect(items[1]).toContain('Maria Souza');
    expect(items[1]).toContain('Pendente');
    expect(within(dialog).queryByText('11:00')).toBeNull();
  });

  it('dia livre abre um estado vazio com orientação, e o botão Fechar fecha', () => {
    renderStrip();
    fireEvent.click(screen.getByRole('button', { name: 'Qua, dia 25: livre' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Dia livre')).toBeTruthy();
    expect(within(dialog).getByText('Nenhum agendamento')).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('CancellationsCard: selo do período', () => {
  it('o selo "últimos 7 dias" fica numa linha só e nunca quebra', () => {
    render(<CancellationsCard data={{ total: 3, cancelled: 2, noShow: 1 }} loading={false} error={false} onRetry={() => {}} />);
    const badge = screen.getByText('7 dias', { exact: false }).closest('div') as HTMLElement;
    expect(badge.className).toContain('whitespace-nowrap');
    expect(badge.className).toContain('shrink-0');
    expect(badge.textContent).toContain('últimos');
    // em telas estreitas o "últimos" some e o selo vira só "7 dias"
    expect(badge.querySelector('span')?.className).toContain('hidden');
  });
});
