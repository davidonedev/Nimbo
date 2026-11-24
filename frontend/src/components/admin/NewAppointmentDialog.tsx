import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { CalendarPlus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTenant } from '@/context/TenantContext';
import { formatCurrency } from '@/lib/utils';
import { addMinutes, isPastInBrasilia, isSlotConflict, nowBrasilia } from '@/lib/scheduling';
import type { AppointmentStatus } from '@/types';

interface ApptForm {
  // cliente existente
  clientId: string;
  clientSearch: string;
  // novo cliente
  newClientMode: boolean;
  newName: string;
  newEmail: string;
  newPhone: string;
  // agendamento
  professionalId: string; serviceId: string;
  date: string; startTime: string; notes: string; status: AppointmentStatus;
}

const emptyForm = (init: { date?: string; professionalId?: string } = {}): ApptForm => ({
  clientId: '', clientSearch: '',
  newClientMode: false,
  newName: '', newEmail: '', newPhone: '',
  professionalId: init.professionalId ?? '', serviceId: '',
  date: init.date ?? format(new Date(), 'yyyy-MM-dd'), startTime: '09:00',
  notes: '', status: 'confirmed',
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pré-preenche a data (ex.: clique num dia do calendário). */
  initialDate?: string;
  /** Pré-seleciona o profissional (ex.: clique na agenda dele). */
  initialProfessionalId?: string;
}

/**
 * Novo agendamento criado manualmente pelo admin (cliente existente ou novo, serviço, profissional,
 * data, horário e status). Usado pelo botão "+ Novo" da navbar, pelo botão flutuante do celular e pela Agenda.
 * Monte só enquanto estiver aberto (`{open && <NewAppointmentDialog …/>}`): assim o formulário nasce limpo a cada abertura.
 */
export function NewAppointmentDialog({ open, onOpenChange, initialDate, initialProfessionalId }: Props) {
  const { professionals, clients, services, appointments, blockedSlots, addAppointment, updateAppointmentStatus } = useTenant();
  const [form, setForm] = useState<ApptForm>(() => emptyForm({ date: initialDate, professionalId: initialProfessionalId }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleOpenChange = (o: boolean) => { setError(''); onOpenChange(o); };

  const selectedService = services.find(s => s.id === form.serviceId);
  const availableProfs = useMemo(() =>
    form.serviceId ? professionals.filter(p => p.services.includes(form.serviceId)) : professionals,
    [professionals, form.serviceId]);

  const handleSave = async () => {
    setError('');
    if (!form.professionalId || !form.serviceId || !form.date || !form.startTime) {
      setError('Preencha todos os campos obrigatórios.'); return;
    }
    if (form.newClientMode) {
      if (!form.newName.trim() || !form.newEmail.trim() || !form.newPhone.trim()) {
        setError('Preencha nome, e-mail e telefone do novo cliente.'); return;
      }
    } else if (!form.clientId) {
      setError('Selecione um cliente.'); return;
    }
    if (isPastInBrasilia(form.date, form.startTime)) {
      setError('Não é possível agendar em um horário que já passou.'); return;
    }
    if (!selectedService) return;
    const endTime = addMinutes(form.startTime, selectedService.duration);
    if (isSlotConflict(form.date, form.professionalId, form.startTime, endTime, appointments, blockedSlots)) {
      setError('Conflito de horário: o profissional já tem um compromisso neste intervalo.'); return;
    }
    setSaving(true);
    try {
      // Garante formato HH:mm independente do browser (alguns retornam HH:mm:ss)
      const base = {
        professionalId: form.professionalId,
        serviceId:      form.serviceId,
        date:           form.date,
        startTime:      form.startTime.slice(0, 5),
        notes:          form.notes.trim() || undefined,
      };
      const created = await addAppointment(form.newClientMode
        ? { ...base, clientName: form.newName.trim(), clientEmail: form.newEmail.trim(), clientPhone: form.newPhone.trim() || undefined }
        : { ...base, clientId: form.clientId });

      // A API cria como "Agendado"; se o admin escolheu "Confirmado", aplica em seguida.
      if (form.status !== 'pending') {
        try { await updateAppointmentStatus(created.id, form.status); }
        catch { /* o agendamento foi criado; só a confirmação falhou e dá para confirmar na lista */ }
      }
      onOpenChange(false);
    } catch (err) {
      if (err && typeof err === 'object' && 'details' in err) {
        const details = (err as { details?: { field: string; message: string }[] }).details;
        if (details?.length) { setError(details.map(d => `${d.field}: ${d.message}`).join(' | ')); return; }
      }
      setError(err instanceof Error ? err.message : 'Erro ao criar agendamento.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-primary" /> Novo Agendamento
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">

          {/* Serviço */}
          <div className="space-y-1">
            <Label>Serviço *</Label>
            <Select value={form.serviceId} onValueChange={v => setForm(f => ({ ...f, serviceId: v, professionalId: '' }))}>
              <SelectTrigger><SelectValue placeholder="Selecione o serviço…" /></SelectTrigger>
              <SelectContent>
                {services.map(s => <SelectItem key={s.id} value={s.id}>{s.name} — {formatCurrency(s.price)} · {s.duration} min</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Profissional */}
          <div className="space-y-1">
            <Label>Profissional *</Label>
            <Select value={form.professionalId} onValueChange={v => setForm(f => ({ ...f, professionalId: v }))} disabled={!form.serviceId}>
              <SelectTrigger><SelectValue placeholder={form.serviceId ? 'Selecione…' : 'Selecione o serviço primeiro'} /></SelectTrigger>
              <SelectContent>
                {availableProfs.map(p => <SelectItem key={p.id} value={p.id}>{p.name} — {p.specialty}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Cliente — busca ou novo */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Cliente *</Label>
              <button
                type="button"
                className="text-xs text-primary underline underline-offset-2"
                onClick={() => setForm(f => ({
                  ...f,
                  newClientMode: !f.newClientMode,
                  clientId: '', clientSearch: '',
                  newName: '', newEmail: '', newPhone: '',
                }))}
              >
                {form.newClientMode ? '← Buscar cliente existente' : '+ Novo cliente'}
              </button>
            </div>

            {!form.newClientMode ? (
              /* ── Busca de cliente existente ── */
              <div className="space-y-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Digite o nome do cliente…"
                    value={form.clientSearch}
                    onChange={e => setForm(f => ({ ...f, clientSearch: e.target.value, clientId: '' }))}
                  />
                </div>
                {form.clientSearch.trim().length > 0 && (
                  <div className="border rounded-md max-h-44 overflow-y-auto bg-popover shadow-md">
                    {clients
                      .filter(c => c.name.toLowerCase().startsWith(form.clientSearch.toLowerCase()))
                      .slice(0, 20)
                      .map(c => (
                        <button
                          key={c.id}
                          type="button"
                          className={`w-full text-left px-3 py-2.5 text-sm hover:bg-muted transition-colors border-b last:border-0 ${form.clientId === c.id ? 'bg-primary/10 font-semibold' : ''}`}
                          onClick={() => setForm(f => ({ ...f, clientId: c.id, clientSearch: c.name }))}
                        >
                          <span className="font-medium">{c.name}</span>
                          <span className="text-muted-foreground text-xs ml-2">{c.phone}</span>
                        </button>
                      ))}
                    {clients.filter(c => c.name.toLowerCase().startsWith(form.clientSearch.toLowerCase())).length === 0 && (
                      <p className="px-3 py-2 text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
                    )}
                  </div>
                )}
                {form.clientId && (
                  <p className="text-xs text-green-600 font-medium">
                    ✓ {clients.find(c => c.id === form.clientId)?.name} selecionado
                  </p>
                )}
              </div>
            ) : (
              /* ── Novo cliente ── */
              <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
                <p className="text-xs text-muted-foreground">Preencha os dados do novo cliente:</p>
                <div className="space-y-1">
                  <Label className="text-xs">Nome completo *</Label>
                  <Input
                    placeholder="João Silva"
                    value={form.newName}
                    onChange={e => setForm(f => ({ ...f, newName: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">E-mail *</Label>
                  <Input
                    type="email"
                    placeholder="joao@email.com"
                    value={form.newEmail}
                    onChange={e => setForm(f => ({ ...f, newEmail: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Telefone *</Label>
                  <Input
                    placeholder="(00) 00000-0000"
                    value={form.newPhone}
                    onChange={e => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
                      let masked = '';
                      if (digits.length === 0) masked = '';
                      else if (digits.length <= 2) masked = `(${digits}`;
                      else if (digits.length <= 7) masked = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
                      else masked = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
                      setForm(f => ({ ...f, newPhone: masked }));
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Data e Horário */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Data *</Label>
              <Input type="date" value={form.date}
                min={nowBrasilia().date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Horário *</Label>
              <Input type="time" value={form.startTime}
                min={form.date === nowBrasilia().date ? nowBrasilia().time : undefined}
                onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
            </div>
          </div>

          {/* Resumo do serviço */}
          {selectedService && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
              Duração: <strong>{selectedService.duration} min</strong> · Término: <strong>{addMinutes(form.startTime, selectedService.duration)}</strong> · Valor: <strong>{formatCurrency(selectedService.price)}</strong>
            </p>
          )}

          {/* Status */}
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as AppointmentStatus }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="confirmed">Confirmado</SelectItem>
                <SelectItem value="pending">Agendado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Observações */}
          <div className="space-y-1">
            <Label>Observações</Label>
            <Textarea placeholder="Alguma observação…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="resize-none h-20" />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-md px-3 py-2">
              <X className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button
            onClick={handleSave}
            disabled={
              saving ||
              !form.serviceId ||
              !form.professionalId ||
              !form.date ||
              !form.startTime ||
              (form.newClientMode
                ? !form.newName.trim() || !form.newEmail.trim() || !form.newPhone.trim()
                : !form.clientId)
            }
          >
            {saving ? 'Criando…' : 'Criar Agendamento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
