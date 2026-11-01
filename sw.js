/**
 * Duo 2.0 — service worker
 * - Hors connexion : tous les fichiers de l'app sont gardés en cache (réseau d'abord, cache en secours).
 * - Mises à jour : la nouvelle version attend que l'utilisateur touche « Mettre à jour ».
 * - Notifications push : affichage + ouverture du chat au toucher.
 */
const VERSION = '2.0.1';
const CACHE = 'duo2-' + VERSION;
const SHELL = [
  "./",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./css/animations.css",
  "./css/components.css",
  "./css/layout.css",
  "./css/reset.css",
  "./css/screens.css",
  "./css/variables.css",
  "./index.html",
  "./js/app.js",
  "./js/components/avatar.js",
  "./js/components/icons.js",
  "./js/components/media-viewer.js",
  "./js/components/modal.js",
  "./js/components/navbar.js",
  "./js/components/toast.js",
  "./js/config.js",
  "./js/core/events.js",
  "./js/core/media.js",
  "./js/core/router.js",
  "./js/core/session.js",
  "./js/core/state.js",
  "./js/core/storage.js",
  "./js/core/sync.js",
  "./js/core/utils.js",
  "./js/data/demo.js",
  "./js/features/calendar/calendar.js",
  "./js/features/chat/chat.js",
  "./js/features/home/home.js",
  "./js/features/memories/memories.js",
  "./js/features/onboarding/onboarding.js",
  "./js/features/profile/profile.js",
  "./js/features/together/player.js",
  "./js/features/together/together.js",
  "./js/features/video/call.js",
  "./js/features/voice/recorder.js",
  "./js/services/auth.service.js",
  "./js/services/calendar.service.js",
  "./js/services/calls.service.js",
  "./js/services/chat.service.js",
  "./js/services/couple.service.js",
  "./js/services/media.service.js",
  "./js/services/memories.service.js",
  "./js/services/music.service.js",
  "./js/services/profile.service.js",
  "./js/services/push.service.js",
  "./js/services/realtime.js",
  "./js/services/supabase.js",
  "./js/services/youtube.service.js",
  "./manifest.json"
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k.startsWith('duo2-')).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Jamais de cache pour Supabase, LiveKit, YouTube… : seulement nos propres fichiers
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return res; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});

self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { data = { title: 'Duo', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(data.title || 'Duo', {
    body: data.body || 'Nouveau message',
    icon: 'assets/icons/icon-192.png',
    badge: 'assets/icons/icon-192.png',
    tag: data.tag || 'duo-message',
    renotify: true,
    data: { open: data.open || 'chat' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const open = (e.notification.data && e.notification.data.open) || 'chat';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const existing = list.find(c => c.url.startsWith(self.registration.scope));
    if (existing) { existing.postMessage({ open }); return existing.focus(); }
    return self.clients.openWindow('./#' + open);
  }));
});
