import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { TenantProvider, useTenant } from './TenantContext';
import * as clientsSvc from '../services/clients.service';
import * as apptSvc from '../services/appointments.service';

vi.mock('./AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'tenant_admin' }, logout: vi.fn() }) }));
vi.mock('../services/tenant.service', () => ({ getMyTenantApi: vi.fn().mockResolvedValue({ id: 't1', plan: 'pro' }), updateTenantSettingsApi: vi.fn() }));
vi.mock('../services/appointments.service', () => ({ listAppointmentsApi: vi.fn(), createAppointmentApi: vi.fn(), updateAppointmentStatusApi: vi.fn(), bulkConfirmAppointmentsApi: vi.fn() }));
vi.mock('../services/blockedSlots.service', () => ({ listBlockedSlotsApi: vi.fn().mockResolvedValue([]), createBlockedSlotApi: vi.fn(), deleteBlockedSlotApi: vi.fn() }));
vi.mock('../services/clients.service', () => ({ listClientsApi: vi.fn(), createClientApi: vi.fn(), updateClientApi: vi.fn(), deleteClientApi: vi.fn() }));
vi.mock('../services/professionals.service', () => ({ listProfessionalsApi: vi.fn().mockResolvedValue([]), createProfessionalApi: vi.fn(), updateProfessionalApi: vi.fn(), deleteProfessionalApi: vi.fn() }));
vi.mock('../services/services.service', () => ({ listServicesApi: vi.fn().mockResolvedValue([]), createServiceApi: vi.fn(), updateServiceApi: vi.fn(), deleteServiceApi: vi.fn() }));
vi.mock('../services/products.service', () => ({ listProductsApi: vi.fn().mockResolvedValue([]), createProductApi: vi.fn(), updateProductApi: vi.fn(), deleteProductApi: vi.fn(), adjustStockApi: vi.fn() }));
vi.mock('../services/productCategories.service', () => ({ listCategoriesApi: vi.fn().mockResolvedValue([]), createCategoryApi: vi.fn(), deleteCategoryApi: vi.fn() }));
vi.mock('../services/serviceCategories.service', () => ({ listServiceCategoriesApi: vi.fn().mockResolvedValue([]), createServiceCategoryApi: vi.fn(), deleteServiceCategoryApi: vi.fn() }));

afterEach(() => { vi.useRealTimers(); });

describe('polling do painel (30 s) traz agendamentos E clientes no mesmo tick', () => {
  it('o cliente novo já está na lista quando o pedido novo aparece', async () => {
    const ana = { id: 'c1', name: 'Ana' };
    const carla = { id: 'c9', name: 'Carla Nova' };
    vi.mocked(clientsSvc.listClientsApi).mockResolvedValueOnce([ana] as never).mockResolvedValue([ana, carla] as never);
    vi.mocked(apptSvc.listAppointmentsApi).mockResolvedValueOnce([]).mockResolvedValue([{ id: 'a1', clientId: 'c9', status: 'pending' }] as never);

    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useTenant(), { wrapper: TenantProvider });
    await waitFor(() => expect(result.current.tenant).toBeTruthy());
    expect(result.current.clients).toHaveLength(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });

    expect(clientsSvc.listClientsApi).toHaveBeenCalledTimes(2);
    expect(result.current.appointments.map((a) => a.id)).toEqual(['a1']);
    expect(result.current.clients.map((c) => c.name)).toEqual(['Ana', 'Carla Nova']);
  });
});
