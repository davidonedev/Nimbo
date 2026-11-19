import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResponsiveSheet } from '@/components/ui/responsive-sheet';
import { useAuth } from '@/context/AuthContext';
import { useTenant } from '@/context/TenantContext';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { navItemsFor } from '@/config/navigation';
import { KIND_LABEL, MIN_QUERY_LENGTH, searchAdmin, type SearchResult } from '@/lib/globalSearch';

interface ComboProps {
  query: string;
  onQueryChange: (q: string) => void;
  results: SearchResult[];
  onSelect: (r: SearchResult) => void;
  /** Lista flutuante sob o campo (desktop). Falso: lista no fluxo da página (folha do celular). */
  floating: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  /** Foca o campo ao montar (folha do celular). */
  autoFocus?: boolean;
}

function SearchCombobox({ query, onQueryChange, results, onSelect, floating, open, onOpenChange, inputRef, autoFocus }: ComboProps) {
  const uid = useId();
  const listId = `${uid}-list`;
  const [active, setActive] = useState(0);
  const trimmed = query.trim();
  const tooShort = trimmed.length < MIN_QUERY_LENGTH;
  const showList = open && trimmed.length > 0;
  const current = Math.min(active, Math.max(results.length - 1, 0));

  useEffect(() => {
    if (!autoFocus) return;
    const t = setTimeout(() => inputRef.current?.focus(), 60); // depois de o foco inicial do diálogo assentar
    return () => clearTimeout(t);
  }, [autoFocus, inputRef]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (results.length === 0) return;
      e.preventDefault();
      onOpenChange(true);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((current + step + results.length) % results.length);
    } else if (e.key === 'Enter') {
      const r = results[current];
      if (r) { e.preventDefault(); onSelect(r); }
    } else if (e.key === 'Escape') {
      if (query) { e.preventDefault(); e.stopPropagation(); onQueryChange(''); setActive(0); }
      else { onOpenChange(false); inputRef.current?.blur(); }
    }
  };

  const list = (
    <ul id={listId} role="listbox" aria-label="Resultados da busca" className="max-h-[min(70vh,24rem)] overflow-y-auto overscroll-contain py-1">
      {results.map((r, i) => {
        const header = i === 0 || results[i - 1].kind !== r.kind;
        return (
          <li key={r.key} role="presentation">
            {header && <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" aria-hidden>{KIND_LABEL[r.kind]}</p>}
            <div
              id={`${uid}-opt-${i}`}
              role="option"
              aria-selected={i === current}
              onMouseEnter={() => setActive(i)}
              onMouseDown={e => e.preventDefault()} // não tira o foco do campo antes do clique
              onClick={() => onSelect(r)}
              className={`flex min-h-11 cursor-pointer flex-col justify-center px-3 py-1.5 text-sm ${i === current ? 'bg-muted' : ''}`}
            >
              <span className="truncate font-medium">{r.title}</span>
              {r.subtitle && <span className="truncate text-xs text-muted-foreground">{r.subtitle}</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );

  const message = tooShort
    ? `Digite ao menos ${MIN_QUERY_LENGTH} letras para buscar.`
    : results.length === 0 ? `Nenhum resultado para “${trimmed}”.` : null;

  return (
    <div className="relative w-full">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label="Buscar"
        aria-expanded={showList && results.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results.length > 0 ? `${uid}-opt-${current}` : undefined}
        autoComplete="off"
        placeholder="Buscar no painel…"
        value={query}
        onChange={e => { onQueryChange(e.target.value); setActive(0); onOpenChange(true); }}
        onFocus={() => onOpenChange(true)}
        onKeyDown={onKeyDown}
        className="h-11 w-full rounded-lg border bg-muted/40 pl-9 pr-16 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9"
      />
      {query ? (
        <button
          type="button" aria-label="Limpar busca"
          onMouseDown={e => e.preventDefault()}
          onClick={() => { onQueryChange(''); inputRef.current?.focus(); }}
          className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-7 md:w-7"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      ) : (
        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground lg:inline" aria-hidden>
          Ctrl K
        </kbd>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {showList && !tooShort ? (results.length === 0 ? 'Nenhum resultado.' : `${results.length} resultado${results.length > 1 ? 's' : ''}.`) : ''}
      </p>

      {showList && (
        floating ? (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border bg-card shadow-lg md:min-w-[22rem]">
            {message ? <p className="px-3 py-3 text-sm text-muted-foreground">{message}</p> : list}
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-lg border bg-card">
            {message ? <p className="px-3 py-3 text-sm text-muted-foreground">{message}</p> : list}
          </div>
        )
      )}
    </div>
  );
}

/**
 * Busca do painel: páginas, clientes, agendamentos, serviços e profissionais, em memória (os dados já
 * estão carregados). Escolher um resultado abre a tela já filtrada (`?q=`). Atalho Ctrl/⌘ + K.
 * Desktop: campo com lista suspensa. Celular: ícone que abre uma folha com o mesmo campo.
 */
export function AdminSearch() {
  const { clients, appointments, services, professionals } = useTenant();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isMobile } = useBreakpoint();

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const sheetInputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const navItems = useMemo(() => navItemsFor(user?.role), [user?.role]);
  const results = useMemo(
    () => searchAdmin({ clients, appointments, services, professionals, navItems }, query),
    [clients, appointments, services, professionals, navItems, query],
  );

  const select = (r: SearchResult) => {
    setQuery(''); setOpen(false); setSheetOpen(false);
    inputRef.current?.blur();
    navigate(r.to);
  };

  // Ctrl/⌘ + K: foca o campo (desktop) ou abre a folha (celular)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isMobile) setSheetOpen(true);
        else { inputRef.current?.focus(); inputRef.current?.select(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isMobile]);

  // Clique fora fecha a lista (o texto digitado fica)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  return (
    <>
      {/* Celular: só o ícone; abre a folha de busca */}
      <Button variant="ghost" size="icon" className="md:hidden" aria-label="Buscar" type="button" onClick={() => setSheetOpen(true)}>
        <Search className="h-4 w-4" aria-hidden />
      </Button>
      <ResponsiveSheet open={sheetOpen && isMobile} onOpenChange={o => { setSheetOpen(o); if (!o) setQuery(''); }} title="Buscar" description="Clientes, agendamentos, serviços e profissionais">
        <SearchCombobox
          query={query} onQueryChange={setQuery} results={results} onSelect={select}
          floating={false} open onOpenChange={() => {}} inputRef={sheetInputRef} autoFocus
        />
      </ResponsiveSheet>

      {/* Desktop: campo com lista suspensa */}
      <div ref={rootRef} className="hidden w-full max-w-xs md:block lg:max-w-sm" role="search">
        <SearchCombobox
          query={query} onQueryChange={setQuery} results={results} onSelect={select}
          floating open={open} onOpenChange={setOpen} inputRef={inputRef}
        />
      </div>
    </>
  );
}
