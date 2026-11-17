import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';

interface Props {
  label: string;
  /** Rota de destino; sem `to`, age como botão com `onClick`. */
  to?: string;
  onClick?: () => void;
}

const cls = 'fixed right-4 z-30 flex h-14 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg transition-transform active:scale-95 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:hidden';
// acima da BottomNav (56px) + área segura
const style = { bottom: 'calc(72px + env(safe-area-inset-bottom))' } as const;

/** Botão flutuante "+ Novo" do celular. No desktop o botão da navbar continua valendo. */
export function Fab({ label, to, onClick }: Props) {
  const content = (<><Plus className="h-5 w-5" aria-hidden />{label}</>);
  return to
    ? <Link to={to} className={cls} style={style}>{content}</Link>
    : <button type="button" onClick={onClick} className={cls} style={style}>{content}</button>;
}
