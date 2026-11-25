import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Appointment, Client, Service } from '@/types';
import { FALLBACK_CLIENT_NAME, useAppointmentNotifications } from './useAppointmentNotifications';

const ana = { id: 'c1', name: 'Ana Lima' } as unknown as Client;
const novo = { id: 'c9', name: 'Carla Nova' } as unknown as Client;
const services = [{ id: 's1', name: 'Corte' }] as unknown as Service[];
const mk = (id: string, clientId: string, status: Appointment['status'] = 'pending'): Appointment => ({
  id, tenantId: 't', clientId, professionalId: 'p1', serviceId: 's1', date: '2030-01-10', startTime: '09:45', endTime: '10:15',
  status, price: 50, createdAt: '',
} as Appointment);

type Props = { list: Appointment[]; cls: Client[] };
const setup = (initial: Props) =>
  renderHook(({ list, cls }: Props) => useAppointmentNotifications(list, cls, services, 'apn_c2c'), { initialProps: initial });

beforeEach(() => { localStorage.clear(); });

describe('aviso de novo pedido de um cliente que acabou de se cadastrar (C2c)', () => {
  it('mostra o nome quando agendamentos e clientes chegam no mesmo tick do polling', () => {
    const { result, rerender } = setup({ list: [mk('a1', 'c1', 'confirmed')], cls: [ana] });
    rerender({ list: [mk('a1', 'c1', 'confirmed'), mk('a2', 'c9')], cls: [ana, novo] });
    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0]).toMatchObject({ type: 'new_booking', clientName: 'Carla Nova', serviceName: 'Corte', time: '09:45' });
    expect(result.current.activeToasts[0].clientName).toBe('Carla Nova');
  });

  it('se o cliente ainda não está na lista, usa texto neutro e nunca o "—" cru', () => {
    const { result, rerender } = setup({ list: [], cls: [ana] });
    rerender({ list: [mk('a2', 'c9')], cls: [ana] });
    expect(result.current.notifications[0].clientName).toBe(FALLBACK_CLIENT_NAME);
    expect(FALLBACK_CLIENT_NAME).toBe('Novo cliente');
    expect(result.current.notifications[0].clientName).not.toBe('—');
    expect(result.current.notifications[0].serviceName).not.toBe('—');
  });
});
