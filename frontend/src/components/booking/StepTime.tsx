import { useCallback, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { ChevronLeft, Plus, Tag, X } from 'lucide-react';
import { useBooking } from './BookingContext';
import DayTimePicker from './DayTimePicker';
import { MiniAvatar, StepHeader } from './parts';
import { formatDuration, priceLabel, totalOf } from './bookingFormat';

/** Passo 2/3 — dia e horário. */
export default function StepTime() {
  const { slug, selectedServices } = useBooking();
  if (selectedServices.length === 0) return <Navigate to={`/${slug}`} replace />;
  return <TimePicker />;
}

function TimePicker() {
  const { slug, selectedServices, eligible, professionalId, date, go } = useBooking();
  const serviceIds = useMemo(() => selectedServices.map(s => s.id), [selectedServices]);

  // O profissional escolhido só vale se ainda atende todos os serviços.
  const chosenPro = eligible.find(p => p.id === professionalId) ?? null;
  const proId = chosenPro?.id ?? null;
  const shownPro = chosenPro ?? (eligible.length === 1 ? eligible[0] : null);

  const onDate = useCallback((d: string, opts?: { replace?: boolean }) => go('horario', { d }, opts), [go]);
  const onSlot = useCallback((slot: string, d: string) => go('dados', { t: slot, d }), [go]);

  const removeService = (id: string) => {
    const rest = serviceIds.filter(x => x !== id);
    if (rest.length === 0) go('servico', { s: [] });
    else go('horario', { s: rest }, { replace: true });
  };

  const single = selectedServices.length === 1 ? selectedServices[0] : null;
  const { minutes, price } = totalOf(selectedServices);

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

      <DayTimePicker slug={slug} serviceIds={serviceIds} professionalId={proId} date={date} onDate={onDate} onSlot={onSlot} />

      <div className="bk-actions">
        <button type="button" className="bk-link" onClick={() => go('servico')}><ChevronLeft size={16} aria-hidden /> Voltar</button>
      </div>
    </section>
  );
}
