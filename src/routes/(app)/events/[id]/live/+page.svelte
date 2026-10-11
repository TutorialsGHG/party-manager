<script lang="ts">
	import { onMount } from 'svelte';
	import { ArrowLeft, Maximize, Minimize, Music, ExternalLink, Camera } from '@lucide/svelte';
	import type { MediaItem } from '$lib/features/gallery/types';

	let { data } = $props();

	let photos = $state<MediaItem[]>([]);
	$effect(() => {
		photos = data.mediaItems || [];
	});
	let currentIndex = $state(0);
	let isFullscreen = $state(false);
	let slideshowTimer: NodeJS.Timeout | null = null;

	let activePhoto = $derived(photos.length > 0 ? photos[currentIndex % photos.length] : null);

	function nextSlide() {
		if (photos.length > 1) {
			currentIndex = (currentIndex + 1) % photos.length;
		}
	}

	function prevSlide() {
		if (photos.length > 1) {
			currentIndex = (currentIndex - 1 + photos.length) % photos.length;
		}
	}

	function toggleFullscreen() {
		if (!document.fullscreenElement) {
			document.documentElement.requestFullscreen().catch(() => {});
			isFullscreen = true;
		} else {
			document.exitFullscreen().catch(() => {});
			isFullscreen = false;
		}
	}

	onMount(() => {
		const handleFsChange = () => {
			isFullscreen = !!document.fullscreenElement;
		};
		document.addEventListener('fullscreenchange', handleFsChange);

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'ArrowRight' || e.key === ' ') {
				nextSlide();
			} else if (e.key === 'ArrowLeft') {
				prevSlide();
			}
		};
		window.addEventListener('keydown', handleKeyDown);

		// Slideshow interval (every 7 seconds)
		slideshowTimer = setInterval(() => {
			nextSlide();
		}, 7000);

		// Live updates via SSE
		const eventSource = new EventSource(`/api/events/${data.event.id}/sse`);

		eventSource.addEventListener('media:new', (e) => {
			const newMedia = JSON.parse(e.data);
			if (!photos.some((p) => p.id === newMedia.id)) {
				photos = [newMedia, ...photos];
				// Instantly show newly arrived photo
				currentIndex = 0;
			}
		});

		eventSource.addEventListener('media:delete', (e) => {
			const { mediaId } = JSON.parse(e.data);
			photos = photos.filter((p) => p.id !== mediaId);
			if (currentIndex >= photos.length && photos.length > 0) {
				currentIndex = 0;
			}
		});

		return () => {
			document.removeEventListener('fullscreenchange', handleFsChange);
			window.removeEventListener('keydown', handleKeyDown);
			if (slideshowTimer) clearInterval(slideshowTimer);
			eventSource.close();
		};
	});
</script>

<svelte:head>
	<title>Party-Modus – {data.event.title}</title>
</svelte:head>

<div class="party-mode-view">
	<!-- Top Bar Controls -->
	<header class="top-bar">
		<div class="bar-left">
			<a href={`/events/${data.event.id}`} class="control-btn back-btn" title="Zurück zum Event">
				<ArrowLeft size={20} />
				<span>Zurück</span>
			</a>
			<span class="event-title">{data.event.title}</span>
		</div>

		<div class="bar-right">
			{#if data.event.playlistUrl}
				<a
					href={data.event.playlistUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="control-btn music-btn"
					title="YouTube Music Playlist auf diesem PC öffnen"
				>
					<Music size={18} />
					<span>Playlist abspielen</span>
					<ExternalLink size={14} />
				</a>
			{/if}

			<button
				type="button"
				class="control-btn icon-only"
				onclick={toggleFullscreen}
				title={isFullscreen ? 'Vollbild beenden' : 'Vollbild aktivieren'}
			>
				{#if isFullscreen}
					<Minimize size={20} />
				{:else}
					<Maximize size={20} />
				{/if}
			</button>
		</div>
	</header>

	<!-- Main Stage Area -->
	<main class="stage">
		{#if photos.length === 0}
			<!-- Empty State: "Dein Bild jetzt hier – lad es hoch!" -->
			<div class="empty-state-card">
				<div class="empty-icon-ring">
					<Camera size={44} />
				</div>
				<h1 class="empty-headline">Dein Bild jetzt hier – lad es hoch!</h1>
				<p class="empty-subline">
					Scanne den QR-Code mit deinem Smartphone und teile deine Party-Schnappschüsse live auf der
					Leinwand.
				</p>

				{#if data.qrSvg}
					<div class="qr-container">
						<div class="qr-box">
							<img
								src={`data:image/svg+xml;utf8,${encodeURIComponent(data.qrSvg)}`}
								alt="QR Code"
							/>
						</div>
						<span class="qr-label">Direkt hochladen & mitfeiern</span>
					</div>
				{/if}
			</div>
		{:else if activePhoto}
			<!-- Live Slideshow -->
			<div class="slide-wrapper">
				<img
					src={`/api/media/${activePhoto.id}/stream`}
					alt="Party Schnappschuss"
					class="slide-image"
				/>

				<!-- Subtle Floating QR Badge in corner -->
				{#if data.qrSvg}
					<div class="floating-qr-badge">
						<div class="badge-qr">
							<img
								src={`data:image/svg+xml;utf8,${encodeURIComponent(data.qrSvg)}`}
								alt="QR Code"
							/>
						</div>
						<div class="badge-text">
							<span class="badge-title">Foto teilen 📷</span>
							<span class="badge-sub">QR-Code scannen</span>
						</div>
					</div>
				{/if}

				<!-- Discreet Slide Counter -->
				<div class="slide-counter">
					<span>{(currentIndex % photos.length) + 1} / {photos.length}</span>
				</div>
			</div>
		{/if}
	</main>
</div>

<style>
	:global(body) {
		background-color: #000000;
	}

	.party-mode-view {
		position: fixed;
		inset: 0;
		width: 100vw;
		height: 100vh;
		background: #09090b;
		color: #ffffff;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		user-select: none;
		font-family:
			-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
	}

	.top-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.5rem;
		background: rgba(9, 9, 11, 0.75);
		backdrop-filter: blur(12px);
		z-index: 10;
		transition: opacity 0.3s ease;
	}

	.bar-left,
	.bar-right {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.event-title {
		font-size: 1.1rem;
		font-weight: 700;
		color: #ffffff;
		letter-spacing: -0.01em;
	}

	.control-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.9rem;
		border-radius: 9999px;
		background: rgba(255, 255, 255, 0.12);
		color: #ffffff;
		border: 1px solid rgba(255, 255, 255, 0.15);
		font-size: 0.9rem;
		font-weight: 600;
		text-decoration: none;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.control-btn:hover {
		background: rgba(255, 255, 255, 0.22);
		border-color: rgba(255, 255, 255, 0.3);
	}

	.music-btn {
		background: #ff0033;
		border-color: #ff0033;
	}

	.music-btn:hover {
		background: #e6002e;
	}

	.icon-only {
		padding: 0.5rem;
	}

	.stage {
		flex: 1;
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	/* Empty State Styles */
	.empty-state-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		max-width: 650px;
		padding: 2.5rem;
		background: rgba(24, 24, 27, 0.8);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 2rem;
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(20px);
		animation: fadeIn 0.8s ease;
	}

	.empty-icon-ring {
		width: 80px;
		height: 80px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.08);
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 1.5rem;
		color: #ffffff;
	}

	.empty-headline {
		font-size: 2.25rem;
		font-weight: 800;
		margin: 0 0 0.75rem;
		line-height: 1.2;
		color: #ffffff;
		letter-spacing: -0.02em;
	}

	.empty-subline {
		font-size: 1.15rem;
		color: #a1a1aa;
		margin: 0 0 2rem;
		line-height: 1.5;
	}

	.qr-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
	}

	.qr-box {
		width: 220px;
		height: 220px;
		background: #ffffff;
		padding: 0.75rem;
		border-radius: 1.25rem;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
	}

	.qr-box img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.qr-label {
		font-size: 0.95rem;
		font-weight: 600;
		color: #e4e4e7;
	}

	/* Slideshow Styles */
	.slide-wrapper {
		width: 100%;
		height: 100%;
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.slide-image {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		animation: fadeIn 0.6s ease;
	}

	.floating-qr-badge {
		position: absolute;
		bottom: 1.5rem;
		right: 1.5rem;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		background: rgba(9, 9, 11, 0.85);
		border: 1px solid rgba(255, 255, 255, 0.2);
		padding: 0.6rem 0.9rem;
		border-radius: 1rem;
		backdrop-filter: blur(12px);
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.6);
	}

	.badge-qr {
		width: 56px;
		height: 56px;
		background: #ffffff;
		padding: 0.25rem;
		border-radius: 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.badge-qr img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.badge-text {
		display: flex;
		flex-direction: column;
	}

	.badge-title {
		font-size: 0.95rem;
		font-weight: 700;
		color: #ffffff;
	}

	.badge-sub {
		font-size: 0.75rem;
		color: #a1a1aa;
	}

	.slide-counter {
		position: absolute;
		bottom: 1.5rem;
		left: 1.5rem;
		background: rgba(9, 9, 11, 0.7);
		border: 1px solid rgba(255, 255, 255, 0.15);
		padding: 0.4rem 0.8rem;
		border-radius: 9999px;
		font-size: 0.85rem;
		font-weight: 600;
		color: #d4d4d8;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: scale(0.98);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}
</style>
