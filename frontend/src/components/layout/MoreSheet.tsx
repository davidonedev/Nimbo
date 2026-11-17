import { Link, useLocation } from 'react-router-dom';
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
 * Folha do "Mais" no celular: lista os itens que não cabem na barra inferior.
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
