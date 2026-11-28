import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { RescheduleDialog } from './RescheduleDialog';

const target = { id: 'a1', clientName: 'Ana Lima', date: '2099-05-10', startTime: '10:00', professionalId: 'p1' };
const profs = [{ id: 'p1', name: 'Ronald' }, { id: 'p2', name: 'Carla' }];

describe('RescheduleDialog', () => {
  it('fechado quando não há agendamento', () => {
    const { container } = render(<RescheduleDialog target={null} professionals={profs} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(container.textContent).toBe('');
  });

  it('recusa salvar sem mudar nada', async () => {
    const onSave = vi.fn();
    render(<RescheduleDialog target={target} professionals={profs} onClose={vi.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar novo horário' }));
    expect((await screen.findByRole('alert')).textContent).toContain('diferente do atual');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('salva o novo horário e fecha', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<RescheduleDialog target={target} professionals={profs} onClose={onClose} onSave={onSave} />);
    const time = screen.getByLabelText('Horário');
    fireEvent.change(time, { target: { value: '14:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar novo horário' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('a1', { date: '2099-05-10', startTime: '14:30', professionalId: 'p1' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('mostra o motivo que o servidor deu (ex.: horário ocupado)', async () => {
    const onSave = vi.fn().mockRejectedValue(new ApiError('Conflito de horário: já existe agendamento ou bloqueio neste período', 409, 'SCHEDULE_CONFLICT'));
    const onClose = vi.fn();
    render(<RescheduleDialog target={target} professionals={profs} onClose={onClose} onSave={onSave} />);
    const time = screen.getByLabelText('Horário');
    fireEvent.change(time, { target: { value: '15:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar novo horário' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Conflito de horário');
    expect(onClose).not.toHaveBeenCalled();
  });
});
