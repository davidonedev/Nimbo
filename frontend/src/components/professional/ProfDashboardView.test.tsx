import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProfDashboardView from './ProfDashboardView';
import { appt, day, profContext } from './testFixtures';

let ctx = profContext();
vi.mock('@/context/ProfessionalContext', () => ({ useProfessional: () => ctx }));

const setup = () => render(<MemoryRouter><ProfDashboardView /></MemoryRouter>);
const tile = (label: string) => {
  const section = screen.getByText(/Seus agendamentos em/).closest('section')!;
  return within(section).getByText(label).previousElementSibling!.textContent;
};

describe('ProfDashboardView', () => {
  // Meio do mês, para "hoje" e os dias vizinhos caírem sempre no mesmo mês.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-17T12:00:00'));
    ctx = profContext({
      appointments: [
        appt('a1', 'p1', 'c1', day(0), '14:00', 'confirmed'),
        appt('a2', 'p1', 'c2', day(0), '09:00', 'pending'),
        appt('a3', 'p1', 'c1', day(2), '10:00', 'confirmed'),
        appt('a4', 'p1', 'c2', day(-3), '10:00', 'completed'),
        appt('a5', 'p2', 'c3', day(0), '11:00', 'confirmed'),  // colega
        appt('a6', 'p2', 'c3', day(1), '15:00', 'no_show'),    // colega
      ],
    });
  });
  afterEach(() => vi.useRealTimers());

  it('lista os agendamentos de hoje dele, em ordem de horário, sem os da colega', () => {
    setup();
    const rows = within(screen.getByRole('list', { name: 'Agendamentos de hoje' })).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('09:00');
    expect(rows[0].textContent).toContain('Bruno Alves');
    expect(rows[1].textContent).toContain('14:00');
    expect(screen.queryByText('Carla Colega')).toBeNull();
  });

  it('mostra os próximos dele (futuros em aberto) e leva à agenda', () => {
    setup();
    const next = screen.getByRole('list', { name: 'Próximos agendamentos' });
    expect(within(next).getAllByRole('listitem')).toHaveLength(1);
    expect(next.textContent).toContain('10:00');
    expect(screen.getByRole('link', { name: /ver minha agenda/i }).getAttribute('href')).toBe('/professional/agenda');
  });

  it('as contagens por status são só dele (a colega, com no_show, não entra)', () => {
    setup();
    expect(tile('Agendado')).toBe('1');
    expect(tile('Confirmado')).toBe('2');
    expect(tile('Concluído')).toBe('1');
    expect(tile('Cancelado')).toBe('0');
    expect(tile('Não compareceu')).toBe('0');
  });

  it('estados vazios e nenhum valor em reais', () => {
    ctx = profContext({ appointments: [] });
    setup();
    expect(screen.getByText('Nenhum agendamento para hoje.')).toBeTruthy();
    expect(screen.getByText('Nenhum agendamento futuro.')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/R\$/);
  });
});
