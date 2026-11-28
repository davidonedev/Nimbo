/**
 * O site já foi instalável (service worker + cache offline). Quem abriu naquela época ainda tem o service
 * worker e o cache no navegador; aqui eles são removidos para o site abrir sempre direto da rede.
 */
export function removeLegacyServiceWorker(): void {
  try {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.getRegistrations()
        .then(regs => regs.forEach(r => void r.unregister()))
        .catch(() => { /* navegador sem acesso: nada a remover */ });
    }
    if (typeof caches !== 'undefined') {
      void caches.keys()
        .then(keys => keys.forEach(k => void caches.delete(k)))
        .catch(() => { /* idem */ });
    }
  } catch { /* modo privado etc. */ }
}
