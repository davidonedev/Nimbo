import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import GoogleSignInButton from './GoogleSignInButton';

describe('GoogleSignInButton sem VITE_GOOGLE_CLIENT_ID', () => {
  it('não renderiza nada (e não quebra a tela) quando o login com Google não está configurado', () => {
    // Sem contexto/provider nenhum: se o hook do Google fosse chamado, isto lançaria erro.
    const { container } = render(<GoogleSignInButton onSuccess={() => {}} onError={() => {}} />);
    expect(container.innerHTML).toBe('');
  });
});
