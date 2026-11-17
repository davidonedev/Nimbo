import { describe, expect, it } from 'vitest';
import { DEFAULT_API_URL, resolveApiBaseUrl } from './apiUrl';

describe('resolveApiBaseUrl', () => {
  it('acrescenta /api quando a variável traz só o domínio (caso do Render)', () => {
    expect(resolveApiBaseUrl('https://nimbo-api-duyl.onrender.com')).toBe('https://nimbo-api-duyl.onrender.com/api');
  });

  it('não duplica /api e ignora barras e espaços no fim', () => {
    expect(resolveApiBaseUrl('http://localhost:3333/api')).toBe('http://localhost:3333/api');
    expect(resolveApiBaseUrl('https://nimbo-api-duyl.onrender.com/api/')).toBe('https://nimbo-api-duyl.onrender.com/api');
    expect(resolveApiBaseUrl('  https://nimbo-api-duyl.onrender.com/  ')).toBe('https://nimbo-api-duyl.onrender.com/api');
  });

  it('usa o endereço local quando a variável não existe ou está vazia', () => {
    expect(resolveApiBaseUrl(undefined)).toBe(DEFAULT_API_URL);
    expect(resolveApiBaseUrl('')).toBe(DEFAULT_API_URL);
    expect(resolveApiBaseUrl('   ')).toBe(DEFAULT_API_URL);
  });
});
