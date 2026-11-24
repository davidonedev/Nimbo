import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ProductsView from './ProductsView';

const prod = (id: string, name: string, category: string | null, isActive = true) =>
  ({ id, tenantId: 't1', name, description: null, price: 25, stock: 10, lowStockThreshold: 2, category, imageUrl: null, isActive });

const ctx = {
  products: [
    prod('p1', 'Pomada', 'Cabelo'), prod('p2', 'Shampoo', 'Cabelo'), prod('p3', 'Óleo de barba', 'Barba'),
    prod('p4', 'Toalha', null), prod('p5', 'Balm', 'Barba', false),
  ],
  productCategories: [],
  lowStockProducts: [],
  addProduct: vi.fn(), updateProduct: vi.fn(), deleteProduct: vi.fn(), adjustStock: vi.fn(),
  addProductCategory: vi.fn(), deleteProductCategory: vi.fn(),
};
vi.mock('@/context/TenantContext', async importOriginal => ({
  ...(await importOriginal<typeof import('@/context/TenantContext')>()),
  useTenant: () => ctx,
}));

const shown = () => ['Pomada', 'Shampoo', 'Óleo de barba', 'Toalha', 'Balm'].filter(n => screen.queryByText(n, { selector: 'p' }));

describe('Produtos: filtros em dropdown (iguais aos de Serviços)', () => {
  it('Categoria e Situação são caixas de seleção, sem fileira de botões de filtro', () => {
    render(<ProductsView />);
    expect(screen.getByLabelText('Categoria').tagName).toBe('SELECT');
    expect(screen.getByLabelText('Situação').tagName).toBe('SELECT');
    for (const name of ['Todos', 'Ativos', 'Inativos', 'Todas']) expect(screen.queryByRole('button', { name })).toBeNull();
  });

  it('as opções trazem a contagem', () => {
    render(<ProductsView />);
    expect([...(screen.getByLabelText('Categoria') as HTMLSelectElement).options].map(o => o.textContent)).toEqual(['Todas (5)', 'Barba (2)', 'Cabelo (2)']);
    expect([...(screen.getByLabelText('Situação') as HTMLSelectElement).options].map(o => o.textContent)).toEqual(['Todos (5)', 'Ativos (4)', 'Inativos (1)']);
  });

  it('filtra por categoria e situação e combina com a busca', () => {
    render(<ProductsView />);
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'Barba' } });
    expect(shown()).toEqual(['Óleo de barba', 'Balm']);

    fireEvent.change(screen.getByLabelText('Situação'), { target: { value: 'inactive' } });
    expect(shown()).toEqual(['Balm']);

    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Situação'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('Buscar produto'), { target: { value: 'sham' } });
    expect(shown()).toEqual(['Shampoo']);
  });
});
