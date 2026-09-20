<script lang="ts">
  import { enhance } from '$app/forms';
  import { t, formatDate } from '$lib/i18n';
  import { deriveThemeTokens } from '$lib/ui/tokens/colors';
  import Card from '$lib/ui/components/Card.svelte';
  import Button from '$lib/ui/components/Button.svelte';
  import Badge from '$lib/ui/components/Badge.svelte';
  import Dialog from '$lib/ui/components/Dialog.svelte';
  import Countdown from '$lib/features/events/Countdown.svelte';
  import {
    ArrowLeft,
    Share2,
    Copy,
    Check,
    QrCode,
    Calendar,
    MapPin,
    RefreshCw,
    Trash2,
    Users,
    Download
  } from '@lucide/svelte';

  let { data, form } = $props();

  let copied = $state(false);
  let showQrDialog = $state(false);
  let showDeleteDialog = $state(false);
  let qrSvg = $state('');

  let themeTokens = $derived(deriveThemeTokens(data.event.accentColor));

  // Determine current active invite link
  let currentToken = $derived(form?.newToken || (data.event as any).token || '');
  let inviteUrl = $derived(currentToken ? `${data.baseUrl}/e/${currentToken}` : '');

  async function copyLink() {
    if (inviteUrl) {
      await navigator.clipboard.writeText(inviteUrl);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    }
  }

  async function shareLink() {
    if (navigator.share && inviteUrl) {
      try {
        await navigator.share({
          title: data.event.title,
          text: `Du bist eingeladen: ${data.event.title}`,
          url: inviteUrl
        });
      } catch {
        // Fallback to copy
        copyLink();
      }
    } else {
      copyLink();
    }
  }

  function downloadIcs() {
    window.location.href = `/events/${data.event.id}/ics`;
  }
</script>

<div class="manage-page" style:--accent={themeTokens.accent} style:--accent-contrast={themeTokens.accentContrast}>
  <div class="header-nav">
    <a href="/dashboard" class="back-link">
      <Button variant="ghost" size="sm">
        <ArrowLeft size={16} />
        <span>Zur Übersicht</span>
      </Button>
    </a>

    <div class="event-status-wrap">
      <Badge variant="accent">Host-Ansicht</Badge>
    </div>
  </div>

  <div class="hero-card" style:border-top-color={data.event.accentColor}>
    <div class="hero-content">
      <span class="date-badge">
        {formatDate(data.event.dateStart, { dateStyle: 'full', timeStyle: 'short' })}
      </span>
      <h1 class="hero-title">{data.event.title}</h1>

      {#if data.event.locationName || data.event.locationAddress}
        <div class="loc-row">
          <MapPin size={16} />
          <span>{[data.event.locationName, data.event.locationAddress].filter(Boolean).join(' • ')}</span>
        </div>
      {/if}
    </div>

    <div class="countdown-wrap">
      <Countdown targetDate={data.event.dateStart} />
    </div>
  </div>

  <!-- Share & Invite Link Section -->
  <Card title="Einladungs-Link" subtitle="Teile diesen geheimen Link mit deinen Gästen. Sie können ohne Registrierung öffnen und antworten.">
    <div class="share-box">
      {#if inviteUrl}
        <div class="link-display">
          <code>{inviteUrl}</code>
        </div>
      {:else}
        <p class="regenerate-notice">
          Der Einladungslink wurde aus Sicherheitsgründen ausgeblendet. Klicke unten auf "Neuen Link generieren", um einen neuen 128-Bit Einladungslink zu erzeugen.
        </p>
      {/if}

      <div class="share-actions">
        {#if inviteUrl}
          <Button variant="primary" onclick={shareLink}>
            <Share2 size={16} />
            <span>Teilen</span>
          </Button>

          <Button variant="secondary" onclick={copyLink}>
            {#if copied}
              <Check size={16} />
              <span>Kopiert!</span>
            {:else}
              <Copy size={16} />
              <span>Link kopieren</span>
            {/if}
          </Button>
        {/if}

        <Button variant="secondary" onclick={downloadIcs}>
          <Calendar size={16} />
          <span>.ics Kalender</span>
        </Button>
      </div>
    </div>
  </Card>

  <!-- RSVP Summary Section -->
  <Card title="Rückmeldungen ({data.rsvp.totalAttending} Gäste)" subtitle="Übersicht aller Zu- und Absagen">
    <div class="rsvp-stats-grid">
      <div class="stat-card yes">
        <span class="stat-num">{data.rsvp.yesCount}</span>
        <span class="stat-label">Zusagen</span>
      </div>

      <div class="stat-card maybe">
        <span class="stat-num">{data.rsvp.maybeCount}</span>
        <span class="stat-label">Vielleicht</span>
      </div>

      <div class="stat-card no">
        <span class="stat-num">{data.rsvp.noCount}</span>
        <span class="stat-label">Absagen</span>
      </div>
    </div>

    {#if data.rsvp.attendees.length > 0}
      <div class="attendees-list">
        <h4 class="list-title">Zusagen im Detail:</h4>
        {#each data.rsvp.attendees as att}
          <div class="attendee-row">
            <span class="guest-name">{att.name}</span>
            {#if att.companionCount > 0}
              <Badge variant="neutral">+{att.companionCount} Begleitung</Badge>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </Card>

  <!-- Danger Zone & Management -->
  <Card title="Sicherheit & Verwaltung">
    <div class="danger-actions">
      <form action="?/regenerateToken" method="POST" use:enhance>
        <Button type="submit" variant="secondary">
          <RefreshCw size={16} />
          <span>Neuen Einladungslink generieren (alter wird ungültig)</span>
        </Button>
      </form>

      <Button variant="danger" onclick={() => (showDeleteDialog = true)}>
        <Trash2 size={16} />
        <span>Event unwiderruflich löschen (Crypto-Shredding)</span>
      </Button>
    </div>
  </Card>
</div>

<!-- Delete Confirmation Dialog -->
<Dialog
  bind:open={showDeleteDialog}
  title="Event wirklich löschen?"
  onclose={() => (showDeleteDialog = false)}
>
  <p class="dialog-p">
    Möchtest du <strong>{data.event.title}</strong> wirklich löschen?
  </p>
  <p class="dialog-warning">
    <strong>Echte Löschgarantie (Crypto-Shredding):</strong> Der Event-Schlüssel wird sofort vernichtet. Sämtliche Chats, RSVPs und Fotos werden mathematisch unlesbar und unwiderruflich gelöscht.
  </p>

  {#snippet actions()}
    <Button variant="secondary" onclick={() => (showDeleteDialog = false)}>
      Abbrechen
    </Button>
    <form action="?/deleteEvent" method="POST" use:enhance>
      <Button type="submit" variant="danger">
        Endgültig vernichten
      </Button>
    </form>
  {/snippet}
</Dialog>

<style>
  .manage-page {
    max-width: var(--max-content-width);
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .header-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .back-link {
    text-decoration: none;
  }

  .hero-card {
    background: var(--bg-surface);
    border-radius: var(--radius-xl);
    border: 1px solid var(--border-subtle);
    border-top: 6px solid var(--accent);
    padding: var(--space-6);
    box-shadow: var(--shadow-sm);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .hero-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .date-badge {
    font-size: var(--text-xs);
    font-weight: 700;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .hero-title {
    font-size: var(--text-2xl);
    font-weight: 800;
    line-height: 1.2;
    color: var(--text-primary);
  }

  .loc-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .countdown-wrap {
    display: flex;
    justify-content: center;
    padding-top: var(--space-2);
  }

  .share-box {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .link-display {
    background-color: var(--bg-canvas);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-subtle);
    overflow-x: auto;
  }

  .link-display code {
    font-family: var(--font-family-mono);
    font-size: var(--text-sm);
    color: var(--text-primary);
  }

  .regenerate-notice {
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .share-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .rsvp-stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-3);
    text-align: center;
  }

  .stat-card {
    padding: var(--space-3);
    border-radius: var(--radius-md);
    background-color: var(--bg-canvas);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .stat-card.yes .stat-num { color: var(--color-success); }
  .stat-card.maybe .stat-num { color: var(--color-warning); }
  .stat-card.no .stat-num { color: var(--text-tertiary); }

  .stat-num {
    font-size: var(--text-2xl);
    font-weight: 700;
  }

  .stat-label {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--text-secondary);
  }

  .attendees-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-top: var(--space-2);
    border-top: 1px solid var(--border-subtle);
  }

  .list-title {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text-secondary);
  }

  .attendee-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2);
    background-color: var(--bg-canvas);
    border-radius: var(--radius-sm);
  }

  .guest-name {
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .danger-actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .dialog-p {
    font-size: var(--text-base);
    color: var(--text-primary);
  }

  .dialog-warning {
    font-size: var(--text-sm);
    color: var(--color-danger);
    background: rgba(255, 59, 48, 0.08);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    line-height: 1.4;
  }
</style>