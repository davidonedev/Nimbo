import { useEffect, useId, useMemo, useState } from 'react';
import { CheckCircle, Clock, Loader2, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { nowBrasilia } from '@/lib/scheduling';
import {
  ADVANCE_PRESETS, advanceError, earliestBooking, formatAdvance, isPreset, toMinutes, type AdvanceUnit,
} from '@/lib/advanceNotice';

interface Props {
  /** Valor atual (minutos), ainda não salvo. */
  value: number;
  /** Valor salvo no servidor, para saber se há alteração pendente. */
  saved: number;
  onChange: (minutes: number) => void;
  onSave: () => void;
  saving: boolean;
  justSaved: boolean;
  error: string;
}

const optionBase =
  'relative flex min-h-[4.5rem] flex-col items-start justify-center gap-0.5 rounded-xl border p-3 pr-8 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Antecedência mínima para o cliente agendar. Em vez de um campo solto, cartões selecionáveis (um por vez), um valor
 * personalizado e uma prévia que mostra, em linguagem natural, a partir de que horas o cliente consegue marcar.
 */
export default function AdvanceNoticeCard({ value, saved, onChange, onSave, saving, justSaved, error }: Props) {
  const uid = useId();
  const custom = !isPreset(value);
  const [customOpen, setCustomOpen] = useState(custom);
  const [amount, setAmount] = useState(() => (custom ? String(value) : ''));
  const [unit, setUnit] = useState<AdvanceUnit>('minutes');

  // A hora da prévia acompanha o relógio enquanto a tela fica aberta.
  const [now, setNow] = useState(() => nowBrasilia());
  useEffect(() => {
    const t = setInterval(() => setNow(nowBrasilia()), 30_000);
    return () => clearInterval(t);
  }, []);

  const preview = useMemo(() => earliestBooking(now, Number.isFinite(value) ? value : 0), [now, value]);
  const customError = customOpen && amount !== '' ? advanceError(toMinutes(amount, unit)) : '';
  const dirty = value !== saved;
  const invalid = !Number.isFinite(value) || value < 0 || value > 1440;

  const pickPreset = (minutes: number) => { setCustomOpen(false); onChange(minutes); };
  const changeCustom = (nextAmount: string, nextUnit: AdvanceUnit) => {
    setAmount(nextAmount); setUnit(nextUnit);
    const minutes = toMinutes(nextAmount, nextUnit);
    if (Number.isFinite(minutes) && !advanceError(minutes)) onChange(minutes);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Clock className="h-4 w-4" aria-hidden /> Antecedência mínima para agendar</CardTitle>
        <CardDescription>Quanto tempo antes do horário o cliente ainda pode marcar pelo link de agendamento.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div role="radiogroup" aria-label="Antecedência mínima" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ADVANCE_PRESETS.map(p => {
            const on = !customOpen && value === p.minutes;
            return (
              <button
                key={p.minutes} type="button" role="radio" aria-checked={on} onClick={() => pickPreset(p.minutes)}
                className={`${optionBase} ${on ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-card hover:bg-muted/50'}`}
              >
                {on && <CheckCircle className="absolute right-2 top-2 h-4 w-4 text-primary" aria-hidden />}
                <span className="text-base font-semibold">{p.label}</span>
                <span className="text-xs text-muted-foreground">{p.hint}</span>
              </button>
            );
          })}
          <button
            type="button" role="radio" aria-checked={customOpen} onClick={() => { setCustomOpen(true); if (amount === '') setAmount(String(value > 0 ? value : 45)); if (amount === '') onChange(value > 0 ? value : 45); }}
            className={`${optionBase} ${customOpen ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-card hover:bg-muted/50'}`}
          >
            {customOpen && <CheckCircle className="absolute right-2 top-2 h-4 w-4 text-primary" aria-hidden />}
            <span className="flex items-center gap-1.5 text-base font-semibold"><Timer className="h-4 w-4" aria-hidden />Outro valor</span>
            <span className="text-xs text-muted-foreground">Você escolhe o tempo</span>
          </button>
        </div>

        {customOpen && (
          <div className="grid grid-cols-[1fr_auto] items-end gap-3 rounded-xl border bg-muted/30 p-3 sm:max-w-sm">
            <div className="space-y-1">
              <Label htmlFor={`${uid}-amount`}>Tempo de antecedência</Label>
              <Input id={`${uid}-amount`} inputMode="decimal" className="h-11" value={amount} aria-invalid={!!customError}
                onChange={e => changeCustom(e.target.value, unit)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${uid}-unit`} className="sr-only">Unidade</Label>
              <select id={`${uid}-unit`} value={unit} onChange={e => changeCustom(amount, e.target.value as AdvanceUnit)}
                className="h-11 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="minutes">minutos</option>
                <option value="hours">horas</option>
              </select>
            </div>
            {customError && <p role="alert" className="col-span-2 text-sm text-destructive">{customError}</p>}
          </div>
        )}

        {/* Prévia: o efeito da escolha, em palavras */}
        <div role="status" aria-live="polite" className="flex items-start gap-3 rounded-xl bg-primary/5 p-3 text-sm">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <div>
            <p className="font-medium">{invalid ? 'Informe um valor válido para ver a prévia.' : preview.sentence}</p>
            <p className="text-xs text-muted-foreground">Antecedência escolhida: {invalid ? '—' : formatAdvance(value)}. Horários anteriores a isso não aparecem para o cliente.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={onSave} disabled={saving || !dirty || invalid} className="min-h-11 gap-2 sm:min-h-9" size="sm">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Salvando…</> : justSaved ? <><CheckCircle className="h-4 w-4" aria-hidden /> Salvo!</> : 'Salvar'}
          </Button>
          {dirty && !saving && <span className="text-xs text-muted-foreground">Alteração não salva</span>}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
