// Service worker van de loterij-app: ontvangt pushmeldingen en opent bij een tik
// de juiste pagina. Bewust klein: geen caching (de app werkt gewoon online).
// Het rode balletje op het app-icoon telt de ongelezen meldingen; de app zet het
// weer op nul zodra hij geopend wordt.

function zetBalletje() {
  if (!self.navigator.setAppBadge) return Promise.resolve();
  return self.registration.getNotifications().then((open) =>
    open.length ? self.navigator.setAppBadge(open.length) : self.navigator.clearAppBadge(),
  ).catch(() => {});
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { titel: 'Loterij', tekst: event.data ? event.data.text() : '' };
  }
  const titel = data.titel || 'Loterij';
  event.waitUntil(
    self.registration.showNotification(titel, {
      body: data.tekst || '',
      icon: data.icoon || '/icon',
      badge: '/icon',
      tag: data.tag || undefined,
      data: { url: data.url || '/' },
    }).then(zetBalletje),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  zetBalletje();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((vensters) => {
      for (const v of vensters) {
        if ('focus' in v) {
          v.navigate(url);
          return v.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

self.addEventListener('notificationclose', () => zetBalletje());
