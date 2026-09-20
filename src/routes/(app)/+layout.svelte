<script lang="ts">
  import { APP_NAME } from '$lib/config';
  import { t } from '$lib/i18n';
  import Button from '$lib/ui/components/Button.svelte';
  import Badge from '$lib/ui/components/Badge.svelte';
  import { Calendar, Plus, LogOut, Shield } from '@lucide/svelte';

  let { data, children } = $props();
</script>

<div class="app-layout">
  <header class="app-nav">
    <div class="nav-content">
      <div class="nav-left">
        <a href="/dashboard" class="brand">
          <span class="brand-text">{APP_NAME}</span>
        </a>
        {#if data.user.role === 'admin'}
          <a href="/admin">
            <Badge variant="accent">
              <Shield size={12} />
              <span>Admin</span>
            </Badge>
          </a>
        {/if}
      </div>

      <div class="nav-actions">
        <a href="/events/new">
          <Button variant="primary" size="sm">
            <Plus size={16} />
            <span>Neues Event</span>
          </Button>
        </a>

        <form action="/logout" method="POST">
          <button type="submit" class="logout-btn" title={t('auth.logout')}>
            <LogOut size={18} />
          </button>
        </form>
      </div>
    </div>
  </header>

  <main class="app-main">
    {@render children()}
  </main>
</div>

<style>
  .app-layout {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    background-color: var(--bg-canvas);
  }

  .app-nav {
    position: sticky;
    top: 0;
    z-index: 100;
    background-color: var(--glass-bg);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-bottom: 1px solid var(--border-subtle);
  }

  .nav-content {
    max-width: var(--max-desktop-width);
    margin: 0 auto;
    padding: var(--space-3) var(--space-4);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .nav-left {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .brand {
    text-decoration: none;
    color: var(--text-primary);
    font-weight: 800;
    font-size: var(--text-lg);
    letter-spacing: -0.02em;
  }

  .nav-actions {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .nav-actions a {
    text-decoration: none;
  }

  .logout-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-pill);
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: background-color var(--duration-fast) ease, color var(--duration-fast) ease;
  }

  .logout-btn:hover {
    background: var(--bg-subtle);
    color: var(--color-danger);
  }

  .app-main {
    flex: 1;
    max-width: var(--max-desktop-width);
    width: 100%;
    margin: 0 auto;
    padding: var(--space-6) var(--space-4);
  }
</style>