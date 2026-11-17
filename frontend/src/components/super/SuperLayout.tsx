import { useState, useEffect } from 'react';
import { useNavigate, Outlet } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ToastProvider } from '@/components/ui/toast';
import { UserMenu } from '@/components/layout/admin/UserMenu';
import { BottomNav } from '@/components/layout/BottomNav';
import { MoreSheet } from '@/components/layout/MoreSheet';
import { Sidebar } from '@/components/layout/Sidebar';
import { ScreenSuspense } from '@/components/layout/ScreenFallback';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { useSidebarCollapsed } from '@/hooks/useSidebarCollapsed';
import { hexToHslVars } from '@/lib/utils';
import { bottomBarItems, HOME_PATH, moreItems, navItemsFor } from '@/config/navigation';
import { getSuperColor } from './SuperSettingsView';

/**
 * Layout do super admin: a mesma Sidebar e BottomNav do admin, alimentadas pela config central
 * (`config/navigation.ts`, só itens do papel super_admin). Usuário e Sair vivem só no menu do avatar.
 */
export default function SuperLayout() {
  const { logout, user } = useAuth();
  const { isDark, toggle } = useTheme();
  const { collapsed, toggle: toggleCollapsed } = useSidebarCollapsed();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const [primaryColor, setPrimaryColor] = useState(getSuperColor);

  // Aplica a cor como CSS var — igual ao AdminLayout
  useEffect(() => {
    const apply = (color: string) => {
      const { hsl, isLight } = hexToHslVars(color);
      const fgHsl = isLight ? '222 47% 11%' : '0 0% 100%';
      const root = document.documentElement;
      root.style.setProperty('--primary', hsl);
      root.style.setProperty('--primary-foreground', fgHsl);
      root.style.setProperty('--ring', hsl);
    };

    apply(primaryColor);

    // Ouve mudanças feitas na página de configurações sem reload
    const handler = (e: Event) => {
      const color = (e as CustomEvent<string>).detail;
      setPrimaryColor(color);
      apply(color);
    };
    window.addEventListener('super-color-change', handler);

    return () => {
      window.removeEventListener('super-color-change', handler);
      const root = document.documentElement;
      root.style.removeProperty('--primary');
      root.style.removeProperty('--primary-foreground');
      root.style.removeProperty('--ring');
    };
  }, [primaryColor]);

  const handleLogout = () => { logout(); navigate('/login', { replace: true }); };

  const role = user?.role;

  return (
    <div className="flex h-dvh bg-muted/30 overflow-hidden">
      <Sidebar
        id="super-sidebar"
        items={navItemsFor(role, 'main')}
        footerItems={navItemsFor(role, 'footer')}
        accentColor={primaryColor}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        homeTo={HOME_PATH.super_admin}
        homeLabel="Nimbo — ir para o Painel"
      />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="h-[calc(3.5rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] border-b bg-card flex items-center px-4 gap-3 shrink-0">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">Super Admin</Badge>
          <div className="flex-1" />
          <Button variant="ghost" size="icon" onClick={toggle} aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'} title={isDark ? 'Tema claro' : 'Tema escuro'}>
            {isDark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
          </Button>
          <UserMenu
            name={user?.name ?? ''} email={user?.email} accentColor={primaryColor} onLogout={handleLogout}
            accountPath="/super/account" onToggleTheme={toggle} isDark={isDark}
          />
        </header>
        <main className="flex-1 overflow-y-auto p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:p-6">
          <ToastProvider>
            <ScreenSuspense><Outlet /></ScreenSuspense>
          </ToastProvider>
        </main>
      </div>

      <BottomNav items={bottomBarItems(role)} accentColor={primaryColor} onMore={() => setMoreOpen(true)} moreOpen={moreOpen} />
      <MoreSheet items={moreItems(role)} open={moreOpen} onOpenChange={setMoreOpen} accentColor={primaryColor} />
    </div>
  );
}
