import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useProfessional } from '@/context/ProfessionalContext';
import type { Client } from '@/types';
import { STATUS_BADGE, STATUS_LABEL, ownAppointments, ownClients, startKey } from './ownData';

const initials = (name: string) => name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase();
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const fmtDate = (d: string) => format(parseISO(d), "d 'de' MMM 'de' yyyy", { locale: ptBR });

/**
 * Clientes do profissional: só quem tem agendamento com ele. Somente leitura (cadastro de
 * clientes é do dono da empresa). Cards em grade, que no celular ocupam a largura toda.
 */
export default function ProfClientsView() {
  const { professional, appointments, allClients, services } = useProfessional();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const own = useMemo(() => ownAppointments(appointments, professional.id), [appointments, professional.id]);
  const clients = useMemo(() => ownClients(allClients, own).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [allClients, own]);

  const q = norm(search.trim());
  const qDigits = search.replace(/\D/g, '');
  const filtered = clients.filter(c =>
    !q || norm(c.name).includes(q) || norm(c.email ?? '').includes(q) || (qDigits.length > 0 && (c.phone ?? '').replace(/\D/g, '').includes(qDigits)));

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const statsOf = (c: Client) => {
    const mine = own.filter(a => a.clientId === c.id);
    const done = mine.filter(a => a.status === 'completed').sort((a, b) => b.date.localeCompare(a.date))[0];
    const next = mine.filter(a => a.date >= todayStr && (a.status === 'pending' || a.status === 'confirmed')).sort((a, b) => startKey(a).localeCompare(startKey(b)))[0];
    return { total: mine.length, lastVisit: done?.date, next };
  };

  const selected = clients.find(c => c.id === selectedId) ?? null;
  const serviceName = (id: string) => services.find(s => s.id === id)?.name ?? 'Serviço';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Clientes</h2>
        <p className="text-sm text-muted-foreground">
          {clients.length === 1 ? '1 cliente atendido por você' : `${clients.length} clientes atendidos por você`}
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          className="h-11 pl-9"
          aria-label="Buscar cliente por nome, e-mail ou telefone"
          placeholder="Buscar por nome, e-mail ou telefone…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground" role="status">
          {clients.length === 0 ? 'Você ainda não tem clientes com agendamento.' : 'Nenhum cliente encontrado.'}
        </p>
      ) : (
        <ul aria-label="Meus clientes" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(c => {
            const s = statsOf(c);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  aria-label={`Ver detalhes de ${c.name}`}
                  className="flex min-h-[44px] w-full items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="font-bold text-white" style={{ backgroundColor: 'hsl(var(--primary))' }}>{initials(c.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.phone || c.email}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {s.total === 1 ? '1 agendamento' : `${s.total} agendamentos`}
                      {s.next ? ` · próximo em ${format(parseISO(s.next.date), 'dd/MM', { locale: ptBR })}` : s.lastVisit ? ` · última visita ${format(parseISO(s.lastVisit), 'dd/MM/yy', { locale: ptBR })}` : ''}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!selected} onOpenChange={o => !o && setSelectedId(null)}>
        <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.name}</DialogTitle>
                <DialogDescription>{[selected.phone, selected.email].filter(Boolean).join(' · ')}</DialogDescription>
              </DialogHeader>
              <div>
                <p className="mb-2 text-sm font-semibold">Seus atendimentos com este cliente</p>
                <ul className="space-y-2">
                  {own.filter(a => a.clientId === selected.id).sort((a, b) => startKey(b).localeCompare(startKey(a))).map(a => (
                    <li key={a.id} className="flex items-center justify-between gap-3 rounded border p-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{serviceName(a.serviceId)}</p>
                        <p className="text-xs text-muted-foreground">{fmtDate(a.date)} · {a.startTime}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[a.status]}`}>{STATUS_LABEL[a.status]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
