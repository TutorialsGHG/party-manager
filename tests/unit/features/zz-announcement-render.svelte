<script lang="ts">
	/**
	 * Mirrors the announcement markup used in both page.svelte files:
	 *
	 *   <div class="announcement-card">
	 *     <p>{announcement.content}</p>
	 *   </div>
	 *
	 * Kept as a separate component purely so a test can render it. If the real
	 * templates ever switch to `{@html ...}`, this probe starts failing, which is the
	 * point of having it.
	 */
	let { content }: { content: string } = $props();
</script>

<div class="announcement-card">
	<p>{content}</p>
</div>
