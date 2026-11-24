import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, CheckCircle, Clock, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTenant } from '@/context/TenantContext';
import { useClientNotice } from '@/hooks/useClientNotice';
import ClientNoticeBar from '@/components/admin/ClientNoticeBar';
import { saveErrorMessage } from '@/lib/settingsPayload';
import { nowBrasilia } from '@/lib/scheduling';
import type { Appointment } from '@/types';

const fmtWhen = (a: Appointment) => `${format(new Date(`${a.date}T00:00:00`), "EEE, d 'de' MMM", { locale: ptBR })} às ${a.startTime}`;

/** wa.me exige só dígitos com DDI: "(19) 98179-4567" → "5519981794567". */
function waNumber(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`;
}

/**
 * "Aguardando confirmação": horários que clientes reservaram sem código automático. O cliente confirma mandando uma
 * mensagem para o WhatsApp do estabelecimento; aqui o dono vê quem é, abre a conversa e confirma — um a um ou vários
 * de uma vez (com aviso). Sem confirmação até o prazo, o servidor libera o horário.
 */
export default function PendingConfirmations() {
  const { appointments, clients, services, professionals, updateAppointmentStatus, confirmAppointments, refresh } = useTenant();
  const clientNotice = useClientNotice();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [askBulk, setAskBulk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(() => Date.now());

  // Esconde sozinho o que passou do prazo (o servidor libera o horário em seguida).
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const rows = useMemo(() => {
    const today = nowBrasilia().date;
    const clientById = new Map(clients.map(c => [c.id, c]));
    const svcById = new Map(services.map(s => [s.id, s]));
    const profById = new Map(professionals.map(p => [p.id, p]));
    return appointments
      .filter(a => a.status === 'pending' && a.date >= today && (!a.confirmBy || new Date(a.confirmBy).getTime() > now))
      .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`))
      .map(a => ({
        appt: a,
        client: clientById.get(a.clientId),
        service: svcById.get(a.serviceId)?.name ?? '—',
        professional: profById.get(a.professionalId)?.name ?? '—',
      }));
  }, [appointments, clients, services, professionals, now]);

  // Mantém a seleção só com o que ainda está pendente na lista.
  const selectedIds = useMemo(() => rows.filter(r => selected.has(r.appt.id)).map(r => r.appt.id), [rows, selected]);
  const allSelected = rows.length > 0 && selectedIds.length === rows.length;
  // Quem já tocou em "Confirmar no WhatsApp" fica em cima: é o que o dono tem de decidir primeiro.
  const groups = [
    { key: 'confirmed', title: 'O cliente já confirmou no WhatsApp — aguardando você', rows: rows.filter(r => !!r.appt.clientConfirmedAt) },
    { key: 'waiting', title: 'O cliente ainda não confirmou', rows: rows.filter(r => !r.appt.clientConfirmedAt) },
  ].filter(g => g.rows.length > 0);

  // Lista vazia: some, mas deixa a mensagem do que acabou de acontecer (ex.: "3 agendamentos confirmados") por alguns segundos.
  if (rows.length === 0) {
    if (!notice && !error && clientNotice.notice.links.length === 0) return null;
    return (
      <div className="space-y-2">
        {error
          ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          : notice && <p role="status" className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-300">{notice}</p>}
        <ClientNoticeBar notice={clientNotice.notice} onClose={clientNotice.clear} />
      </div>
    );
  }

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const confirmOne = async (id: string) => {
    setError(''); setNotice(''); clientNotice.clear(); setBusy(true);
    const target = rows.find(r => r.appt.id === id)?.appt;
    try {
      await updateAppointmentStatus(id, 'confirmed');
      if (target) clientNotice.offer([target], 'confirmed');
    }
    catch (err) { setError(saveErrorMessage(err)); }
    finally { setBusy(false); }
  };

  const confirmSelected = async () => {
    setAskBulk(false); setError(''); setNotice(''); clientNotice.clear(); setBusy(true);
    const targets = rows.filter(r => selectedIds.includes(r.appt.id)).map(r => r.appt);
    try {
      const { confirmed, skipped, confirmedIds } = await confirmAppointments(selectedIds);
      const done = new Set(confirmedIds ?? selectedIds);
      clientNotice.offer(targets.filter(a => done.has(a.id)), 'confirmed');
      setSelected(new Set());
      setNotice(`${confirmed} agendamento${confirmed !== 1 ? 's' : ''} confirmado${confirmed !== 1 ? 's' : ''}.${skipped > 0 ? ` ${skipped} já não estava${skipped !== 1 ? 'm' : ''} pendente${skipped !== 1 ? 's' : ''}.` : ''}`);
      if (skipped > 0) void refresh();
      setTimeout(() => setNotice(''), 8000);
    } catch (err) { setError(saveErrorMessage(err)); }
    finally { setBusy(false); }
  };

  return (
    <Card className="border-yellow-300 dark:border-yellow-700">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4" aria-hidden /> Aguardando confirmação
          <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-200">{rows.length}</span>
        </CardTitle>
        <CardDescription>
          Estes clientes reservaram sem código. O cliente tem 3 horas para tocar em "Confirmar no WhatsApp" e mandar a mensagem
          para o seu número; se não tocar, o horário volta a ficar livre. Quem já confirmou fica reservado até você confirmar aqui.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox" className="h-4 w-4"
              checked={allSelected}
              onChange={e => setSelected(e.target.checked ? new Set(rows.map(r => r.appt.id)) : new Set())}
            />
            Selecionar todos
          </label>
          <Button type="button" className="min-h-11 gap-2" disabled={selectedIds.length === 0 || busy} onClick={() => setAskBulk(true)}>
            <CheckCircle className="h-4 w-4" aria-hidden /> Confirmar selecionados ({selectedIds.length})
          </Button>
        </div>

        {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        {notice && <p role="status" className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-300">{notice}</p>}
        <ClientNoticeBar notice={clientNotice.notice} onClose={clientNotice.clear} />

        {groups.map(g => (
          <section key={g.key} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{g.title} ({g.rows.length})</h3>
              <Button type="button" variant="ghost" size="sm" className="min-h-9"
                onClick={() => setSelected(prev => new Set([...prev, ...g.rows.map(r => r.appt.id)]))}>
                Selecionar este grupo
              </Button>
            </div>
            <ul className="divide-y rounded-md border" aria-label={g.title}>
              {g.rows.map(({ appt, client, service, professional }) => {
                const number = waNumber(client?.phone);
                const msg = `Olá, ${client?.name?.split(' ')[0] ?? ''}! Recebi seu pedido de horário (${service}) para ${fmtWhen(appt)}. Está confirmado?`;
                return (
                  <li key={appt.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                      <input
                        type="checkbox" className="mt-1 h-4 w-4 shrink-0"
                        checked={selected.has(appt.id)} onChange={() => toggle(appt.id)}
                        aria-label={`Selecionar ${client?.name ?? 'cliente'}, ${fmtWhen(appt)}`}
                      />
                      <span className="min-w-0 text-sm">
                        <span className="block truncate font-semibold">{client?.name ?? 'Cliente'}{client?.phone && <span className="ml-2 font-normal text-muted-foreground">{client.phone}</span>}</span>
                        <span className="block text-muted-foreground">{service} · {professional} · {fmtWhen(appt)}</span>
                        {appt.clientConfirmedAt ? (
                          <span className="block text-xs text-green-700 dark:text-green-400">
                            Cliente confirmou às {format(new Date(appt.clientConfirmedAt), 'HH:mm')} · horário reservado até você confirmar
                          </span>
                        ) : appt.confirmBy && (
                          <span className="block text-xs text-yellow-800 dark:text-yellow-300">O cliente tem até {format(new Date(appt.confirmBy), 'HH:mm')} para confirmar</span>
                        )}
                      </span>
                    </label>
                    <div className="flex shrink-0 gap-2">
                      {number && (
                        <Button asChild variant="outline" size="sm" className="min-h-11 gap-1.5 sm:min-h-9">
                          <a href={`https://wa.me/${number}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer">
                            <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
                          </a>
                        </Button>
                      )}
                      <Button type="button" size="sm" className="min-h-11 sm:min-h-9" disabled={busy} onClick={() => void confirmOne(appt.id)}>
                        Confirmar
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </CardContent>

      <Dialog open={askBulk} onOpenChange={setAskBulk}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" aria-hidden /> Confirmar {selectedIds.length} agendamento{selectedIds.length !== 1 ? 's' : ''} de uma vez?
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-1 text-left">
              <span className="block">
                Você vai confirmar <strong>{selectedIds.length}</strong> horário{selectedIds.length !== 1 ? 's' : ''} sem conferir um por um.
              </span>
              <span className="block">
                Faça isso só se você já recebeu a mensagem de confirmação desses clientes no WhatsApp. Quem ainda não
                confirmou pode não aparecer e o horário ficará ocupado à toa.
              </span>
              <span className="block">Depois de confirmar, só dá para desfazer cancelando cada agendamento individualmente.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setAskBulk(false)}>Voltar</Button>
            <Button type="button" className="min-h-11" onClick={() => void confirmSelected()}>
              Sim, confirmar {selectedIds.length}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
