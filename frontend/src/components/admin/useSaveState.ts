import { useCallback, useEffect, useRef, useState } from 'react';
import { saveErrorMessage } from '@/lib/settingsPayload';

/** Estado de um botão "Salvar": salvando, "Salvo!" por 2,5 s e a mensagem de erro quando falha. */
export function useSaveState() {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const run = useCallback(async (action: () => Promise<void>) => {
    setError('');
    setSaving(true);
    try {
      await action();
      setSaved(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setSaved(false);
      setError(saveErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }, []);

  return { saving, saved, error, setError, run };
}
