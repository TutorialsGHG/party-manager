<script lang="ts">
	import '$lib/ui/tokens/theme.css';
	import { APP_NAME } from '$lib/config';

	let { children } = $props();
</script>

<svelte:head>
	<title>{APP_NAME}</title>
</svelte:head>

<main class="app-root">
	{@render children()}
</main>

<style>
	.app-root {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
	}
</style>
