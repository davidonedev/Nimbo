import { Clock, Edit2, MoreVertical, Tag, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatCurrency } from '@/lib/utils';
import type { Service } from '@/types';

interface Props {
  service: Service;
  onEdit: (s: Service) => void;
  onDelete: (s: Service) => void;
  /** Só no painel do dono (o profissional não ativa/desativa). */
  onToggleActive?: (s: Service) => void;
  /** Mostra "Ativo/Inativo" no rodapé do cartão. */
  showStatus?: boolean;
}

/**
 * Cartão de serviço. Em cima o nome e as ações; abaixo a categoria e a descrição; no rodapé, numa linha só, o
 * preço (em destaque), a duração e a situação. Celular: um menu "⋮" sempre visível (antes as ações só apareciam com o
 * mouse por cima, e no toque ficavam invisíveis). Desktop: os ícones aparecem ao passar o mouse.
 */
export function ServiceCard({ service, onEdit, onDelete, onToggleActive, showStatus = false }: Props) {
  const inactive = showStatus && !service.isActive;
  return (
    <Card className={`group relative overflow-hidden transition-shadow hover:shadow-md ${inactive ? 'opacity-70' : ''}`}>
      <CardContent className="space-y-3 p-4 sm:px-5 sm:pt-5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold leading-tight">{service.name}</h3>
            {service.category && (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Tag className="h-3 w-3 shrink-0" aria-hidden /><span className="truncate">{service.category}</span>
              </p>
            )}
          </div>

          {/* Celular: menu sempre visível */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="-mr-2 -mt-2 h-11 w-11 shrink-0 sm:hidden" aria-label={`Ações de ${service.name}`}>
                <MoreVertical className="h-5 w-5" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="min-h-11" onSelect={() => onEdit(service)}>
                <Edit2 className="mr-2 h-4 w-4" aria-hidden />Editar
              </DropdownMenuItem>
              {onToggleActive && (
                <DropdownMenuItem className="min-h-11" onSelect={() => onToggleActive(service)}>
                  {service.isActive ? <ToggleLeft className="mr-2 h-4 w-4" aria-hidden /> : <ToggleRight className="mr-2 h-4 w-4" aria-hidden />}
                  {service.isActive ? 'Desativar' : 'Ativar'}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem destructive className="min-h-11" onSelect={() => onDelete(service)}>
                <Trash2 className="mr-2 h-4 w-4" aria-hidden />Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Tablet e desktop: ícones ao passar o mouse (ou ao focar pelo teclado) */}
          <div className="hidden shrink-0 gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 sm:flex">
            {onToggleActive && (
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title={service.isActive ? 'Desativar' : 'Ativar'}
                aria-label={`${service.isActive ? 'Desativar' : 'Ativar'} ${service.name}`} onClick={() => onToggleActive(service)}>
                {service.isActive ? <ToggleRight className="h-4 w-4 text-emerald-600" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
              </Button>
            )}
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Editar" aria-label={`Editar ${service.name}`} onClick={() => onEdit(service)}>
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" title="Excluir" aria-label={`Excluir ${service.name}`} onClick={() => onDelete(service)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {service.description && <p className="line-clamp-2 text-sm text-muted-foreground">{service.description}</p>}

        {/* Rodapé: preço em destaque, duração e situação numa linha só */}
        <div className="flex items-center gap-3 whitespace-nowrap border-t pt-3">
          <span className="text-lg font-bold tabular-nums">{formatCurrency(service.price)}</span>
          <span className="flex items-center gap-1 text-sm text-muted-foreground"><Clock className="h-3.5 w-3.5" aria-hidden />{service.duration} min</span>
          {showStatus && (
            <span className={`ml-auto inline-flex items-center gap-1.5 text-xs font-medium ${service.isActive ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>
              <span aria-hidden className={`h-2 w-2 rounded-full ${service.isActive ? 'bg-emerald-500' : 'bg-muted-foreground/50'}`} />
              {service.isActive ? 'Ativo' : 'Inativo'}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
