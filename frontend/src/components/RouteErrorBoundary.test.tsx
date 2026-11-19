import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { isChunkLoadError } from '@/lib/chunkError';

const Boom = ({ message }: { message: string }): never => { throw new Error(message); };

describe('RouteErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // trava anti-loop já acionada: o teste não tenta recarregar a página do jsdom
    sessionStorage.setItem('nimbo_chunk_reload_at', String(Date.now()));
  });

  it('erro qualquer vira aviso com saída, não tela branca', () => {
    render(<MemoryRouter><RouteErrorBoundary><Boom message="x is undefined" /></RouteErrorBoundary></MemoryRouter>);
    expect(screen.getByRole('alert').textContent).toContain('Não foi possível abrir esta tela');
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ir para o início' })).toBeTruthy();
  });

  it('falha de chunk (versão nova no ar) pede para recarregar', () => {
    render(<MemoryRouter><RouteErrorBoundary><Boom message="Failed to fetch dynamically imported module: /assets/ProfAgendaView-abc.js" /></RouteErrorBoundary></MemoryRouter>);
    expect(screen.getByRole('alert').textContent).toContain('versão nova');
  });

  it('reconhece as mensagens de chunk dos navegadores', () => {
    for (const m of ['Failed to fetch dynamically imported module: x', 'error loading dynamically imported module', 'Importing a module script failed.', 'Loading chunk 12 failed.']) {
      expect(isChunkLoadError(new Error(m))).toBe(true);
    }
    expect(isChunkLoadError(new Error('Cannot read properties of null'))).toBe(false);
  });
});
