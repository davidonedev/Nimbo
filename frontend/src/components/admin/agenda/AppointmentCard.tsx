import { memo } from 'react';
import type { CardLayout } from '@/lib/agendaGrid';
import { STATUS_META } from './statusStyle';

interface Props {
  layout: CardLayout;
  onSelect: (id: string) => void;
}

/** Cartão de agendamento na grade. Cartões curtos viram uma linha e o texto completo fica no tooltip. */
function AppointmentCardBase({ layout, onSelect }: Props) {
  const { appt, top, height, lane, lanes } = layout;
  const meta = STATUS_META[appt.status];
  const Icon = meta.icon;
  const client = appt.client?.name ?? 'Cliente';
  const service = appt.service?.name ?? 'Serviço';
  const professional = appt.professional?.name ?? '';
  const full = `${appt.startTime} às ${appt.endTime} · ${client} · ${service}${professional ? ` · ${professional}` : ''} · ${meta.label}`;
  // 30 min (48 px) cabem em uma linha; o texto completo (com status) fica no tooltip e no aria-label
  const compact = height < 60;
  const roomy = height >= 88;

  return (
    <button
      type="button"
      title={full}
      aria-label={full}
      onClick={() => onSelect(appt.id)}
      style={{ top, height: height - 2, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }}
      className={`absolute z-10 flex flex-col overflow-hidden rounded-lg border-l-4 px-2 py-1 text-left text-xs shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${meta.card}`}
    >
      <span className="flex items-center gap-1 font-semibold leading-tight">
        <Icon className="h-3 w-3 shrink-0" aria-hidden />
        <span className="truncate">{appt.startTime} {client}</span>
      </span>
      {!compact && <span className="truncate leading-tight opacity-90">{service}</span>}
      {roomy && professional && <span className="truncate leading-tight opacity-80">{professional}</span>}
      {height >= 70 && <span className="mt-auto truncate text-[10px] font-medium uppercase tracking-wide opacity-90">{meta.label}</span>}
    </button>
  );
}

export const AppointmentCard = memo(AppointmentCardBase);
