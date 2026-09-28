# Reverse-Proxy Konfiguration

Einladung ist als eigenständiger Docker-Container konzipiert, der hinter einem Reverse-Proxy (Caddy, Nginx, Traefik o. Ä.) betrieben wird. Der Proxy übernimmt die TLS/HTTPS-Terminierung.

Damit alle Echtzeit- und Streaming-Features (SSE für Pinnwand/Umfragen, tus-Uploads für große Mediendateien und HTTP-Range-Requests für Video-Seeking) einwandfrei funktionieren, beachte bitte die folgenden Konfigurationsrichtlinien.

---

## 1. Caddy (Empfohlen)

Caddy ist der einfachste Reverse-Proxy, da er HTTPS automatisch einrichtet und HTTP-Streaming von Haus aus ohne Buffering unterstützt.

```caddy
party.example.com {
    reverse_proxy localhost:3000 {
        # Kein Buffering für SSE (Echtzeit-Updates)
        flush_interval -1
    }

    # Maximale Upload-Größe für tus-Uploads (z. B. 500 MB)
    request_body {
        max_size 500MB
    }
}
```

---

## 2. Nginx

Für Nginx ist besonders wichtig, dass das **Proxy-Buffering für SSE deaktiviert** ist, damit Pinnwand-Einträge und Reaktionen in Echtzeit beim Gast ankommen.

```nginx
server {
    listen 443 ssl http2;
    server_name party.example.com;

    # SSL-Zertifikate (z. B. von Certbot)
    ssl_certificate /etc/letsencrypt/live/party.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/party.example.com/privkey.pem;

    # Erlaube große Uploads für tus-Video- und Foto-Uploads
    client_max_body_size 500M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # Standard-Header
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Wichtig für SvelteKit Origin-Check
        proxy_set_header Origin $http_origin;

        # Range-Requests für Video-Seeking
        proxy_force_ranges on;
    }

    # Spezifische Konfiguration für Server-Sent Events (SSE)
    location /api/events/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE Buffering ausschalten (unerlässlich für Live-Updates!)
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 24h;
        chunked_transfer_encoding off;
    }
}
```

---

## 3. Traefik (Docker Compose)

Bei Traefik werden die Konfigurationen über Container-Labels gesteuert.

```yaml
services:
  app:
    # ... Einladung Image und Configs ...
    labels:
      - 'traefik.enable=true'
      - 'traefik.http.routers.einladung.rule=Host(`party.example.com`)'
      - 'traefik.http.routers.einladung.entrypoints=websecure'
      - 'traefik.http.routers.einladung.tls.certresolver=myresolver'
      - 'traefik.http.services.einladung.loadbalancer.server.port=3000'
      # Pufferung für SSE deaktivieren
      - 'traefik.http.middlewares.einladung-buffering.buffering.maxRequestBodyBytes=524288000'
      - 'traefik.http.middlewares.einladung-buffering.buffering.memResponseBodyBytes=0'
      - 'traefik.http.routers.einladung.middlewares=einladung-buffering'
```

---

## 4. Cloudflare Tunnel / Cloudflare Proxy

Wenn du Cloudflare nutzt:

1. **gRPC / SSE:** In den Cloudflare-Netzwerkeinstellungen muss WebSockets aktiviert sein.
2. **Buffering:** Unter _Speed > Optimization_ die Pufferung für SSE-Streams deaktivieren oder eine _Page Rule_ für `/api/events/*` einrichten (`Cache Level: Bypass`, `Disable Performance`).
3. **Upload-Limits:** Der kostenlose Cloudflare-Plan limitiert HTTP-POST-Requests auf 100 MB. Da Einladung das **tus-Protokoll** mit 1-MiB-Chunks verwendet, funktionieren auch Videos mit mehreren Gigabyte problemlos über Cloudflare!

---

## Checkliste nach dem Setup

- [ ] Einladungs-Link über HTTPS aufrufbar?
- [ ] `BASE_URL` in der `.env` stimmt exakt mit der öffentlichen URL überein (z. B. `https://party.example.com`)?
- [ ] Live-Updates auf der Pinnwand erscheinen ohne manuelles Neuladen (SSE funktioniert)?
- [ ] Video-Vorschau und Seeking im Browser laufen flüssig?
- [ ] `/api/health` liefert `{"status":"ok"}` zurück?
