import { NavLink } from 'react-router-dom';
import { MoreHorizontal, type LucideIcon } from 'lucide-react';

export interface BottomNavItem { to: string; label: string; icon: LucideIcon }

interface Props {
  items: BottomNavItem[];
  accentColor: string;
  /** Abre o menu completo (itens que não cabem na barra, conta, sair). */
  onMore: () => void;
  moreOpen?: boolean;
}

/**
 * Barra de navegação inferior do celular (até 4 itens + "Mais"). Some a partir de `md`,
 * onde a sidebar assume. Respeita a área segura do iPhone/Android com gestos.
 */
export function BottomNav({ items, accentColor, onMore, moreOpen = false }: Props) {
  const base = 'flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring';
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {items.slice(0, 4).map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `${base} ${isActive ? '' : 'text-muted-foreground'}`}
          style={({ isActive }) => (isActive ? { color: accentColor } : undefined)}
        >
          <Icon className="h-5 w-5" aria-hidden />
          <span className="max-w-full truncate">{label}</span>
        </NavLink>
      ))}
      <button
        type="button"
        onClick={onMore}
        aria-expanded={moreOpen}
        aria-controls="admin-sidebar"
        className={`${base} ${moreOpen ? '' : 'text-muted-foreground'}`}
        style={moreOpen ? { color: accentColor } : undefined}
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden />
        <span>Mais</span>
      </button>
    </nav>
  );
}
