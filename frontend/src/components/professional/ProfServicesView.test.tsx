import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ProfServicesView from './ProfServicesView';

const svc = (id: string, name: string, category: string | null) =>
  ({ id, tenantId: 't1', name, description: null, price: 40, duration: 30, category, isActive: true });

let services = [svc('s1', 'Corte', 'Cabelo'), svc('s2', 'Escova', 'Cabelo'), svc('s3', 'Barba', 'Barba')];
vi.mock('@/context/ProfessionalContext', () => ({
  useProfessional: () => ({ services, addService: vi.fn(), updateService: vi.fn(), deleteService: vi.fn() }),
}));

const shown = () => ['Corte', 'Escova', 'Barba'].filter(n => screen.queryByText(n, { selector: 'h3, p, span' }));

describe('Serviços (profissional): filtro em dropdown', () => {
  it('a categoria é uma caixa de seleção com contagem, e não uma fileira de botões', () => {
    render(<ProfServicesView />);
    const cat = screen.getByLabelText('Categoria') as HTMLSelectElement;
    expect(cat.tagName).toBe('SELECT');
    expect([...cat.options].map(o => o.textContent)).toEqual(['Todas (3)', 'Cabelo (2)', 'Barba (1)']);
    expect(screen.queryByRole('button', { name: 'Todos' })).toBeNull();
  });

  it('escolher a categoria filtra a lista e "Todas" volta tudo', () => {
    render(<ProfServicesView />);
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'Barba' } });
    expect(shown()).toEqual(['Barba']);
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: '' } });
    expect(shown()).toEqual(['Corte', 'Escova', 'Barba']);
  });

  it('sem nenhuma categoria cadastrada o filtro nem aparece', () => {
    services = [svc('s1', 'Corte', null)];
    render(<ProfServicesView />);
    expect(screen.queryByLabelText('Categoria')).toBeNull();
    services = [svc('s1', 'Corte', 'Cabelo'), svc('s2', 'Escova', 'Cabelo'), svc('s3', 'Barba', 'Barba')];
  });
});
