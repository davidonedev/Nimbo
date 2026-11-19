import { addDays, format } from 'date-fns';
import type { Appointment, AppointmentStatus, Client, Professional, Service, Tenant } from '@/types';

/** Massa de teste do portal do profissional: o profissional `p1`, uma colega `p2` e clientes de ambos. */
export const day = (offset: number) => format(addDays(new Date(), offset), 'yyyy-MM-dd');

export const PROFESSIONAL: Professional = {
  id: 'p1', tenantId: 't1', name: 'Marina Souza', specialty: 'Cabeleireira', avatar: 'MS', bio: '',
  services: ['s1'], workingHours: { start: '08:00', end: '18:00' }, workingDays: [1, 2, 3, 4, 5],
};

export const TENANT = { id: 't1', name: 'Studio Nimbo', primaryColor: '#7c3aed', adminColor: '#7c3aed' } as unknown as Tenant;

const client = (id: string, name: string, phone: string): Client =>
  ({ id, tenantId: 't1', name, email: `${name.split(' ')[0].toLowerCase()}@email.com`, phone, createdAt: '2026-01-01' });

export const CLIENTS: Client[] = [
  client('c1', 'Ana Lima', '(11) 91111-1111'),
  client('c2', 'Bruno Alves', '(11) 92222-2222'),
  client('c3', 'Carla Colega', '(11) 93333-3333'),   // só atendida pela colega
  client('c4', 'Diego Sem Agenda', '(11) 94444-4444'), // sem nenhum agendamento
];

export const SERVICES: Service[] = [
  { id: 's1', tenantId: 't1', name: 'Corte feminino', description: '', price: 80, duration: 60, category: 'Cabelo', isActive: true },
];

export const appt = (id: string, professionalId: string, clientId: string, date: string, startTime: string, status: AppointmentStatus = 'confirmed'): Appointment =>
  ({ id, tenantId: 't1', clientId, professionalId, serviceId: 's1', date, startTime, endTime: '10:00', status, price: 80, createdAt: '2026-01-01' });

export const APPOINTMENTS: Appointment[] = [
  appt('a1', 'p1', 'c1', day(0), '09:00', 'confirmed'),
  appt('a2', 'p1', 'c2', day(0), '14:00', 'pending'),
  appt('a3', 'p1', 'c1', day(2), '10:00', 'confirmed'),
  appt('a4', 'p2', 'c3', day(0), '11:00', 'confirmed'), // da colega
  appt('a5', 'p2', 'c3', day(3), '15:00', 'pending'),   // da colega
];

export const profContext = (overrides: Record<string, unknown> = {}) => ({
  professional: PROFESSIONAL, tenant: TENANT, appointments: APPOINTMENTS, clients: CLIENTS, allClients: CLIENTS, services: SERVICES, loading: false,
  ...overrides,
});
