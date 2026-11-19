import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { AlertTriangle, CalendarClock, ShieldCheck, Tag } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { resendCodeApi, verifyBookApi } from '@/services/booking.service';
import { useBooking } from './BookingContext';
import { MiniAvatar, StepHeader } from './parts';
import { formatDuration, whenLabel } from './bookingFormat';

const RESEND_SECONDS = 30; // igual ao RESEND_COOLDOWN do backend

/** Confirmação do celular: código de 6 dígitos enviado por WhatsApp. */
export default function StepVerify() {
  const { slug, challengeId } = useBooking();
  if (!challengeId) return <Navigate to={`/${slug}`} replace />;
  return <VerifyForm challengeId={challengeId} />;
}

function VerifyForm({ challengeId }: { challengeId: string }) {
  const { slug, selectedServices, eligible, professionalId, date, time, challenge, setChallenge, setBooked, go } = useBooking();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<{ message: string; conflict: boolean } | null>(null);
  const [info, setInfo] = useState('');
  const [wait, setWait] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(w => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const masked = challenge?.id === challengeId ? challenge.maskedPhone : 'seu celular';
  const chosen = eligible.find(p => p.id === professionalId) ?? (eligible.length === 1 ? eligible[0] : null);
  const single = selectedServices.length === 1 ? selectedServices[0] : null;
  const totalMin = selectedServices.reduce((n, s) => n + s.duration, 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) { setProblem({ message: 'Digite os 6 dígitos do código.', conflict: false }); return; }
    setSubmitting(true);
    setProblem(null);
    try {
      const result = await verifyBookApi(slug, challengeId, code);
      if (result.kind === 'booked') {
        setBooked({ booking: result.booking, client: result.client });
        go('confirmado');
      }
    } catch (err) {
      const conflict = err instanceof ApiError && err.code === 'SCHEDULE_CONFLICT';
      setProblem({ message: err instanceof Error ? err.message : 'Não foi possível confirmar. Tente novamente.', conflict });
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    setProblem(null);
    setInfo('');
    try {
      const r = await resendCodeApi(slug, challengeId);
      setChallenge({ id: challengeId, maskedPhone: r.maskedPhone, expiresAt: r.expiresAt });
      setInfo('Enviamos um novo código.');
      setWait(RESEND_SECONDS);
      setCode('');
    } catch (err) {
      setProblem({ message: err instanceof Error ? err.message : 'Não foi possível reenviar o código.', conflict: false });
    }
  };

  return (
    <section>
      <StepHeader step="3/3" title="Confirme seu número" icon={<ShieldCheck size={20} aria-hidden />}>
        <p className="bk-sub" style={{ marginTop: 2 }}>Quase lá! É só digitar o código.</p>
      </StepHeader>

      {selectedServices.length > 0 && date && time && (
        <div className="bk-summary">
          <div className="bk-summary-row">
            <span>Serviço</span>
            <b><Tag size={16} aria-hidden /> {single ? single.name : selectedServices.map(s => s.name).join(' + ')} · {formatDuration(totalMin)}</b>
          </div>
          <div className="bk-summary-row">
            <span>Profissional</span>
            {chosen ? <b><MiniAvatar pro={chosen} /> {chosen.name}</b> : <b>Qualquer profissional</b>}
          </div>
          <div className="bk-summary-row">
            <span>Quando</span>
            <b><CalendarClock size={16} aria-hidden /> {whenLabel(date, time)}</b>
          </div>
        </div>
      )}

      <p className="bk-hint">
        Enviamos um código por WhatsApp para <b style={{ color: 'var(--bk-text)' }}>{masked}</b>. Pode levar até 1 minuto para chegar.
      </p>

      <form onSubmit={submit} noValidate>
        <div className="bk-field">
          <label htmlFor="bk-code">Código</label>
          <input
            id="bk-code" className="bk-input bk-code" inputMode="numeric" autoComplete="one-time-code" placeholder="6 dígitos" maxLength={6}
            value={code} aria-invalid={!!problem} autoFocus
            onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setProblem(null); }}
          />
        </div>

        {info && <p className="bk-hint" role="status">{info}</p>}
        {problem && (
          <div className="bk-alert" role="alert">
            <AlertTriangle size={18} aria-hidden />
            <span>
              {problem.message}{' '}
              {problem.conflict && <button type="button" className="bk-inline" onClick={() => go('horario')}>Escolher outro horário</button>}
            </span>
          </div>
        )}

        <button type="submit" className="bk-btn block" style={{ marginTop: 20 }} disabled={submitting || code.length !== 6}>
          {submitting ? 'Confirmando…' : 'Confirmar'}
        </button>
      </form>

      <div className="bk-secondary">
        <button type="button" className="bk-link" disabled={wait > 0} onClick={resend}>
          {wait > 0 ? `Reenviar código (${wait}s)` : 'Reenviar código'}
        </button>
        <button type="button" className="bk-link" onClick={() => go('dados')}>Trocar o número</button>
      </div>
    </section>
  );
}
