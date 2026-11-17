import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { signupErrors } from './signupErrors';

describe('signupErrors', () => {
  it('e-mail já cadastrado vai para o campo e-mail', () => {
    const e = signupErrors(new ApiError('Este e-mail já está em uso.', 409, 'EMAIL_IN_USE'));
    expect(e.email).toMatch(/já está cadastrado/);
    expect(e.general).toBeUndefined();
  });

  it('422 mapeia cada campo inválido para o seu campo', () => {
    const e = signupErrors(new ApiError('Dados inválidos', 422, 'VALIDATION_ERROR', [
      { field: 'email', message: 'deve ser um endereço de e-mail bem formado' },
      { field: 'slug', message: 'Use apenas letras minúsculas, números e hífens' },
    ]));
    expect(e.email).toBeTruthy();
    expect(e.slug).toBe('Use apenas letras minúsculas, números e hífens');
  });

  it('422 com campo desconhecido cai numa mensagem geral', () => {
    const e = signupErrors(new ApiError('Dados inválidos', 422, 'VALIDATION_ERROR', [{ field: 'xpto', message: 'x' }]));
    expect(e.general).toMatch(/Confira os dados/);
  });

  it('falha de rede, servidor indisponível e erro desconhecido mostram mensagem clara', () => {
    expect(signupErrors(new ApiError('Não foi possível conectar ao servidor.', 0, 'NETWORK')).general).toMatch(/conectar/);
    expect(signupErrors(new ApiError('O servidor está indisponível', 503)).general).toMatch(/indisponível/);
    expect(signupErrors(new ApiError('x', 429)).general).toMatch(/Muitas tentativas/);
    expect(signupErrors(new Error('boom')).general).toBe('Erro ao criar conta. Tente novamente.');
  });
});
