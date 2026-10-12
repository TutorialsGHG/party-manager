# Einladung 🎈

> **Self-hosted, privacy-first party invitation app (PWA) — deploy in 60 seconds with a single Docker command.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docker Pulls](https://img.shields.io/docker/pulls/tutorialsghg/party-manager)](https://hub.docker.com/r/tutorialsghg/party-manager)
[![GitHub release](https://img.shields.io/github/v/release/TutorialsGHG/party-manager)](https://github.com/TutorialsGHG/party-manager/releases)

**Einladung** ("Invitation") is a modern, self-hosted web app for organizing parties and birthdays without touching any commercial platform or third-party tracker. Guests open a secret link in their browser — **no account, no app install required** — and can RSVP, bring items, vote in polls, post on the wall, and upload party photos that appear live on your beamer.

---

## ✨ Features at a Glance

| Feature | Details |
|---|---|
| 🔒 **Zero external requests** | No Google Fonts, CDNs, analytics, or tracking. Everything served locally. |
| 🛡️ **Envelope encryption** | RSA-4096 + AES-256-GCM. Deleting an event crypto-shreds all its data. |
| 📷 **Live party slideshow** | Full-screen beamer mode with QR code for guests to upload photos in real time. |
| 📣 **Host announcements** | Push updates only to confirmed guests (declined guests never see them). |
| 🥗 **Potluck / bring list** | Guests claim items with one tap; updates sync live across all devices. |
| 💬 **Live wall & polls** | Real-time guestbook + single/multi-choice polls with live progress bars. |
| 🎵 **Playlist integration** | Embed YouTube Music or Spotify; quick-launch button for the party PC. |
| 📸 **Encrypted media pipeline** | Resumable tus uploads · sharp thumbnails · ffmpeg video transcoding · BlurHash. |
| 📱 **Apple-inspired PWA** | SF Pro/Inter · 8-pt grid · swipe gestures · WCAG AA contrast. |

---

## 🚀 Quick Start — Pull & Run (No Build Required)

The easiest way: **pull the pre-built image directly from Docker Hub.**

```bash
# 1. Download the compose file
curl -O https://raw.githubusercontent.com/TutorialsGHG/party-manager/main/docker-compose.yml

# 2. Create your .env (edit BASE_URL and the two secrets)
cp .env.example .env   # or create it manually (see below)

# 3. Start
docker compose up -d
```

> Open **http://localhost:3000** — the first account you create becomes the Administrator.

The `docker-compose.yml` already points to `tutorialsghg/party-manager:latest` on Docker Hub, so Docker pulls the image automatically without any local build step.

### Minimal `.env` for production

```env
# The public URL guests will use (must be HTTPS in production)
BASE_URL=https://party.example.com

# Protects the encrypted master key — use a long random string
ENCRYPTION_PASSPHRASE=replace-with-a-long-random-secret

# Optional but recommended — keeps PoW challenges valid across restarts
# Generate with: openssl rand -hex 32
POW_SECRET=
```

---

## 🐳 Docker Compose Reference

```yaml
services:
  app:
    image: tutorialsghg/party-manager:latest   # ← pre-built, no build needed
    container_name: einladung
    restart: unless-stopped
    ports:
      - '3000:3000'
    environment:
      - BASE_URL=${BASE_URL:-http://localhost:3000}
      - ENCRYPTION_PASSPHRASE=${ENCRYPTION_PASSPHRASE:-}
      - POW_SECRET=${POW_SECRET:-}
    volumes:
      - party_data:/data      # SQLite DB + encrypted blobs
      - party_config:/config  # RSA master key + event keys

volumes:
  party_data:
  party_config:
```

> [!IMPORTANT]
> **Always back up `/data` and `/config` together.** The keys in `/config` are required to decrypt the database and media. Without them, data cannot be recovered. See [`docs/BACKUP.md`](docs/BACKUP.md).

---

## ⚙️ Configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `BASE_URL` | `http://localhost:3000` | Public URL for invite links and CSRF checks |
| `ORIGIN` | *(= BASE_URL)* | Allowed origin for SvelteKit's CSRF check |
| `ADDRESS_HEADER` | *(none)* | Set to `x-forwarded-for` behind a reverse proxy |
| `ENCRYPTION_PASSPHRASE` | *(empty)* | Passphrase for the RSA master private key |
| `POW_SECRET` | *(random)* | HMAC secret for proof-of-work registration challenges |
| `DATABASE_PATH` | `data/app.db` | SQLite database file path |
| `BLOB_STORAGE_PATH` | `data/blobs` | Encrypted blob storage path |
| `MASTER_KEY_DIR` | `config/keys` | RSA master key + event keystore directory |

---

## 🌐 Reverse Proxy

Works with **Nginx Proxy Manager**, **Caddy**, **Traefik**, and **Cloudflare Tunnel**. See [`docs/REVERSE_PROXY.md`](docs/REVERSE_PROXY.md) for step-by-step guides.

> [!TIP]
> **Disable proxy buffering for SSE** on `/api/events/` (`proxy_buffering off;` in Nginx) so real-time photo updates, wall posts, and potluck claims arrive instantly.

---

## 🛠️ Local Development

```bash
# Prerequisites: Node.js 22 LTS, pnpm 10+, ffmpeg (optional for video)

pnpm install
pnpm dev          # dev server at http://localhost:5173
pnpm check        # TypeScript type check
pnpm test:unit    # Vitest unit tests
pnpm test:ci      # Full CI run (lint, check, tests, boundary checks)
pnpm build        # Production bundle
```

### Build your own Docker image

```bash
docker build -f docker/Dockerfile -t einladung:local .
docker compose up -d   # uses locally built image if tag matches
```

---

## 📖 Documentation

| Doc | Contents |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Layer overview & boundary enforcement |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Cryptographic design, threat model, crypto-shredding |
| [`docs/BACKUP.md`](docs/BACKUP.md) | 3-2-1 backup strategy & cold-restart recovery |
| [`docs/REVERSE_PROXY.md`](docs/REVERSE_PROXY.md) | Nginx, Caddy, Traefik, Cloudflare Tunnel guides |
| [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md) | Design tokens, gestures, accessibility |
| [`docs/features/`](docs/features/) | Per-module feature specification cards |

---

## 🤖 AI Development Disclosure

This project was designed, developed, and tested in collaboration with **Advanced Agentic AI Assistants** (Google DeepMind / Antigravity). All commits pass mechanical quality gates including boundary checkers, offline zero-external validators, automated test roundtrips, and type checking (`pnpm test:ci`).

---

## 📄 License

[MIT](LICENSE) — free for personal and commercial self-hosted use.
