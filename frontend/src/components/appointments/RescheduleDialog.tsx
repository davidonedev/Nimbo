import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { isPastInBrasilia, nowBrasilia } from '@/lib/scheduling';
import { fmtDate } from './appointmentUi';

export interface RescheduleTarget {
  id: string;
  clientName: string;
  /** yyyy-MM-dd */
  date: string;
  startTime: string;
  professionalId: string;
}

export interface RescheduleChange {
  date: string;
  startTime: string;
  professionalId: string;
}

interface Props {
  /** Agendamento a mudar; null = fechado. */
  target: RescheduleTarget | null;
  professionals: { id: string; name: string }[];
  onClose: () => void;
  onSave: (id: string, change: RescheduleChange) => Promise<void>;
}

const field = 'h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** O estabelecimento muda o dia, o horário e/ou o profissional de um agendamento; o cliente recebe o aviso no WhatsApp. */
export function RescheduleDialog({ target, professionals, onClose, onSave }: Props) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [professionalId, setProfessionalId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setDate(target.date);
    setTime(target.startTime);
    setProfessionalId(target.professionalId);
    setError('');
  }, [target]);

  if (!target) return null;

  const unchanged = date === target.date && time === target.startTime && professionalId === target.professionalId;

  const save = async () => {
    if (!date || !time) { setError('Informe o dia e o horário.'); return; }
    if (unchanged) { setError('Escolha um dia, horário ou profissional diferente do atual.'); return; }
    if (isPastInBrasilia(date, time)) { setError('Esse horário já passou. Escolha um horário a partir de agora.'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave(target.id, { date, startTime: time, professionalId });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível mudar o horário. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={o => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Alterar horário</DialogTitle>
          <DialogDescription>
            {target.clientName}: hoje marcado para {fmtDate(target.date)} às {target.startTime}. O cliente é avisado pelo WhatsApp.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="resched-date">Dia</Label>
              <Input id="resched-date" type="date" min={nowBrasilia().date} value={date} onChange={e => setDate(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="resched-time">Horário</Label>
              <Input id="resched-time" type="time" step={900} value={time} onChange={e => setTime(e.target.value)} className="h-11" />
            </div>
          </div>
          {professionals.length > 1 && (
            <div className="space-y-1">
              <Label htmlFor="resched-prof">Profissional</Label>
              <select id="resched-prof" className={field} value={professionalId} onChange={e => setProfessionalId(e.target.value)}>
                {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={onClose} disabled={saving}>Voltar</Button>
          <Button type="button" className="min-h-11" onClick={() => void save()} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Salvando…</> : 'Salvar novo horário'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
