import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { addDays } from 'date-fns';
import { setViewportWidth } from '@/test/setup';
import { dayNavLabel } from '@/lib/dayNavLabel';
import App from '../App';
import { installAdminBackend, signInAsTenantAdmin } from './fakeBackend';

/** Agenda do dono: o botão do meio de "‹ Hoje ›" acompanha o dia em exibição e o título não repete a data. */
vi.mock('../motion/LoginSplashHost', () => ({ LoginSplashHost: () => null }));

const T = { timeout: 25000 };

beforeEach(() => {
  sessionStorage.clear(); localStorage.clear();
  setViewportWidth(390);
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 390 });
  Element.prototype.scrollIntoView = vi.fn();
  signInAsTenantAdmin();
  installAdminBackend([]);
});
afterEach(() => { vi.unstubAllGlobals(); });

const open = (path: string) => { window.history.pushState({}, '', path); return render(<App />); };
const center = () => screen.getByRole('button', { name: /^Ir para hoje\. Exibindo:/ });

describe('Agenda: rótulo da navegação', { timeout: 90000 }, () => {
  it('começa em "Hoje" e a seta para a direita vai para "Amanhã" e depois para a data por extenso', async () => {
    open('/admin/agenda');
    await screen.findByRole('heading', { name: 'Agenda' }, T);
    expect(center().textContent).toBe('Hoje');

    fireEvent.click(screen.getByRole('button', { name: 'Próximo dia' }));
    expect(center().textContent).toBe('Amanhã');

    fireEvent.click(screen.getByRole('button', { name: 'Próximo dia' }));
    const esperado = dayNavLabel(addDays(new Date(), 2), new Date(), 'day');
    expect(center().textContent).toBe(esperado);
    expect(esperado).toMatch(/^[A-Z][a-zç-]+(-feira)?, \d{1,2} de [a-zç]+$/);
  });

  it('seta para a esquerda mostra "Ontem" e clicar no rótulo volta para "Hoje"', async () => {
    open('/admin/agenda');
    await screen.findByRole('heading', { name: 'Agenda' }, T);

    fireEvent.click(screen.getByRole('button', { name: 'Dia anterior' }));
    expect(center().textContent).toBe('Ontem');

    fireEvent.click(center());
    expect(center().textContent).toBe('Hoje');
  });

  it('o título "Agenda" não traz mais a data logo abaixo', async () => {
    open('/admin/agenda');
    const title = await screen.findByRole('heading', { name: 'Agenda' }, T);
    expect(title.parentElement?.querySelector('p')).toBeNull();
  });
});
