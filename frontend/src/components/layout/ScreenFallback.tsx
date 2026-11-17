import { Suspense, type ReactNode } from 'react';

/**
 * Suspense da área de conteúdo: a primeira visita a cada tela baixa o código dela (lazy). Com isto o menu e a barra
 * do topo continuam na tela e só o miolo mostra "Carregando…", em vez de a tela inteira trocar por um aviso.
 */
export function ScreenSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground" role="status">Carregando…</div>}>
      {children}
    </Suspense>
  );
}
