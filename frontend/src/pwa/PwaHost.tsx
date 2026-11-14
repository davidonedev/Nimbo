import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Download, RefreshCw, Share, WifiOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useOnlineStatus } from './useOnlineStatus';

const DISMISS_KEY = 'nimbo_install_dismissed';

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

const bar = 'fixed inset-x-3 z-[70] mx-auto flex max-w-md items-center gap-3 rounded-xl border bg-card p-3 text-sm shadow-lg';

/** Avisos do PWA: sem conexão, nova versão e instalação. Não bloqueia nada e some quando não se aplica. */
export function PwaHost() {
  const { user } = useAuth();
  const online = useOnlineStatus();
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW();
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; } });

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallEvent(e as InstallEvent); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const dismiss = () => { setDismissed(true); try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ } };
  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  };

  // Instalar só é oferecido a quem já entrou (dono/profissional), nunca ao cliente na página pública
  const canOfferInstall = !!user && !dismissed && !isStandalone() && (installEvent || isIos());

  return (
    <>
      {!online && (
        <div role="status" className="fixed inset-x-0 top-0 z-[80] flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 pt-[max(0.375rem,env(safe-area-inset-top))] text-xs font-medium text-black">
          <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Sem conexão — mostrando os últimos dados carregados. Alterações ficam indisponíveis.
        </div>
      )}

      {needRefresh && (
        <div role="alert" className={`${bar} bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-4`}>
          <RefreshCw className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="flex-1">Nova versão disponível.</span>
          <Button size="sm" onClick={() => updateServiceWorker(true)}>Atualizar</Button>
          <button type="button" onClick={() => setNeedRefresh(false)} aria-label="Dispensar" className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {canOfferInstall && !needRefresh && (
        <div role="region" aria-label="Instalar o Nimbo" className={`${bar} bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-4`}>
          {installEvent ? <Download className="h-4 w-4 shrink-0 text-primary" aria-hidden /> : <Share className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
          <span className="flex-1">
            {installEvent
              ? 'Instale o Nimbo para abrir direto da tela inicial.'
              : <>No iPhone: toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.</>}
          </span>
          {installEvent && <Button size="sm" onClick={install}>Instalar</Button>}
          <button type="button" onClick={dismiss} aria-label="Não mostrar de novo" className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
    </>
  );
}
