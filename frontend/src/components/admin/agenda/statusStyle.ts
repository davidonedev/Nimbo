import { CalendarCheck2, CalendarClock, CheckCircle2, UserX, type LucideIcon } from 'lucide-react';
import type { AppointmentStatus } from '@/types';

/** Cada status tem cor, ícone E texto: a cor nunca é a única pista. */
export const STATUS_META: Record<AppointmentStatus, { label: string; icon: LucideIcon; card: string }> = {
  pending: { label: 'Pendente', icon: CalendarClock, card: 'border-amber-500 bg-amber-50 text-amber-950 dark:border-amber-500 dark:bg-amber-950/50 dark:text-amber-50' },
  confirmed: { label: 'Confirmado', icon: CalendarCheck2, card: 'border-blue-500 bg-blue-50 text-blue-950 dark:border-blue-400 dark:bg-blue-950/50 dark:text-blue-50' },
  completed: { label: 'Concluído', icon: CheckCircle2, card: 'border-green-600 bg-green-50 text-green-950 dark:border-green-500 dark:bg-green-950/50 dark:text-green-50' },
  no_show: { label: 'Faltou', icon: UserX, card: 'border-red-500 bg-red-50 text-red-950 dark:border-red-500 dark:bg-red-950/50 dark:text-red-50' },
  cancelled: { label: 'Cancelado', icon: UserX, card: 'border-zinc-400 bg-zinc-100 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200' },
};
