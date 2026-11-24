/**
 * PublicTenantContext — portal do cliente (sem autenticação).
 * Carrega dados públicos do tenant por slug via API.
 * Expõe os dados públicos do tenant para as páginas do portal (serviços, meus agendamentos...).
 */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import type { Client, Product, TenantData } from '../types';

import {
  getPublicTenantApi,
  getPublicServicesApi,
  getPublicProfessionalsApi,
} from '../services/public.service';
import { listPublicProductsApi } from '../services/products.service';
import { ApiError } from '../lib/api';

interface PublicTenantContextType {
  data: TenantData;
  products: Product[];
  loading: boolean;
  addClient: (client: Client) => void;
  getSlug: () => string;
}

const PublicTenantContext = createContext<PublicTenantContextType | null>(null);

export function PublicTenantProvider({ children }: { children: React.ReactNode }) {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();

  const [data, setData]         = useState<TenantData | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [suspended, setSuspended] = useState(false);
  const [failed, setFailed]       = useState(false);
  const [attempt, setAttempt]     = useState(0);

  useEffect(() => {
    if (!tenantSlug) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setNotFound(false);
    setSuspended(false);
    setFailed(false);

    Promise.all([
      getPublicTenantApi(tenantSlug),
      getPublicServicesApi(tenantSlug),
      getPublicProfessionalsApi(tenantSlug),
      // Produtos são um extra (upsell): se falharem, o portal abre mesmo assim.
      listPublicProductsApi(tenantSlug).catch((): Product[] => []),
    ])
      .then(([tenant, services, professionals, prods]) => {
        if (tenant.status === 'suspended') {
          setSuspended(true);
          return;
        }
        setData({
          tenant,
          services,
          professionals,
          clients: [],
          appointments: [],
          blockedSlots: [],
        });
        setProducts(prods);
      })
      .catch(err => {
        // Só é "não encontrado" quando o back diz 404; queda de rede/500 pede nova tentativa.
        if (err instanceof ApiError && err.status === 404) setNotFound(true); else setFailed(true);
      })
      .finally(() => setLoading(false));
  }, [tenantSlug, attempt]);

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 text-muted-foreground">
        <p className="text-xl font-semibold">Barbearia não encontrada</p>
        <p className="text-sm">Verifique o link e tente novamente.</p>
      </div>
    );
  }

  if (failed) {
    return (
      <div role="alert" className="flex h-dvh flex-col items-center justify-center gap-4 p-6 text-center text-muted-foreground">
        <p className="text-xl font-semibold">Não foi possível carregar a página</p>
        <p className="text-sm">Verifique sua conexão e tente novamente.</p>
        <button type="button" onClick={() => setAttempt(a => a + 1)} className="min-h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
          Tentar novamente
        </button>
      </div>
    );
  }

  if (suspended) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4">
        <p className="text-xl font-semibold text-destructive">Estabelecimento inativo</p>
        <p className="text-sm text-muted-foreground">
          Este estabelecimento está temporariamente indisponível para agendamentos.
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 text-muted-foreground">
        <p className="text-xl font-semibold">Algo deu errado</p>
        <p className="text-sm">Não foi possível carregar o portal. Tente novamente.</p>
      </div>
    );
  }

  // Mantido por compatibilidade — o backend cria o cliente automaticamente no booking
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const addClient = (_client: Client) => { /* no-op: backend gerencia */ };

  return (
    <PublicTenantContext.Provider
      value={{ data, products, loading, addClient, getSlug: () => tenantSlug! }}
    >
      {children}
    </PublicTenantContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePublicTenant() {
  const ctx = useContext(PublicTenantContext);
  if (!ctx) throw new Error('usePublicTenant must be inside PublicTenantProvider');
  return ctx;
}
