import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { usePublicTenant } from '@/context/PublicTenantContext';
import { AlertTriangle, CalendarClock, ChevronLeft, CircleCheck, Lock, CalendarX, Tag } from 'lucide-react';
import { maskPhone } from '@/lib/phone';
import { ApiError } from '@/lib/api';
import { bookApi } from '@/services/booking.service';
import { useBooking } from './BookingContext';
import { Turnstile, captchaEnabled } from './Turnstile';
import { MiniAvatar, StepHeader } from './parts';
import { formatDuration, priceLabel, totalOf, whenLabel } from './bookingFormat';

/** Passo 3/3 — Nome + Celular. Na 1ª vez o código chega por WhatsApp; aparelho reconhecido confirma direto. */
export default function StepContact() {
  const { slug, selectedServices, date, time } = useBooking();
  if (selectedServices.length === 0) return <Navigate to={`/${slug}`} replace />;
  if (!date || !time) return <Navigate to={`/${slug}/horario${window.location.search}`} replace />;
  return <ContactForm date={date} time={time} />;
}

function ContactForm({ date, time }: { date: string; time: string }) {
  const { slug, selectedServices, eligible, professionalId, possession, form, setForm, setChallenge, setBooked, go } = useBooking();
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<{ message: string; conflict: boolean } | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0); // muda para refazer o captcha (token é de uso único)
  const { data: { tenant } } = usePublicTenant();

  // Aparelho reconhecido: já vem preenchido (sem sobrescrever o que a pessoa digitou).
  useEffect(() => {
    if (possession?.recognized && !form.name && !form.phone) {
      setForm({ ...form, name: possession.fullName ?? '', phone: possession.phone ? maskPhone(possession.phone) : '' });
    }
  }, [possession]); // eslint-disable-line react-hooks/exhaustive-deps

  const chosen = eligible.find(p => p.id === professionalId) ?? (eligible.length === 1 ? eligible[0] : null);
  const { minutes, price } = totalOf(selectedServices);
  const single = selectedServices.length === 1 ? selectedServices[0] : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (form.name.trim().length < 2) next.name = 'Informe seu nome completo.';
    if (form.phone.replace(/\D/g, '').length < 10) next.phone = 'Informe o celular com DDD.';
    setErrors(next);
    if (Object.keys(next).length) return;
    if (captchaEnabled && !captchaToken) {
      setProblem({ message: 'Confirme que você não é um robô antes de continuar.', conflict: false });
      return;
    }

    setSubmitting(true);
    setProblem(null);
    try {
      const result = await bookApi(slug, {
        name: form.name.trim(),
        phone: form.phone,
        serviceIds: selectedServices.map(s => s.id),
        professionalId: chosen ? chosen.id : null,
        date,
        startTime: time,
        notes: form.notes.trim() || undefined,
        captchaToken: captchaToken ?? undefined,
      });
      if (result.kind === 'challenge_required') {
        setChallenge({ id: result.challengeId, maskedPhone: result.maskedPhone, expiresAt: result.expiresAt });
        go('codigo', { c: result.challengeId });
      } else if (result.kind === 'pending_confirmation') {
        // Sem código automático: o horário foi reservado e o cliente confirma pelo WhatsApp do estabelecimento.
        setBooked({ booking: result.booking, client: result.client, pending: true, confirmBy: result.confirmBy });
        go('confirmado');
      } else {
        setBooked({ booking: result.booking, client: result.client });
        go('confirmado');
      }
    } catch (err) {
      const conflict = err instanceof ApiError && err.code === 'SCHEDULE_CONFLICT';
      setProblem({ message: err instanceof Error ? err.message : 'Não foi possível agendar. Tente novamente.', conflict });
      setCaptchaToken(null);
      setCaptchaKey(k => k + 1);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section>
      <StepHeader step="3/3" title="Seus dados" icon={<CircleCheck size={20} aria-hidden />}>
        <p className="bk-sub" style={{ marginTop: 2 }}>Quase lá! É só confirmar.</p>
      </StepHeader>

      <div className="bk-summary">
        <div className="bk-summary-row">
          <span>Serviço</span>
          <b><Tag size={16} aria-hidden /> {single ? `${single.name} · ${formatDuration(single.duration)}` : `${selectedServices.map(s => s.name).join(' + ')} · ${formatDuration(minutes)}`}</b>
        </div>
        <div className="bk-summary-row">
          <span>Profissional</span>
          {chosen ? <b><MiniAvatar pro={chosen} /> {chosen.name}</b> : <b>Qualquer profissional</b>}
        </div>
        <div className="bk-summary-row">
          <span>Quando</span>
          <b><CalendarClock size={16} aria-hidden /> {whenLabel(date, time)}</b>
        </div>
        {price > 0 && (
          <div className="bk-summary-row">
            <span>Valor</span>
            <b>{priceLabel(price)}</b>
          </div>
        )}
      </div>

      <form onSubmit={submit} noValidate>
        <div className="bk-field">
          <label htmlFor="bk-name">Nome completo <i>*</i></label>
          <input
            id="bk-name" className="bk-input" autoComplete="name" value={form.name} aria-invalid={!!errors.name}
            onChange={e => { setForm({ ...form, name: e.target.value }); setErrors(p => ({ ...p, name: undefined })); }}
          />
          {errors.name && <p className="bk-error">{errors.name}</p>}
        </div>

        <div className="bk-field">
          <label htmlFor="bk-phone">Celular (WhatsApp) <i>*</i></label>
          <div className="bk-phone">
            <span className="bk-phone-cc" aria-label="Brasil, +55">🇧🇷 +55</span>
            <input
              id="bk-phone" className="bk-input" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(11) 99999-8888"
              value={form.phone} aria-invalid={!!errors.phone} maxLength={15}
              onChange={e => { setForm({ ...form, phone: maskPhone(e.target.value) }); setErrors(p => ({ ...p, phone: undefined })); }}
            />
          </div>
          {errors.phone && <p className="bk-error">{errors.phone}</p>}
          <p className="bk-hint">Avisos deste agendamento podem chegar no seu WhatsApp, em nome do estabelecimento, pelo sistema Nimbo.</p>
        </div>

        <div className="bk-field">
          <label htmlFor="bk-notes">Observações (opcional)</label>
          <textarea
            id="bk-notes" className="bk-input" maxLength={500} value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })}
          />
        </div>

        <Turnstile onToken={setCaptchaToken} resetKey={captchaKey} />

        {problem && (
          <div className="bk-alert" role="alert">
            <AlertTriangle size={18} aria-hidden />
            <span>
              {problem.message}{' '}
              {problem.conflict && <button type="button" className="bk-inline" onClick={() => go('horario')}>Escolher outro horário</button>}
            </span>
          </div>
        )}

        <p className="bk-sub" style={{ fontSize: 12, marginTop: 4 }}>
          Ao confirmar, você autoriza o {tenant.name} a usar seu nome e seu WhatsApp para este agendamento e para os avisos sobre ele.
          Veja a <Link to="/privacidade" className="bk-inline">Política de Privacidade</Link>.
        </p>

        <div className="bk-actions">
          <button type="button" className="bk-link" onClick={() => go('horario')}><ChevronLeft size={16} aria-hidden /> Voltar</button>
          <button type="submit" className="bk-btn" disabled={submitting}>{submitting ? 'Enviando…' : 'Confirmar agendamento'}</button>
        </div>
      </form>

      <div className="bk-trust">
        <span><Lock size={14} aria-hidden /> Sem pagamento antecipado.</span>
        <span><CalendarX size={14} aria-hidden /> Cancelamento até 1h antes.</span>
      </div>
    </section>
  );
}
