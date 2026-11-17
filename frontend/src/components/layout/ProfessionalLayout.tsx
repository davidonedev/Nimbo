import { Outlet, useNavigate } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { UserMenu } from './admin/UserMenu';
import { BottomNav } from './BottomNav';
import { Sidebar } from './Sidebar';
import { useAuth } from '@/context/AuthContext';
import { useProfessional } from '@/context/ProfessionalContext';
import { useTheme } from '@/hooks/useTheme';
import { useSidebarCollapsed } from '@/hooks/useSidebarCollapsed';
import { hexToHslVars } from '@/lib/utils';
import { useAppointmentNotifications } from '@/hooks/useAppointmentNotifications';
import { HOME_PATH, bottomBarItems, navItemsFor } from '@/config/navigation';

/**
 * Portal do profissional: mesmo shell do admin (Sidebar e BottomNav alimentadas pela config
 * central), mas só com Painel, Agenda e Clientes. Usuário e Sair ficam apenas no avatar do navbar.
 * O papel é fixo aqui: este layout só é montado dentro do guard do profissional.
 */
const ROLE = 'professional' as const;

export default function ProfessionalLayout() {
  const { logout, user }                                          = useAuth();
  const { professional, tenant, appointments, clients, services } = useProfessional();
  const { isDark, toggle }                                        = useTheme();
  const { collapsed, toggle: toggleCollapsed }                    = useSidebarCollapsed();
  const navigate                                                  = useNavigate();

  const { notifications, unreadCount, markAllRead, activeToasts, dismissToast, clearAll } =
    useAppointmentNotifications(appointments, clients, services);

  const accentColor           = tenant.adminColor ?? tenant.primaryColor;
  const { hsl, isLight }      = hexToHslVars(accentColor);
  const fgHsl                 = isLight ? '222 47% 11%' : '0 0% 100%';

  const handleLogout = () => { logout(); navigate('/login', { replace: true }); };

  return (
    <div
      className="flex h-dvh bg-muted/30 overflow-hidden"
      style={{ '--primary': hsl, '--primary-foreground': fgHsl, '--ring': hsl } as React.CSSProperties}
    >
      {/* No celular a navegação é a barra inferior (sem "Mais": só há 3 itens); a sidebar é só do desktop. */}
      <div className="hidden md:contents">
        <Sidebar
          id="prof-sidebar"
          items={navItemsFor(ROLE, 'main')}
          footerItems={navItemsFor(ROLE, 'footer')}
          accentColor={accentColor}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
          open={false}
          onClose={() => {}}
          homeTo={HOME_PATH[ROLE]}
          homeLabel="Nimbo — ir para o Painel"
        />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="h-[calc(3.5rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] border-b bg-card flex items-center px-4 gap-3 shrink-0">
          <p className="min-w-0 truncate text-sm font-medium text-muted-foreground">{tenant.name}</p>
          <div className="flex-1" />
          <Button variant="ghost" size="icon" className="h-11 w-11" onClick={toggle} aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'} title={isDark ? 'Tema claro' : 'Tema escuro'}>
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
            name={professional.name} email={user?.email} photoUrl={professional.photoUrl} accentColor={accentColor}
            onLogout={handleLogout} schedulePath="/professional/settings" onToggleTheme={toggle} isDark={isDark}
          />
        </header>
        <main className="flex-1 overflow-y-auto p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:p-6">
          <Outlet />
        </main>
      </div>

      <BottomNav items={bottomBarItems(ROLE)} accentColor={accentColor} />
    </div>
  );
}
