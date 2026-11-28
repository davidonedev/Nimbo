import type { Professional, Tenant } from '../types';
import { openStatus } from './bookingHours';

type Hours = Pick<Professional, 'workingDays' | 'workingHours'>;

/** Agora em Brasília: data (yyyy-MM-dd) e hora (HH:mm), como devolve nowBrasilia() em lib/scheduling. */
export interface BrasiliaNow { date: string; time: string }

/**
 * Aberto/Fechado do estabelecimento — ÚNICO ponto que decide o estado exibido na navbar.
 *
 * Segue o expediente dos profissionais: dentro do horário de algum profissional (no dia da semana dele) fica
 * "Aberto"; passou do horário de fechar (ex.: 18h), ou é dia em que ninguém trabalha, vira "Fechado" sozinho e volta a
 * "Aberto" quando o expediente começa. O intervalo de almoço não fecha o estabelecimento.
 * O interruptor "Status do Estabelecimento" (tenant.isOpen) continua mandando: desligado = "Fechado" o tempo todo.
 * Sem nenhum profissional cadastrado ainda, vale só o interruptor.
 */
export function computeOpenStatus(
  tenant: Pick<Tenant, 'isOpen'>,
  professionals: Hours[] = [],
  now?: BrasiliaNow,
): boolean {
  if (!tenant.isOpen) return false;
  if (!now || professionals.length === 0) return true;
  const dayOfWeek = new Date(`${now.date}T12:00:00`).getDay(); // 0=Dom … 6=Sáb, do dia de Brasília
  return openStatus(true, professionals, { dayOfWeek, time: now.time }).kind === 'open';
}
