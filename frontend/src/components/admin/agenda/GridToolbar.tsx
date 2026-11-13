import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { GridInterval } from '@/lib/agendaGrid';
import type { Professional } from '@/types';

const INTERVALS: GridInterval[] = [15, 30, 60];
const initials = (name: string) => name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();

interface Props {
  professionals: Professional[];
  /** null = todos */
  selectedIds: string[] | null;
  onSelectedChange: (ids: string[] | null) => void;
  interval: GridInterval;
  onIntervalChange: (i: GridInterval) => void;
  /** profissional logado: sem filtro de profissionais */
  lockedProfessional: boolean;
}

/** Filtro de profissionais (todos ou selecionados) e intervalo da grade (15, 30 ou 60 min). */
export function GridToolbar({ professionals, selectedIds, onSelectedChange, interval, onIntervalChange, lockedProfessional }: Props) {
  const isSelected = (id: string) => selectedIds === null || selectedIds.includes(id);

  // Com "Todos" ativo, clicar em um profissional mostra só ele; depois, cada clique inclui ou tira alguém.
  const toggle = (id: string) => {
    if (selectedIds === null) { onSelectedChange([id]); return; }
    const next = selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id];
    // nada marcado ou todos marcados volta para "Todos"
    onSelectedChange(next.length === 0 || next.length === professionals.length ? null : next);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!lockedProfessional && professionals.length > 1 && (
        <div role="group" aria-label="Filtrar profissionais" className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            aria-pressed={selectedIds === null}
            onClick={() => onSelectedChange(null)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedIds === null ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}
          >
            Todos
          </button>
          {professionals.map(p => (
            <button
              key={p.id}
              type="button"
              aria-pressed={selectedIds !== null && isSelected(p.id)}
              onClick={() => toggle(p.id)}
              className={`flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedIds !== null && isSelected(p.id) ? 'border-primary bg-primary/10 text-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}
            >
              <Avatar className="h-5 w-5">
                {p.photoUrl && <AvatarImage src={p.photoUrl} alt="" />}
                <AvatarFallback className="text-[9px]">{initials(p.name)}</AvatarFallback>
              </Avatar>
              {p.name}
            </button>
          ))}
        </div>
      )}

      <div role="radiogroup" aria-label="Intervalo da grade" className="ml-auto inline-flex rounded-lg border bg-muted/40 p-0.5">
        {INTERVALS.map(i => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={interval === i}
            onClick={() => onIntervalChange(i)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${interval === i ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {i} min
          </button>
        ))}
      </div>
    </div>
  );
}
