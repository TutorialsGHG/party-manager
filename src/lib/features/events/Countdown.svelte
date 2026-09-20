<script lang="ts">
  import { t } from '$lib/i18n';

  interface Props {
    targetDate: string | Date;
  }

  let { targetDate }: Props = $props();

  let remaining = $state({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isPast: false
  });

  function updateCountdown() {
    const target = new Date(targetDate).getTime();
    const now = Date.now();
    const diff = target - now;

    if (diff <= 0) {
      remaining = { days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true };
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    remaining = { days, hours, minutes, seconds, isPast: false };
  }

  $effect(() => {
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  });
</script>

{#if !remaining.isPast}
  <div class="countdown-grid" aria-label="Countdown bis zum Event">
    <div class="time-block">
      <span class="num">{remaining.days}</span>
      <span class="label">{t('events.countdownDays')}</span>
    </div>
    <div class="sep">:</div>
    <div class="time-block">
      <span class="num">{String(remaining.hours).padStart(2, '0')}</span>
      <span class="label">{t('events.countdownHours')}</span>
    </div>
    <div class="sep">:</div>
    <div class="time-block">
      <span class="num">{String(remaining.minutes).padStart(2, '0')}</span>
      <span class="label">{t('events.countdownMinutes')}</span>
    </div>
    <div class="sep">:</div>
    <div class="time-block">
      <span class="num">{String(remaining.seconds).padStart(2, '0')}</span>
      <span class="label">{t('events.countdownSeconds')}</span>
    </div>
  </div>
{:else}
  <div class="event-started-badge">
    🎉 Das Event hat begonnen!
  </div>
{/if}

<style>
  .countdown-grid {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    background-color: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
  }

  .time-block {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 44px;
  }

  .num {
    font-size: var(--text-2xl);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--accent);
    line-height: 1;
  }

  .label {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-top: var(--space-1);
  }

  .sep {
    font-size: var(--text-xl);
    font-weight: 600;
    color: var(--separator);
    margin-bottom: var(--space-2);
  }

  .event-started-badge {
    display: inline-flex;
    padding: var(--space-2) var(--space-4);
    background-color: var(--accent-subtle);
    color: var(--accent);
    border-radius: var(--radius-pill);
    font-weight: 600;
    font-size: var(--text-base);
  }
</style>