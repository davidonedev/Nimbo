import type { Tenant } from '../types';

/**
 * Aberto/Fechado do estabelecimento — ÚNICO ponto que decide o estado exibido na navbar.
 * A fonte da verdade é o interruptor "Status do Estabelecimento" (Configurações > Portal do Cliente,
 * `tenant.isOpen`): o mesmo valor que o portal do cliente mostra. Assim, mudar lá muda aqui na hora.
 * TODO: o tenant ainda não tem horário de funcionamento próprio; quando tiver, troque só esta função.
 */
export function computeOpenStatus(tenant: Pick<Tenant, 'isOpen'>): boolean {
  return tenant.isOpen;
}
