import { useEffect, useMemo } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { Clock, Phone } from 'lucide-react';
import { usePublicTenant } from '@/context/PublicTenantContext';
import { accentOnDark, readableOn } from '@/lib/bookingColor';
import { businessHoursLabel, openStatus } from '@/lib/bookingHours';
import { nowBrasilia } from '@/lib/scheduling';
import { BookingProvider } from './BookingContext';
import { initials } from './bookingFormat';
import '@/styles/booking.css';

/** Moldura de todos os passos: capa, logo, nome, selo de aberto/fechado, cartão e rodapé. */
export default function BookLayout() {
  const { data: { tenant, professionals } } = usePublicTenant();

  const accent = accentOnDark(tenant.primaryColor);
  const hours = useMemo(() => businessHoursLabel(professionals), [professionals]);
  const status = useMemo(() => {
    const now = nowBrasilia();
    const dow = new Date(`${now.date}T12:00:00`).getDay();
    return openStatus(tenant.isOpen, professionals, { dayOfWeek: dow, time: now.time });
  }, [tenant.isOpen, professionals]);

  useEffect(() => {
    document.title = `Agendar em ${tenant.name}`;
  }, [tenant.name]);

  const phoneDigits = (tenant.phone ?? '').replace(/\D/g, '');

  return (
    <div className="book-root" style={{ ['--bk-accent' as string]: accent, ['--bk-accent-fg' as string]: readableOn(accent) }}>
      <div className="bk-wrap">
        <div className={`bk-cover${tenant.bannerUrl ? ' has-image' : ''}`}>
          {tenant.bannerUrl && <img src={tenant.bannerUrl} alt="" />}
        </div>
        <div className="bk-avatar bk-display" aria-hidden={!tenant.logoUrl}>
          {tenant.logoUrl ? <img src={tenant.logoUrl} alt={tenant.name} /> : initials(tenant.name)}
        </div>
        <h2 className="bk-name bk-display">{tenant.name}</h2>
        <div className="bk-status">
          <span className={`bk-pill${status.kind === 'open' ? '' : ' muted'}`}>{status.label}</span>
        </div>

        <main className="bk-card">
          {status.kind === 'paused' ? (
            <div role="status">
              <h1 className="bk-title bk-display">Agendamentos pausados</h1>
              <p className="bk-sub">
                {tenant.name} não está aceitando agendamentos online neste momento.
                {phoneDigits ? ' Fale direto com o estabelecimento pelo telefone abaixo.' : ' Volte mais tarde.'}
              </p>
            </div>
          ) : (
            <BookingProvider>
              <Outlet />
            </BookingProvider>
          )}
        </main>

        <footer className="bk-footer">
          <div className="bk-footer-info">
            {phoneDigits && (
              <a href={`tel:+${phoneDigits.startsWith('55') ? phoneDigits : `55${phoneDigits}`}`}>
                <Phone size={16} aria-hidden /> {tenant.phone}
              </a>
            )}
            {hours && <span><Clock size={16} aria-hidden /> {hours}</span>}
          </div>
          <Link to="/" className="bk-via">
            via <img src="/images/nimbo-logo-branco.png" alt="Nimbo" />
          </Link>
        </footer>
      </div>
    </div>
  );
}
