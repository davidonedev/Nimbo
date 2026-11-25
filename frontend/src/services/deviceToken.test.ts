import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { getDeviceToken, saveDeviceToken, storeDeviceTokenFrom, cancelMyAppointmentApi, listMyAppointmentsApi, rescheduleMyAppointmentApi } from './booking.service';
import { cancelPublicAppointmentApi, getClientAppointmentsApi, reschedulePublicAppointmentApi, verifyClientEmailApi } from './public.service';
import { clientLoginApi, googleAuthClientApi, registerClientApi } from './register.service';

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  ApiError: class extends Error {},
}));

const H = { headers: { 'X-Device-Token': 'tok-1' } };

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  saveDeviceToken('studio', 'tok-1');
});

describe('portal antigo envia X-Device-Token (G2)', () => {
  it('listar, cancelar e remarcar mandam o cabeçalho do aparelho', async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    vi.mocked(api.patch).mockResolvedValue(undefined);
    await getClientAppointmentsApi('studio', 'c1');
    await cancelPublicAppointmentApi('studio', 'a1', 'c1');
    await reschedulePublicAppointmentApi('studio', 'a1', { clientId: 'c1', date: '2030-01-10', startTime: '10:00' });
    expect(api.get).toHaveBeenCalledWith('/public/studio/my-appointments?clientId=c1', H);
    expect(api.patch).toHaveBeenCalledWith('/public/studio/appointments/a1/cancel', { clientId: 'c1' }, H);
    expect(api.patch).toHaveBeenCalledWith('/public/studio/appointments/a1/reschedule', { clientId: 'c1', date: '2030-01-10', startTime: '10:00' }, H);
  });

  it('sem token guardado não manda cabeçalho nenhum', async () => {
    localStorage.clear();
    vi.mocked(api.get).mockResolvedValue([]);
    await getClientAppointmentsApi('studio', 'c1');
    expect(api.get).toHaveBeenCalledWith('/public/studio/my-appointments?clientId=c1', { headers: {} });
  });

  it('login por e-mail, Google, cadastro e verificação guardam o deviceToken e não o repassam à sessão', async () => {
    for (const run of [
      () => clientLoginApi('loja', 'a@b.com', 'x'),
      () => googleAuthClientApi('loja', 'g'),
      () => registerClientApi('loja', { name: 'Ana', email: 'a@b.com', phone: '(11) 99999-8888', password: 'x' }),
    ]) {
      localStorage.clear();
      vi.mocked(api.post).mockResolvedValueOnce({ id: 'c1', name: 'Ana', email: 'a@b.com', deviceToken: 'novo-tok' });
      const session = await run();
      expect(getDeviceToken('loja')).toBe('novo-tok');
      expect(session).toEqual({ id: 'c1', name: 'Ana', email: 'a@b.com' });
    }
    localStorage.clear();
    vi.mocked(api.get).mockResolvedValueOnce({ id: 'c1', name: 'Ana', email: 'a@b.com', deviceToken: 'tok-verify' });
    const verified = await verifyClientEmailApi('loja', 'abc');
    expect(getDeviceToken('loja')).toBe('tok-verify');
    expect('deviceToken' in verified).toBe(false);
  });

  it('resposta sem deviceToken não apaga o que já existe', () => {
    storeDeviceTokenFrom('studio', { id: 'x', deviceToken: null });
    expect(getDeviceToken('studio')).toBe('tok-1');
  });
});

describe('meus agendamentos do fluxo novo', () => {
  it('usam X-Device-Token; remarcar manda só data e hora (sem clientId)', async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    vi.mocked(api.patch).mockResolvedValue(undefined);
    await listMyAppointmentsApi('studio');
    await cancelMyAppointmentApi('studio', 'a1');
    await rescheduleMyAppointmentApi('studio', 'a1', { date: '2030-01-10', startTime: '10:00' });
    expect(api.get).toHaveBeenCalledWith('/public/studio/book/my-appointments', H);
    expect(api.patch).toHaveBeenCalledWith('/public/studio/appointments/a1/cancel', {}, H);
    expect(api.patch).toHaveBeenCalledWith('/public/studio/appointments/a1/reschedule', { date: '2030-01-10', startTime: '10:00' }, H);
  });
});
