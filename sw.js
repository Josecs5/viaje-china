/* Service worker — Viaje a China
 * Precache del shell para que la app arranque sin conexión. Sin dependencias.
 * Al publicar una versión nueva: subir SHELL_CACHE y los ?v= de index.html.
 */
'use strict';

const SHELL_CACHE = 'china-shell-v4';
// En GitHub Pages el origen (usuario.github.io) es compartido con otros
// proyectos, como viaje-tailandia (sus cachés se llaman «shell-vN»), y
// caches.keys() no está acotado por scope: solo se tocan las cachés propias.
const OWNED_CACHE = /^china-shell-v\d+$/;

const SHELL_ASSETS = [
  './',
  './index.html',
  './style.css?v=5',
  './app.js?v=6',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/images/marker-icon.png',
  './vendor/leaflet/images/marker-icon-2x.png',
  './vendor/leaflet/images/marker-shadow.png',
  './vendor/leaflet/images/layers.png',
  './vendor/leaflet/images/layers-2x.png',
  './vendor/suncalc/suncalc.js',
  './vendor/fonts/fonts.css?v=2',
  './vendor/fonts/notoserifsc-sub.woff2',
  './vendor/fonts/mashanzheng-sub.woff2',
  './vendor/fonts/manrope-latin.woff2'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache => cache.addAll(
      // 'reload' evita hornear en el precache un archivo rancio de la caché HTTP.
      SHELL_ASSETS.map(u => new Request(u, { cache: 'reload' }))
    ))
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.filter(n => OWNED_CACHE.test(n) && n !== SHELL_CACHE).map(n => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Navegación: cache-first contra index.html (arranque sin conexión instantáneo).
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html', { cacheName: SHELL_CACHE })
        .then(hit => hit || fetch(request))
    );
    return;
  }

  // Shell del mismo origen: caché primero y, si no está, red.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request, { cacheName: SHELL_CACHE })
        .then(hit => hit || fetch(request))
    );
  }

  // De otro origen (teselas de OpenStreetMap, Nominatim, Open-Meteo,
  // frankfurter.dev): sin interceptar.
});
