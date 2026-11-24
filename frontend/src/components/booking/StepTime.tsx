import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { addDays, addMonths, endOfMonth, format, getDay, parseISO, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, ChevronLeft, ChevronRight, Plus, RotateCcw, Tag, X } from 'lucide-react';
import { nowBrasilia } from '@/lib/scheduling';
import { getDaysApi, getSlotsApi } from '@/services/booking.service';
import { useBooking } from './BookingContext';
import { MiniAvatar, StepHeader } from './parts';
import { formatDuration, priceLabel, totalOf } from './bookingFormat';

const MAX_ADVANCE_DAYS = 60; // mesmo limite do backend (PhoneBookingService.MAX_ADVANCE_DAYS)
const DAY_W = 64;            // largura de um dia + espaço, para rolar de 5 em 5

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

function period(slot: string): 'Manhã' | 'Tarde' | 'Noite' {
  const h = Number(slot.slice(0, 2));
  return h < 12 ? 'Manhã' : h < 18 ? 'Tarde' : 'Noite';
}

/** Passo 2/3 — dia e horário. */
export default function StepTime() {
  const { slug, selectedServices } = useBooking();
  if (selectedServices.length === 0) return <Navigate to={`/${slug}`} replace />;
  return <TimePicker />;
}

function TimePicker() {
  const { slug, selectedServices, eligible, professionalId, date, go } = useBooking();
  const today = nowBrasilia().date;
  const serviceIds = useMemo(() => selectedServices.map(s => s.id), [selectedServices]);
  const idsKey = serviceIds.join(',');

  const days = useMemo(() => Array.from({ length: MAX_ADVANCE_DAYS + 1 }, (_, i) => iso(addDays(parseISO(today), i))), [today]);
  const [calOpen, setCalOpen] = useState(false);
  const [month, setMonth] = useState(() => startOfMonth(parseISO(date ?? today)));
  const stripRef = useRef<HTMLDivElement>(null);

  // O profissional escolhido só vale se ainda atende todos os serviços.
  const chosenPro = eligible.find(p => p.id === professionalId) ?? null;
  const proId = chosenPro?.id ?? null;
  const shownPro = chosenPro ?? (eligible.length === 1 ? eligible[0] : null);

  // Resultados guardados com a "chave" do pedido: se a escolha muda, o resultado antigo deixa de valer (= carregando)
  // sem precisar zerar estado dentro do effect.
  const daysKey = `${idsKey}|${proId ?? ''}`;
  const [daysRes, setDaysRes] = useState<{ key: string; set: Set<string> } | null>(null);
  const available = daysRes?.key === daysKey ? daysRes.set : null;

  const slotsKey = `${idsKey}|${proId ?? ''}|${date ?? ''}`;
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
    if (first) go('horario', { d: first }, { replace: true });
  }, [date, available, days, go]);

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

  const removeService = (id: string) => {
    const rest = serviceIds.filter(x => x !== id);
    if (rest.length === 0) go('servico', { s: [] });
    else go('horario', { s: rest }, { replace: true });
  };

  const single = selectedServices.length === 1 ? selectedServices[0] : null;
  const { minutes, price } = totalOf(selectedServices);
  const groups = (['Manhã', 'Tarde', 'Noite'] as const)
    .map(label => ({ label, items: (slots ?? []).filter(s => period(s) === label) }))
    .filter(g => g.items.length > 0);

  return (
    <section>
      <StepHeader step="2/3" title="Escolha data e horário" />

      {single ? (
        <div className="bk-summary">
          <div className="bk-summary-row">
            <span>Serviço</span>
            <b><Tag size={16} aria-hidden /> {single.name} · {formatDuration(single.duration)}</b>
          </div>
          {shownPro && (
            <div className="bk-summary-row">
              <span>Profissional</span>
              <b><MiniAvatar pro={shownPro} /> {shownPro.name}</b>
            </div>
          )}
        </div>
      ) : (
        <>
          <p className="bk-with">
            {selectedServices.length} serviços {shownPro && <>com <MiniAvatar pro={shownPro} /> <b>{shownPro.name}</b></>}
          </p>
          <div className="bk-service-list">
            {selectedServices.map((s, i) => (
              <div key={s.id} className="bk-line">
                <span className="bk-num" aria-hidden>{i + 1}</span>
                <div><strong>{s.name}</strong><small>{formatDuration(s.duration)} · {priceLabel(s.price)}</small></div>
                <button type="button" className="bk-icon-btn" aria-label={`Remover ${s.name}`} onClick={() => removeService(s.id)}>
                  <X size={18} aria-hidden />
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="bk-add" onClick={() => go('servico')}><Plus size={18} aria-hidden /> Adicionar outro serviço</button>
          <p className="bk-hint">Total: {formatDuration(minutes)}{price > 0 ? ` · ${priceLabel(price)}` : ''}</p>
        </>
      )}

      {eligible.length > 1 && (
        <div className="bk-staff" role="group" aria-label="Profissional">
          <button type="button" className="bk-chip" aria-pressed={!proId} onClick={() => go('horario', { p: null }, { replace: true })}>Qualquer profissional</button>
          {eligible.map(p => (
            <button key={p.id} type="button" className="bk-chip" aria-pressed={proId === p.id} onClick={() => go('horario', { p: p.id }, { replace: true })}>
              <MiniAvatar pro={p} /> {p.name}
            </button>
          ))}
        </div>
      )}

      {eligible.length === 0 && (
        <div className="bk-alert" role="alert">
          {selectedServices.length === 1
            ? 'Este serviço ainda não tem profissional disponível para agendamento online. Escolha outro serviço ou fale com o estabelecimento.'
            : 'Nenhum profissional faz todos esses serviços juntos. Remova um serviço ou agende separado.'}
        </div>
      )}

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
                onClick={() => go('horario', { d })}
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
            onPick={d => { setCalOpen(false); go('horario', { d }); }}
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
                  <button key={slot} type="button" className="bk-slot" aria-pressed={false} onClick={() => go('dados', { t: slot, d: date })}>{slot}</button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="bk-actions">
        <button type="button" className="bk-link" onClick={() => go('servico')}><ChevronLeft size={16} aria-hidden /> Voltar</button>
      </div>
    </section>
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
