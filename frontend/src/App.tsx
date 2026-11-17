import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
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
const AdminAgenda = lazy(() => import('./components/admin/agenda/AdminAgenda'));
const ProfessionalAgenda = lazy(() => import('./components/admin/agenda/ProfessionalAgenda'));
const ClientsView = lazy(() => import('./components/admin/ClientsView'));
const ProfessionalsView = lazy(() => import('./components/admin/ProfessionalsView'));
const RevenueView = lazy(() => import('./components/admin/RevenueView'));
const SettingsView = lazy(() => import('./components/admin/SettingsView'));
const ProfAgendaView = lazy(() => import('./components/professional/ProfAgendaView'));
const ProfRevenueView = lazy(() => import('./components/professional/ProfRevenueView'));
const ProfSettingsView = lazy(() => import('./components/professional/ProfSettingsView'));
const ProfServicesView = lazy(() => import('./components/professional/ProfServicesView'));
const ServicesView = lazy(() => import('./components/admin/ServicesView'));
const ProductsView = lazy(() => import('./components/admin/ProductsView'));
const RemindersView = lazy(() => import('./components/admin/RemindersView'));
const ServicesPage = lazy(() => import('./components/client/ServicesPage'));
const BookingFlow = lazy(() => import('./components/client/BookingFlow'));
const MyAppointments = lazy(() => import('./components/client/MyAppointments'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ProfessionalRegisterPage = lazy(() => import('./pages/ProfessionalRegisterPage'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
import { LoginSplashHost }       from './motion/LoginSplashHost';
import { PwaHost }               from './pwa/PwaHost';

// ─── Route guards ─────────────────────────────────────────────────────────────
function SuperGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user)                       return <Navigate to="/login" replace />;
  if (user.role !== 'super_admin') return <Navigate to="/login" replace />;
  return <PlatformProvider>{children}</PlatformProvider>;
}

function TenantGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user)                        return <Navigate to="/login" replace />;
  if (user.role !== 'tenant_admin') return <Navigate to="/login" replace />;
  return <TenantProvider>{children}</TenantProvider>;
}

function ProfessionalGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user)                        return <Navigate to="/login" replace />;
  if (user.role !== 'professional') return <Navigate to="/login" replace />;
  return <ProfessionalProvider>{children}</ProfessionalProvider>;
}

// ─── App shell ────────────────────────────────────────────────────────────────
function AppRoutes() {
  return (
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
        <Route path="account"     element={<SuperAccountView />} />
        <Route path="access-help" element={<AccessHelpList scope="super" />} />
      </Route>

      {/* Tenant admin */}
      <Route path="admin" element={<TenantGuard><AdminLayout /></TenantGuard>}>
        <Route index                 element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard"      element={<Dashboard />} />
        <Route path="agenda"         element={<AgendaView only="calendar" />} />
        <Route path="appointments"   element={<AgendaView only="table" />} />
        {/* Nova Agenda em desenvolvimento: assume /admin/agenda quando tiver paridade (etapa 3) */}
        <Route path="agenda-beta"    element={<AdminAgenda />} />
        <Route path="clients"        element={<ClientsView />} />
        <Route path="professionals"  element={<ProfessionalsView />} />
        <Route path="services"       element={<ServicesView />} />
        <Route path="products"       element={<ProductsView />} />
        <Route path="reminders"      element={<RemindersView />} />
        <Route path="reports"        element={<RevenueView />} />
        <Route path="revenue"        element={<Navigate to="/admin/reports" replace />} />
        <Route path="access-help"    element={<AccessHelpList scope="admin" />} />
        {/* Minha Conta — subseções */}
        <Route path="account"          element={<SettingsView section="account" />} />
        <Route path="account/portal"   element={<SettingsView section="portal" />} />
        <Route path="account/schedule" element={<SettingsView section="schedule" />} />
        {/* Compatibilidade com rota antiga */}
        <Route path="settings"          element={<SettingsView section="account" />} />
        <Route path="settings/portal"   element={<SettingsView section="portal" />} />
        <Route path="settings/schedule" element={<SettingsView section="schedule" />} />
      </Route>

      {/* Professional portal */}
      <Route path="professional" element={<ProfessionalGuard><ProfessionalLayout /></ProfessionalGuard>}>
        <Route index              element={<Navigate to="agenda" replace />} />
        <Route path="agenda"      element={<ProfAgendaView />} />
        {/* Nova Agenda em desenvolvimento: assume /professional/agenda quando tiver paridade */}
        <Route path="agenda-beta" element={<ProfessionalAgenda />} />
        <Route path="services"    element={<ProfServicesView />} />
        <Route path="revenue"     element={<ProfRevenueView />} />
        <Route path="settings"    element={<ProfSettingsView />} />
      </Route>

      {/* Public client portal — /:tenantSlug */}
      <Route path=":tenantSlug" element={<PublicTenantProvider><PublicClientProvider><ClientLayout /></PublicClientProvider></PublicTenantProvider>}>
        <Route index                           element={<ServicesPage />} />
        <Route path="booking"                  element={<BookingFlow />} />
        <Route path="register"                 element={<RegisterPage />} />
        <Route path="professional-register"    element={<ProfessionalRegisterPage />} />
        <Route path="my-appointments"          element={<MyAppointments />} />
        <Route path="verify-email"             element={<VerifyEmailPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
    </Suspense>
  );
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <LoginSplashHost />
        <PwaHost />
      </AuthProvider>
    </BrowserRouter>
    </GoogleOAuthProvider>
  );
}