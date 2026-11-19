import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { isChunkLoadError } from '@/lib/chunkError';

const RELOAD_KEY = 'nimbo_chunk_reload_at';
const RELOAD_COOLDOWN_MS = 30_000;


interface Props { children: ReactNode; resetKey: string }
interface State { error: Error | null }

class Boundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Falha ao exibir a tela', error, info.componentStack);
    // Versão nova no ar: recarrega uma vez para pegar os arquivos novos (com trava para não entrar em loop).
    if (isChunkLoadError(error)) {
      try {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
        if (Date.now() - last > RELOAD_COOLDOWN_MS) {
          sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
          window.location.reload();
        }
      } catch { /* sessionStorage indisponível: o aviso abaixo basta */ }
    }
  }

  componentDidUpdate(prev: Props) {
    // Trocou de rota: tenta de novo em vez de ficar preso na tela de erro.
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const chunk = isChunkLoadError(error);
    return (
      <div role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-lg font-semibold">{chunk ? 'Há uma versão nova do Nimbo' : 'Não foi possível abrir esta tela'}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          {chunk
            ? 'Recarregue a página para carregar a versão mais recente.'
            : 'Ocorreu um erro inesperado. Recarregue a página; se continuar, volte ao início e tente de novo.'}
        </p>
        <div className="flex gap-2">
          <Button onClick={() => window.location.reload()}>Recarregar</Button>
          <Button variant="outline" onClick={() => window.location.assign('/')}>Ir para o início</Button>
        </div>
      </div>
    );
  }
}

/** Evita a tela branca: qualquer erro ao montar uma rota (inclusive falha de chunk) vira um aviso com saída. */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <Boundary resetKey={pathname}>{children}</Boundary>;
}
