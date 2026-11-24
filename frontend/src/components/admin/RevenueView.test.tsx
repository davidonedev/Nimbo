import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { setViewportWidth } from '@/test/setup';
import RevenueView from './RevenueView';

const base = { tenantId: 't', clientId: 'c1', professionalId: 'p1', serviceId: 's1', startTime: '09:00', endTime: '09:30', createdAt: '' };
const tenant = {
  tenant: { id: 't', primaryColor: '#2563eb', adminColor: '#2563eb' },
  services: [{ id: 's1', name: 'Corte' }],
  professionals: [{ id: 'p1', name: 'Ana' }],
  appointments: [
    { ...base, id: 'a1', date: '2026-11-10', price: 50, status: 'completed' },
    { ...base, id: 'a2', date: '2026-10-15', price: 80, status: 'completed' },
    { ...base, id: 'a3', date: '2026-11-11', price: 30, status: 'cancelled' },
    { ...base, id: 'a4', date: '2026-11-11', price: 40, status: 'completed' },
  ],
};
vi.mock('@/context/TenantContext', () => ({ useTenant: () => tenant }));

const kpi = (label: string) => screen.getByText(label).parentElement as HTMLElement;
const radio = (name: string) => screen.getByRole('radio', { name });

describe('Relatórios: filtros de período', () => {
  beforeEach(() => {
    setViewportWidth(390);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-12T15:00:00Z')); // quinta-feira
  });
  afterEach(() => vi.useRealTimers());

  it('o seletor tem os cinco períodos, com Este mês marcado, e troca de período', () => {
    render(<RevenueView />);
    const group = screen.getByRole('radiogroup', { name: 'Período do relatório' });
    expect(within(group).getAllByRole('radio').map(r => r.textContent)).toEqual(['Hoje', 'Semana', 'Mês', 'Ano', 'Período']);
    expect(radio('Mês').getAttribute('aria-checked')).toBe('true');
    expect(kpi('Receita Total').textContent).toContain('90,00'); // 50 + 40 de novembro

    fireEvent.click(radio('Hoje'));
    expect(radio('Hoje').getAttribute('aria-checked')).toBe('true');
    expect(radio('Mês').getAttribute('aria-checked')).toBe('false');
    expect(kpi('Receita Total').textContent).toContain('0,00');
  });

  it('o navegador volta aos períodos anteriores, mostra o nome e não avança para o futuro', () => {
    render(<RevenueView />);
    const prev = screen.getByRole('button', { name: 'Período anterior' });
    const next = screen.getByRole('button', { name: 'Próximo período' }) as HTMLButtonElement;
    expect(screen.getByRole('button', { name: 'Período atual: Este mês' })).toBeTruthy();
    expect(screen.getByText('Novembro de 2026')).toBeTruthy(); // subtítulo
    expect(next.disabled).toBe(true);

    fireEvent.click(prev);
    expect(screen.getAllByText('Outubro de 2026').length).toBeGreaterThan(0);
    expect(kpi('Receita Total').textContent).toContain('80,00');
    expect(next.disabled).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /Voltar para este mês/ }));
    expect(kpi('Receita Total').textContent).toContain('90,00');
    expect(next.disabled).toBe(true);
  });

  it('no dia, o anterior se chama Ontem; na semana, Semana passada', () => {
    render(<RevenueView />);
    fireEvent.click(radio('Hoje'));
    expect(screen.getByRole('button', { name: 'Período atual: Hoje' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Período anterior' }));
    expect(screen.getByText('Ontem')).toBeTruthy();

    fireEvent.click(radio('Semana'));
    expect(screen.getByRole('button', { name: 'Período atual: Esta semana' })).toBeTruthy();
    expect(screen.getByText('9 de nov – 15 de nov')).toBeTruthy(); // segunda a domingo
    fireEvent.click(screen.getByRole('button', { name: 'Período anterior' }));
    expect(screen.getByText('Semana passada')).toBeTruthy();
  });

  it('trocar de período zera o navegador', () => {
    render(<RevenueView />);
    fireEvent.click(screen.getByRole('button', { name: 'Período anterior' }));
    fireEvent.click(radio('Ano'));
    expect(screen.getByRole('button', { name: 'Período atual: Este ano' })).toBeTruthy();
  });

  it('Período: atalhos preenchem as datas e uma data inicial depois da final avisa', () => {
    render(<RevenueView />);
    fireEvent.click(radio('Período'));
    expect(screen.queryByRole('button', { name: 'Período anterior' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Últimos 7 dias' }));
    expect((screen.getByLabelText('Data inicial') as HTMLInputElement).value).toBe('2026-11-06');
    expect((screen.getByLabelText('Data final') as HTMLInputElement).value).toBe('2026-11-12');
    expect(screen.getByText(/7 dias selecionados/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Mês passado' }));
    expect((screen.getByLabelText('Data inicial') as HTMLInputElement).value).toBe('2026-10-01');
    expect((screen.getByLabelText('Data final') as HTMLInputElement).value).toBe('2026-10-31');
    expect(kpi('Receita Total').textContent).toContain('80,00');

    fireEvent.change(screen.getByLabelText('Data inicial'), { target: { value: '2026-11-20' } });
    expect(screen.getByRole('alert').textContent).toMatch(/data inicial é depois/i);
  });
});
