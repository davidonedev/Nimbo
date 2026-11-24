import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OpenStatus } from './OpenStatus';

let isOpen = true;
vi.mock('@/context/TenantContext', () => ({ useTenant: () => ({ tenant: { isOpen } }) }));

describe('OpenStatus (navbar)', () => {
  it('mostra o texto "Aberto" junto da bolinha, em qualquer tela (sem classe que o esconda no celular)', () => {
    isOpen = true;
    render(<OpenStatus />);
    const label = screen.getByText('Aberto');
    expect(label.className).not.toMatch(/hidden|sr-only/);
    expect(label.parentElement?.getAttribute('role')).toBe('status');
  });

  it('mostra "Fechado" com a bolinha vermelha', () => {
    isOpen = false;
    const { container } = render(<OpenStatus />);
    expect(screen.getByText('Fechado').className).not.toMatch(/hidden|sr-only/);
    expect(container.querySelector('.bg-red-500')).toBeTruthy();
    expect(container.querySelector('.bg-green-500')).toBeNull();
  });
});
