import { CalendarDays, CalendarRange, LayoutGrid } from 'lucide-react';
import type { AgendaView } from '@/hooks/useAgendaState';

const OPTIONS: { value: AgendaView; label: string; icon: typeof CalendarDays }[] = [
  { value: 'day', label: 'Dia', icon: CalendarDays },
  { value: 'week', label: 'Semana', icon: CalendarRange },
  { value: 'month', label: 'Mês', icon: LayoutGrid },
];

/** Alternador Dia / Semana / Mês (grupo de rádio acessível). */
export function ViewSwitcher({ value, onChange }: { value: AgendaView; onChange: (v: AgendaView) => void }) {
  return (
    <div role="radiogroup" aria-label="Visão da agenda" className="inline-flex rounded-lg border bg-muted/40 p-0.5">
      {OPTIONS.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${value === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Icon className="h-4 w-4" aria-hidden /> {label}
        </button>
      ))}
    </div>
  );
}
