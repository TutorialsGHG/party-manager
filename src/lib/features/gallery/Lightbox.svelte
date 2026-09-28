<script lang="ts">
	import { onMount } from 'svelte';
	import { X, ChevronLeft, ChevronRight, Download, Trash2, Loader2 } from '@lucide/svelte';

	export interface LightboxMedia {
		id: string;
		mimeType: string;
		originalFilename: string;
		uploaderName?: string;
		createdAt: number;
		uploaderGuestId: string;
	}

	interface Props {
		items: LightboxMedia[];
		initialIndex: number;
		canDeleteCurrent?: (item: LightboxMedia) => boolean;
		onClose: () => void;
		onDelete?: (item: LightboxMedia) => Promise<void>;
	}

	const { items, initialIndex, canDeleteCurrent, onClose, onDelete }: Props = $props();

	let currentIndex = $state(0);
	let isDeleting = $state(false);
	let touchStartX = 0;
	let touchEndX = 0;

	$effect(() => {
		currentIndex = initialIndex;
	});

	const currentItem = $derived(items[currentIndex]);
	const isVideo = $derived(
		currentItem?.mimeType.startsWith('video/') ||
			/\.(mov|mp4|webm)$/i.test(currentItem?.originalFilename || '')
	);
	const isDeletable = $derived(
		currentItem && canDeleteCurrent ? canDeleteCurrent(currentItem) : false
	);

	function prev() {
		if (currentIndex > 0) {
			currentIndex--;
		} else {
			currentIndex = items.length - 1; // cycle
		}
	}

	function next() {
		if (currentIndex < items.length - 1) {
			currentIndex++;
		} else {
			currentIndex = 0; // cycle
		}
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose();
		} else if (e.key === 'ArrowLeft') {
			prev();
		} else if (e.key === 'ArrowRight') {
			next();
		}
	}

	function handleTouchStart(e: TouchEvent) {
		touchStartX = e.changedTouches[0].screenX;
	}

	function handleTouchEnd(e: TouchEvent) {
		touchEndX = e.changedTouches[0].screenX;
		const diff = touchEndX - touchStartX;
		if (Math.abs(diff) > 50) {
			if (diff > 0) {
				prev();
			} else {
				next();
			}
		}
	}

	async function handleDelete() {
		if (!currentItem || !onDelete) return;
		if (!confirm('Möchtest du diese Datei wirklich löschen?')) return;

		try {
			isDeleting = true;
			await onDelete(currentItem);
			if (items.length <= 1) {
				onClose();
			} else if (currentIndex >= items.length - 1) {
				currentIndex = Math.max(0, currentIndex - 1);
			}
		} finally {
			isDeleting = false;
		}
	}

	onMount(() => {
		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
		};
	});
</script>

<div
	class="lightbox-backdrop"
	role="dialog"
	tabindex="-1"
	aria-modal="true"
	aria-label="Medienansicht"
	ontouchstart={handleTouchStart}
	ontouchend={handleTouchEnd}
>
	<!-- Top Navigation Bar -->
	<header class="lightbox-header">
		<div class="header-info">
			<span class="index-badge">{currentIndex + 1} / {items.length}</span>
			{#if currentItem?.uploaderName}
				<span class="uploader-name">von {currentItem.uploaderName}</span>
			{/if}
		</div>

		<div class="header-actions">
			{#if currentItem}
				<a
					href="/api/media/{currentItem.id}/download"
					class="header-btn"
					title="Herunterladen"
					download
				>
					<Download size={20} />
				</a>

				{#if isDeletable && onDelete}
					<button
						class="header-btn delete-btn"
						onclick={handleDelete}
						disabled={isDeleting}
						title="Löschen"
					>
						{#if isDeleting}
							<Loader2 size={20} class="spin" />
						{:else}
							<Trash2 size={20} />
						{/if}
					</button>
				{/if}
			{/if}

			<button class="header-btn close-btn" onclick={onClose} title="Schließen (Esc)">
				<X size={22} />
			</button>
		</div>
	</header>

	<!-- Media Display Area -->
	<main class="lightbox-content">
		{#if items.length > 1}
			<button class="nav-arrow left" onclick={prev} title="Vorheriges (Pfeil links)">
				<ChevronLeft size={36} />
			</button>
		{/if}

		<div class="media-container">
			{#if currentItem}
				{#key currentItem.id}
					{#if isVideo}
						<!-- svelte-ignore a11y_media_has_caption -->
						<video
							src="/api/media/{currentItem.id}/stream"
							controls
							autoplay
							playsinline
							class="media-element"
						></video>
					{:else}
						<img
							src="/api/media/{currentItem.id}/stream"
							alt={currentItem.originalFilename}
							class="media-element"
						/>
					{/if}
				{/key}
			{/if}
		</div>

		{#if items.length > 1}
			<button class="nav-arrow right" onclick={next} title="Nächstes (Pfeil rechts)">
				<ChevronRight size={36} />
			</button>
		{/if}
	</main>
</div>

<style>
	.lightbox-backdrop {
		position: fixed;
		inset: 0;
		z-index: 9999;
		background: rgba(0, 0, 0, 0.92);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		display: flex;
		flex-direction: column;
		color: #ffffff;
		user-select: none;
	}

	.lightbox-header {
		height: 60px;
		padding: 0 20px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		background: linear-gradient(to bottom, rgba(0, 0, 0, 0.6), transparent);
		z-index: 10;
	}

	.header-info {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.index-badge {
		font-size: 0.875rem;
		font-weight: 500;
		opacity: 0.75;
	}

	.uploader-name {
		font-size: 0.875rem;
		font-weight: 500;
		background: rgba(255, 255, 255, 0.15);
		padding: 2px 10px;
		border-radius: 12px;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.header-btn {
		background: rgba(255, 255, 255, 0.15);
		border: none;
		color: #ffffff;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		text-decoration: none;
		transition:
			background 0.15s ease,
			transform 0.1s ease;
	}

	.header-btn:hover {
		background: rgba(255, 255, 255, 0.3);
	}

	.header-btn:active {
		transform: scale(0.95);
	}

	.delete-btn:hover {
		background: rgba(255, 59, 48, 0.5);
	}

	.lightbox-content {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		overflow: hidden;
	}

	.nav-arrow {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		background: rgba(255, 255, 255, 0.15);
		border: none;
		color: #ffffff;
		width: 52px;
		height: 52px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		z-index: 10;
		transition: background 0.2s ease;
	}

	.nav-arrow:hover {
		background: rgba(255, 255, 255, 0.3);
	}

	.nav-arrow.left {
		left: 20px;
	}

	.nav-arrow.right {
		right: 20px;
	}

	@media (max-width: 640px) {
		.nav-arrow {
			display: none; /* Mobile relies on swipe gestures */
		}
	}

	.media-container {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
	}

	.media-element {
		max-width: 100%;
		max-height: calc(100vh - 120px);
		object-fit: contain;
		border-radius: 8px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
	}

	:global(.spin) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
</style>
