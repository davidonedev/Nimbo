import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isNavItemActive, type NavItem } from '@/config/navigation';

interface Props {
  id?: string;
  /** Itens da lista principal. */
  items: readonly NavItem[];
  /** Itens do rodapé, separados dos demais (hoje: só "Configurações"). */
  footerItems?: readonly NavItem[];
  accentColor: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Gaveta do celular aberta? */
  open?: boolean;
  onClose?: () => void;
  /** Para onde o logo leva. */
  homeTo: string;
  homeLabel: string;
}

/**
 * Sidebar única, alimentada pela configuração central (`config/navigation.ts`). No desktop é
 * recolhível (só ícones, com tooltip); no celular os itens ficam na BottomNav e no "Mais" (a gaveta só aparece se `open`).
 * Usuário e Sair NÃO ficam aqui: vivem só no menu do avatar do navbar.
 */
export function Sidebar({ id = 'app-sidebar', items, footerItems = [], accentColor, collapsed, onToggleCollapsed, open = false, onClose, homeTo, homeLabel }: Props) {
  const { pathname } = useLocation();
  // Tooltip dos ícones com a sidebar recolhida: num portal, porque a nav (com rolagem) recortaria o que passa da borda.
  const [tip, setTip] = useState<{ label: string; top: number } | null>(null);
  const showTip = (label: string) => (e: React.SyntheticEvent<HTMLElement>) => {
    if (!collapsed || !window.matchMedia('(min-width: 768px)').matches) return;
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ label, top: r.top + r.height / 2 });
  };
  const hideTip = () => setTip(null);

  // `collapsed` só vale do breakpoint md para cima; na gaveta mobile o menu é sempre completo.
  const hideWhenCollapsed = collapsed ? 'md:hidden' : '';

  const renderLink = (item: NavItem) => {
    const active = isNavItemActive(item, pathname);
    const Icon = item.icon;
    return (
      <Link
        key={item.id}
        to={item.to}
        onClick={() => onClose?.()}
        aria-current={active ? 'page' : undefined}
        aria-label={collapsed ? item.label : undefined}
        style={active ? { backgroundColor: accentColor } : undefined}
        onMouseEnter={showTip(item.label)} onMouseLeave={hideTip} onFocus={showTip(item.label)} onBlur={hideTip}
        className={`group relative flex items-center gap-3 px-3 py-3 md:py-2.5 rounded-lg text-sm font-medium transition-colors
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
          ${collapsed ? 'md:justify-center md:px-0' : ''}
          ${active ? 'text-white' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <span className={hideWhenCollapsed}>{item.label}</span>
      </Link>
    );
  };

  return (
    <>
      <aside
        id={id}
        className={`fixed md:relative inset-y-0 left-0 z-40 w-64 ${collapsed ? 'md:w-16' : 'md:w-64'} bg-card border-r flex flex-col transform transition-[transform,width] duration-200 motion-reduce:transition-none ${open ? 'translate-x-0' : '-translate-x-full max-md:invisible md:translate-x-0'}`}
      >
        {/* Recolher / expandir (desktop) */}
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
          aria-expanded={!collapsed}
          aria-controls={id}
          className="absolute -right-3 top-5 z-50 hidden h-6 w-6 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:flex"
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" aria-hidden /> : <ChevronLeft className="h-3.5 w-3.5" aria-hidden />}
        </button>

        {/* Logo da Nimbo (versão escura no tema escuro); recolhida mostra só o ícone */}
        <div className={`p-4 flex h-14 items-center justify-between ${collapsed ? 'md:justify-center md:px-0' : ''}`}>
          <Link to={homeTo} onClick={() => onClose?.()} aria-label={homeLabel} className="flex items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className={hideWhenCollapsed}>
              <img src="/images/nimbo-logo-icon.png" alt="Nimbo" width={181} height={36} className="h-8 w-auto dark:hidden" />
              <img src="/images/nimbo-logo-branco.png" alt="Nimbo" width={181} height={36} className="hidden h-8 w-auto dark:block" />
            </span>
            {collapsed && (
              <img src="/images/favicon-32.png" alt="Nimbo" width={32} height={32} className="hidden h-8 w-8 rounded-lg md:block" />
            )}
          </Link>
          <Button variant="ghost" size="icon" className="md:hidden shrink-0" onClick={() => onClose?.()} aria-label="Fechar menu">
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>

        <nav aria-label="Menu principal" className="flex-1 p-3 space-y-0.5 overflow-y-auto overflow-x-hidden md:overflow-x-visible">
          {items.map(renderLink)}
        </nav>

        {footerItems.length > 0 && (
          <nav aria-label="Menu de configurações" className="border-t p-3 space-y-0.5">
            {footerItems.map(renderLink)}
          </nav>
        )}
      </aside>

      {tip && createPortal(
        <div role="tooltip" style={{ position: 'fixed', left: 72, top: tip.top, transform: 'translateY(-50%)' }}
          className="pointer-events-none z-[60] whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md">
          {tip.label}
        </div>,
        document.body,
      )}
    </>
  );
}
