<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    open?: boolean;
    title?: string;
    onclose?: () => void;
    children?: Snippet;
  }

  let {
    open = $bindable(false),
    title,
    onclose,
    children
  }: Props = $props();

  function close() {
    open = false;
    onclose?.();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      close();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="sheet-backdrop" onclick={close}>
    <div
      class="sheet-container"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      aria-label={title || 'Sheet'}
      onclick={(e) => e.stopPropagation()}
    >
      <div class="sheet-handle-bar">
        <div class="sheet-handle"></div>
      </div>

      {#if title}
        <div class="sheet-header">
          <h2 class="sheet-title">{title}</h2>
        </div>
      {/if}

      <div class="sheet-body">
        {#if children}
          {@render children()}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .sheet-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    z-index: 1000;
  }

  .sheet-container {
    background: var(--bg-surface);
    width: 100%;
    max-width: 560px;
    max-height: 85dvh;
    border-top-left-radius: var(--radius-xl);
    border-top-right-radius: var(--radius-xl);
    padding: var(--space-4) var(--space-6) calc(var(--space-6) + env(safe-area-inset-bottom, 0));
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    box-shadow: var(--shadow-lg);
    animation: sheetSlideUp var(--duration-fast) var(--ease-spring);
    overflow-y: auto;
  }

  @media (min-width: 768px) {
    .sheet-backdrop {
      align-items: center;
      padding: var(--space-4);
    }
    .sheet-container {
      border-radius: var(--radius-xl);
      padding-bottom: var(--space-6);
    }
  }

  .sheet-handle-bar {
    display: flex;
    justify-content: center;
    padding-bottom: var(--space-1);
  }

  .sheet-handle {
    width: 36px;
    height: 5px;
    background: var(--separator);
    border-radius: var(--radius-pill);
  }

  .sheet-header {
    text-align: center;
    padding-bottom: var(--space-2);
  }

  .sheet-title {
    font-size: var(--text-lg);
    font-weight: 700;
    color: var(--text-primary);
  }

  .sheet-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  @keyframes sheetSlideUp {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }
</style>