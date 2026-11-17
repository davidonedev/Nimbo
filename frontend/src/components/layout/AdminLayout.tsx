import { useState, useEffect } from 'react';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import { Sun, Moon, Plus, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { AdminSearch } from './admin/AdminSearch';
import { OpenStatus } from './admin/OpenStatus';
import { UserMenu } from './admin/UserMenu';
import { BottomNav } from './BottomNav';
import { Sidebar } from './Sidebar';
import { Fab } from '@/components/ui/fab';
import { useAuth, IMPERSONATION_BACKUP_KEY } from '@/context/AuthContext';
import { useTenant } from '@/context/TenantContext';
import { useTheme } from '@/hooks/useTheme';
import { useSidebarCollapsed } from '@/hooks/useSidebarCollapsed';
import { hexToHslVars } from '@/lib/utils';
import { useAppointmentNotifications } from '@/hooks/useAppointmentNotifications';
import { bottomBarItems, navItemsFor } from '@/config/navigation';

export default function AdminLayout() {
  const { logout, user }                            = useAuth();
  const { tenant, appointments, clients, services } = useTenant();
  const { isDark, toggle }                          = useTheme();
  const { collapsed, toggle: toggleCollapsed }      = useSidebarCollapsed();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  const [impersonating] = useState<string | null>(() => {
    try { return localStorage.getItem(IMPERSONATION_BACKUP_KEY) ? (tenant?.name ?? 'tenant') : null; } catch { return null; }
  });

  const exitImpersonation = () => {
    try {
      const backup = localStorage.getItem(IMPERSONATION_BACKUP_KEY);
      if (backup) {
        sessionStorage.setItem('agendepro_session', backup);
        localStorage.removeItem(IMPERSONATION_BACKUP_KEY);
      }
    } catch { /* ignore */ }
    logout();
    window.location.href = '/super/tenants';
  };

  const { notifications, unreadCount, markAllRead, activeToasts, dismissToast, clearAll } =
    useAppointmentNotifications(appointments, clients, services, `apn_${tenant?.id ?? 'admin'}`);

  const handleLogout = () => { logout(); navigate('/login', { replace: true }); };

  const accentColor = tenant.adminColor ?? tenant.primaryColor;
  const { hsl, isLight } = hexToHslVars(accentColor);
  const fgHsl = isLight ? '222 47% 11%' : '0 0% 100%';

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--primary', hsl);
    root.style.setProperty('--primary-foreground', fgHsl);
    root.style.setProperty('--ring', hsl);
    return () => {
      root.style.removeProperty('--primary');
      root.style.removeProperty('--primary-foreground');
      root.style.removeProperty('--ring');
    };
  }, [hsl, fgHsl]);

  const role = user?.role;

  return (
    <div
      className="flex h-dvh bg-muted/30 overflow-hidden"
      style={{ '--primary': hsl, '--primary-foreground': fgHsl, '--ring': hsl } as React.CSSProperties}
    >
      {open && <div className="fixed inset-0 bg-black/40 z-[35] md:hidden" onClick={() => setOpen(false)} />}

      <Sidebar
        id="admin-sidebar"
        items={navItemsFor(role, 'main')}
        footerItems={navItemsFor(role, 'footer')}
        accentColor={accentColor}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        open={open}
        onClose={() => setOpen(false)}
        homeTo="/admin/dashboard"
        homeLabel="Nimbo — ir para o Painel"
      />

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="h-[calc(3.5rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] border-b bg-card flex items-center px-4 gap-3 shrink-0">
          <AdminSearch />
          <div className="flex-1" />
          <OpenStatus />
          {/* TODO: abrir o fluxo de novo agendamento (solicitação do zero). Por ora, só o botão. */}
          <Button type="button" size="sm" className="hidden gap-1.5 md:inline-flex" aria-label="Novo agendamento" onClick={() => { /* TODO */ }}>
            <Plus className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Novo</span>
          </Button>
          <Button variant="ghost" size="icon" onClick={toggle} aria-label={isDark ? "Ativar tema claro" : "Ativar tema escuro"} title={isDark ? "Tema claro" : "Tema escuro"}>
            {isDark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
          </Button>
          <NotificationBell
            notifications={notifications}
            unreadCount={unreadCount}
            markAllRead={markAllRead}
            activeToasts={activeToasts}
            dismissToast={dismissToast}
            clearAll={clearAll}
          />
          <UserMenu
            name={user?.name ?? ''} email={user?.email} accentColor={accentColor} onLogout={handleLogout}
            accountPath="/admin/settings" schedulePath="/admin/settings/schedule" onToggleTheme={toggle} isDark={isDark}
          />
        </header>
        {impersonating && (
          <div className="shrink-0 flex items-center gap-3 border-b bg-amber-50 px-4 py-2 text-sm dark:bg-amber-950/30">
            <Shield className="h-4 w-4 shrink-0 text-amber-600" />
            <span className="flex-1 text-amber-800 dark:text-amber-300">
              Acessando como admin — <strong>{impersonating}</strong>
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 border-amber-300 text-xs text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300"
              onClick={exitImpersonation}
            >
              Voltar ao Super Admin
            </Button>
          </div>
        )}
        <main className="flex-1 overflow-y-auto p-4 pb-[calc(9rem+env(safe-area-inset-bottom))] md:p-6">
          <Outlet />
        </main>
      </div>

      {/* Celular: navegação inferior e botão flutuante (no desktop valem a sidebar e o "Novo" da navbar) */}
      <BottomNav items={bottomBarItems(role)} accentColor={accentColor} onMore={() => setOpen(true)} moreOpen={open} />
      {/* Só no Painel: nas demais telas a própria página já tem seu botão de criar. TODO: abrir o fluxo de novo agendamento; por ora leva à Agenda */}
      {pathname === '/admin/dashboard' && <Fab label="Novo agendamento" to="/admin/agenda" />}
    </div>
  );
}
