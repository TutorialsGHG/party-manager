<script lang="ts">
	interface Props {
		width?: string;
		height?: string;
		radius?: 'sm' | 'md' | 'lg' | 'pill' | 'circle';
		class?: string;
	}

	let { width = '100%', height = '20px', radius = 'md', class: className = '' }: Props = $props();
</script>

<div class="skeleton {radius} {className}" style:width style:height aria-hidden="true"></div>

<style>
	.skeleton {
		background: linear-gradient(
			90deg,
			var(--bg-subtle) 0%,
			var(--bg-canvas) 50%,
			var(--bg-subtle) 100%
		);
		background-size: 200% 100%;
		animation: shimmer 1.5s infinite linear;
	}

	.sm {
		border-radius: var(--radius-sm);
	}
	.md {
		border-radius: var(--radius-md);
	}
	.lg {
		border-radius: var(--radius-lg);
	}
	.pill {
		border-radius: var(--radius-pill);
	}
	.circle {
		border-radius: 50%;
	}

	@keyframes shimmer {
		0% {
			background-position: 200% 0;
		}
		100% {
			background-position: -200% 0;
		}
	}
</style>
