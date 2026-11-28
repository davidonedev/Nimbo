import { Link } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { AuthShell, authButtonClass } from '@/components/account/AuthShell';

/**
 * O Nimbo avisa só por WhatsApp (sem e-mail), então a senha não é recuperada por link: o pedido de ajuda chega ao
 * dono (funcionário) ou à equipe Nimbo (dono), que atualiza o acesso e avisa pelo contato informado.
 */
export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Esqueci minha senha" subtitle="Vamos te ajudar a entrar de novo.">
      <div className="space-y-5">
        <div className="space-y-2 rounded-2xl border border-lp-line bg-lp-alt p-4 text-sm text-lp-black/70">
          <p className="font-bold text-lp-black">Como recuperar o acesso</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Toque em <strong className="text-lp-black">Pedir ajuda</strong> e informe seu nome, seu WhatsApp e o nome da barbearia.</li>
            <li><strong className="text-lp-black">Funcionário:</strong> o dono da barbearia recebe o pedido e troca a sua senha. <strong className="text-lp-black">Dono:</strong> a equipe Nimbo confirma seus dados e troca a senha.</li>
            <li>Você recebe a nova senha pelo WhatsApp informado. Nunca pedimos a sua senha.</li>
          </ol>
        </div>

        <Link to="/access-help" className={authButtonClass}>
          <MessageCircle className="h-4 w-4" aria-hidden /> Pedir ajuda
        </Link>
        <p className="text-center text-sm text-lp-muted">
          <Link to="/login" className="font-bold text-lp-primary underline-offset-4 hover:underline">Voltar ao login</Link>
        </p>
      </div>
    </AuthShell>
  );
}
