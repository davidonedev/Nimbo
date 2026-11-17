import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { setViewportWidth } from '@/test/setup';
import { ResponsiveSheet } from './responsive-sheet';

const renderSheet = (open = true, onOpenChange = vi.fn()) => {
  render(
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title="Novo agendamento" description="Escolha o horário" footer={<button>Salvar</button>}>
      <p>conteúdo</p>
    </ResponsiveSheet>,
  );
  return onOpenChange;
};

describe('ResponsiveSheet', () => {
  beforeEach(() => setViewportWidth(1280));

  it('fechado, não renderiza nada', () => {
    renderSheet(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('aberto, é um diálogo com título, descrição, conteúdo e rodapé', () => {
    renderSheet();
    const dialog = screen.getByRole('dialog', { name: 'Novo agendamento' });
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText('conteúdo')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeTruthy();
  });

  it('no desktop vira drawer lateral', () => {
    renderSheet();
    const cls = screen.getByRole('dialog').className;
    expect(cls).toContain('sheet-right');
    expect(cls).not.toContain('sheet-up');
  });

  it('no celular vira bottom sheet limitado a 90% da altura', () => {
    setViewportWidth(390);
    renderSheet();
    const cls = screen.getByRole('dialog').className;
    expect(cls).toContain('sheet-up');
    expect(cls).toContain('max-h-[90dvh]');
  });

  it('o botão Fechar (44 px) e a tecla Esc pedem para fechar', () => {
    const onOpenChange = renderSheet();
    const close = screen.getByRole('button', { name: 'Fechar' });
    expect(close.className).toContain('h-11');
    fireEvent.click(close);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledTimes(2);
  });
});
