import { describe, expect, it } from 'vitest';
import { buildClientNotice, noticeEventFor, normalizeWaNumber, type ClientNoticeContext } from './clientNotice';

const ctx: ClientNoticeContext = {
  clientName: 'Ana Maria Lima',
  clientPhone: '(11) 91111-1111',
  tenantName: 'Studio Nimbo',
  tenantSlug: 'studio',
  tenantAddress: 'Rua A, 1',
  serviceName: 'Corte feminino',
  professionalName: 'Marina Souza',
  date: '2026-12-05',
  startTime: '10:00',
  siteUrl: 'https://nimbo.example',
};

describe('normalizeWaNumber', () => {
  it('prefixa 55 em número com DDD (10 e 11 dígitos)', () => {
    expect(normalizeWaNumber('(11) 91111-1111')).toBe('5511911111111');
    expect(normalizeWaNumber('11 3333-4444')).toBe('551133334444');
  });
  it('mantém número que já tem 55', () => {
    expect(normalizeWaNumber('+55 (11) 91111-1111')).toBe('5511911111111');
    expect(normalizeWaNumber('551133334444')).toBe('551133334444');
  });
  it('recusa vazio, curto e comprido demais', () => {
    expect(normalizeWaNumber(null)).toBeNull();
    expect(normalizeWaNumber('')).toBeNull();
    expect(normalizeWaNumber('91111-111')).toBeNull();
    expect(normalizeWaNumber('1234567890123456')).toBeNull();
  });
});

describe('buildClientNotice', () => {
  it('aprovação: texto exato, com endereço, e link wa.me codificado', () => {
    const n = buildClientNotice('approved', ctx)!;
    expect(n.text).toBe('Olá, Ana! Seu horário em Studio Nimbo está confirmado: Corte feminino com Marina Souza, 05/12/2026 às 10:00. Endereço: Rua A, 1.');
    expect(n.url).toBe(`https://wa.me/5511911111111?text=${encodeURIComponent(n.text)}`);
  });

  it('aprovação sem endereço não deixa "Endereço" solto', () => {
    expect(buildClientNotice('approved', { ...ctx, tenantAddress: '  ' })!.text).toBe(
      'Olá, Ana! Seu horário em Studio Nimbo está confirmado: Corte feminino com Marina Souza, 05/12/2026 às 10:00.',
    );
    expect(buildClientNotice('approved', { ...ctx, tenantAddress: undefined })!.text).not.toContain('Endereço');
  });

  it('recusa: pede para escolher outro horário no link do estabelecimento', () => {
    expect(buildClientNotice('refused', ctx)!.text).toBe(
      'Olá, Ana. Não conseguimos atender 05/12/2026 às 10:00 em Studio Nimbo. Escolha outro horário: https://nimbo.example/studio',
    );
  });

  it('cancelamento pelo dono: avisa e manda reagendar', () => {
    expect(buildClientNotice('cancelled_by_owner', ctx)!.text).toBe(
      'Olá, Ana. Seu horário de 05/12/2026 às 10:00 em Studio Nimbo foi cancelado. Para reagendar: https://nimbo.example/studio',
    );
  });

  it('usa só o primeiro nome, ignorando espaços extras', () => {
    expect(buildClientNotice('refused', { ...ctx, clientName: '  Bruno   Costa ' })!.text.startsWith('Olá, Bruno. ')).toBe(true);
  });

  it('o link codifica acentos, quebras e & do texto', () => {
    const n = buildClientNotice('approved', { ...ctx, tenantName: 'Salão & Cia', tenantAddress: 'Av. Brasil, 10' })!;
    const text = decodeURIComponent(n.url.split('?text=')[1]);
    expect(text).toBe(n.text);
    expect(n.url).not.toContain(' ');
    expect(n.url).toContain('%26');
  });

  it('sem telefone válido não há aviso', () => {
    expect(buildClientNotice('approved', { ...ctx, clientPhone: null })).toBeNull();
    expect(buildClientNotice('approved', { ...ctx, clientPhone: '123' })).toBeNull();
  });
});

describe('noticeEventFor', () => {
  it('só avisa aprovação, recusa e cancelamento pelo dono', () => {
    expect(noticeEventFor('pending', 'confirmed')).toBe('approved');
    expect(noticeEventFor('pending', 'cancelled')).toBe('refused');
    expect(noticeEventFor('confirmed', 'cancelled')).toBe('cancelled_by_owner');
  });
  it('concluir, falta e demais trocas não avisam', () => {
    expect(noticeEventFor('confirmed', 'completed')).toBeNull();
    expect(noticeEventFor('confirmed', 'no_show')).toBeNull();
    expect(noticeEventFor('pending', 'completed')).toBeNull();
    expect(noticeEventFor('no_show', 'cancelled')).toBeNull();
  });
});
