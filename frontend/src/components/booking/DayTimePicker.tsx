import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, addMonths, endOfMonth, format, getDay, parseISO, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { nowBrasilia } from '@/lib/scheduling';
import { getDaysApi, getSlotsApi } from '@/services/booking.service';

export const MAX_ADVANCE_DAYS = 60; // mesmo limite do backend (PhoneBookingService.MAX_ADVANCE_DAYS)
const DAY_W = 64;                   // largura de um dia + espaço, para rolar de 5 em 5

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

function period(slot: string): 'Manhã' | 'Tarde' | 'Noite' {
  const h = Number(slot.slice(0, 2));
  return h < 12 ? 'Manhã' : h < 18 ? 'Tarde' : 'Noite';
}

interface Props {
  slug: string;
  serviceIds: string[];
  /** null = qualquer profissional. */
  professionalId: string | null;
  /** Dia escolhido (yyyy-MM-dd) ou null. Quem usa guarda o valor (URL no agendamento, estado na remarcação). */
  date: string | null;
  onDate: (date: string, opts?: { replace?: boolean }) => void;
  onSlot: (slot: string, date: string) => void;
  /** Muda para forçar nova busca de dias e horários (ex.: depois de "horário indisponível"). */
  refreshKey?: number;
}

/**
 * Faixa de dias + calendário + horários do dia, usados no passo "Escolha data e horário" e em "Remarcar".
 * Já abre no primeiro dia com vaga; o ponto sob o dia indica que há horário.
 */
export default function DayTimePicker({ slug, serviceIds, professionalId: proId, date, onDate, onSlot, refreshKey = 0 }: Props) {
  const today = nowBrasilia().date;
  const idsKey = serviceIds.join(',');

  const days = useMemo(() => Array.from({ length: MAX_ADVANCE_DAYS + 1 }, (_, i) => iso(addDays(parseISO(today), i))), [today]);
  const [calOpen, setCalOpen] = useState(false);
  const [month, setMonth] = useState(() => startOfMonth(parseISO(date ?? today)));
  const stripRef = useRef<HTMLDivElement>(null);

  // Resultados guardados com a "chave" do pedido: se a escolha muda, o resultado antigo deixa de valer (= carregando)
  // sem precisar zerar estado dentro do effect.
  const daysKey = `${idsKey}|${proId ?? ''}|${refreshKey}`;
  const [daysRes, setDaysRes] = useState<{ key: string; set: Set<string> } | null>(null);
  const available = daysRes?.key === daysKey ? daysRes.set : null;

  const slotsKey = `${idsKey}|${proId ?? ''}|${date ?? ''}|${refreshKey}`;
  const [slotsRes, setSlotsRes] = useState<{ key: string; slots?: string[]; error?: string } | null>(null);
  const current = slotsRes?.key === slotsKey ? slotsRes : null;
  const slots = current?.slots ?? null;
  const error = current?.error ?? '';

  // Dias com vaga (o ponto sob o dia): 2 chamadas cobrem os 60 dias.
  useEffect(() => {
    let alive = true;
    Promise.all([
      getDaysApi(slug, { serviceIds, from: days[0], count: 31, professionalId: proId }),
      getDaysApi(slug, { serviceIds, from: days[31], count: 30, professionalId: proId }),
    ])
      .then(([a, b]) => { if (alive) setDaysRes({ key: daysKey, set: new Set([...a, ...b]) }); })
      .catch(() => { if (alive) setDaysRes({ key: daysKey, set: new Set() }); });
    return () => { alive = false; };
  }, [slug, daysKey, proId, days, serviceIds]);

  // Sem dia escolhido: já abre no primeiro dia com vaga (como o "HOJE" do Caapto).
  useEffect(() => {
    if (date || !available || available.size === 0) return;
    const first = days.find(d => available.has(d));
    if (first) onDate(first, { replace: true });
  }, [date, available, days, onDate]);

  // Horários do dia escolhido.
  useEffect(() => {
    if (!date) return;
    let alive = true;
    getSlotsApi(slug, { serviceIds, date, professionalId: proId })
      .then(s => { if (alive) setSlotsRes({ key: slotsKey, slots: s }); })
      .catch(e => { if (alive) setSlotsRes({ key: slotsKey, error: e instanceof Error ? e.message : 'Não foi possível carregar os horários.' }); });
    return () => { alive = false; };
  }, [slug, slotsKey, date, proId, serviceIds]);

  const scrollDays = (dir: 1 | -1) => stripRef.current?.scrollBy({ left: dir * DAY_W * 5, behavior: 'smooth' });
  const scrollToStart = () => stripRef.current?.scrollTo({ left: 0, behavior: 'smooth' });

  const groups = (['Manhã', 'Tarde', 'Noite'] as const)
    .map(label => ({ label, items: (slots ?? []).filter(s => period(s) === label) }))
    .filter(g => g.items.length > 0);

  return (
    <>
      <div className="bk-days-bar">
        <button type="button" className="bk-nav" aria-label="Dias anteriores" onClick={() => scrollDays(-1)}><ChevronLeft size={18} aria-hidden /></button>
        <div className="bk-days" ref={stripRef} role="group" aria-label="Dia">
          {days.map(d => {
            const has = available?.has(d) ?? false;
            const dt = parseISO(d);
            return (
              <button
                key={d}
                type="button"
                className={`bk-day${d === today ? ' today' : ''}${has ? ' has' : ''}`}
                aria-pressed={d === date}
                aria-label={format(dt, "EEEE, d 'de' MMMM", { locale: ptBR })}
                disabled={available !== null && !has}
                onClick={() => onDate(d)}
              >
                <small>{d === today ? 'Hoje' : format(dt, 'EEEE', { locale: ptBR }).slice(0, 3)}</small>
                <b>{format(dt, 'd')}</b>
              </button>
            );
          })}
        </div>
        <button type="button" className="bk-nav" aria-label="Próximos dias" onClick={() => scrollDays(1)}><ChevronRight size={18} aria-hidden /></button>
        <button type="button" className="bk-nav" aria-label="Escolher data" aria-expanded={calOpen} onClick={() => setCalOpen(o => !o)}><Calendar size={18} aria-hidden /></button>
        <button type="button" className="bk-nav reset" aria-label="Voltar para o primeiro dia" onClick={scrollToStart}><RotateCcw size={16} aria-hidden /></button>

        {calOpen && (
          <MonthCalendar
            month={month}
            onMonth={setMonth}
            today={today}
            selected={date}
            available={available}
            onPick={d => { setCalOpen(false); onDate(d); }}
          />
        )}
      </div>

      <div className="bk-slots-wrap" aria-live="polite">
        {error ? (
          <div className="bk-alert" role="alert">{error}</div>
        ) : !date ? (
          available && available.size === 0 ? <p className="bk-empty">Sem horários disponíveis nos próximos dias.</p> : null
        ) : slots === null ? (
          <p className="bk-empty">Carregando horários…</p>
        ) : groups.length === 0 ? (
          <p className="bk-empty">Sem horários neste dia. Escolha outro dia.</p>
        ) : (
          groups.map(g => (
            <div key={g.label}>
              <h3 className="bk-period">{g.label}</h3>
              <div className="bk-slots">
                {g.items.map(slot => (
                  <button key={slot} type="button" className="bk-slot" aria-pressed={false} onClick={() => onSlot(slot, date)}>{slot}</button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function MonthCalendar({ month, onMonth, today, selected, available, onPick }: {
  month: Date; onMonth: (d: Date) => void; today: string; selected: string | null; available: Set<string> | null; onPick: (d: string) => void;
}) {
  const first = startOfMonth(month);
  const lead = getDay(first); // 0 = domingo
  const total = endOfMonth(month).getDate();
  const last = iso(addDays(parseISO(today), MAX_ADVANCE_DAYS));
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: total }, (_, i) => iso(addDays(first, i)))];
  const canPrev = iso(startOfMonth(month)) > today.slice(0, 8) + '01';
  const canNext = iso(addMonths(first, 1)) <= last;

  return (
    <div className="bk-cal" role="dialog" aria-label="Escolher data">
      <div className="bk-cal-head">
        <button type="button" className="bk-nav" aria-label="Mês anterior" disabled={!canPrev} onClick={() => onMonth(addMonths(month, -1))}><ChevronLeft size={16} aria-hidden /></button>
        <span className="bk-display" style={{ textTransform: 'capitalize' }}>{format(month, "MMMM', 'yyyy", { locale: ptBR })}</span>
        <button type="button" className="bk-nav" aria-label="Próximo mês" disabled={!canNext} onClick={() => onMonth(addMonths(month, 1))}><ChevronRight size={16} aria-hidden /></button>
      </div>
      <div className="bk-cal-grid">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => <span key={i} className="dow">{d}</span>)}
        {cells.map((d, i) => d === null ? <span key={`e${i}`} /> : (
          <button
            key={d}
            type="button"
            aria-pressed={d === selected}
            disabled={d < today || d > last || (available !== null && !available.has(d))}
            onClick={() => onPick(d)}
          >
            {Number(d.slice(8))}
          </button>
        ))}
      </div>
    </div>
  );
}
