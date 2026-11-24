import { addDays, differenceInCalendarDays, differenceInCalendarWeeks, format, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Rótulo do botão central de navegação da Agenda (‹ rótulo ›), que acompanha o dia ou a semana em exibição.
 * Dia: "Hoje", "Amanhã", "Ontem" ou "Quinta-feira, 26 de novembro". Semana (segunda a sábado, como a grade):
 * "Esta semana", "Próxima semana", "Semana passada" ou "30 de nov – 5 de dez".
 */
export function dayNavLabel(current: Date, now: Date, mode: 'day' | 'week'): string {
  if (mode === 'day') {
    const diff = differenceInCalendarDays(current, now);
    if (diff === 0) return 'Hoje';
    if (diff === 1) return 'Amanhã';
    if (diff === -1) return 'Ontem';
    return capitalize(format(current, "EEEE, d 'de' MMMM", { locale: ptBR }));
  }
  const diff = differenceInCalendarWeeks(current, now, { weekStartsOn: 1 });
  if (diff === 0) return 'Esta semana';
  if (diff === 1) return 'Próxima semana';
  if (diff === -1) return 'Semana passada';
  const start = startOfWeek(current, { weekStartsOn: 1 });
  return `${format(start, "d 'de' MMM", { locale: ptBR })} – ${format(addDays(start, 5), "d 'de' MMM", { locale: ptBR })}`;
}
