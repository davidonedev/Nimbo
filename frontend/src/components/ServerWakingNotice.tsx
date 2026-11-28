import { Loader2 } from 'lucide-react';
import { useServerWaking } from '@/lib/serverWaking';

/** Aviso fixo no topo quando o servidor demora a responder (ele dorme quando fica sem uso). */
export function ServerWakingNotice() {
  const waking = useServerWaking();
  if (!waking) return null;
  return (
    <div role="status" aria-live="polite"
      className="fixed inset-x-0 top-0 z-[90] flex items-center justify-center gap-2 bg-amber-500 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-center text-xs font-medium text-black">
      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
      Estamos acordando o servidor. Na primeira vez do dia isso pode levar até 2 minutos. Não feche a página.
    </div>
  );
}
