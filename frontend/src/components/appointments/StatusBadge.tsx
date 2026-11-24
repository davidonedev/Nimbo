import { STATUS_META } from '@/components/admin/agenda/statusStyle';
import type { AppointmentStatus } from '@/types';

/** Cor + ícone + texto: a cor nunca é a única pista do status. */
export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const { label, icon: Icon, card } = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${card}`}>
      <Icon className="h-3 w-3" aria-hidden />{label}
    </span>
  );
}
