<script lang="ts">
	import type { Snippet } from 'svelte';
	import { X } from '@lucide/svelte';

	interface Props {
		open?: boolean;
		title?: string;
		onclose?: () => void;
		children?: Snippet;
		actions?: Snippet;
	}

	let { open = $bindable(false), title, onclose, children, actions }: Props = $props();

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			close();
		}
	}

	function close() {
		open = false;
		onclose?.();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="overlay" onclick={close}>
		<div
			class="dialog"
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			aria-labelledby={title ? 'dialog-title' : undefined}
			onclick={(e) => e.stopPropagation()}
		>
			<div class="dialog-header">
				{#if title}
					<h2 id="dialog-title" class="dialog-title">{title}</h2>
				{/if}
				<button type="button" class="close-btn" onclick={close} aria-label="Schließen">
					<X size={18} />
				</button>
			</div>

			{#if children}
				<div class="dialog-content">
					{@render children()}
				</div>
			{/if}

			{#if actions}
				<div class="dialog-actions">
					{@render actions()}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.45);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-4);
		z-index: 1000;
	}

	.dialog {
		background: var(--bg-surface);
		border-radius: var(--radius-xl);
		border: 1px solid var(--border-subtle);
		box-shadow: var(--shadow-lg);
		width: 100%;
		max-width: 480px;
		max-height: 90dvh;
		overflow-y: auto;
		padding: var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		animation: dialogAppear var(--duration-fast) var(--ease-spring);
	}

	.dialog-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}

	.dialog-title {
		font-size: var(--text-xl);
		font-weight: 700;
		color: var(--text-primary);
	}

	.close-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-full);
		border: none;
		background: var(--bg-subtle);
		color: var(--text-secondary);
		cursor: pointer;
		transition: background-color var(--duration-fast) ease;
	}

	.close-btn:hover {
		background: var(--separator);
	}

	.dialog-content {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.dialog-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-3);
		margin-top: var(--space-2);
	}

	@keyframes dialogAppear {
		from {
			opacity: 0;
			transform: scale(0.96);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}
</style>
