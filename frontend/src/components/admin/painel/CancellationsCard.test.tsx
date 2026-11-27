import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { CancellationsCard } from './CancellationsCard';

const renderCard = (data: { total: number; cancelled: number; noShow: number }) =>
  render(<CancellationsCard data={data} loading={false} error={false} onRetry={() => {}} />);

describe('CancellationsCard (layout)', () => {
  it('o total fica grande à esquerda e o detalhe à direita', () => {
    renderCard({ total: 5, cancelled: 3, noShow: 2 });
    const total = screen.getByText('5');
    expect(total.className).toContain('text-5xl');
    const detail = screen.getByRole('list', { name: 'Detalhe' });
    expect(detail.className).toContain('ml-auto'); // empurrado para a direita
    expect(total.compareDocumentPosition(detail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // total vem antes
    expect(within(detail).getAllByRole('listitem').map(li => li.textContent)).toEqual(['3 cancelados', '2 faltas']);
  });

  it('cada informação do detalhe fica numa linha só, sem quebrar', () => {
    renderCard({ total: 12, cancelled: 10, noShow: 2 });
    expect(screen.getByRole('list', { name: 'Detalhe' }).className).toContain('whitespace-nowrap');
    expect(screen.getByText('no total')).toBeTruthy();
  });

  it('usa o singular com 1 cancelado e 1 falta', () => {
    renderCard({ total: 2, cancelled: 1, noShow: 1 });
    expect(within(screen.getByRole('list', { name: 'Detalhe' })).getAllByRole('listitem').map(li => li.textContent)).toEqual(['1 cancelado', '1 falta']);
  });

  it('sem cancelamentos nem faltas mostra a mensagem vazia', () => {
    renderCard({ total: 0, cancelled: 0, noShow: 0 });
    expect(screen.getByText(/Nenhum cancelamento ou falta/)).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Detalhe' })).toBeNull();
  });
});
