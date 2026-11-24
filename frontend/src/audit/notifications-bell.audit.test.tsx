import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import type { Appointment, Client, Service } from '@/types';
import { useAppointmentNotifications } from '@/hooks/useAppointmentNotifications';
import { NotificationBell } from '@/components/ui/NotificationBell';

/**
 * AUDITORIA (Fase 2 · A2): o sino é a ÚNICA notificação "ao dono" quando o cliente agenda (não há WhatsApp/e-mail para isso).
 * Estes testes fixam o que ele faz e o que NÃO faz. Nada é enviado: só estado do navegador (localStorage).
 */
const clients = [{ id: 'c1', name: 'Ana Lima' }, { id: 'c2', name: 'Bruno Costa' }] as unknown as Client[];
const services = [{ id: 's1', name: 'Corte' }] as unknown as Service[];
const mk = (id: string, clientId: string, status: Appointment['status'], extra: Partial<Appointment> = {}): Appointment => ({
  id, tenantId: 't', clientId, professionalId: 'p1', serviceId: 's1', date: '2030-01-10', startTime: '10:00', endTime: '10:30',
  status, price: 50, createdAt: '', ...extra,
} as Appointment);

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.useRealTimers(); });

const setup = (initial: Appointment[]) =>
  renderHook(({ list }) => useAppointmentNotifications(list, clients, services, 'apn_audit'), { initialProps: { list: initial } });

describe('sino: novo agendamento, cancelamento e aprovação', () => {
  it('a 1ª carga não gera alertas (linha de base), mesmo com pendentes já existentes', () => {
    const { result } = setup([mk('a1', 'c1', 'pending')]);
    expect(result.current.notifications).toHaveLength(0);
    expect(result.current.unreadCount).toBe(0);
  });

  it('agendamento novo e pendente (chegou pelo polling) vira "new_booking" com contador', () => {
    const { result, rerender } = setup([mk('a1', 'c1', 'confirmed')]);
    rerender({ list: [mk('a1', 'c1', 'confirmed'), mk('a2', 'c2', 'pending')] });
    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0]).toMatchObject({ type: 'new_booking', clientName: 'Bruno Costa', serviceName: 'Corte', time: '10:00' });
    expect(result.current.unreadCount).toBe(1);
    act(() => result.current.markAllRead());
    expect(result.current.unreadCount).toBe(0);
  });

  it('cancelamento (cliente ou dono) vira "cancelled"; aprovar, concluir e falta NÃO geram notificação', () => {
    const { result, rerender } = setup([mk('a1', 'c1', 'pending'), mk('a2', 'c2', 'confirmed'), mk('a3', 'c1', 'confirmed')]);
    rerender({ list: [mk('a1', 'c1', 'confirmed'), mk('a2', 'c2', 'completed'), mk('a3', 'c1', 'no_show')] });
    expect(result.current.notifications).toHaveLength(0);
    rerender({ list: [mk('a1', 'c1', 'cancelled'), mk('a2', 'c2', 'completed'), mk('a3', 'c1', 'no_show')] });
    expect(result.current.notifications.map(n => n.type)).toEqual(['cancelled']);
  });

  it('agendamento que nasce confirmado (ex.: aparelho reconhecido) NÃO alerta o dono — só "pending" alerta', () => {
    const { result, rerender } = setup([]);
    rerender({ list: [mk('a1', 'c1', 'confirmed')] });
    expect(result.current.notifications).toHaveLength(0);
  });

  it('o histórico persiste no localStorage e sobrevive a recarregar a página', () => {
    const { result, rerender, unmount } = setup([]);
    rerender({ list: [mk('a1', 'c1', 'pending')] });
    expect(result.current.notifications).toHaveLength(1);
    unmount();
    const again = setup([]);
    expect(again.result.current.notifications).toHaveLength(1);
  });

  it('o que aconteceu com o painel fechado NÃO vira alerta ao abrir (a 1ª carga é só linha de base)', () => {
    // agendamentos pendentes que chegaram enquanto o dono estava offline: ao abrir, o hook inicia com a lista já cheia
    const { result } = setup([mk('a1', 'c1', 'pending'), mk('a2', 'c2', 'pending')]);
    expect(result.current.notifications).toHaveLength(0);
  });
});

describe('sino: "falta confirmar" 2 h e 1 h antes (só pendente que o cliente já confirmou)', () => {
  /** Horário de Brasília (UTC-3) daqui a `min` minutos, como o hook interpreta data+hora. */
  const brIn = (min: number) => {
    const iso = new Date(Date.now() + min * 60_000 - 3 * 3_600_000).toISOString();
    return { date: iso.slice(0, 10), startTime: iso.slice(11, 16) };
  };

  it('avisa aos ~2 h e de novo ~1 h antes, uma vez cada; sem confirmação do cliente não avisa', () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.setSystemTime(new Date('2030-01-10T12:00:00Z'));
    const withClientConfirm = mk('a1', 'c1', 'pending', { ...brIn(110), clientConfirmedAt: '2030-01-10T11:00:00Z' });
    const withoutConfirm = mk('a2', 'c2', 'pending', { ...brIn(110) });
    const { result } = setup([withClientConfirm, withoutConfirm]);

    act(() => { vi.advanceTimersByTime(2_000); });
    expect(result.current.notifications.map(n => [n.type, n.reminder, n.clientName])).toEqual([['pending_reminder', '2h', 'Ana Lima']]);

    act(() => { vi.advanceTimersByTime(30_000); }); // outro tick: não repete o de 2 h
    expect(result.current.notifications).toHaveLength(1);

    act(() => { vi.advanceTimersByTime(55 * 60_000); }); // faltam ~55 min: dispara o de 1 h
    expect(result.current.notifications.map(n => n.reminder)).toEqual(['1h', '2h']);

    act(() => { vi.advanceTimersByTime(10 * 60_000); }); // sem repetir
    expect(result.current.notifications).toHaveLength(2);
  });

  it('não avisa de agendamento já confirmado pelo dono nem de horário que já passou', () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.setSystemTime(new Date('2030-01-10T12:00:00Z'));
    const confirmed = mk('a1', 'c1', 'confirmed', { ...brIn(90), clientConfirmedAt: '2030-01-10T11:00:00Z' });
    const past = mk('a2', 'c2', 'pending', { ...brIn(-10), clientConfirmedAt: '2030-01-10T11:00:00Z' });
    const { result } = setup([confirmed, past]);
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(result.current.notifications).toHaveLength(0);
  });
});

describe('sino: componente (contador e lista)', () => {
  it('mostra o contador de não lidas no botão e limpa ao abrir', () => {
    const n = { id: 'n1', type: 'new_booking' as const, clientName: 'Ana Lima', serviceName: 'Corte', date: '2030-01-10', time: '10:00', timestamp: Date.now(), read: false };
    const markAllRead = vi.fn();
    render(<NotificationBell notifications={[n]} unreadCount={1} markAllRead={markAllRead} activeToasts={[]} dismissToast={() => {}} clearAll={() => {}} />);
    const btn = screen.getByRole('button', { name: 'Notificações (1 novas)' });
    expect(btn.textContent).toContain('1');
    fireEvent.click(btn);
    expect(markAllRead).toHaveBeenCalled();
    expect(screen.getByText('Ana Lima', { exact: false })).toBeTruthy();
  });
});
