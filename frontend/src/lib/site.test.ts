import { afterEach, describe, expect, it, vi } from 'vitest';
import { siteHost, siteUrl, tenantLink } from './site';

afterEach(() => { vi.unstubAllEnvs(); });

describe('endereço do site', () => {
  it('usa VITE_SITE_URL quando definida, sem a barra final', () => {
    vi.stubEnv('VITE_SITE_URL', 'https://seudominio.com/');
    expect(siteUrl()).toBe('https://seudominio.com');
    expect(siteHost()).toBe('seudominio.com');
    expect(tenantLink('barber-kings')).toBe('seudominio.com/barber-kings');
  });

  it('aceita o valor sem protocolo e acrescenta https://', () => {
    vi.stubEnv('VITE_SITE_URL', ' seudominio.com ');
    expect(siteUrl()).toBe('https://seudominio.com');
    expect(siteHost()).toBe('seudominio.com');
  });

  it('mantém http:// (ex.: ambiente local) e porta', () => {
    vi.stubEnv('VITE_SITE_URL', 'http://localhost:5173');
    expect(siteUrl()).toBe('http://localhost:5173');
    expect(tenantLink('studio')).toBe('localhost:5173/studio');
  });

  it('sem VITE_SITE_URL usa o endereço em que a página está aberta', () => {
    vi.stubEnv('VITE_SITE_URL', '');
    expect(siteUrl()).toBe(window.location.origin);
    expect(siteHost()).toBe(window.location.host);
    expect(tenantLink('studio')).toBe(`${window.location.host}/studio`);
  });
});
