import { addDays, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "2026-11-25" → "25/11/2026". */
export const fmtDate = (isoDay: string) => format(parseISO(isoDay), 'dd/MM/yyyy');

/** Cabeçalho do dia na lista: "Hoje · Quarta, 25 de nov" / "Amanhã · …" / "Ontem · …" / "Quarta, 18 de nov". */
export function dayHeading(isoDay: string, todayIso: string): string {
  const full = capitalize(format(parseISO(isoDay), "EEE, d 'de' MMM", { locale: ptBR }));
  const rel = isoDay === todayIso ? 'Hoje'
    : isoDay === format(addDays(parseISO(todayIso), 1), 'yyyy-MM-dd') ? 'Amanhã'
    : isoDay === format(addDays(parseISO(todayIso), -1), 'yyyy-MM-dd') ? 'Ontem' : null;
  return rel ? `${rel} · ${full}` : full;
}

/** Nome acessível de uma ação: diz quem, quando e o quê (vários botões iguais convivem na lista). */
export const actionLabel = (label: string, clientName: string, isoDay: string, startTime: string) =>
  `${label}: ${clientName}, ${fmtDate(isoDay)} às ${startTime}`;

/** Chip de filtro (alvo de 44 px no celular, 36 px no desktop). */
export const chipClass = (on: boolean) =>
  `inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9 sm:px-3 ${on ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground'}`;
