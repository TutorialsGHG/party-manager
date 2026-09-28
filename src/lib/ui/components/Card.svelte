<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title?: string;
		subtitle?: string;
		padding?: 'none' | 'sm' | 'md' | 'lg';
		interactive?: boolean;
		onclick?: () => void;
		children?: Snippet;
		headerAction?: Snippet;
		class?: string;
	}

	let {
		title,
		subtitle,
		padding = 'md',
		interactive = false,
		onclick,
		children,
		headerAction,
		class: className = ''
	}: Props = $props();
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	class="card {padding} {interactive ? 'interactive' : ''} {className}"
	role={interactive ? 'button' : undefined}
	tabindex={interactive ? 0 : undefined}
	{onclick}
>
	{#if title || subtitle || headerAction}
		<div class="card-header">
			<div class="header-titles">
				{#if title}
					<h3 class="card-title">{title}</h3>
				{/if}
				{#if subtitle}
					<p class="card-subtitle">{subtitle}</p>
				{/if}
			</div>
			{#if headerAction}
				<div class="header-action">
					{@render headerAction()}
				</div>
			{/if}
		</div>
	{/if}

	{#if children}
		<div class="card-body">
			{@render children()}
		</div>
	{/if}
</div>

<style>
	.card {
		background-color: var(--bg-surface);
		border-radius: var(--radius-lg);
		border: 1px solid var(--border-subtle);
		box-shadow: var(--shadow-sm);
		overflow: hidden;
		transition:
			transform var(--duration-fast) var(--ease-spring),
			box-shadow var(--duration-fast) ease;
	}

	.interactive {
		cursor: pointer;
		user-select: none;
	}

	.interactive:active {
		transform: scale(0.985);
	}

	.interactive:hover {
		box-shadow: var(--shadow-md);
	}

	.none {
		padding: 0;
	}
	.sm {
		padding: var(--space-2);
	}
	.md {
		padding: var(--space-4);
	}
	.lg {
		padding: var(--space-6);
	}

	.card-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
	}

	.card-title {
		font-size: var(--text-lg);
		font-weight: 600;
		color: var(--text-primary);
		line-height: 1.25;
	}

	.card-subtitle {
		font-size: var(--text-sm);
		color: var(--text-secondary);
		margin-top: var(--space-1);
	}

	.card-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
</style>
