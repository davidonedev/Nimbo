import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ServicesView from './ServicesView';

const svc = (id: string, name: string, category: string | null, isActive = true) =>
  ({ id, tenantId: 't1', name, description: null, price: 40, duration: 30, category, isActive });

const tenantCtx = {
  services: [
    svc('s1', 'Corte', 'Cabelo'), svc('s2', 'Escova', 'Cabelo'), svc('s3', 'Barba', 'Barba'),
    svc('s4', 'Hidratação', null), svc('s5', 'Sobrancelha', 'Barba', false),
  ],
  serviceCategories: [],
  tenant: { id: 't1', plan: 'pro' },
  canAddService: true,
  addService: vi.fn(), updateService: vi.fn(), deleteService: vi.fn(),
  addServiceCategory: vi.fn(), deleteServiceCategory: vi.fn(),
};
vi.mock('@/context/TenantContext', async importOriginal => ({
  ...(await importOriginal<typeof import('@/context/TenantContext')>()),
  useTenant: () => tenantCtx,
}));

const cards = () => ['Corte', 'Escova', 'Barba', 'Hidratação', 'Sobrancelha'].filter(n => screen.queryByText(n, { selector: 'h3' }));

describe('Serviços (admin): filtros em dropdown', () => {
  it('Categoria e Situação são caixas de seleção, e não há mais fileira de botões de filtro', () => {
    render(<ServicesView />);
    expect(screen.getByLabelText('Categoria').tagName).toBe('SELECT');
    expect(screen.getByLabelText('Situação').tagName).toBe('SELECT');
    for (const name of ['Todos', 'Ativos', 'Inativos', 'Todas']) expect(screen.queryByRole('button', { name })).toBeNull();
  });

  it('as opções trazem a contagem de cada categoria e situação', () => {
    render(<ServicesView />);
    const cat = screen.getByLabelText('Categoria') as HTMLSelectElement;
    expect([...cat.options].map(o => o.textContent)).toEqual(['Todas (5)', 'Barba (2)', 'Cabelo (2)']);
    const sit = screen.getByLabelText('Situação') as HTMLSelectElement;
    expect([...sit.options].map(o => o.textContent)).toEqual(['Todos (5)', 'Ativos (4)', 'Inativos (1)']);
  });

  it('filtra por categoria e por situação, e os dois se combinam com a busca', () => {
    render(<ServicesView />);
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'Barba' } });
    expect(cards()).toEqual(['Barba', 'Sobrancelha']);

    fireEvent.change(screen.getByLabelText('Situação'), { target: { value: 'active' } });
    expect(cards()).toEqual(['Barba']);

    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Situação'), { target: { value: 'inactive' } });
    expect(cards()).toEqual(['Sobrancelha']);

    fireEvent.change(screen.getByLabelText('Situação'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('Buscar serviço'), { target: { value: 'cort' } });
    expect(cards()).toEqual(['Corte']);
  });
});
