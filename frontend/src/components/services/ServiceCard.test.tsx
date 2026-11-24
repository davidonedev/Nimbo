import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ServiceCard } from './ServiceCard';

const service = { id: 's1', tenantId: 't1', name: 'Corte masculino', description: 'Corte com máquina e tesoura', price: 45, duration: 30, category: 'Cabelo', isActive: true };

const setup = (overrides: Partial<typeof service> = {}, props: Partial<Parameters<typeof ServiceCard>[0]> = {}) => {
  const onEdit = vi.fn(), onDelete = vi.fn(), onToggleActive = vi.fn();
  render(<ServiceCard service={{ ...service, ...overrides }} onEdit={onEdit} onDelete={onDelete} onToggleActive={onToggleActive} showStatus {...props} />);
  return { onEdit, onDelete, onToggleActive };
};

describe('ServiceCard', () => {
  it('mantém todas as informações: nome, categoria, descrição, preço, duração e situação', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Corte masculino' })).toBeTruthy();
    expect(screen.getByText('Cabelo')).toBeTruthy();
    expect(screen.getByText('Corte com máquina e tesoura')).toBeTruthy();
    expect(screen.getByText(/45,00/)).toBeTruthy();
    expect(screen.getByText('30 min')).toBeTruthy();
    expect(screen.getByText('Ativo')).toBeTruthy();
  });

  it('serviço inativo mostra "Inativo" e o cartão fica esmaecido', () => {
    setup({ isActive: false });
    expect(screen.getByText('Inativo')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Corte masculino' }).closest('.opacity-70')).toBeTruthy();
  });

  it('o rodapé (preço, duração e situação) fica numa linha só, sem quebrar', () => {
    setup();
    const footer = screen.getByText('30 min').parentElement as HTMLElement;
    expect(footer.className).toContain('whitespace-nowrap');
    expect(footer.className).toContain('flex');
  });

  it('o menu "⋮" tem alvo de 44 px e oferece Editar, Desativar e Excluir', () => {
    const { onEdit, onToggleActive, onDelete } = setup();
    const trigger = screen.getByRole('button', { name: 'Ações de Corte masculino' });
    expect(trigger.className).toContain('h-11');
    expect(trigger.className).toContain('w-11');

    fireEvent.keyDown(trigger, { key: 'Enter' });
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map(i => i.textContent)).toEqual(['Editar', 'Desativar', 'Excluir']);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Editar' }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }));
    expect(onToggleActive).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('serviço inativo oferece "Ativar" e excluir chama o callback', () => {
    const { onDelete, onToggleActive } = setup({ isActive: false });
    const trigger = screen.getByRole('button', { name: 'Ações de Corte masculino' });

    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Ativar' }));
    expect(onToggleActive).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Excluir' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('no portal do profissional não há situação nem ativar/desativar', () => {
    render(<ServiceCard service={service} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByText('Ativo')).toBeNull();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Ações de Corte masculino' }), { key: 'Enter' });
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem').map(i => i.textContent)).toEqual(['Editar', 'Excluir']);
  });

  it('sem categoria e sem descrição o cartão continua inteiro', () => {
    setup({ category: null as unknown as string, description: null as unknown as string });
    expect(screen.queryByText('Cabelo')).toBeNull();
    expect(screen.getByText(/45,00/)).toBeTruthy();
  });
});
