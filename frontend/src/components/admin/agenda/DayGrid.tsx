import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Ban, Plus } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { fromMinutes, nowTimeSP, toMinutes, todaySP } from '@/lib/agendaDates';
import {
  PX_PER_MIN, buildColumn, computeGridRange, isAllDayBlock, minutesToPx, type ColumnLayout, type GridInterval, type GridRange,
} from '@/lib/agendaGrid';
import type { AgendaAppointment } from '@/services/appointments.service';
import type { BlockedSlot, Professional } from '@/types';
import { AppointmentCard } from './AppointmentCard';

const HACHURA = 'repeating-linear-gradient(135deg, hsl(var(--muted-foreground) / 0.18) 0 5px, transparent 5px 10px)';
const initials = (name: string) => name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
const AXIS_W = '3.5rem';

interface Props {
  date: string;
  professionals: Professional[];
  appointments: AgendaAppointment[];
  blocks: BlockedSlot[];
  interval: GridInterval;
  /** TODO (etapa 3): abrir o formulário de novo agendamento no horário clicado */
  onSlotSelect: (professionalId: string, time: string) => void;
  /** TODO (etapa 3): abrir os detalhes do agendamento */
  onAppointmentSelect: (id: string) => void;
}

interface ColumnProps {
  professional: Professional;
  layout: ColumnLayout;
  interval: GridInterval;
  height: number;
  /** posição da linha de "agora" (px) ou null fora de hoje */
  nowTop: number | null;
  onSlotSelect: Props['onSlotSelect'];
  onAppointmentSelect: Props['onAppointmentSelect'];
}

const Column = memo(function Column({ professional, layout, interval, height, nowTop, onSlotSelect, onAppointmentSelect }: ColumnProps) {
  const lineH = interval * PX_PER_MIN;
  return (
    <div
      role="group"
      aria-label={`Agenda de ${professional.name}`}
      className="relative border-l"
      style={{
        height,
        backgroundImage: 'linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px)',
        backgroundSize: `100% ${lineH}px`,
      }}
    >
      {layout.offAreas.map((a, i) => (
        <div key={i} title={a.title} aria-label={a.title} role="img" className="absolute inset-x-0 z-[5] cursor-not-allowed bg-muted/50" style={{ top: a.top, height: a.height, backgroundImage: HACHURA }} />
      ))}
      {layout.blockAreas.map(b => (
        <div key={b.id} title={b.title} role="img" aria-label={b.title}
          className="absolute inset-x-0.5 z-[6] flex cursor-not-allowed items-start gap-1 overflow-hidden rounded-md border border-dashed border-muted-foreground/50 bg-muted px-1.5 py-1 text-[11px] font-medium text-muted-foreground"
          style={{ top: b.top, height: b.height, backgroundImage: HACHURA }}>
          <Ban className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">{b.reason || 'Bloqueado'}</span>
        </div>
      ))}
      {layout.slots.map(s => (
        <button
          key={s.time}
          type="button"
          onClick={() => onSlotSelect(professional.id, s.time)}
          aria-label={`Novo agendamento com ${professional.name} às ${s.time}`}
          title={`Agendar às ${s.time}`}
          className="group absolute inset-x-0 z-[1] flex items-center justify-center text-primary opacity-0 transition-opacity hover:bg-primary/10 hover:opacity-100 focus-visible:bg-primary/10 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          style={{ top: s.top, height: s.height }}
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      ))}
      {layout.cards.map(c => <AppointmentCard key={c.appt.id} layout={c} onSelect={onAppointmentSelect} />)}
      {nowTop !== null && <div aria-hidden className="pointer-events-none absolute inset-x-0 z-[15] border-t-2 border-red-500" style={{ top: nowTop }} />}
    </div>
  );
});

/**
 * Grade do dia: eixo de horas, uma coluna por profissional (avatar, nome e disponibilidade), linha "Dia todo",
 * linha de "agora", áreas hachuradas (fora do expediente, folga e bloqueios) e cartões de agendamento.
 */
export function DayGrid({ date, professionals, appointments, blocks, interval, onSlotSelect, onAppointmentSelect }: Props) {
  const today = todaySP();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => toMinutes(nowTimeSP()));

  // a linha de "agora" e as células passadas se atualizam sozinhas
  useEffect(() => {
    const id = setInterval(() => setNow(toMinutes(nowTimeSP())), 30_000);
    return () => clearInterval(id);
  }, []);

  const range: GridRange = useMemo(() => computeGridRange(date, professionals, appointments, blocks), [date, professionals, appointments, blocks]);
  const height = (range.end - range.start) * PX_PER_MIN;

  const columns = useMemo(
    () => professionals.map(p => ({ p, layout: buildColumn(date, today, now, p, appointments, blocks, interval, range) })),
    [professionals, date, today, now, appointments, blocks, interval, range],
  );

  const allDay = useMemo(() => blocks.filter(b => b.date === date && isAllDayBlock(b)), [blocks, date]);

  // rolagem inicial: perto de "agora" (hoje) ou da primeira abertura do dia
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = date === today ? Math.max(range.start, now - 60) : range.start;
    el.scrollTop = Math.max(0, minutesToPx(target, range));
    // só ao trocar de dia/faixa: não deve "puxar" a rolagem a cada tique do relógio
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, range.start, range.end]);

  const hours = useMemo(() => {
    const list: number[] = [];
    for (let t = range.start; t < range.end; t += 60) list.push(t);
    return list;
  }, [range]);

  const showNow = date === today && now >= range.start && now <= range.end;
  const template = { gridTemplateColumns: `${AXIS_W} repeat(${columns.length}, minmax(10rem, 1fr))` };

  return (
    <div ref={scrollRef} className="relative max-h-[70vh] overflow-auto rounded-xl border bg-card" role="region" aria-label="Grade de horários do dia" tabIndex={0}>
      <div className="min-w-full" style={{ ...template, display: 'grid' }}>
        {/* cabeçalho das colunas */}
        <div className="sticky left-0 top-0 z-30 border-b bg-card" />
        {columns.map(({ p, layout }) => (
          <div key={p.id} className="sticky top-0 z-20 flex items-center gap-2 border-b border-l bg-card px-3 py-2">
            <Avatar className="h-8 w-8">
              {p.photoUrl && <AvatarImage src={p.photoUrl} alt="" />}
              <AvatarFallback className="text-xs">{initials(p.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">{p.name}</p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className={`h-1.5 w-1.5 rounded-full ${layout.working ? 'bg-green-500' : 'bg-zinc-400'}`} aria-hidden />
                {layout.working ? `${p.workingHours.start}–${p.workingHours.end}` : 'Folga'}
              </p>
            </div>
          </div>
        ))}

        {/* linha "Dia todo" */}
        <div className="sticky left-0 z-20 flex items-center border-b bg-card px-2 text-[11px] font-medium text-muted-foreground">Dia todo</div>
        {columns.map(({ p }) => {
          const mine = allDay.filter(b => b.professionalId === p.id);
          return (
            <div key={p.id} className="flex min-h-8 flex-wrap items-center gap-1 border-b border-l px-1.5 py-1">
              {mine.map(b => (
                <span key={b.id} className="inline-flex items-center gap-1 rounded-md border border-dashed border-muted-foreground/50 bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground" title={b.reason ? `Dia bloqueado: ${b.reason}` : 'Dia bloqueado'}>
                  <Ban className="h-3 w-3" aria-hidden /> {b.reason || 'Dia bloqueado'}
                </span>
              ))}
            </div>
          );
        })}

        {/* eixo de horas */}
        <div className="sticky left-0 z-10 bg-card" style={{ height }}>
          {hours.map(t => (
            <div key={t} className="absolute right-1.5 -translate-y-1/2 text-[11px] text-muted-foreground" style={{ top: minutesToPx(t, range) + (t === range.start ? 8 : 0) }}>
              {fromMinutes(t)}
            </div>
          ))}
          {showNow && (
            <div className="absolute right-0 z-10 -translate-y-1/2 rounded-l bg-red-500 px-1 text-[10px] font-semibold text-white" style={{ top: minutesToPx(now, range) }}>
              {fromMinutes(now)}
            </div>
          )}
        </div>

        {columns.map(({ p, layout }) => (
          <Column key={p.id} professional={p} layout={layout} interval={interval} height={height} nowTop={showNow ? minutesToPx(now, range) : null} onSlotSelect={onSlotSelect} onAppointmentSelect={onAppointmentSelect} />
        ))}
      </div>

    </div>
  );
}

