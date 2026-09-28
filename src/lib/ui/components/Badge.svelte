<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		variant?: 'accent' | 'neutral' | 'success' | 'warning' | 'danger';
		children?: Snippet;
		class?: string;
	}

	let { variant = 'neutral', children, class: className = '' }: Props = $props();
</script>

<span class="badge {variant} {className}">
	{#if children}
		{@render children()}
	{/if}
</span>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: 2px 8px;
		border-radius: var(--radius-pill);
		font-size: var(--text-xs);
		font-weight: 600;
		line-height: 1.4;
		white-space: nowrap;
	}

	.accent {
		background-color: var(--accent-subtle);
		color: var(--accent);
	}

	.neutral {
		background-color: var(--bg-subtle);
		color: var(--text-secondary);
	}

	.success {
		background-color: rgba(52, 199, 89, 0.15);
		color: var(--color-success);
	}

	.warning {
		background-color: rgba(255, 149, 0, 0.15);
		color: var(--color-warning);
	}

	.danger {
		background-color: rgba(255, 59, 48, 0.15);
		color: var(--color-danger);
	}
</style>
