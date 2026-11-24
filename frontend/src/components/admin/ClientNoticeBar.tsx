import { Link } from 'react-router-dom';
import { CheckCircle2, Loader2, MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ClientNoticeState } from '@/hooks/useClientNotice';

const SENT_TEXT = { approved: 'Confirmação enviada', refused: 'Aviso de recusa enviado', cancelled_by_owner: 'Aviso de cancelamento enviado' } as const;
const SENDING_TEXT = { approved: 'Enviando a confirmação', refused: 'Enviando o aviso de recusa', cancelled_by_owner: 'Enviando o aviso de cancelamento' } as const;

const join = (names: string[]) => names.length <= 2 ? names.join(' e ') : `${names.slice(0, 2).join(', ')} e mais ${names.length - 2}`;

/**
 * Faixa do aviso ao cliente depois de aprovar, recusar ou cancelar. O servidor envia a mensagem pelo WhatsApp sozinho:
 * mostra "enviando" e depois "enviada". Se não saiu, oferece o botão que abre o WhatsApp já com a mensagem (reserva).
 * `settingsHref`: onde ativar o envio automático (só o dono tem acesso).
 */
export default function ClientNoticeBar({ notice, onClose, settingsHref }: { notice: ClientNoticeState; onClose: () => void; settingsHref?: string }) {
  const { sending, sent, links, extra, reason } = notice;
  const event = notice.event ?? 'approved';
  if (sending.length === 0 && sent.length === 0 && links.length === 0) return null;
  return (
    <div role="status" className="sticky top-2 z-30 flex items-start justify-between gap-2 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900 shadow-md dark:bg-green-900 dark:text-green-100">
      <div className="min-w-0 space-y-2">
        {sending.length > 0 && (
          <p className="flex items-center gap-2 font-medium">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> {SENDING_TEXT[event]} para {join(sending)} pelo WhatsApp…
          </p>
        )}
        {sent.length > 0 && (
          <p className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden /> {SENT_TEXT[event]} para {join(sent)} pelo WhatsApp.
          </p>
        )}
        {links.length > 0 && (
          <>
            <p className="font-medium">
              {reason === 'not_configured' ? 'O envio automático pelo WhatsApp não está ativo. Avise o cliente pelo WhatsApp:'
                : reason === 'failed' ? 'Não foi possível enviar automaticamente (vamos tentar de novo). Se preferir, avise agora:'
                : 'Avise o cliente pelo WhatsApp:'}
            </p>
            <ul className="space-y-2">
              {links.map(link => (
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
            {extra > 0 && <p className="text-xs">e mais {extra} cliente{extra !== 1 ? 's' : ''} sem aviso nesta lista</p>}
            {reason === 'not_configured' && settingsHref && (
              <p className="text-xs"><Link to={settingsHref} className="font-medium underline underline-offset-2">Ativar o envio automático</Link> para a mensagem sair sozinha na próxima vez.</p>
            )}
          </>
        )}
      </div>
      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Fechar aviso" onClick={onClose}>
        <X className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}
