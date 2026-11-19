import { useMemo, useState } from 'react';
import { ArrowRight, Check, Plus, RotateCcw, X } from 'lucide-react';
import { useBooking } from './BookingContext';
import { StepHeader } from './parts';
import { formatDuration, priceLabel } from './bookingFormat';

/** Passo 1/3 — escolher o serviço. Tocar no cartão agenda esse serviço; o "+" junta vários numa vez só. */
export default function StepServices() {
  const { services, selectedServices, possession, go } = useBooking();
  const [category, setCategory] = useState<string | null>(null);

  const categories = useMemo(() => [...new Set(services.map(s => s.category).filter(Boolean))], [services]);
  const visible = category ? services.filter(s => s.category === category) : services;
  const chosen = selectedServices.map(s => s.id);
  const isOn = (id: string) => chosen.includes(id);

  const lastService = possession?.recognized && possession.lastServiceId
    ? services.find(s => s.id === possession.lastServiceId)
    : undefined;

  const setChosen = (ids: string[]) => go('servico', { s: ids }, { replace: true });
  const toggle = (id: string) => setChosen(isOn(id) ? chosen.filter(x => x !== id) : [...chosen, id]);
  /** Toque no cartão: com bandeja aberta soma/tira; sem bandeja vai direto para o horário. */
  const pick = (id: string) => (chosen.length > 0 ? toggle(id) : go('horario', { s: [id] }));

  return (
    <section>
      <StepHeader step="1/3" title="Qual serviço você quer agendar?" />

      {lastService && chosen.length === 0 && (
        <button type="button" className="bk-repeat" onClick={() => go('horario', { s: [lastService.id] })}>
          <span className="bk-repeat-icon"><RotateCcw size={18} aria-hidden /></span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <small>Seu último serviço aqui</small>
            <strong>Repetir {lastService.name}</strong>
            <span>{formatDuration(lastService.duration)} · {priceLabel(lastService.price)}</span>
          </span>
          <ArrowRight size={16} aria-hidden style={{ color: 'var(--bk-accent-text)' }} />
        </button>
      )}

      <p className="bk-sub">
        Toque no serviço para agendar — ou use <b>+</b> para juntar vários de uma vez.
      </p>

      {categories.length > 1 && (
        <div className="bk-chips" role="group" aria-label="Categorias">
          <button type="button" className="bk-chip" aria-pressed={category === null} onClick={() => setCategory(null)}>Todos</button>
          {categories.map(c => (
            <button key={c} type="button" className="bk-chip" aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>
          ))}
        </div>
      )}

      {services.length === 0 ? (
        <p className="bk-empty">Este estabelecimento ainda não cadastrou serviços.</p>
      ) : (
        <ul className="bk-services" style={{ listStyle: 'none', padding: 0 }}>
          {visible.map(s => (
            <li key={s.id} className={`bk-service${isOn(s.id) ? ' on' : ''}`}>
              <button type="button" className="bk-service-main" onClick={() => pick(s.id)}>
                <strong>{s.name}</strong>
                <span>{formatDuration(s.duration)} · {priceLabel(s.price)}</span>
              </button>
              <button
                type="button"
                className="bk-service-toggle"
                aria-pressed={isOn(s.id)}
                aria-label={`${isOn(s.id) ? 'Remover' : 'Adicionar'} ${s.name} ${isOn(s.id) ? 'do' : 'ao'} agendamento`}
                onClick={() => toggle(s.id)}
              >
                {isOn(s.id) ? <Check size={20} aria-hidden /> : <Plus size={20} aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedServices.length > 0 && (
        <div className="bk-tray" role="region" aria-label="Serviços escolhidos">
          {selectedServices.map((s, i) => (
            <div key={s.id} className="bk-tray-row">
              <span className="bk-num" aria-hidden>{i + 1}</span>
              <div>
                <strong>{s.name}</strong>
                <small>{formatDuration(s.duration)} · {priceLabel(s.price)}</small>
              </div>
              <button type="button" className="bk-icon-btn" aria-label={`Remover ${s.name}`} onClick={() => toggle(s.id)}>
                <X size={18} aria-hidden />
              </button>
            </div>
          ))}
          <p className="bk-tray-foot">
            {selectedServices.length === 1 ? '1 serviço' : `${selectedServices.length} serviços, nessa ordem`}
          </p>
          <button type="button" className="bk-btn light block" onClick={() => go('horario')}>
            Continuar <ArrowRight size={18} aria-hidden />
          </button>
        </div>
      )}
    </section>
  );
}
