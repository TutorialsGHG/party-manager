<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';

  interface Props {
    value?: string;
    type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'date' | 'time' | 'datetime-local';
    label?: string;
    placeholder?: string;
    error?: string;
    hint?: string;
    disabled?: boolean;
    required?: boolean;
    id?: string;
    autocomplete?: HTMLInputAttributes['autocomplete'];
    name?: string;
    class?: string;
  }

  let {
    value = $bindable(''),
    type = 'text',
    label,
    placeholder = '',
    error,
    hint,
    disabled = false,
    required = false,
    id = Math.random().toString(36).substring(2, 9),
    autocomplete,
    name,
    class: className = ''
  }: Props = $props();
</script>

<div class="field {className}">
  {#if label}
    <label for={id} class="label">
      {label}
      {#if required}
        <span class="required" aria-hidden="true">*</span>
      {/if}
    </label>
  {/if}

  <input
    {id}
    {name}
    {type}
    bind:value
    {placeholder}
    {disabled}
    {required}
    {autocomplete}
    aria-invalid={!!error}
    aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
    class="input {error ? 'has-error' : ''}"
  />

  {#if error}
    <p id="{id}-error" class="error-msg" role="alert">{error}</p>
  {:else if hint}
    <p id="{id}-hint" class="hint-msg">{hint}</p>
  {/if}
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    width: 100%;
  }

  .label {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-secondary);
  }

  .required {
    color: var(--color-danger);
  }

  .input {
    width: 100%;
    min-height: var(--min-touch-target);
    padding: var(--space-2) var(--space-3);
    font-family: inherit;
    font-size: 16px; /* Crucial: 16px prevents iOS Safari auto-zoom */
    color: var(--text-primary);
    background-color: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    outline: none;
    transition: border-color var(--duration-fast) ease, box-shadow var(--duration-fast) ease;
  }

  .input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-subtle);
  }

  .input.has-error {
    border-color: var(--color-danger);
  }

  .input.has-error:focus {
    box-shadow: 0 0 0 3px rgba(255, 59, 48, 0.15);
  }

  .input:disabled {
    opacity: 0.6;
    background-color: var(--bg-subtle);
    cursor: not-allowed;
  }

  .error-msg {
    font-size: var(--text-xs);
    color: var(--color-danger);
  }

  .hint-msg {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
  }
</style>