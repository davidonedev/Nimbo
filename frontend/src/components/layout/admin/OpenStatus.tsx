import { useTenant } from '@/context/TenantContext';
import { computeOpenStatus } from '@/lib/businessStatus';
import { useBrasiliaNow } from '@/hooks/useBrasiliaNow';

/**
 * "Aberto" com bolinha verde pulsando; "Fechado" com bolinha vermelha estática (um vermelho piscando
 * lê como alarme). O texto aparece também no celular: a cor sozinha não diz o estado. O pulso respeita prefers-reduced-motion (motion-reduce). Segue o expediente dos profissionais (abre e fecha sozinho) e o interruptor do portal do cliente.
 */
export function OpenStatus() {
  const { tenant, professionals } = useTenant();
  const now = useBrasiliaNow();
  const open = computeOpenStatus(tenant, professionals, now);

  return (
    <div role="status" className="flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs font-medium sm:gap-2 sm:px-3 sm:text-sm">
      <span className="relative flex h-2.5 w-2.5" aria-hidden>
        {open && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60 motion-reduce:animate-none" />}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${open ? 'bg-green-500' : 'bg-red-500'}`} />
      </span>
      <span>{open ? 'Aberto' : 'Fechado'}</span>
    </div>
  );
}
