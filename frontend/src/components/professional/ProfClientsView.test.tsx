import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import ProfClientsView from './ProfClientsView';
import { profContext } from './testFixtures';

vi.mock('@/context/ProfessionalContext', () => ({ useProfessional: () => profContext() }));

describe('ProfClientsView', () => {
  it('mostra só clientes com agendamento dele (nunca os da colega nem quem não tem agendamento)', () => {
    render(<ProfClientsView />);
    const list = screen.getByRole('list', { name: 'Meus clientes' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Ana Lima')).toBeTruthy();
    expect(screen.getByText('Bruno Alves')).toBeTruthy();
    expect(screen.queryByText('Carla Colega')).toBeNull();
    expect(screen.queryByText('Diego Sem Agenda')).toBeNull();
    expect(screen.getByText('2 clientes atendidos por você')).toBeTruthy();
  });

  it('conta só os agendamentos dele por cliente', () => {
    render(<ProfClientsView />);
    expect(screen.getByRole('button', { name: 'Ver detalhes de Ana Lima' }).textContent).toContain('2 agendamentos');
    expect(screen.getByRole('button', { name: 'Ver detalhes de Bruno Alves' }).textContent).toContain('1 agendamento');
  });

  it('busca por nome (sem acento/caixa), e-mail e telefone', () => {
    render(<ProfClientsView />);
    const box = screen.getByRole('searchbox', { name: /buscar cliente/i });
    fireEvent.change(box, { target: { value: 'BRUNO' } });
    expect(screen.queryByText('Ana Lima')).toBeNull();
    expect(screen.getByText('Bruno Alves')).toBeTruthy();
    fireEvent.change(box, { target: { value: 'ana@email' } });
    expect(screen.getByText('Ana Lima')).toBeTruthy();
    fireEvent.change(box, { target: { value: '91111' } });
    expect(screen.getByText('Ana Lima')).toBeTruthy();
    expect(screen.queryByText('Bruno Alves')).toBeNull();
    fireEvent.change(box, { target: { value: 'Carla' } }); // colega: nem na busca aparece
    expect(screen.getByRole('status').textContent).toBe('Nenhum cliente encontrado.');
  });

  it('o detalhe lista só os atendimentos dele com o cliente', () => {
    render(<ProfClientsView />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes de Ana Lima' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByText('Corte feminino')).toHaveLength(2);
  });

  it('cards em grade que viram uma coluna no celular, com alvo de toque >= 44px', () => {
    render(<ProfClientsView />);
    expect(screen.getByRole('list', { name: 'Meus clientes' }).className).toContain('sm:grid-cols-2');
    expect(screen.getByRole('button', { name: 'Ver detalhes de Ana Lima' }).className).toContain('min-h-[44px]');
  });
});
