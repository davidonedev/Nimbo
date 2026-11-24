import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProfessionalsView from './ProfessionalsView';

const service = { id: 's1', tenantId: 't1', name: 'Cabelo', description: null, price: 30, duration: 30, category: null, isActive: true };
const pro = (id: string, name: string, services: string[]) => ({
  id, tenantId: 't1', name, specialty: 'Barbeiro', avatar: name.slice(0, 2), photoUrl: undefined, bio: '', email: undefined,
  services, workingHours: { start: '09:00', end: '18:00' }, workingDays: [1, 2, 3, 4, 5],
});

const professionals = [pro('p1', 'Ronald', []), pro('p2', 'Carlos', ['s1'])];

vi.mock('@/context/TenantContext', async importOriginal => ({
  ...(await importOriginal<typeof import('@/context/TenantContext')>()),
  useTenant: () => ({
    professionals, services: [service], appointments: [], clients: [],
    tenant: { id: 't1', plan: 'pro' }, canAddProfessional: true,
    addProfessional: vi.fn(), updateProfessional: vi.fn(), deleteProfessional: vi.fn(),
  }),
}));

describe('ProfessionalsView: profissional sem serviço', () => {
  it('avisa que ele não aparece para os clientes, só no cartão de quem está sem serviços', () => {
    render(<MemoryRouter><ProfessionalsView /></MemoryRouter>);

    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].textContent).toContain('este profissional não aparece para os clientes');
    expect(screen.getByText('Ronald')).toBeTruthy();
    expect(screen.getByText('Carlos')).toBeTruthy();
  });
});
