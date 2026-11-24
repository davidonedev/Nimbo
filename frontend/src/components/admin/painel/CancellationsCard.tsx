import { XCircle, UserX } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { DashboardSummary } from '@/services/dashboard.service';
import { CardError, LinesSkeleton } from './SummaryState';

interface Props {
  data?: DashboardSummary['cancellations'];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

/** Cancelamentos e faltas dos últimos 7 dias, com o detalhamento (o ícone acompanha o texto, não só a cor). */
export function CancellationsCard({ data, loading, error, onRetry }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <XCircle className="h-5 w-5 shrink-0 text-red-500 dark:text-red-400" aria-hidden />
          <span className="min-w-0 flex-1 leading-tight">Cancelamentos e faltas recentes</span>
          {/* Nunca quebra de linha: em tela estreita encurta de "últimos 7 dias" para "7 dias". */}
          <Badge variant="outline" className="shrink-0 whitespace-nowrap text-xs font-normal">
            <span className="hidden min-[400px]:inline">últimos&nbsp;</span>7 dias
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? <LinesSkeleton lines={2} /> : error || !data ? <CardError onRetry={onRetry} /> : data.total === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum cancelamento ou falta nos últimos 7 dias.</p>
        ) : (
          <div className="flex items-center gap-5">
            {/* Total à esquerda; o detalhe à direita, cada item numa linha só */}
            <div className="shrink-0">
              <p className="text-5xl font-bold leading-none tabular-nums">{data.total}</p>
              <p className="mt-1.5 text-xs text-muted-foreground">no total</p>
            </div>
            <ul className="ml-auto flex flex-col gap-2.5 whitespace-nowrap border-l pl-5 text-sm" aria-label="Detalhe">
              <li className="flex items-center gap-2">
                <XCircle className="h-4 w-4 shrink-0 text-red-500 dark:text-red-400" aria-hidden />
                <span><strong className="tabular-nums">{data.cancelled}</strong> {data.cancelled === 1 ? 'cancelado' : 'cancelados'}</span>
              </li>
              <li className="flex items-center gap-2">
                <UserX className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                <span><strong className="tabular-nums">{data.noShow}</strong> {data.noShow === 1 ? 'falta' : 'faltas'}</span>
              </li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
