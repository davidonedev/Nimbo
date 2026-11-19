import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { onlyChanged, saveErrorMessage } from './settingsPayload';
import type { Tenant } from '../types';

const tenant = {
  name: 'Barbearia', phone: '(11) 99999-1111', address: '', adminColor: null, primaryColor: '#7c3aed',
  logoUrl: 'data:image/webp;base64,AAA', bannerUrl: null, isOpen: true, minAdvanceMinutes: 30,
  whatsappApiUrl: null, whatsappApiKey: null, whatsappInstance: null, whatsappTemplate: null,
} as unknown as Tenant;

describe('onlyChanged', () => {
  it('manda só o que mudou (uma aba nunca desfaz o que outra salvou)', () => {
    expect(onlyChanged({ name: 'Barbearia', phone: '(11) 90000-0000', primaryColor: '#7c3aed' }, tenant)).toEqual({ phone: '(11) 90000-0000' });
  });

  it('null, undefined e vazio contam como "sem valor": não gera mudança', () => {
    expect(onlyChanged({ address: '', bannerUrl: '', adminColor: '', whatsappApiUrl: null, whatsappInstance: '' }, tenant)).toEqual({});
  });

  it('ignora campos undefined', () => {
    expect(onlyChanged({ name: undefined, phone: undefined }, tenant)).toEqual({});
  });

  it('para limpar um campo que tinha valor envia "" (o backend entende como limpar)', () => {
    expect(onlyChanged({ logoUrl: '' }, tenant)).toEqual({ logoUrl: '' });
    expect(onlyChanged({ logoUrl: null }, tenant)).toEqual({ logoUrl: '' });
  });

  it('compara booleanos e números de forma estrita', () => {
    expect(onlyChanged({ isOpen: true, minAdvanceMinutes: 30 }, tenant)).toEqual({});
    expect(onlyChanged({ isOpen: false, minAdvanceMinutes: 60 }, tenant)).toEqual({ isOpen: false, minAdvanceMinutes: 60 });
  });
});

describe('saveErrorMessage', () => {
  it('junta os detalhes de validação do backend', () => {
    const err = new ApiError('Dados inválidos', 422, 'VALIDATION_ERROR', [
      { field: 'name', message: 'O nome deve ter entre 2 e 150 caracteres' },
      { field: 'primaryColor', message: 'Cor inválida (use o formato #RRGGBB)' },
    ]);
    expect(saveErrorMessage(err)).toBe('O nome deve ter entre 2 e 150 caracteres Cor inválida (use o formato #RRGGBB)');
  });

  it('usa a mensagem do erro quando não há detalhes e tem texto padrão para o resto', () => {
    expect(saveErrorMessage(new Error('Falhou'))).toBe('Falhou');
    expect(saveErrorMessage(new ApiError('Erro 500', 500))).toBe('Erro 500');
    expect(saveErrorMessage('???')).toBe('Não foi possível salvar. Tente novamente.');
  });
});
