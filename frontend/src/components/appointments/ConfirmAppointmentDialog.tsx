import { CheckCircle2, Loader2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useWhatsappAuto } from '@/hooks/useWhatsappAuto';
import type { NoticeScope } from '@/services/notifications.service';
import { fmtDate } from './appointmentUi';

export interface ConfirmTarget {
  clientName: string;
  /** yyyy-MM-dd */
  date: string;
  startTime: string;
  serviceName?: string;
}

interface Props {
  /** Agendamento a confirmar; null = fechado. */
  target: ConfirmTarget | null;
  scope: NoticeScope;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  title?: string;
  confirmLabel?: string;
}

/** O que acontece com o cliente depois de confirmar, conforme o envio automático do WhatsApp estar ligado ou não. */
export function AutoSendNote({ scope, active }: { scope: NoticeScope; active: boolean }) {
  const auto = useWhatsappAuto(scope, active);
  if (auto === null) return null;
  return auto ? (
    <span className="flex items-start gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-900 dark:bg-green-900/20 dark:text-green-200">
      <MessageCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      Ao confirmar, a mensagem de confirmação é enviada automaticamente ao cliente pelo WhatsApp.
    </span>
  ) : (
    <span className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-sm">
      <MessageCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      O envio automático pelo WhatsApp não está ativo. Depois de confirmar, você poderá avisar o cliente com um botão.
    </span>
  );
}

/**
 * Segurança contra toque sem querer: confirmar um agendamento avisa o cliente, então pede uma segunda confirmação
 * mostrando quem, quando e o que vai acontecer. Usado por todo botão de Confirmar/Aceitar (dono e profissional).
 */
export function ConfirmAppointmentDialog({
  target, scope, onConfirm, onCancel, busy = false,
  title = 'Confirmar agendamento?', confirmLabel = 'Sim, confirmar',
}: Props) {
  return (
    <Dialog open={target !== null} onOpenChange={o => { if (!o && !busy) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden /> {title}
          </DialogTitle>
          <DialogDescription className="space-y-3 pt-1 text-left">
            {target && (
              <span className="block">
                <strong className="text-foreground">{target.clientName}</strong>
                {target.serviceName ? <> · {target.serviceName}</> : null}
                <span className="block">{fmtDate(target.date)} às {target.startTime}</span>
              </span>
            )}
            <AutoSendNote scope={scope} active={target !== null} />
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={onCancel}>Voltar</Button>
          <Button type="button" className="min-h-11 gap-2" disabled={busy} onClick={onConfirm}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
