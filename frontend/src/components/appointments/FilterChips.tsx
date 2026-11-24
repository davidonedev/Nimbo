import { chipClass } from './appointmentUi';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  /** Quantidade ao lado do rótulo (opcional). */
  count?: number;
}

interface Props<T extends string> {
  label: string;
  options: ChipOption<T>[];
  /** Valor marcado; null = nenhum. */
  value: T | null;
  onChange: (value: T) => void;
}

/** Linha de chips com rolagem horizontal; cada chip é um botão com `aria-pressed`. O nome acessível inclui a contagem. */
export function FilterChips<T extends string>({ label, options, value, onChange }: Props<T>) {
  return (
    <div role="group" aria-label={label} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {options.map(o => {
        const on = value === o.value;
        return (
          <button key={o.value} type="button" aria-pressed={on} onClick={() => onChange(o.value)} className={chipClass(on)}>
            {o.label}
            {o.count !== undefined && (
              <>{' '}<span className={`text-xs tabular-nums ${on ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{o.count}</span></>
            )}
          </button>
        );
      })}
    </div>
  );
}
