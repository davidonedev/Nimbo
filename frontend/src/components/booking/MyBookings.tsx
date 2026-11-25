import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarClock, ChevronLeft, Plus, XCircle } from 'lucide-react';
import {
  cancelMyAppointmentApi, listMyAppointmentsApi, rescheduleMyAppointmentApi, type MyAppointment,
} from '@/services/booking.service';
import { useBooking } from './BookingContext';
import DayTimePicker from './DayTimePicker';
import { StepHeader } from './parts';
import { priceLabel, whenLabel } from './bookingFormat';
import {
  RESCHEDULE_REQUESTS_CONFIRMATION, canChange, isManageable, manageError, type ManageError,
} from './manageErrors';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Aguardando confirmação',
  confirmed: 'Confirmado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  no_show: 'Não compareceu',
};

const serviceOf = (a: MyAppointment) => ({ id: a.service?.id ?? a.serviceId ?? null, name: a.service?.name ?? 'Serviço' });
const professionalOf = (a: MyAppointment) => ({ id: a.professional?.id ?? a.professionalId ?? null, name: a.professional?.name ?? '' });

/** "Meus agendamentos": próximos e histórico do cliente deste aparelho, com cancelar e remarcar. */
export default function MyBookings() {
  const { slug } = useBooking();
  const navigate = useNavigate();

  // A lista vem com o "agora" da carga: ele decide próximos x histórico e o prazo de 1 h.
  const [loaded, setLoaded] = useState<{ list: MyAppointment[]; now: number } | null>(null);
  const items = loaded?.list ?? null;
  const now = loaded?.now ?? 0;
  const [loadError, setLoadError] = useState<ManageError | null>(null);
  const [notice, setNotice] = useState('');
  const [resched, setResched] = useState<MyAppointment | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await listMyAppointmentsApi(slug);
      setLoaded({ list, now: Date.now() });
      setLoadError(null);
    } catch (err) {
      setLoadError(manageError(err, 'load'));
    }
  }, [slug]);

  // Busca na entrada da tela; o setState só roda depois da resposta da API.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const { upcoming, history } = useMemo(() => {
    const list = items ?? [];
    const key = (a: MyAppointment) => `${a.date} ${a.startTime}`;
    return {
      upcoming: list.filter(a => isManageable(a, now)).sort((a, b) => key(a).localeCompare(key(b))),
      history: list.filter(a => !isManageable(a, now)).sort((a, b) => key(b).localeCompare(key(a))),
    };
  }, [items, now]);

  const backToStart = () => navigate(`/${slug}`);

  if (loadError?.deviceRequired) {
    return (
      <section>
        <StepHeader title="Meus agendamentos" />
        <div className="bk-alert" role="alert">{loadError.message}</div>
        <p className="bk-hint">Faça um agendamento e confirme o código enviado ao seu WhatsApp: depois disso seus horários aparecem aqui.</p>
        <div style={{ display: 'grid', marginTop: 20 }}>
          <button type="button" className="bk-btn block" onClick={backToStart}>Ir para o início</button>
        </div>
      </section>
    );
  }

  if (resched) {
    return (
      <Reschedule
        slug={slug}
        appt={resched}
        onBack={() => setResched(null)}
        onDeviceRequired={err => { setResched(null); setLoadError(err); }}
        onDone={async message => { setResched(null); setNotice(message); await load(); }}
      />
    );
  }

  return (
    <section>
      <StepHeader title="Meus agendamentos" />

      {notice && <div className="bk-notice" role="status">{notice}</div>}

      {loadError ? (
        <>
          <div className="bk-alert" role="alert">{loadError.message}</div>
          <div style={{ display: 'grid', marginTop: 16 }}>
            <button type="button" className="bk-btn ghost block" onClick={() => { setLoadError(null); void load(); }}>Tentar de novo</button>
          </div>
        </>
      ) : items === null ? (
        <p className="bk-empty" role="status">Carregando seus agendamentos…</p>
      ) : items.length === 0 ? (
        <p className="bk-empty">Você ainda não tem agendamentos aqui.</p>
      ) : (
        <>
          <h2 className="bk-section-title">Próximos</h2>
          {upcoming.length === 0 ? (
            <p className="bk-empty" style={{ marginTop: 12 }}>Nenhum horário marcado por enquanto.</p>
          ) : (
            <ul className="bk-appts">
              {upcoming.map(a => (
                <UpcomingCard
                  key={a.id}
                  appt={a}
                  slug={slug}
                  now={now}
                  onReschedule={() => { setNotice(''); setResched(a); }}
                  onCancelled={async () => { setNotice('Agendamento cancelado. O horário foi liberado.'); await load(); }}
                  onDeviceRequired={setLoadError}
                  onStale={() => { void load(); }}
                />
              ))}
            </ul>
          )}

          {history.length > 0 && (
            <>
              <h2 className="bk-section-title">Histórico</h2>
              <ul className="bk-appts">
                {history.map(a => <HistoryCard key={a.id} appt={a} />)}
              </ul>
            </>
          )}
        </>
      )}

      <div className="bk-actions">
        <Link to={`/${slug}`} className="bk-link"><ChevronLeft size={16} aria-hidden /> Voltar</Link>
        <button type="button" className="bk-btn" onClick={backToStart}><Plus size={18} aria-hidden /> Novo agendamento</button>
      </div>
    </section>
  );
}

function CardBody({ appt }: { appt: MyAppointment }) {
  const svc = serviceOf(appt);
  const pro = professionalOf(appt);
  return (
    <>
      <div className="bk-appt-top">
        <strong>{svc.name}</strong>
        <span className={`bk-tag ${appt.status}`}>{STATUS_LABEL[appt.status] ?? appt.status}</span>
      </div>
      <p className="bk-appt-when">{whenLabel(appt.date, appt.startTime)}</p>
      <p className="bk-appt-meta">{[pro.name && `com ${pro.name}`, appt.price > 0 ? priceLabel(appt.price) : ''].filter(Boolean).join(' · ')}</p>
    </>
  );
}

function HistoryCard({ appt }: { appt: MyAppointment }) {
  return <li className="bk-appt history"><CardBody appt={appt} /></li>;
}

function UpcomingCard({ appt, slug, now, onReschedule, onCancelled, onDeviceRequired, onStale }: {
  appt: MyAppointment;
  slug: string;
  now: number;
  onReschedule: () => void;
  onCancelled: () => Promise<void>;
  onDeviceRequired: (e: ManageError) => void;
  onStale: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const changeable = canChange(appt, now);
  const hasService = serviceOf(appt).id !== null;

  const confirmCancel = async () => {
    setBusy(true); setError('');
    try {
      await cancelMyAppointmentApi(slug, appt.id);
      await onCancelled();
    } catch (err) {
      const e = manageError(err, 'cancel');
      if (e.deviceRequired) { onDeviceRequired(e); return; }
      setAsking(false); setError(e.message);
      onStale(); // o prazo pode ter vencido: atualiza a lista para esconder os botões
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="bk-appt">
      <CardBody appt={appt} />

      {error && <div className="bk-alert" role="alert">{error}</div>}

      {!changeable ? (
        <p className="bk-hint">Faltam menos de 1 hora para o horário. Para alterar, fale com o estabelecimento.</p>
      ) : asking ? (
        <div className="bk-confirm" role="group" aria-label="Confirmar cancelamento">
          <p>Cancelar este agendamento? O horário volta a ficar livre.</p>
          <div className="bk-appt-actions">
            <button type="button" className="bk-btn danger" disabled={busy} onClick={() => void confirmCancel()}>
              {busy ? 'Cancelando…' : 'Sim, cancelar'}
            </button>
            <button type="button" className="bk-btn ghost" disabled={busy} onClick={() => setAsking(false)}>Manter horário</button>
          </div>
        </div>
      ) : (
        <div className="bk-appt-actions">
          {hasService && (
            <button type="button" className="bk-btn ghost" onClick={onReschedule}>
              <CalendarClock size={18} aria-hidden /> Remarcar
            </button>
          )}
          <button type="button" className="bk-btn danger" onClick={() => { setError(''); setAsking(true); }}>
            <XCircle size={18} aria-hidden /> Cancelar
          </button>
        </div>
      )}
    </li>
  );
}

/** Escolher outro dia/horário para um agendamento (mesma faixa de dias e horários do agendamento). */
function Reschedule({ slug, appt, onBack, onDone, onDeviceRequired }: {
  slug: string;
  appt: MyAppointment;
  onBack: () => void;
  onDone: (message: string) => Promise<void>;
  onDeviceRequired: (e: ManageError) => void;
}) {
  const svc = serviceOf(appt);
  const pro = professionalOf(appt);
  const serviceIds = useMemo(() => (svc.id ? [svc.id] : []), [svc.id]);
  const [date, setDate] = useState<string | null>(null);
  const [pick, setPick] = useState<{ date: string; slot: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const onDate = useCallback((d: string) => { setDate(d); setError(''); }, []);
  const onSlot = useCallback((slot: string, d: string) => { setError(''); setPick({ date: d, slot }); }, []);

  const confirm = async () => {
    if (!pick) return;
    setBusy(true); setError('');
    try {
      await rescheduleMyAppointmentApi(slug, appt.id, { date: pick.date, startTime: pick.slot });
      const when = whenLabel(pick.date, pick.slot);
      // O servidor devolve para "pendente" um horário que estava confirmado: o dono precisa confirmar de novo.
      await onDone(appt.status === 'confirmed'
        ? `Horário remarcado para ${when}. ${RESCHEDULE_REQUESTS_CONFIRMATION}`
        : `Horário remarcado para ${when}.`);
    } catch (err) {
      const e = manageError(err, 'reschedule');
      if (e.deviceRequired) { onDeviceRequired(e); return; }
      setError(e.message);
      setPick(null); // volta à escolha de horários (e, se o horário foi ocupado, busca a lista de novo)
      if (e.conflict) setRefreshKey(k => k + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <StepHeader title="Remarcar horário" />

      <div className="bk-summary">
        <div className="bk-summary-row"><span>Serviço</span><b>{svc.name}</b></div>
        {pro.name && <div className="bk-summary-row"><span>Profissional</span><b>{pro.name}</b></div>}
        <div className="bk-summary-row"><span>Agora</span><b>{whenLabel(appt.date, appt.startTime)}</b></div>
      </div>

      {pick ? (
        <div className="bk-confirm" role="group" aria-label="Confirmar remarcação" style={{ marginTop: 20 }}>
          <p>Remarcar para <b>{whenLabel(pick.date, pick.slot)}</b>?</p>
          {appt.status === 'confirmed' && <p className="bk-hint">Como o horário muda, o estabelecimento precisa confirmar de novo.</p>}
          <div className="bk-appt-actions">
            <button type="button" className="bk-btn" disabled={busy} onClick={() => void confirm()}>
              {busy ? 'Remarcando…' : 'Confirmar remarcação'}
            </button>
            <button type="button" className="bk-btn ghost" disabled={busy} onClick={() => setPick(null)}>Escolher outro</button>
          </div>
        </div>
      ) : (
        <>
          {error && <div className="bk-alert" role="alert">{error}</div>}
          <DayTimePicker
            slug={slug}
            serviceIds={serviceIds}
            professionalId={pro.id}
            date={date}
            onDate={onDate}
            onSlot={onSlot}
            refreshKey={refreshKey}
          />
        </>
      )}

      <div className="bk-actions">
        <button type="button" className="bk-link" onClick={onBack}><ChevronLeft size={16} aria-hidden /> Voltar</button>
      </div>
    </section>
  );
}
