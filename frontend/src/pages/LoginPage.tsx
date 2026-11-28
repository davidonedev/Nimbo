import { showLoginSplash } from '@/motion/loginSplashStore';
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { LpButton } from '@/components/brand/LpButton';
import { AuthHeader, headerLinkClass } from '@/components/auth/AuthHeader';
import { AuthAlert } from '@/components/auth/AuthAlert';
import { TextField, PasswordField } from '@/components/auth/TextField';
import { Spinner } from '@/components/auth/Spinner';

interface FieldErrors { email?: string; password?: string }

/** Validação de campos antes de chamar a API (equivale ao antigo `required` + type="email"). */
function validateLogin(email: string, password: string): FieldErrors {
  const errs: FieldErrors = {};
  if (!email.trim()) errs.email = 'Informe seu e-mail.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = 'E-mail inválido.';
  if (!password) errs.password = 'Informe sua senha.';
  return errs;
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function LoginPage() {
  const navigate  = useNavigate();
  const { login } = useAuth();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [success,  setSuccess]  = useState(false);
  const [loading,  setLoading]  = useState(false);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const errs = validateLogin(email, password);
    setFieldErrors(errs);
    if (errs.email || errs.password) { setError(''); return; }
    setError(''); setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (!result.ok) { setError(result.error ?? 'Credenciais inválidas.'); return; }
    setSuccess(true);
    showLoginSplash();
    navigate(result.redirectTo, { replace: true });
  };

  return (
    <div className="lp-root">
      <div className="min-h-dvh bg-lp-alt">
        <AuthHeader
          right={<Link to="/" className={headerLinkClass}><ArrowLeft className="h-4 w-4" aria-hidden /> Voltar ao início</Link>}
        />

        <main className="flex justify-center px-4 pb-16 pt-8 sm:pt-14">
          <div className="w-full max-w-[440px]">
            <div className="rounded-lp-card border border-lp-line bg-lp-white p-6 shadow-lp-card sm:p-8">
              <div className="mb-7 text-center">
                <h1 className="lp-h3">Entrar na sua conta</h1>
                <p className="mt-2 text-sm text-lp-muted">Acesse o painel da sua barbearia.</p>
              </div>

              <form onSubmit={handleLogin} noValidate className="space-y-5">
                <TextField
                  id="email" label="E-mail" type="email" placeholder="voce@email.com" autoComplete="email"
                  value={email} onChange={e => { setEmail(e.target.value); setFieldErrors(f => ({ ...f, email: undefined })); }}
                  error={fieldErrors.email} required
                />

                <PasswordField
                  id="password" label="Senha" placeholder="••••••••" autoComplete="current-password"
                  value={password} onChange={e => { setPassword(e.target.value); setFieldErrors(f => ({ ...f, password: undefined })); }}
                  error={fieldErrors.password} required
                  labelAside={
                    <Link to="/forgot-password" className="rounded text-sm font-bold text-lp-primary underline-offset-4 hover:underline">
                      Esqueci minha senha
                    </Link>
                  }
                />

                {error && <AuthAlert kind="error">{error}</AuthAlert>}
                {success && <AuthAlert kind="success">Login realizado! Redirecionando…</AuthAlert>}

                <LpButton type="submit" size="lg" disabled={loading || success} className="w-full">
                  {loading
                    ? <><Spinner /> Entrando…</>
                    : <>Entrar <ArrowRight className="h-4 w-4" aria-hidden /></>}
                </LpButton>
              </form>

              <p className="mt-6 text-center text-sm">
                <Link to="/access-help" className="font-bold text-lp-primary underline-offset-4 hover:underline">
                  Não consigo acessar meu e-mail
                </Link>
              </p>

              <p className="mt-3 text-center text-sm text-lp-muted">
                Ainda não tem uma conta?{' '}
                <Link to="/signup" className="font-bold text-lp-primary underline-offset-4 hover:underline">
                  Criar conta grátis
                </Link>
              </p>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
