<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
		size?: 'sm' | 'md' | 'lg';
		type?: 'button' | 'submit' | 'reset';
		disabled?: boolean;
		loading?: boolean;
		fullWidth?: boolean;
		onclick?: (e: MouseEvent) => void;
		children?: Snippet;
		class?: string;
	}

	let {
		variant = 'primary',
		size = 'md',
		type = 'button',
		disabled = false,
		loading = false,
		fullWidth = false,
		onclick,
		children,
		class: className = ''
	}: Props = $props();
</script>

<button
	{type}
	class="btn {variant} {size} {fullWidth ? 'full-width' : ''} {className}"
	disabled={disabled || loading}
	{onclick}
>
	{#if loading}
		<span class="spinner" aria-hidden="true"></span>
	{/if}
	{#if children}
		{@render children()}
	{/if}
</button>

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		font-family: inherit;
		font-weight: 600;
		border-radius: var(--radius-md);
		border: 1px solid transparent;
		cursor: pointer;
		user-select: none;
		transition:
			transform var(--duration-fast) var(--ease-spring),
			background-color var(--duration-fast) ease,
			opacity var(--duration-fast) ease,
			box-shadow var(--duration-fast) ease;
		min-height: var(--min-touch-target);
		line-height: 1;
		text-decoration: none;
	}

	.btn:active:not(:disabled) {
		transform: scale(0.97);
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
	}

	/* Sizes */
	.sm {
		padding: var(--space-1) var(--space-3);
		font-size: var(--text-sm);
		min-height: 36px;
		border-radius: var(--radius-sm);
	}

	.md {
		padding: var(--space-2) var(--space-4);
		font-size: var(--text-base);
		min-height: var(--min-touch-target);
	}

	.lg {
		padding: var(--space-3) var(--space-6);
		font-size: var(--text-lg);
		min-height: 52px;
		border-radius: var(--radius-lg);
	}

	.full-width {
		width: 100%;
	}

	/* Variants */
	.primary {
		background-color: var(--accent);
		color: var(--accent-contrast);
		box-shadow: var(--shadow-sm);
	}

	.primary:hover:not(:disabled) {
		background-color: var(--accent-hover);
	}

	.primary:active:not(:disabled) {
		background-color: var(--accent-active);
	}

	.secondary {
		background-color: var(--bg-subtle);
		color: var(--text-primary);
	}

	.secondary:hover:not(:disabled) {
		filter: brightness(0.96);
	}

	.danger {
		background-color: var(--color-danger);
		color: var(--color-danger-contrast);
	}

	.ghost {
		background-color: transparent;
		color: var(--text-primary);
	}

	.ghost:hover:not(:disabled) {
		background-color: var(--bg-subtle);
	}

	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid currentColor;
		border-right-color: transparent;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
