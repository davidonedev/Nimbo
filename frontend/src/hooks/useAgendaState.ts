import { useCallback, useState } from 'react';
import { addDaysISO, todaySP } from '../lib/agendaDates';

export type AgendaView = 'day' | 'week' | 'month';

const VIEW_KEY = 'nimbo_agenda_view';
const VIEWS: AgendaView[] = ['day', 'week', 'month'];

/** Visão (Dia/Semana/Mês, lembrada no localStorage) e data selecionada da Agenda. */
export function useAgendaState() {
  const [view, setViewState] = useState<AgendaView>(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY) as AgendaView | null;
      return v && VIEWS.includes(v) ? v : 'day';
    } catch { return 'day'; }
  });
  const [date, setDate] = useState(() => todaySP());

  const setView = useCallback((v: AgendaView) => {
    setViewState(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* sem storage: só não persiste */ }
  }, []);

  const goToday = useCallback(() => setDate(todaySP()), []);
  const shiftDays = useCallback((n: number) => setDate(d => addDaysISO(d, n)), []);

  return { view, setView, date, setDate, goToday, shiftDays };
}
