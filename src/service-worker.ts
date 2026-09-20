/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

const CACHE_NAME = `einladung-shell-${version}`;

// Only cache static assets, icons, fonts, and the compiled app bundle
const ASSETS_TO_CACHE = [
  ...build,
  ...files.filter(f => !f.endsWith('.map'))
];

self.addEventListener('install', (event: any) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => {
      (self as any).skipWaiting();
    })
  );
});

self.addEventListener('activate', (event: any) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => {
      (self as any).clients.claim();
    })
  );
});

self.addEventListener('fetch', (event: any) => {
  const url = new URL(event.request.url);

  // HARD PRIVACY RULE: Never cache API responses, tus uploads, or encrypted media
  if (
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/blobs/') ||
    url.pathname.startsWith('/e/')
  ) {
    return;
  }

  // Cache-first for build and static assets
  if (ASSETS_TO_CACHE.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request);
      })
    );
    return;
  }

  // Network-first for navigation with graceful offline fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;

        // Clean offline fallback shell
        return new Response(
          `<!DOCTYPE html>
          <html lang="de">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
            <title>Offline – Einladung</title>
            <style>
              body { font-family: -apple-system, sans-serif; background: #000; color: #fff; display: flex; align-items: center; justify-content: center; height: 100dvh; margin: 0; text-align: center; padding: 24px; }
              h1 { font-size: 24px; margin-bottom: 8px; }
              p { color: #8E8E93; font-size: 16px; max-width: 360px; line-height: 1.5; }
            </style>
          </head>
          <body>
            <div>
              <h1>Keine Verbindung</h1>
              <p>Du bist aktuell offline. Bitte überprüfe deine Internetverbindung und lade die Einladung erneut.</p>
            </div>
          </body>
          </html>`,
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      })
    );
  }
});