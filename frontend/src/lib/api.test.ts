import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NETWORK_ERROR_MESSAGE, TIMEOUT_ERROR_MESSAGE, UNAVAILABLE_ERROR_MESSAGE, api } from './api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('api (rede, timeout e retry)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('chama a API sob /api', async () => {
    fetchMock.mockResolvedValue(json(201, { success: true, data: { slug: 'x' } }));
    await api.post('/public/register/business', { a: 1 });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/public\/register\/business$/);
  });

  it('falha de rede vira ApiError NETWORK com mensagem em português', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api.post('/x', {})).rejects.toMatchObject({ code: 'NETWORK', status: 0, message: NETWORK_ERROR_MESSAGE });
    expect(fetchMock).toHaveBeenCalledTimes(1); // sem retries por padrão
  });

  it('desiste com TIMEOUT depois do tempo limite e não repete (a requisição pode ter sido processada)', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError')))));

    const result = api.post('/x', {}, { timeoutMs: 1000, retries: 3 }).catch(e => e);
    await vi.advanceTimersByTimeAsync(1000);
    const err = await result;

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: 'TIMEOUT', message: TIMEOUT_ERROR_MESSAGE });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('repete em falha de rede e avisa a tela, até dar certo', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(json(201, { success: true, data: { slug: 'ok' } }));
    const onRetry = vi.fn();

    const data = await api.post<{ slug: string }>('/x', {}, { retries: 3, retryDelayMs: 1, onRetry });

    expect(data.slug).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(onRetry.mock.calls).toEqual([[1, 3], [2, 3]]);
  });

  it('repete em 503 (servidor acordando) e, esgotadas as tentativas, mostra mensagem de indisponível', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response('<html>waking</html>', { status: 503 })));
    await expect(api.post('/x', {}, { retries: 2, retryDelayMs: 1 }))
      .rejects.toMatchObject({ status: 503, message: UNAVAILABLE_ERROR_MESSAGE });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('não repete erros do servidor que indicam processamento (409, 422, 500)', async () => {
    for (const status of [409, 422, 500]) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValue(json(status, { success: false, error: 'msg', code: 'X' }));
      await expect(api.post('/x', {}, { retries: 3, retryDelayMs: 1 })).rejects.toMatchObject({ status, message: 'msg' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });
});
