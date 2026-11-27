import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ClientRegisterForm from './ClientRegisterForm';
import { registerClientApi } from '@/services/register.service';

vi.mock('@/context/PublicTenantContext', () => ({
  usePublicTenant: () => ({ data: { tenant: { name: 'Barbearia Teste' } }, getSlug: () => 'barbearia-teste' }),
}));
vi.mock('@/services/register.service', () => ({ registerClientApi: vi.fn() }));
vi.mock('@/lib/googleAuth', () => ({ isGoogleLoginEnabled: () => false }));
vi.mock('./GoogleSignInButton', () => ({ default: () => null }));

function fill(label: RegExp | string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('ClientRegisterForm: celular (WhatsApp) obrigatório', () => {
  beforeEach(() => vi.mocked(registerClientApi).mockReset());

  function fillEverythingExceptPhone() {
    fill(/Nome/, 'Ana Souza');
    fill(/E-mail/, 'ana@exemplo.com');
    fill(/^Senha/, 'segredo123');
    fill(/Confirmar senha|Confirmar/, 'segredo123');
  }

  it('o campo é marcado como obrigatório e o cadastro não sai sem ele', async () => {
    render(<ClientRegisterForm onBack={() => {}} onSuccess={() => {}} />);
    expect(screen.getByText(/Celular \(WhatsApp\) \*/)).toBeTruthy();

    fillEverythingExceptPhone();
    fireEvent.click(screen.getByRole('button', { name: /Criar conta|Cadastrar/ }));

    expect(await screen.findByText('Informe o celular (WhatsApp) com DDD.')).toBeTruthy();
    expect(registerClientApi).not.toHaveBeenCalled();
  });

  it('celular sem DDD também é recusado; com DDD o cadastro é enviado', async () => {
    vi.mocked(registerClientApi).mockResolvedValue({ id: '1', name: 'Ana Souza', email: 'ana@exemplo.com' });
    const onSuccess = vi.fn();
    render(<ClientRegisterForm onBack={() => {}} onSuccess={onSuccess} />);
    fillEverythingExceptPhone();

    fill(/Celular \(WhatsApp\)/, '99999-888');
    fireEvent.click(screen.getByRole('button', { name: /Criar conta|Cadastrar/ }));
    expect(await screen.findByText('Informe o celular (WhatsApp) com DDD.')).toBeTruthy();
    expect(registerClientApi).not.toHaveBeenCalled();

    fill(/Celular \(WhatsApp\)/, '11987654321');
    fireEvent.click(screen.getByRole('button', { name: /Criar conta|Cadastrar/ }));
    await waitFor(() => expect(registerClientApi).toHaveBeenCalledTimes(1));
    expect(vi.mocked(registerClientApi).mock.calls[0][1].phone).toMatch(/11\)? ?98765-4321/);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });
});
