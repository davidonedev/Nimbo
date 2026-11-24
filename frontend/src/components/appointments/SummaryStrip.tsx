export interface SummaryItem {
  label: string;
  value: number | string;
  /** Destaque (ex.: pendentes quando há algum). */
  highlight?: boolean;
}

/** Faixa de números do quadro geral: o valor grande e o rótulo pequeno embaixo (valor > rótulo). */
export function SummaryStrip({ items, label }: { items: SummaryItem[]; label: string }) {
  return (
    <dl aria-label={label} className="grid rounded-2xl border bg-card shadow-sm" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((it, i) => (
        <div key={it.label} className={`min-w-0 px-3 py-3 text-center ${i > 0 ? 'border-l' : ''}`}>
          <dd className={`truncate text-xl font-bold tabular-nums ${it.highlight ? 'text-primary' : ''}`}>{it.value}</dd>
          <dt className="truncate text-xs text-muted-foreground">{it.label}</dt>
        </div>
      ))}
    </dl>
  );
}
