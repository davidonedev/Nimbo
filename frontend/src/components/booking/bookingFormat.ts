import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatCurrency } from '@/lib/utils';
import type { Service } from '@/types';

/** 30 → "30 min" · 60 → "1h" · 90 → "1h30". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

/** Preço do serviço; sem valor cadastrado vira "A consultar". */
export function priceLabel(price: number | null | undefined): string {
  return price && price > 0 ? formatCurrency(price) : 'A consultar';
}

export function totalOf(services: Service[]) {
  return {
    minutes: services.reduce((sum, s) => sum + s.duration, 0),
    price: services.reduce((sum, s) => sum + (s.price || 0), 0),
  };
}

/** "sexta-feira, 20 de novembro às 10:00". */
export function whenLabel(date: string, time: string): string {
  return `${format(parseISO(date), "EEEE, d 'de' MMMM", { locale: ptBR })} às ${time}`;
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}
