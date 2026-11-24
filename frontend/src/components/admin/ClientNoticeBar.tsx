import { MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ClientNoticeState } from '@/hooks/useClientNotice';

/** Faixa com o botão que abre o WhatsApp do dono já com a mensagem para o cliente (sem custo, sem API). */
export default function ClientNoticeBar({ notice, onClose }: { notice: ClientNoticeState; onClose: () => void }) {
  if (notice.links.length === 0) return null;
  return (
    <div role="status" className="flex items-start justify-between gap-2 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900 dark:bg-green-900/20 dark:text-green-200">
      <div className="min-w-0 space-y-2">
        <p className="font-medium">Avise o cliente pelo WhatsApp:</p>
        <ul className="space-y-2">
          {notice.links.map(link => (
            <li key={link.key} className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="sm" className="min-h-11 gap-1.5 sm:min-h-9">
                <a href={link.url} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-4 w-4" aria-hidden /> Avisar {link.firstName} no WhatsApp
                </a>
              </Button>
              <span className="text-xs text-muted-foreground">{link.when}</span>
            </li>
          ))}
        </ul>
        {notice.extra > 0 && <p className="text-xs">e mais {notice.extra} cliente{notice.extra !== 1 ? 's' : ''} sem aviso nesta lista</p>}
      </div>
      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Fechar aviso" onClick={onClose}>
        <X className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}
