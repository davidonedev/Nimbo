import { Link, matchPath, useLocation } from 'react-router-dom';
import { ResponsiveSheet } from '@/components/ui/responsive-sheet';
import { isNavItemActive, type NavItem } from '@/config/navigation';

interface Props {
  /** Só os itens `mobile: 'more'` da config central. */
  items: readonly NavItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accentColor: string;
}

/**
 * Folha do "Mais" no celular: lista os itens que não cabem na barra inferior. Um item com `sections` (Configurações)
 * vira um grupo com um link por seção, para ir direto à tela certa.
 * Foco preso e Esc fechando (Radix, via ResponsiveSheet); cada link tem 44 px de altura.
 */
export function MoreSheet({ items, open, onOpenChange, accentColor }: Props) {
  const { pathname } = useLocation();
  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title="Mais opções">
      <nav aria-label="Mais opções">
        <ul className="space-y-1">
          {items.map(item => {
            const active = isNavItemActive(item, pathname);
            const Icon = item.icon;
            if (item.sections && item.sections.length > 0) {
              return (
                <li key={item.id} className="mt-2 border-t pt-2">
                  <h3 id={`more-${item.id}`} className="flex items-center gap-2 px-3 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Icon className="h-4 w-4" aria-hidden />{item.label}
                  </h3>
                  <ul aria-labelledby={`more-${item.id}`} className="space-y-1">
                    {item.sections.map(s => {
                      const SectionIcon = s.icon;
                      const sectionActive = !!matchPath({ path: s.to, end: !!s.end }, pathname);
                      return (
                        <li key={s.to}>
                          <Link
                            to={s.to}
                            onClick={() => onOpenChange(false)}
                            aria-current={sectionActive ? 'page' : undefined}
                            className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${sectionActive ? '' : 'text-foreground hover:bg-muted'}`}
                            style={sectionActive ? { backgroundColor: accentColor, color: '#fff' } : undefined}
                          >
                            {SectionIcon && <SectionIcon className="h-5 w-5 shrink-0" aria-hidden />}
                            {s.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            }
            return (
              <li key={item.id}>
                <Link
                  to={item.to}
                  onClick={() => onOpenChange(false)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? '' : 'text-foreground hover:bg-muted'}`}
                  style={active ? { backgroundColor: accentColor, color: '#fff' } : undefined}
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </ResponsiveSheet>
  );
}
