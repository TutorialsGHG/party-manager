# Einladung 🎈 (Party Manager)

> **Self-hosted, uncompromisingly private invitation web app (PWA) for parties and birthdays.**

**Einladung** ("Invitation") is a modern, privacy-first web application designed to help hosts plan and manage events without relying on commercial platforms or third-party trackers. Guests open a secret invitation link directly in their browser — **with zero account registration or app store installation required** — view event details, RSVP with companions, coordinate potluck items, vote in polls, write on the wall, listen to the party playlist, and upload photos & videos in full original resolution.

---

## 🌟 Highlights & Features

- 🔒 **100% Privacy & Zero External Requests:** No Google Fonts, external CDNs, third-party analytics, or tracking tiles. All assets, scripts, and fonts are served strictly locally from a single container.
- 🛡️ **Envelope Encryption & Crypto-Shredding:**
  - RSA-4096 Master Key Pair + per-event 256-bit AES Event Keys.
  - Chunked AES-256-GCM streaming encryption (1 MiB chunks) for media storage.
  - Sensitive database columns (titles, notes, allergies, guest names) authenticated with deterministic AAD.
  - Deleting an event shreds the event key immediately, rendering encrypted database entries and media files irreversibly unreadable.
- 🥗 **Potluck & Wishlist ("Mitbringliste"):**
  - Guests and host can add items needed for the party (e.g. _"Baguette"_, _"Ice cubes"_, _"Vegetarian dip"_).
  - 1-click claiming and unclaiming (_"I'll bring this"_).
  - Synchronized across all connected devices in real time via Server-Sent Events (SSE).
- 📽️ **Live Party Mode / Beamer Slideshow (`/events/:id/live`):**
  - High-contrast, dark-mode fullscreen view tailored for the bar PC, TV, or projector.
  - Automatically rotates through uploaded party photos in real time.
  - **Dynamic Empty-State:** When no photos exist yet, it displays:
    > **"Your photo right here – upload it now!"**
    > همراه with a large, crisp SVG QR code that guests at the bar can scan to take and upload the very first party snapshots.
  - Includes a floating mini-QR badge during the slideshow and a quick-launch button for the party soundtrack.
- 🎵 **Music Playlist Integration:**
  - Host can configure a YouTube Music or Spotify playlist URL.
  - Dedicated **"Playlist"** tab for guests with an embedded player (`youtube-nocookie.com`) and direct app launch button.
- 📣 **Targeted Host Announcements:**
  - Hosts can broadcast updates specifically to confirmed guests and companions (_"Please bring warm clothes for the garden"_).
  - Server-side audience filtering on both initial load and live SSE streams ensures declined guests never receive private announcements.
- 📊 **Host Guest & Dietary Overview:**
  - Comprehensive dashboard showing all guests who opened the link, their RSVP status, accompanied guests, dietary requirements/allergies, and activity counters.
- 💬 **Live Wall & Interactive Polls:**
  - Real-time guestbook with host pin/unpin moderation and instant deletion.
  - Single- and multiple-choice polls with live voting progress bars and optional guest-added choices.
- 📸 **Encrypted Media Pipeline:**
  - Resumable file uploads via the **tus 1.0.0 protocol**.
  - Background processing with `sharp` (automatic EXIF/GPS stripping, WebP thumbnails, BlurHash generation) and `ffmpeg` (H.264/AAC web transcoding).
  - HTTP Range Requests with chunked on-the-fly decryption for smooth video playback and scrubbing.
  - 1-click bulk ZIP album download for the host.
- 📱 **Apple-Inspired Design System:**
  - Clean typography (SF Pro / Inter), 8-pt grid, fluid bottom sheets, and responsive touch gestures.
  - Lightbox with native swipe gestures and pinch-to-zoom.
  - Automated WCAG AA contrast ratio enforcement for customized accent colors.

---

## 🚀 Quick Start with Docker (Recommended)

The entire application runs inside a single self-contained Docker container without requiring external databases or third-party background services.

### 1. Run with Docker Compose

```bash
docker compose up -d
```

Open `http://localhost:3000` in your browser. The first user to register automatically becomes the **Administrator**.

For production deployments, copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Set `BASE_URL` and `ORIGIN` to your public HTTPS domain (e.g. `https://party.example.com`), and choose a secure `ENCRYPTION_PASSPHRASE` and `POW_SECRET`.

### 2. Volume Directory Structure

- `/data`: SQLite database (`app.db`) and encrypted media blobs (`blobs/`).
- `/config`: RSA Master Key pair and wrapped event keys (`keys/`).

> [!IMPORTANT]
> **Backup Strategy:** Always back up `/data` and `/config` together (see [`docs/BACKUP.md`](docs/BACKUP.md)). Without the keys in `/config`, the database and media files in `/data` cannot be decrypted.

---

## 🛠️ Local Development

### Prerequisites

- Node.js 22 LTS
- pnpm 10+
- `ffmpeg` (optional, for local video transcoding)

### Setup & Development Server

```bash
# Install dependencies
pnpm install

# Start local dev server
pnpm dev
```

### Verification & Test Suite

```bash
# SvelteKit TypeScript Typecheck
pnpm check

# Unit tests with Vitest (150+ tests)
pnpm test:unit

# Full CI run (docs, i18n parity, boundaries, no-external, lint, check, tests)
pnpm test:ci

# Build production bundle
pnpm build
```

---

## ⚙️ Configuration & Environment Variables

| Variable                | Default                 | Description                                                                    |
| ----------------------- | ----------------------- | ------------------------------------------------------------------------------ |
| `PORT`                  | `3000`                  | HTTP web server port                                                           |
| `BASE_URL`              | `http://localhost:3000` | Public base URL used for invitation links and emails                           |
| `ORIGIN`                | Value of `BASE_URL`     | Allowed origin for CSRF and same-origin validation                             |
| `ADDRESS_HEADER`        | _(none)_                | Set to `x-forwarded-for` when running behind a reverse proxy                   |
| `ENCRYPTION_PASSPHRASE` | _(empty)_               | Passphrase used to encrypt the private RSA master key                          |
| `POW_SECRET`            | _(random)_              | HMAC secret to stabilize proof-of-work registration challenges across restarts |
| `DATABASE_PATH`         | `data/app.db`           | Path to the SQLite database file                                               |
| `BLOB_STORAGE_PATH`     | `data/blobs`            | Path to encrypted blob storage                                                 |
| `MASTER_KEY_DIR`        | `config/keys`           | Path to master key and event keystore                                          |

---

## 🌐 Running Behind a Reverse Proxy

For deployment behind **Nginx Proxy Manager**, **Caddy**, **Traefik**, or **Cloudflare Tunnel**, check [`docs/REVERSE_PROXY.md`](docs/REVERSE_PROXY.md).

> [!TIP]
> **Disable Proxy Buffering for SSE:** Ensure your reverse proxy disables buffering on `/api/events/` (`proxy_buffering off;`) so real-time wall posts, potluck claims, and photo updates are delivered instantaneously to clients.

---

## 📖 Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) – Architecture overview & boundary enforcement
- [`docs/SECURITY.md`](docs/SECURITY.md) – Cryptographic design, threat model, and crypto-shredding
- [`docs/BACKUP.md`](docs/BACKUP.md) – 3-2-1 backup strategy and cold-restart recovery procedures
- [`docs/REVERSE_PROXY.md`](docs/REVERSE_PROXY.md) – Step-by-step reverse proxy guides
- [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md) – Design tokens, gestures, and accessibility standards
- [`docs/features/`](docs/features/) – Detailed specification cards for all application modules

---

## 🤖 AI Development Disclosure

This repository was designed, developed, and tested in collaboration with **Advanced Agentic AI Assistants** (DeepMind / Antigravity).

- **Implementation:** Code generation, Svelte 5 component architecture, cryptographic layer wiring, and regression tests were developed with AI pair programming.
- **Verification:** Every commit, security patch, and feature addition has been verified against mechanical quality gates, including strict boundary checkers, offline zero-external validators, automated test roundtrips, and type checking (`pnpm test:ci`).

---

## 📄 License

[MIT](LICENSE). Free for personal and commercial self-hosted use.
