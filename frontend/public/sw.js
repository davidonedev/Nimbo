// O Nimbo deixou de ser um app instalável. Este arquivo existe só para quem ainda tem o service worker antigo:
// o navegador o troca por este, que apaga os caches, se desregistra e recarrega as abas abertas.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    await self.registration.unregister();
    const tabs = await self.clients.matchAll({ type: 'window' });
    tabs.forEach(tab => tab.navigate(tab.url));
  })());
});
