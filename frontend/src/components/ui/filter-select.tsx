import { useId } from 'react';
import { Label } from '@/components/ui/label';

export interface FilterOption {
  value: string;
  label: string;
  /** Quantidade ao lado do rótulo, ex.: "Cabelo (4)". */
  count?: number;
}

interface Props {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  className?: string;
}

/**
 * Filtro em caixa de seleção (dropdown nativo): uma linha só, no lugar de vários botões. No celular abre o seletor do
 * próprio aparelho; alvo de 44 px. O rótulo fica acima, como nos demais filtros do painel.
 */
export function FilterSelect({ label, value, options, onChange, className = '' }: Props) {
  const id = useId();
  return (
    <div className={`min-w-0 space-y-1 ${className}`}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <select
        id={id} value={value} onChange={e => onChange(e.target.value)}
        className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:h-10"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.count !== undefined ? `${o.label} (${o.count})` : o.label}</option>)}
      </select>
    </div>
  );
}
