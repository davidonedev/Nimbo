import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import AdvanceNoticeCard from './AdvanceNoticeCard';

const onSave = vi.fn();

/** Pai de teste: guarda o valor como a tela de Configurações faz. */
function Harness({ initial = 60, error = '' }: { initial?: number; error?: string }) {
  const [value, setValue] = useState(initial);
  return <AdvanceNoticeCard value={value} saved={initial} onChange={setValue} onSave={onSave} saving={false} justSaved={false} error={error} />;
}
const options = () => within(screen.getByRole('radiogroup', { name: 'Antecedência mínima' })).getAllByRole('radio');
const selected = () => options().filter(o => o.getAttribute('aria-checked') === 'true').map(o => o.textContent);

describe('AdvanceNoticeCard', () => {
  beforeEach(() => {
    onSave.mockClear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-24T17:20:00Z')); // 14:20 em Brasília
  });
  afterEach(() => vi.useRealTimers());

  it('mostra as opções como cartões selecionáveis, com a atual marcada', () => {
    render(<Harness initial={60} />);
    expect(options().map(o => o.textContent)).toEqual([
      'Sem mínimoPode marcar para agora', '30 minutosMeia hora antes', '1 horaO mais comum', '2 horasTempo para se preparar',
      '3 horasMeio período', '4 horasMais folga', '12 horasSó com meio dia de aviso', '1 diaSó para o dia seguinte', 'Outro valorVocê escolhe o tempo',
    ]);
    expect(selected()).toEqual(['1 horaO mais comum']);
  });

  it('escolher uma opção troca a seleção e atualiza a prévia em palavras', () => {
    render(<Harness initial={60} />);
    expect(screen.getByRole('status').textContent).toContain('é hoje às 15:20');

    fireEvent.click(screen.getByRole('radio', { name: /^2 horas/ }));
    expect(selected()).toEqual(['2 horasTempo para se preparar']);
    expect(screen.getByRole('status').textContent).toContain('é hoje às 16:20');

    fireEvent.click(screen.getByRole('radio', { name: /^Sem mínimo/ }));
    expect(screen.getByRole('status').textContent).toContain('já a partir de agora');
  });

  it('só habilita Salvar quando há alteração, e salvar chama o callback', () => {
    render(<Harness initial={60} />);
    const save = screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.queryByText('Alteração não salva')).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: /^30 minutos/ }));
    expect(save.disabled).toBe(false);
    expect(screen.getByText('Alteração não salva')).toBeTruthy();
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('"Outro valor": digita minutos ou horas e a prévia acompanha', () => {
    render(<Harness initial={60} />);
    fireEvent.click(screen.getByRole('radio', { name: /^Outro valor/ }));
    expect(selected()).toEqual(['Outro valorVocê escolhe o tempo']);

    const amount = screen.getByLabelText('Tempo de antecedência') as HTMLInputElement;
    fireEvent.change(amount, { target: { value: '45' } });
    expect(screen.getByRole('status').textContent).toContain('é hoje às 15:05');
    expect(screen.getByRole('status').textContent).toContain('Antecedência escolhida: 45 min');

    fireEvent.change(screen.getByLabelText('Unidade'), { target: { value: 'hours' } });
    fireEvent.change(amount, { target: { value: '2' } });
    expect(screen.getByRole('status').textContent).toContain('Antecedência escolhida: 2 horas');
  });

  it('valor personalizado acima de 24 horas avisa e não deixa salvar', () => {
    render(<Harness initial={60} />);
    fireEvent.click(screen.getByRole('radio', { name: /^Outro valor/ }));
    fireEvent.change(screen.getByLabelText('Unidade'), { target: { value: 'hours' } });
    fireEvent.change(screen.getByLabelText('Tempo de antecedência'), { target: { value: '30' } });

    expect(screen.getByRole('alert').textContent).toMatch(/máximo é 24 horas/);
    // o valor válido anterior segue valendo (não vira 30 h)
    expect(screen.getByRole('status').textContent).not.toContain('30 horas');
  });

  it('um valor salvo fora das opções (ex.: 45 min) abre já em "Outro valor"', () => {
    render(<Harness initial={45} />);
    expect(selected()).toEqual(['Outro valorVocê escolhe o tempo']);
    expect((screen.getByLabelText('Tempo de antecedência') as HTMLInputElement).value).toBe('45');
  });

  it('mostra o erro de salvamento', () => {
    render(<Harness initial={60} error="Não foi possível salvar." />);
    expect(screen.getByRole('alert').textContent).toBe('Não foi possível salvar.');
  });
});
