import { useNavigate } from 'react-router-dom';
import { Clock, Palette, UserCircle, CircleHelp, LogOut } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Props {
  name: string;
  email?: string;
  photoUrl?: string;
  accentColor: string;
  onLogout: () => void;
  /** "Minha Conta". */
  accountPath: string;
  /** "Meu horário" (só aparece quando informado; o super admin não tem horário). */
  schedulePath?: string;
  /** "Aparência": alterna entre tema claro e escuro. */
  onToggleTheme: () => void;
  isDark?: boolean;
}

const initialsOf = (name: string) => name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();

/**
 * Avatar do usuário com menu suspenso: é o ÚNICO lugar com Usuário e Sair (a sidebar não os tem).
 * O Radix já cuida de fechar ao clicar fora e com Esc, e da navegação por teclado.
 * TODO: "Ajuda" ainda não tem destino definido.
 */
export function UserMenu({ name, email, photoUrl, accentColor, onLogout, accountPath, schedulePath, onToggleTheme, isDark = false }: Props) {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Menu do usuário"
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Avatar className="h-8 w-8">
          {photoUrl && <AvatarImage src={photoUrl} alt="" />}
          <AvatarFallback className="text-xs text-white" style={{ backgroundColor: accentColor }}>{initialsOf(name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-semibold">{name}</p>
          {email && <p className="truncate text-xs text-muted-foreground">{email}</p>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {schedulePath && (
          <DropdownMenuItem onSelect={() => navigate(schedulePath)} className="gap-2"><Clock className="h-4 w-4 text-muted-foreground" aria-hidden />Meu horário</DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={onToggleTheme} className="gap-2"><Palette className="h-4 w-4 text-muted-foreground" aria-hidden />Aparência: {isDark ? 'tema escuro' : 'tema claro'}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate(accountPath)} className="gap-2"><UserCircle className="h-4 w-4 text-muted-foreground" aria-hidden />Minha Conta</DropdownMenuItem>
        <DropdownMenuItem className="gap-2"><CircleHelp className="h-4 w-4 text-muted-foreground" aria-hidden />Ajuda</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onLogout} className="gap-2 text-red-600 focus:bg-red-500/10 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"><LogOut className="h-4 w-4" aria-hidden />Sair</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
