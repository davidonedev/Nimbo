import { Link, Navigate } from 'react-router-dom';
import { CalendarCheck, CalendarPlus, Check, Clock, MessageCircle } from 'lucide-react';
import { format } from 'date-fns';
import { usePublicTenant } from '@/context/PublicTenantContext';
import { formatCurrency } from '@/lib/utils';
import { clientConfirmedApi, getDeviceToken } from '@/services/booking.service';
import { useBooking } from './BookingContext';
import { priceLabel, whenLabel } from './bookingFormat';

/** Só dígitos e com DDI 55: "(19) 98179-4567" → "5519981794567" (formato do link wa.me). */
function waNumber(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`;
}

/**
 * Agendamento criado. Se o estabelecimento não tem código automático, o horário fica PENDENTE e aqui o cliente manda a
 * confirmação pelo WhatsApp do estabelecimento (até o prazo; depois o horário é liberado). Senão, resumo + calendário.
 */
export default function StepDone() {
  const { slug, booked, go, setBooked, setChallenge } = useBooking();
  const { data: { tenant } } = usePublicTenant();
  if (!booked) return <Navigate to={`/${slug}`} replace />;

  const { booking, client, pending, confirmBy, clientConfirmed } = booked;
  const first = booking.items[0];
  const last = booking.items[booking.items.length - 1];
  const names = booking.items.map(i => i.serviceName).join(' + ');
  // Sem prova do celular (pedido pendente de um aparelho novo) o servidor não mostra a lista: só oferece se houver token.
  const canManage = !pending || !!getDeviceToken(slug);
  const mine = canManage && (
    <Link className="bk-btn ghost block" to={`/${slug}/meus-agendamentos`}>
      <CalendarCheck size={18} aria-hidden /> Ver meus agendamentos
    </Link>
  );
  const again = () => { setBooked(null); setChallenge(null); go('servico', { s: [] }); };

  // Link do Google Agenda (abre o app de calendário no celular). Horário de Brasília, UTC-3 fixo.
  const stamp = (time: string) => `${booking.date.replace(/-/g, '')}T${time.replace(':', '')}00`;
  const calendarUrl = `https://calendar.google.com/calendar/render?${new URLSearchParams({
    action: 'TEMPLATE',
    text: `${names} — ${tenant.name}`,
    dates: `${stamp(first.startTime)}/${stamp(last.endTime)}`,
    ctz: 'America/Sao_Paulo',
    details: `Profissional: ${booking.professionalName}`,
    location: tenant.address ?? '',
  })}`;

  const summary = (
    <div className="bk-summary" style={{ textAlign: 'left' }}>
      <div className="bk-summary-row"><span>Profissional</span><b>{booking.professionalName}</b></div>
      <div className="bk-summary-row"><span>Quando</span><b>{whenLabel(booking.date, first.startTime)}</b></div>
      {booking.items.map(i => (
        <div key={i.id} className="bk-summary-row">
          <span>{i.startTime}</span>
          <b>{i.serviceName}{i.price > 0 ? ` · ${priceLabel(i.price)}` : ''}</b>
        </div>
      ))}
      {booking.totalPrice > 0 && (
        <div className="bk-total"><span>Total</span><span>{formatCurrency(booking.totalPrice)}</span></div>
      )}
    </div>
  );

  if (pending) {
    const number = waNumber(tenant.phone);
    const message = `Olá! Sou ${client.name} e confirmo meu horário: ${names} com ${booking.professionalName}, ${whenLabel(booking.date, first.startTime)}.`;
    const waUrl = number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : null;
    const deadline = confirmBy ? format(new Date(confirmBy), 'HH:mm') : null;
    // Ao tocar no botão o link abre o WhatsApp normalmente; em paralelo avisamos o servidor, que tira o prazo do horário.
    const onConfirmTap = () => {
      if (clientConfirmed) return;
      void clientConfirmedApi(slug, booking.items.map(i => i.id))
        .then(r => { if (r.confirmed > 0) setBooked({ ...booked, clientConfirmed: true, confirmBy: null }); })
        .catch(() => { /* sem rede: o cliente ainda mandou a mensagem; só o prazo curto continua valendo */ });
    };

    return (
      <section style={{ textAlign: 'center' }}>
        <div className="bk-done-icon pending"><Clock size={34} aria-hidden /></div>
        <h1 className="bk-title bk-display" style={{ marginTop: 0 }}>Falta só um passo!</h1>
        {waUrl && clientConfirmed ? (
          <p className="bk-sub">
            Pronto, {client.name.split(' ')[0]}! Seu horário está reservado. Agora é só aguardar o {tenant.name} confirmar.
          </p>
        ) : waUrl ? (
          <p className="bk-sub">
            {client.name.split(' ')[0]}, seu horário está reservado, mas só vale depois que você confirmar.
            Toque no botão e envie a mensagem para o {tenant.name}.
            {deadline && <> Faça isso até <b>{deadline}</b> ou o horário será liberado.</>}
          </p>
        ) : (
          <p className="bk-sub">
            {client.name.split(' ')[0]}, seu horário está reservado. O {tenant.name} vai confirmar com você.
          </p>
        )}

        {summary}

        <div style={{ display: 'grid', gap: 10, marginTop: 20 }}>
          {waUrl && (
            <a className="bk-btn block" href={waUrl} target="_blank" rel="noopener noreferrer" onClick={onConfirmTap}>
              <MessageCircle size={18} aria-hidden /> {clientConfirmed ? 'Abrir o WhatsApp de novo' : 'Confirmar no WhatsApp'}
            </a>
          )}
          {mine}
          <button type="button" className="bk-btn ghost block" onClick={again}>Fazer outro agendamento</button>
        </div>
      </section>
    );
  }

  return (
    <section style={{ textAlign: 'center' }}>
      <div className="bk-done-icon"><Check size={36} aria-hidden /></div>
      <h1 className="bk-title bk-display" style={{ marginTop: 0 }}>Agendamento confirmado!</h1>
      <p className="bk-sub">
        {client.name.split(' ')[0]}, esperamos você. Lembretes podem chegar no seu WhatsApp.
      </p>

      {summary}

      <div style={{ display: 'grid', gap: 10, marginTop: 20 }}>
        <a className="bk-btn ghost" href={calendarUrl} target="_blank" rel="noopener noreferrer">
          <CalendarPlus size={18} aria-hidden /> Adicionar ao calendário
        </a>
        {mine}
        <button type="button" className="bk-btn block" onClick={again}>Fazer outro agendamento</button>
      </div>
    </section>
  );
}
