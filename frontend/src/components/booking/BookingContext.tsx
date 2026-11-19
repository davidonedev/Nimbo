/**
 * Estado do agendamento público. O que o cliente escolhe (serviços, profissional, dia, horário) vive na URL
 * (?s=a,b &p= &d= &t=), então recarregar a página ou voltar do navegador não perde nada. O que não deve ir na URL
 * (nome/celular digitados, pedido de código, resumo final) fica aqui, em memória.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { usePublicTenant } from '@/context/PublicTenantContext';
import { getPossessionApi, type BookedClient, type BookedSummary, type Possession } from '@/services/booking.service';
import type { Professional, Service } from '@/types';

export type BookingStep = 'servico' | 'horario' | 'dados' | 'codigo' | 'confirmado';

export interface Selection {
  s?: string[];       // ids dos serviços, na ordem
  p?: string | null;  // profissional (null/undefined = qualquer)
  d?: string | null;  // yyyy-MM-dd
  t?: string | null;  // HH:mm
  c?: string | null;  // pedido de código (challenge)
}

export interface ContactForm { name: string; phone: string; notes: string }

/** Agendamento criado. `pending` = ainda falta o cliente confirmar pelo WhatsApp do estabelecimento (até `confirmBy`). */
export interface BookedState { booking: BookedSummary; client: BookedClient; pending?: boolean; confirmBy?: string | null; clientConfirmed?: boolean }

export interface Challenge { id: string; maskedPhone: string; expiresAt: string }

interface BookingCtx {
  slug: string;
  services: Service[];
  professionals: Professional[];
  selectedServices: Service[];
  /** Profissionais que fazem TODOS os serviços escolhidos. */
  eligible: Professional[];
  professionalId: string | null;
  date: string | null;
  time: string | null;
  challengeId: string | null;
  possession: Possession | null;
  form: ContactForm;
  setForm: (f: ContactForm) => void;
  challenge: Challenge | null;
  setChallenge: (c: Challenge | null) => void;
  booked: BookedState | null;
  setBooked: (b: BookedState | null) => void;
  /** Vai para um passo mantendo a seleção atual, aplicando `patch` por cima (valor null/undefined remove o item). */
  go: (step: BookingStep, patch?: Selection, opts?: { replace?: boolean }) => void;
  pathFor: (step: BookingStep, patch?: Selection) => string;
}

const Ctx = createContext<BookingCtx | null>(null);

const STEP_PATH: Record<BookingStep, string> = { servico: '', horario: '/horario', dados: '/dados', codigo: '/codigo', confirmado: '/confirmado' };

export function BookingProvider({ children }: { children: ReactNode }) {
  const { data, getSlug } = usePublicTenant();
  const slug = getSlug();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const services = useMemo(() => data.services.filter(s => s.isActive !== false), [data.services]);
  const professionals = data.professionals;

  const ids = useMemo(() => (params.get('s') ?? '').split(',').filter(Boolean), [params]);
  const selectedServices = useMemo(
    () => ids.map(id => services.find(s => s.id === id)).filter((s): s is Service => !!s),
    [ids, services],
  );
  const eligible = useMemo(
    () => (selectedServices.length === 0 ? [] : professionals.filter(p => selectedServices.every(s => p.services.includes(s.id)))),
    [professionals, selectedServices],
  );

  const [possession, setPossession] = useState<Possession | null>(null);
  const [form, setForm] = useState<ContactForm>({ name: '', phone: '', notes: '' });
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [booked, setBooked] = useState<BookedState | null>(null);

  useEffect(() => {
    let alive = true;
    getPossessionApi(slug).then(p => { if (alive) setPossession(p); }).catch(() => { /* sem reconhecimento: segue como cliente novo */ });
    return () => { alive = false; };
  }, [slug]);

  const pathFor = useCallback((step: BookingStep, patch: Selection = {}) => {
    const next = new URLSearchParams(params);
    const apply = (key: string, value: string | null | undefined, has: boolean) => {
      if (!has) return;
      if (value) next.set(key, value); else next.delete(key);
    };
    apply('s', patch.s?.join(','), 's' in patch);
    apply('p', patch.p, 'p' in patch);
    apply('d', patch.d, 'd' in patch);
    apply('t', patch.t, 't' in patch);
    apply('c', patch.c, 'c' in patch);
    // Cada passo só carrega o que precisa: sair do horário/dados limpa o que vem depois.
    if (step === 'servico') { next.delete('p'); next.delete('d'); next.delete('t'); next.delete('c'); }
    if (step === 'horario') { next.delete('t'); next.delete('c'); }
    if (step === 'dados') next.delete('c');
    if (step === 'confirmado') { next.delete('c'); }
    const qs = next.toString();
    return `/${slug}${STEP_PATH[step]}${qs ? `?${qs}` : ''}`;
  }, [params, slug]);

  const go = useCallback((step: BookingStep, patch: Selection = {}, opts?: { replace?: boolean }) => {
    navigate(pathFor(step, patch), { replace: opts?.replace });
  }, [navigate, pathFor]);

  const value: BookingCtx = {
    slug, services, professionals, selectedServices, eligible,
    professionalId: params.get('p'), date: params.get('d'), time: params.get('t'), challengeId: params.get('c'),
    possession, form, setForm, challenge, setChallenge, booked, setBooked, go, pathFor,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBooking() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useBooking must be inside BookingProvider');
  return ctx;
}
