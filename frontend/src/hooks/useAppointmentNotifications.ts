import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import type { Appointment, Client, Service } from '@/types';

export interface AppNotification {
  id: string;
  /** pending_reminder = o cliente já confirmou pelo WhatsApp e o dono ainda não confirmou (perto do horário). */
  type: 'new_booking' | 'cancelled' | 'pending_reminder';
  /** Só em pending_reminder: aviso de 2 horas ou de 1 hora antes do horário. */
  reminder?: '2h' | '1h';
  clientName: string;
  serviceName: string;
  date: string;
  time: string;
  timestamp: number;
  read: boolean;
}

// ─── Som ──────────────────────────────────────────────────────────────────────
function playSound(type: 'new_booking' | 'cancelled') {
  try {
    const ctx  = new AudioContext();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';

    if (type === 'new_booking') {
      // Acorde ascendente — positivo
      osc.frequency.setValueAtTime(523, ctx.currentTime);
      osc.frequency.setValueAtTime(659, ctx.currentTime + 0.12);
      osc.frequency.setValueAtTime(784, ctx.currentTime + 0.24);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.55);
    } else {
      // Dois tons descendentes — alerta
      const osc2  = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);

      osc.type  = 'sine';
      osc2.type = 'sine';

      osc.frequency.setValueAtTime(440, ctx.currentTime);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);

      osc2.frequency.setValueAtTime(330, ctx.currentTime + 0.35);
      gain2.gain.setValueAtTime(0.18, ctx.currentTime + 0.35);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65);
      osc2.start(ctx.currentTime + 0.35);
      osc2.stop(ctx.currentTime + 0.65);
    }
  } catch {
    // AudioContext bloqueado ou indisponível
  }
}

// ─── Notificação do browser ───────────────────────────────────────────────────
async function browserNotify(title: string, body: string) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') await Notification.requestPermission();
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico', tag: 'agendepro' });
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAppointmentNotifications(
  appointments: Appointment[],
  clients:       Client[],
  services:      Service[],
  /** Chave de localStorage para isolar por tenant */
  storageKey = 'apn_v1',
) {
  // Inicializa a partir do localStorage (persiste entre reloads)
  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as AppNotification[]) : [];
    } catch {
      return [];
    }
  });

  const [activeToasts, setActiveToasts] = useState<AppNotification[]>([]);
  const prevRef      = useRef<Appointment[] | null>(null);
  const appointmentsRef = useRef(appointments);
  const clientsRef   = useRef(clients);
  const servicesRef  = useRef(services);
  useLayoutEffect(() => {
    clientsRef.current  = clients;
    servicesRef.current = services;
    appointmentsRef.current = appointments;
  });

  // Avisos "falta confirmar" (mesma regra do e-mail do servidor): agendamento pendente que o cliente já confirmou pelo
  // WhatsApp. Aviso 2 h antes e, se ainda pendente, 1 h antes. Só dispara com o painel aberto; o e-mail cobre o resto.
  useEffect(() => {
    const firedKey = `${storageKey}_pending_reminders`;
    const load = (): Set<string> => {
      try { return new Set<string>(JSON.parse(localStorage.getItem(firedKey) ?? '[]')); } catch { return new Set<string>(); }
    };
    const fired = load();

    const tick = () => {
      const now = Date.now();
      const toAdd: AppNotification[] = [];
      for (const a of appointmentsRef.current) {
        if (a.status !== 'pending' || !a.clientConfirmedAt) continue;
        const left = (new Date(`${a.date}T${a.startTime}:00-03:00`).getTime() - now) / 60000; // horário de Brasília (UTC-3)
        if (!(left > 0 && left <= 120)) continue;

        let reminder: '2h' | '1h' | null = null;
        if (left <= 60 && !fired.has(`${a.id}:1h`)) {
          reminder = '1h';
          fired.add(`${a.id}:1h`); fired.add(`${a.id}:2h`); // depois do de 1 h não vem o de 2 h
        } else if (left > 60 && !fired.has(`${a.id}:2h`) && !fired.has(`${a.id}:1h`)) {
          reminder = '2h';
          fired.add(`${a.id}:2h`);
        }
        if (!reminder) continue;

        toAdd.push({
          id: `n-${now}-${a.id}-${reminder}`,
          type: 'pending_reminder', reminder,
          clientName:  clientsRef.current.find(c => c.id === a.clientId)?.name ?? '—',
          serviceName: servicesRef.current.find(s => s.id === a.serviceId)?.name ?? '—',
          date: a.date, time: a.startTime, timestamp: now, read: false,
        });
      }
      if (toAdd.length === 0) return;
      try { localStorage.setItem(firedKey, JSON.stringify([...fired].slice(-300))); } catch { /* quota */ }
      setNotifications(ns => [...toAdd, ...ns].slice(0, 100));
      setActiveToasts(ts => [...ts, ...toAdd]);
      playSound('cancelled'); // tom de alerta
      toAdd.forEach(n => browserNotify(
        n.reminder === '1h' ? '⏰ Falta confirmar — começa em 1 hora' : '⏰ Falta confirmar — começa em 2 horas',
        `${n.clientName} · ${n.serviceName} às ${n.time}`,
      ));
    };

    const first = setTimeout(tick, 1500);
    const timer = setInterval(tick, 30_000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [storageKey]);

  // Persiste sempre que a lista muda
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(notifications.slice(0, 100)));
    } catch {
      // quota excedida — ignora
    }
  }, [notifications, storageKey]);

  // Detecta mudanças nos agendamentos
  useEffect(() => {
    // Primeira renderização: inicializa baseline sem disparar alertas
    if (prevRef.current === null) {
      prevRef.current = appointments;
      return;
    }

    const prev  = prevRef.current;
    const toAdd: AppNotification[] = [];

    appointments.forEach(a => {
      const prevAppt  = prev.find(p => p.id === a.id);
      const client    = clientsRef.current.find(c => c.id === a.clientId);
      const svc       = servicesRef.current.find(s => s.id === a.serviceId);

      const base: Omit<AppNotification, 'type'> = {
        id:          `n-${Date.now()}-${a.id}-${Math.random()}`,
        clientName:  client?.name  ?? '—',
        serviceName: svc?.name     ?? '—',
        date:        a.date,
        time:        a.startTime,
        timestamp:   Date.now(),
        read:        false,
      };

      // Novo agendamento (apareceu com status pending)
      if (!prevAppt && a.status === 'pending') {
        toAdd.push({ ...base, type: 'new_booking' });
      }

      // Agendamento foi cancelado (status transitou para 'cancelled')
      if (prevAppt && prevAppt.status !== 'cancelled' && a.status === 'cancelled') {
        toAdd.push({ ...base, type: 'cancelled' });
      }
    });

    if (toAdd.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNotifications(ns => [...toAdd, ...ns].slice(0, 100));
      setActiveToasts(ts => [...ts, ...toAdd]);
      playSound(toAdd[0].type === 'new_booking' ? 'new_booking' : 'cancelled');
      toAdd.forEach(n => {
        const title = n.type === 'new_booking'
          ? '📅 Novo agendamento!'
          : '❌ Agendamento cancelado';
        browserNotify(title, `${n.clientName} · ${n.serviceName} às ${n.time}`);
      });
    }

    prevRef.current = appointments;
  }, [appointments]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = useCallback(() =>
    setNotifications(ns => ns.map(n => ({ ...n, read: true }))), []);

  const dismissToast = useCallback((id: string) =>
    setActiveToasts(ts => ts.filter(t => t.id !== id)), []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
  }, [storageKey]);

  return { notifications, unreadCount, markAllRead, activeToasts, dismissToast, clearAll };
}
