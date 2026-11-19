import { NavLink, Outlet } from 'react-router-dom';
import type { SectionTab } from '@/config/sectionTabs';

/**
 * Abas de uma seção, baseadas em ROTA (cada aba tem URL própria, funciona com voltar/compartilhar link).
 * Rolam na horizontal no celular, com alvos de toque de 44 px.
 */
export function SectionTabs({ tabs, label }: { tabs: readonly SectionTab[]; label: string }) {
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="inline-flex min-w-full gap-1 border-b md:min-w-0">
        {tabs.map(t => (
          <li key={t.to}>
            <NavLink
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `-mb-px flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isActive ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              {t.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Seção com abas por cima e a tela da aba abaixo (via rotas filhas). */
export function SectionLayout({ tabs, label }: { tabs: readonly SectionTab[]; label: string }) {
  return (
    <div className="space-y-6">
      <SectionTabs tabs={tabs} label={label} />
      <Outlet />
    </div>
  );
}
