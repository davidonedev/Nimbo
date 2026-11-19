import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Ban, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTenant } from '@/context/TenantContext';

const today = () => format(new Date(), 'yyyy-MM-dd');
const emptyForm = () => ({ professionalId: '', date: today(), startTime: '12:00', endTime: '13:00', reason: '' });

/**
 * Bloqueios de horário (almoço, folga, reunião). Vive em Configurações; a Agenda continua com o
 * botão "Bloquear" para criar um bloqueio direto no calendário.
 */
export default function BlockedSlotsView() {
  const { blockedSlots, professionals, addBlockedSlot, removeBlockedSlot } = useTenant();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const nameOf = (id: string) => professionals.find(p => p.id === id)?.name ?? 'Profissional removido';

  // Só os de hoje em diante, do mais próximo ao mais distante
  const upcoming = useMemo(
    () => blockedSlots.filter(b => b.date >= today()).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)),
    [blockedSlots],
  );

  const save = async () => {
    setError('');
    if (form.startTime >= form.endTime) { setError('O horário final deve ser depois do inicial.'); return; }
    setSaving(true);
    try {
      await addBlockedSlot(form);
      setOpen(false);
      setForm(emptyForm());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar o bloqueio.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setRemoving(id);
    try { await removeBlockedSlot(id); } catch { /* a lista continua igual; dá para tentar de novo */ } finally { setRemoving(null); }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Bloqueios</h2>
          <p className="text-muted-foreground text-sm">Horários em que um profissional não recebe agendamentos. Também dá para bloquear direto pela Agenda.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-1.5"><Plus className="h-4 w-4" aria-hidden /> Novo bloqueio</Button>
      </div>

      {upcoming.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
          <Ban className="h-8 w-8 opacity-40" aria-hidden />
          Nenhum bloqueio futuro.
        </CardContent></Card>
      ) : (
        <ul className="space-y-2">
          {upcoming.map(b => (
            <li key={b.id}>
              <Card><CardContent className="flex items-center gap-3 p-3">
                <Ban className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{nameOf(b.professionalId)} · {b.reason || 'Bloqueado'}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(`${b.date}T12:00:00`), "EEE, d 'de' MMM", { locale: ptBR })} · {b.startTime}–{b.endTime}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={`Remover bloqueio de ${nameOf(b.professionalId)} em ${b.date}`}
                  disabled={removing === b.id} onClick={() => remove(b.id)}>
                  {removing === b.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
                </Button>
              </CardContent></Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) setError(''); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo bloqueio</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Profissional *</Label>
              <Select value={form.professionalId} onValueChange={v => setForm(f => ({ ...f, professionalId: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{professionals.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="block-date">Data *</Label>
              <Input id="block-date" type="date" value={form.date} min={today()} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="block-start">Início *</Label>
                <Input id="block-start" type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="block-end">Fim *</Label>
                <Input id="block-end" type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="block-reason">Motivo (opcional)</Label>
              <Input id="block-reason" placeholder="Ex: Almoço, Reunião…" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={!form.professionalId || !form.date || saving}>{saving ? 'Salvando…' : 'Bloquear'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
