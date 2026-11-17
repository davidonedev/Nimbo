import { describe, expect, it } from 'vitest';
import { searchAdmin, type SearchData } from './globalSearch';
import type { Appointment, Client, Professional, Service } from '@/types';

const client = (o: Partial<Client> & Pick<Client, 'id' | 'name'>): Client =>
  ({ tenantId: 't', email: `${o.id}@x.com`, phone: '', createdAt: '2026-01-01', ...o });
const service = (o: Partial<Service> & Pick<Service, 'id' | 'name'>): Service =>
  ({ tenantId: 't', description: '', price: 50, duration: 30, category: '', isActive: true, ...o });
const prof = (o: Partial<Professional> & Pick<Professional, 'id' | 'name'>): Professional =>
  ({ tenantId: 't', specialty: '', avatar: '', bio: '', services: [], workingHours: { start: '09:00', end: '18:00' }, workingDays: [1], ...o });
const appt = (o: Partial<Appointment> & Pick<Appointment, 'id' | 'clientId'>): Appointment =>
  ({ tenantId: 't', professionalId: 'p1', serviceId: 's1', date: '2026-11-10', startTime: '09:00', endTime: '09:30', status: 'confirmed', price: 50, createdAt: '2026-01-01', ...o });

const data = (over: Partial<SearchData> = {}): SearchData => ({
  clients: [
    client({ id: 'c1', name: 'José da Silva', phone: '(11) 98888-7777' }),
    client({ id: 'c2', name: 'Ana Lima', email: 'ana@lima.com', phone: null as unknown as string }),
  ],
  services: [service({ id: 's1', name: 'Corte masculino', category: 'Cabelo' }), service({ id: 's2', name: 'Barba' })],
  professionals: [prof({ id: 'p1', name: 'Marina Souza', specialty: 'Cabeleireira' })],
  appointments: [
    appt({ id: 'a1', clientId: 'c1', date: '2026-11-01' }),
    appt({ id: 'a2', clientId: 'c1', date: '2026-11-20' }),
    appt({ id: 'a3', clientId: 'c2', date: '2026-11-10', serviceId: 's2' }),
  ],
  navItems: [
    { id: 'n1', to: '/admin/clients', label: 'Clientes' },
    { id: 'n2', to: '/admin/services', label: 'Serviços' },
  ],
  ...over,
});

const titles = (rs: { title: string }[]) => rs.map(r => r.title);

describe('searchAdmin', () => {
  it('não busca com menos de 2 letras', () => {
    expect(searchAdmin(data(), '')).toEqual([]);
    expect(searchAdmin(data(), ' j ')).toEqual([]);
  });

  it('ignora acento e caixa', () => {
    expect(titles(searchAdmin(data(), 'JOSE')).filter(t => t === 'José da Silva').length).toBeGreaterThan(0);
    expect(titles(searchAdmin(data(), 'servicos'))).toContain('Serviços'); // página do menu
  });

  it('acha cliente por e-mail e por telefone só pelos dígitos', () => {
    expect(searchAdmin(data(), 'ana@lima').some(r => r.kind === 'client' && r.title === 'Ana Lima')).toBe(true);
    expect(searchAdmin(data(), '98888').some(r => r.kind === 'client' && r.title === 'José da Silva')).toBe(true);
    expect(searchAdmin(data(), '(11) 98888-7777').some(r => r.kind === 'client')).toBe(true);
  });

  it('cliente sem telefone (nulo) não quebra a busca', () => {
    expect(() => searchAdmin(data(), '99999')).not.toThrow();
  });

  it('agrupa na ordem Páginas, Clientes, Agendamentos, Serviços, Profissionais', () => {
    const kinds = searchAdmin(data({ services: [service({ id: 's1', name: 'Clientes VIP' })] }), 'clientes').map(r => r.kind);
    expect(kinds[0]).toBe('page');
    expect(kinds.indexOf('service')).toBeGreaterThan(kinds.indexOf('page'));
  });

  it('agendamentos: acha pelo cliente, pelo serviço e pelo profissional, do mais recente ao mais antigo', () => {
    const byClient = searchAdmin(data(), 'jose').filter(r => r.kind === 'appointment');
    expect(byClient.map(r => r.key)).toEqual(['appointment:a2', 'appointment:a1']);
    expect(searchAdmin(data(), 'barba').some(r => r.key === 'appointment:a3')).toBe(true);
    expect(searchAdmin(data(), 'marina').filter(r => r.kind === 'appointment')).toHaveLength(3);
  });

  it('o resultado de agendamento mostra data, serviço, profissional e status', () => {
    const r = searchAdmin(data(), 'jose').find(x => x.key === 'appointment:a2')!;
    expect(r.subtitle).toBe('20/11/2026 09:00 · Corte masculino · Marina Souza · Confirmado');
  });

  it('leva à tela de destino já filtrada (?q=) com o texto codificado', () => {
    const client = searchAdmin(data(), 'jose').find(r => r.kind === 'client')!;
    expect(client.to).toBe('/admin/clients?q=Jos%C3%A9%20da%20Silva');
    expect(searchAdmin(data(), 'jose').find(r => r.kind === 'appointment')!.to).toBe('/admin/appointments?q=Jos%C3%A9%20da%20Silva');
    expect(searchAdmin(data(), 'barba').find(r => r.kind === 'service')!.to).toBe('/admin/services');
    expect(searchAdmin(data(), 'marina').find(r => r.kind === 'professional')!.to).toBe('/admin/professionals');
  });

  it('acha as abas (Produtos, Bloqueios, Lembretes…) como páginas', () => {
    expect(searchAdmin(data(), 'bloqueios').some(r => r.kind === 'page' && r.to === '/admin/settings/blocks')).toBe(true);
    expect(searchAdmin(data(), 'produtos').some(r => r.kind === 'page' && r.to === '/admin/services/products')).toBe(true);
  });

  it('limita a 5 por grupo e as chaves são únicas', () => {
    const many = Array.from({ length: 12 }, (_, i) => client({ id: `x${i}`, name: `Maria ${i}` }));
    const rs = searchAdmin(data({ clients: many, appointments: [] }), 'maria');
    expect(rs.filter(r => r.kind === 'client')).toHaveLength(5);
    expect(new Set(rs.map(r => r.key)).size).toBe(rs.length);
  });

  it('agendamento de cliente removido não quebra', () => {
    const rs = searchAdmin(data({ appointments: [appt({ id: 'z', clientId: 'sumiu' })] }), 'corte');
    expect(rs.find(r => r.kind === 'appointment')!.title).toBe('Cliente removido');
  });
});
