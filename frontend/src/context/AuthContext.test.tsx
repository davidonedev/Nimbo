import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import * as authService from '../services/auth.service';

vi.mock('../services/auth.service', () => ({ loginApi: vi.fn(), logoutApi: vi.fn(), updateMeApi: vi.fn(), changePasswordApi: vi.fn() }));
vi.mock('../services/super.service', () => ({ impersonateTenantApi: vi.fn() }));

const loginAs = async (role: string) => {
  vi.mocked(authService.loginApi).mockResolvedValue({ user: { id: '1', name: 'N', email: 'n@x.com', role } } as never);
  const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
  let res!: { redirectTo: string };
  await act(async () => { res = await result.current.login('n@x.com', 'x'); });
  return res.redirectTo;
};

describe('redirecionamento pós-login', () => {
  it('cada papel vai para a sua tela inicial (profissional: Painel)', async () => {
    expect(await loginAs('professional')).toBe('/professional/dashboard');
    expect(await loginAs('tenant_admin')).toBe('/admin/dashboard');
    expect(await loginAs('super_admin')).toBe('/super/dashboard');
  });
});
