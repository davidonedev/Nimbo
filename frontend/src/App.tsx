import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useParams } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { GOOGLE_CLIENT_ID } from './lib/googleAuth';
import { PlatformProvider }        from './context/PlatformContext';
import { AuthProvider, useAuth }   from './context/AuthContext';
import { TenantProvider }          from './context/TenantContext';
import { PublicTenantProvider }    from './context/PublicTenantContext';
import { PublicClientProvider }   from './context/PublicClientContext';
import { ProfessionalProvider }    from './context/ProfessionalContext';

// Pages & layouts
const LandingPage = lazy(() => import('./pages/LandingPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const SignupPage = lazy(() => import('./pages/SignupPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const ConfirmEmailChangePage = lazy(() => import('./pages/ConfirmEmailChangePage'));
const AccessHelpPage = lazy(() => import('./pages/AccessHelpPage'));
const AccessHelpList = lazy(() => import('./components/account/AccessHelpList'));
const SuperLayout = lazy(() => import('./components/super/SuperLayout'));
const SuperDashboard = lazy(() => import('./components/super/SuperDashboard'));
const TenantsView = lazy(() => import('./components/super/TenantsView'));
const TenantDetailView = lazy(() => import('./components/super/TenantDetailView'));
const PlatformMetricsView = lazy(() => import('./components/super/PlatformMetricsView'));
const SuperAccountView = lazy(() => import('./components/super/SuperAccountView'));
const PlansView = lazy(() => import('./components/super/PlansView'));
const AdminLayout = lazy(() => import('./components/layout/AdminLayout'));
const ProfessionalLayout = lazy(() => import('./components/layout/ProfessionalLayout'));
const ClientLayout = lazy(() => import('./components/layout/ClientLayout'));
const Dashboard = lazy(() => import('./components/admin/Dashboard'));
const AgendaView = lazy(() => import('./components/admin/AgendaView'));
const AppointmentsView = lazy(() => import('./components/admin/AppointmentsView'));
const AdminAgenda = lazy(() => import('./components/admin/agenda/AdminAgenda'));
const ProfessionalAgenda = lazy(() => import('./components/admin/agenda/ProfessionalAgenda'));
const ClientsView = lazy(() => import('./components/admin/ClientsView'));
const ProfessionalsView = lazy(() => import('./components/admin/ProfessionalsView'));
const RevenueView = lazy(() => import('./components/admin/RevenueView'));
const SettingsView = lazy(() => import('./components/admin/SettingsView'));
const ProfDashboardView = lazy(() => import('./components/professional/ProfDashboardView'));
const ProfClientsView = lazy(() => import('./components/professional/ProfClientsView'));
const ProfAgendaView = lazy(() => import('./components/professional/ProfAgendaView'));
const ProfRevenueView = lazy(() => import('./components/professional/ProfRevenueView'));
const ProfSettingsView = lazy(() => import('./components/professional/ProfSettingsView'));
const ProfServicesView = lazy(() => import('./components/professional/ProfServicesView'));
const ServicesView = lazy(() => import('./components/admin/ServicesView'));
const ProductsView = lazy(() => import('./components/admin/ProductsView'));
const BlockedSlotsView = lazy(() => import('./components/admin/BlockedSlotsView'));
const RemindersView = lazy(() => import('./components/admin/RemindersView'));
// Agendamento público padrão de todos os tenants (Nome + Celular + código por WhatsApp)
const BookLayout = lazy(() => import('./components/booking/BookLayout'));
const StepServices = lazy(() => import('./components/booking/StepServices'));
const StepTime = lazy(() => import('./components/booking/StepTime'));
const StepContact = lazy(() => import('./components/booking/StepContact'));
const StepVerify = lazy(() => import('./components/booking/StepVerify'));
const StepDone = lazy(() => import('./components/booking/StepDone'));
const MyBookings = lazy(() => import('./components/booking/MyBookings'));
const MyAppointments = lazy(() => import('./components/client/MyAppointments'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
import { SectionLayout } from './components/layout/SectionTabs';
import { SERVICES_TABS, SETTINGS_TABS, REPORTS_TABS, SUPER_SETTINGS_TABS } from './config/sectionTabs';
import { canEnterArea } from './config/navigation';
import { LEGACY_ADMIN_REDIRECTS } from './config/legacyRoutes';
import { LoginSplashHost }       from './motion/LoginSplashHost';
import { ServerWakingNotice }    from './components/ServerWakingNotice';
import { RouteErrorBoundary }    from './components/RouteErrorBoundary';

function BookingRedirect() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  return <Navigate to={`/${tenantSlug}`} replace />;
}

// ─── Route guards ─────────────────────────────────────────────────────────────
function SuperGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user)                       return <Navigate to="/login" replace />;
  if (!canEnterArea(user.role, 'super')) return <Navigate to="/login" replace />;
  return <PlatformProvider>{children}</PlatformProvider>;
}

function TenantGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user)                        return <Navigate to="/login" replace />;
  if (!canEnterArea(user.role, 'admin')) return <Navigate to="/login" replace />;
  return <TenantProvider>{children}</TenantProvider>;
}

function ProfessionalGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user)                        return <Navigate to="/login" replace />;
  if (!canEnterArea(user.role, 'professional')) return <Navigate to="/login" replace />;
  return <ProfessionalProvider>{children}</ProfessionalProvider>;
}

// ─── App shell ────────────────────────────────────────────────────────────────
function AppRoutes() {
  return (
    <RouteErrorBoundary>
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground" role="status">Carregando…</div>}>
    <Routes>
      {/* Landing page */}
      <Route index element={<LandingPage />} />
      <Route path="termos"      element={<TermsPage />} />
      <Route path="privacidade" element={<PrivacyPage />} />

      {/* Auth */}
      <Route path="login"  element={<LoginPage />} />
      <Route path="signup" element={<SignupPage />} />
      <Route path="forgot-password"      element={<ForgotPasswordPage />} />
      <Route path="reset-password"       element={<ResetPasswordPage />} />
      <Route path="confirm-email-change" element={<ConfirmEmailChangePage />} />
      <Route path="access-help"          element={<AccessHelpPage />} />

      {/* Super admin */}
      <Route path="super" element={<SuperGuard><SuperLayout /></SuperGuard>}>
        <Route index              element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard"   element={<SuperDashboard />} />
        <Route path="tenants"     element={<TenantsView />} />
        <Route path="tenants/:tenantId" element={<TenantDetailView />} />
        <Route path="metrics"     element={<PlatformMetricsView />} />
        <Route path="plans"       element={<PlansView />} />
        {/* Configurações do super admin: conta e pedidos de acesso (abas) */}
        <Route element={<SectionLayout tabs={SUPER_SETTINGS_TABS} label="Configurações" hideOnMobile />}>
          <Route path="account"     element={<SuperAccountView />} />
          <Route path="access-help" element={<AccessHelpList scope="super" />} />
        </Route>
      </Route>

      {/* Tenant admin */}
      <Route path="admin" element={<TenantGuard><AdminLayout /></TenantGuard>}>
        <Route index                 element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard"      element={<Dashboard />} />
        <Route path="agenda"         element={<AgendaView only="calendar" />} />
        <Route path="appointments"   element={<AppointmentsView />} />
        {/* Nova Agenda em desenvolvimento: assume /admin/agenda quando tiver paridade (etapa 3) */}
        <Route path="agenda-beta"    element={<AdminAgenda />} />
        <Route path="clients"        element={<ClientsView />} />
        <Route path="professionals"  element={<ProfessionalsView />} />

        {/* Serviços — com a aba Produtos */}
        <Route path="services" element={<SectionLayout tabs={SERVICES_TABS} label="Serviços e produtos" />}>
          <Route index            element={<ServicesView />} />
          <Route path="products"  element={<ProductsView />} />
        </Route>

        {/* Relatórios — Financeiro (era "Faturamento") */}
        <Route path="reports" element={<SectionLayout tabs={REPORTS_TABS} label="Relatórios" />}>
          <Route index element={<RevenueView />} />
        </Route>

        {/* Configurações — conta, portal, disponibilidade, bloqueios, lembretes e pedidos de acesso */}
        <Route path="settings" element={<SectionLayout tabs={SETTINGS_TABS} label="Configurações" hideOnMobile />}>
          <Route index              element={<SettingsView section="account" />} />
          <Route path="portal"      element={<SettingsView section="portal" />} />
          <Route path="schedule"    element={<SettingsView section="schedule" />} />
          <Route path="blocks"      element={<BlockedSlotsView />} />
          <Route path="reminders"   element={<RemindersView />} />
          <Route path="access-help" element={<AccessHelpList scope="admin" />} />
        </Route>

        {/* URLs antigas (menu anterior) → novo destino; nada some */}
        {Object.entries(LEGACY_ADMIN_REDIRECTS).map(([from, to]) => (
          <Route key={from} path={from} element={<Navigate to={to} replace />} />
        ))}
      </Route>

      {/* Professional portal */}
      <Route path="professional" element={<ProfessionalGuard><ProfessionalLayout /></ProfessionalGuard>}>
        <Route index              element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard"   element={<ProfDashboardView />} />
        <Route path="agenda"      element={<ProfAgendaView />} />
        <Route path="clients"     element={<ProfClientsView />} />
        {/* Nova Agenda em desenvolvimento: assume /professional/agenda quando tiver paridade */}
        <Route path="agenda-beta" element={<ProfessionalAgenda />} />
        {/* Telas antigas: saíram do menu, mas seguem alcançáveis por URL (settings = "Meu horário" do avatar) */}
        <Route path="services"    element={<ProfServicesView />} />
        <Route path="revenue"     element={<ProfRevenueView />} />
        <Route path="settings"    element={<ProfSettingsView />} />
      </Route>

      {/* Public client portal — /:tenantSlug */}
      <Route path=":tenantSlug" element={<PublicTenantProvider><PublicClientProvider><Outlet /></PublicClientProvider></PublicTenantProvider>}>
        {/* Agendamento: /:slug → /horario → /dados → /codigo → /confirmado (a seleção vai na URL) */}
        <Route element={<BookLayout />}>
          <Route index                           element={<StepServices />} />
          <Route path="horario"                  element={<StepTime />} />
          <Route path="dados"                    element={<StepContact />} />
          <Route path="codigo"                   element={<StepVerify />} />
          <Route path="confirmado"               element={<StepDone />} />
          <Route path="meus-agendamentos"        element={<MyBookings />} />
        </Route>
        {/* Links antigos (/:slug/booking) caem no agendamento novo */}
        <Route path="booking"                  element={<BookingRedirect />} />
        {/* Telas antigas do portal: fora do caminho principal, seguem acessíveis por URL */}
        <Route element={<ClientLayout />}>
          <Route path="register"                 element={<RegisterPage />} />
          <Route path="my-appointments"          element={<MyAppointments />} />
          <Route path="verify-email"             element={<VerifyEmailPage />} />
        </Route>
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
    </Suspense>
    </RouteErrorBoundary>
  );
}


export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <LoginSplashHost />
        <ServerWakingNotice />
      </AuthProvider>
    </BrowserRouter>
    </GoogleOAuthProvider>
  );
}