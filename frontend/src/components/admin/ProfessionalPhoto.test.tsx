import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProfessionalsView from './ProfessionalsView';

const service = { id: 's1', tenantId: 't1', name: 'Cabelo', description: null, price: 30, duration: 30, category: null, isActive: true };
const professionals = [{
  id: 'p1', tenantId: 't1', name: 'Ronald', specialty: 'Barbeiro', avatar: 'RO', photoUrl: undefined, bio: '', email: undefined,
  services: ['s1'], workingHours: { start: '09:00', end: '18:00' }, workingDays: [1, 2, 3, 4, 5],
}];
const updateProfessional = vi.fn(async () => {});

vi.mock('@/context/TenantContext', async importOriginal => ({
  ...(await importOriginal<typeof import('@/context/TenantContext')>()),
  useTenant: () => ({
    professionals, services: [service], appointments: [], clients: [],
    tenant: { id: 't1', plan: 'pro' }, canAddProfessional: true,
    addProfessional: vi.fn(), updateProfessional, deleteProfessional: vi.fn(),
  }),
}));

// O jsdom não tem canvas: a redução da imagem é simulada, mas a regra de erro (ImageError) é a real.
vi.mock('@/lib/imageResize', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/imageResize')>();
  return {
    ...actual,
    prepareImage: vi.fn(async (file: File) => {
      if (file.type === 'application/pdf') throw new actual.ImageError('Use uma imagem PNG, JPG, WebP ou GIF.');
      return 'data:image/webp;base64,FOTO_REDUZIDA';
    }),
  };
});

const openEdit = () => {
  render(<MemoryRouter><ProfessionalsView /></MemoryRouter>);
  fireEvent.click(screen.getByTitle('Editar'));
};
const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

describe('Profissionais: trocar a foto', () => {
  beforeEach(() => updateProfessional.mockClear());

  it('envia a foto já reduzida (e não o arquivo cru) ao salvar', async () => {
    openEdit();
    fireEvent.change(fileInput(), { target: { files: [new File(['x'.repeat(3_000_000)], 'selfie.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(screen.getByAltText('foto').getAttribute('src')).toBe('data:image/webp;base64,FOTO_REDUZIDA'));

    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(updateProfessional).toHaveBeenCalledTimes(1));
    expect(updateProfessional).toHaveBeenCalledWith('p1', expect.objectContaining({ photoUrl: 'data:image/webp;base64,FOTO_REDUZIDA' }));
  });

  it('arquivo que não é imagem mostra o motivo e não troca a foto', async () => {
    openEdit();
    fireEvent.change(fileInput(), { target: { files: [new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' })] } });

    expect((await screen.findByRole('alert')).textContent).toContain('Use uma imagem PNG, JPG, WebP ou GIF');
    expect(screen.queryByAltText('foto')).toBeNull();
  });
});
