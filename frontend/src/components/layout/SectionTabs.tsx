import { NavLink, Outlet } from 'react-router-dom';
import type { SectionTab } from '@/config/sectionTabs';

/** Colunas da grade no celular: todas as abas à vista, sem rolar para o lado (classes literais para o Tailwind). */
function mobileColumns(count: number): string {
  if (count <= 1) return 'grid-cols-1';
  if (count === 2 || count === 4) return 'grid-cols-2';
  return 'grid-cols-3';
}

/**
 * Abas de uma seção, baseadas em ROTA (cada aba tem URL própria, funciona com voltar/compartilhar link).
 * No celular viram uma grade de botões (o texto quebra em duas linhas se precisar), sem rolagem horizontal e com
 * alvos de toque de 44 px; do tablet para cima, abas sublinhadas numa linha só.
 */
export function SectionTabs({ tabs, label }: { tabs: readonly SectionTab[]; label: string }) {
  return (
    <nav aria-label={label}>
      <ul className={`grid ${mobileColumns(tabs.length)} gap-2 md:flex md:gap-1 md:border-b`}>
        {tabs.map(t => (
          <li key={t.to} className="min-w-0">
            <NavLink
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex min-h-11 items-center justify-center rounded-lg border px-1.5 text-center text-[13px] font-medium leading-tight [overflow-wrap:anywhere] min-[380px]:px-2 min-[380px]:text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:-mb-px md:justify-start md:whitespace-nowrap md:rounded-none md:border-0 md:border-b-2 md:px-3 md:text-left ${
                  isActive
                    ? 'border-primary bg-primary/10 text-foreground md:bg-transparent'
                    : 'border-border text-muted-foreground hover:text-foreground md:border-transparent'}`}
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
