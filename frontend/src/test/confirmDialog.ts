import { fireEvent, screen, within } from '@testing-library/react';

/** Segundo "sim" do modal de segurança que abre ao tocar em Confirmar/Aceitar (dono e profissional). */
export async function confirmInSafetyDialog(timeout = 25_000): Promise<void> {
  const dialog = await screen.findByRole('dialog', { name: /Confirmar agendamento\?/ }, { timeout });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Sim, confirmar' }));
}

/** Toca em "Voltar" no modal de segurança: nada deve ser confirmado. */
export async function dismissSafetyDialog(timeout = 25_000): Promise<void> {
  const dialog = await screen.findByRole('dialog', { name: /Confirmar agendamento\?/ }, { timeout });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Voltar' }));
}
