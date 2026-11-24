import { useState } from 'react';
import { NavLink, Outlet, matchPath, useLocation } from 'react-router-dom';
import { Check, ChevronDown } from 'lucide-react';
import { ResponsiveSheet } from '@/components/ui/responsive-sheet';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import type { SectionTab } from '@/config/sectionTabs';

/** A aba da rota atual (a primeira se nenhuma bater). */
function currentTab(tabs: readonly SectionTab[], pathname: string): SectionTab {
  return tabs.find(t => matchPath({ path: t.to, end: !!t.end }, pathname)) ?? tabs[0];
}

/**
 * Celular: uma única barra mostra a seção atual e, ao tocar, abre uma folha de baixo com as seções (ícone, nome e uma
 * frase de apoio). Nada de várias abas apertadas na tela. Com uma seção só, não há o que escolher e a barra some.
 */
function SectionPicker({ tabs, label }: { tabs: readonly SectionTab[]; label: string }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  if (tabs.length < 2) return null;
  const current = currentTab(tabs, pathname);
  const CurrentIcon = current.icon;

  return (
    <>
      <button
        type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}
        aria-label={`${label}: ${current.label}. Trocar de seção`}
        className="flex min-h-14 w-full items-center gap-3 rounded-2xl border bg-card px-3 py-2 text-left shadow-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {CurrentIcon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CurrentIcon className="h-5 w-5" aria-hidden />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-muted-foreground">{label}</span>
          <span className="block truncate text-base font-semibold">{current.label}</span>
        </span>
        <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      <ResponsiveSheet open={open} onOpenChange={setOpen} title={label} description="Escolha a seção">
        <nav aria-label={`Seções de ${label}`}>
          <ul className="space-y-1">
            {tabs.map(t => {
              const Icon = t.icon;
              return (
                <li key={t.to}>
                  <NavLink
                    to={t.to} end={t.end} onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      `flex min-h-14 items-center gap-3 rounded-xl px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        isActive ? 'bg-primary/10' : 'hover:bg-muted'}`}
                  >
                    {({ isActive }) => (
                      <>
                        {Icon && (
                          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                            <Icon className="h-5 w-5" aria-hidden />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block text-base font-semibold">{t.label}</span>
                          {t.description && <span className="block text-sm text-muted-foreground">{t.description}</span>}
                        </span>
                        {isActive && <Check className="h-5 w-5 shrink-0 text-primary" aria-hidden />}
                      </>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>
      </ResponsiveSheet>
    </>
  );
}

/**
 * Abas de uma seção, baseadas em ROTA (cada aba tem URL própria, funciona com voltar/compartilhar link).
 * Tablet e desktop: abas sublinhadas numa linha. Celular: seletor com folha inferior ({@link SectionPicker}), ou nada
 * quando `hideOnMobile` (as seções já estão no menu "Mais" da barra inferior).
 */
export function SectionTabs({ tabs, label, hideOnMobile = false }: { tabs: readonly SectionTab[]; label: string; hideOnMobile?: boolean }) {
  const { isMobile } = useBreakpoint();
  if (isMobile) return hideOnMobile ? null : <SectionPicker tabs={tabs} label={label} />;
  return (
    <nav aria-label={label}>
      <ul className="flex gap-1 border-b">
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
export function SectionLayout({ tabs, label, hideOnMobile = false }: { tabs: readonly SectionTab[]; label: string; hideOnMobile?: boolean }) {
  return (
    <div className="space-y-6">
      <SectionTabs tabs={tabs} label={label} hideOnMobile={hideOnMobile} />
      <Outlet />
    </div>
  );
}
