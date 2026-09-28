<script lang="ts">
	import { uploadMediaWithTus } from './tus-client.js';
	import Button from '$lib/ui/components/Button.svelte';
	import Card from '$lib/ui/components/Card.svelte';
	import { Upload, Film, Image as ImageIcon, X, Check, Loader2, AlertCircle } from '@lucide/svelte';

	interface Props {
		eventId: string;
		guestToken?: string;
		onUploadComplete?: (mediaId: string) => void;
	}

	const { eventId, guestToken, onUploadComplete }: Props = $props();

	interface UploadingItem {
		id: string;
		file: File;
		progress: number;
		status: 'uploading' | 'processing' | 'done' | 'error';
		error?: string;
		abortController: AbortController;
	}

	let items = $state<UploadingItem[]>([]);
	let isDragging = $state(false);
	let fileInput: HTMLInputElement | null = $state(null);

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		isDragging = true;
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
		if (e.dataTransfer?.files) {
			queueFiles(Array.from(e.dataTransfer.files));
		}
	}

	function handleFileSelect(e: Event) {
		const target = e.target as HTMLInputElement;
		if (target.files) {
			queueFiles(Array.from(target.files));
			target.value = '';
		}
	}

	function queueFiles(files: File[]) {
		const valid = files.filter(
			(f) =>
				f.type.startsWith('image/') ||
				f.type.startsWith('video/') ||
				/\.(heic|heif|mov|mp4|webm)$/i.test(f.name)
		);

		for (const file of valid) {
			const abortController = new AbortController();
			const item: UploadingItem = {
				id: Math.random().toString(36).substring(2, 9),
				file,
				progress: 0,
				status: 'uploading',
				abortController
			};

			items = [item, ...items];
			startUpload(item);
		}
	}

	async function startUpload(item: UploadingItem) {
		try {
			const mediaId = await uploadMediaWithTus({
				file: item.file,
				eventId,
				guestToken,
				signal: item.abortController.signal,
				onProgress: (p) => {
					const found = items.find((i) => i.id === item.id);
					if (found) {
						found.progress = p.percentage;
						if (p.percentage >= 100) {
							found.status = 'processing';
						}
					}
				}
			});

			const found = items.find((i) => i.id === item.id);
			if (found) {
				found.status = 'done';
			}
			if (onUploadComplete) {
				onUploadComplete(mediaId);
			}
		} catch (err: any) {
			if (item.abortController.signal.aborted) return;
			const found = items.find((i) => i.id === item.id);
			if (found) {
				found.status = 'error';
				found.error = err.message || 'Upload fehlgeschlagen';
			}
		}
	}

	function cancelUpload(id: string) {
		const item = items.find((i) => i.id === id);
		if (item) {
			item.abortController.abort();
			items = items.filter((i) => i.id !== id);
		}
	}

	function removeFinished(id: string) {
		items = items.filter((i) => i.id !== id);
	}
</script>

<div class="upload-zone-wrapper">
	<input
		bind:this={fileInput}
		type="file"
		multiple
		accept="image/*,video/*,.heic,.heif,.mov"
		class="hidden-input"
		onchange={handleFileSelect}
	/>

	<div
		class="drop-target"
		class:dragging={isDragging}
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		ondrop={handleDrop}
		role="region"
		aria-label="Upload Dropzone"
	>
		<div class="drop-content">
			<div class="icon-circle">
				<Upload size={28} />
			</div>
			<div class="drop-text">
				<h3>Fotos & Videos hochladen</h3>
				<p>Dateien hierher ziehen oder auswählen</p>
			</div>
			<Button variant="primary" onclick={() => fileInput?.click()}>Dateien auswählen</Button>
		</div>
	</div>

	{#if items.length > 0}
		<div class="queue-list">
			{#each items as item (item.id)}
				<Card class="queue-card">
					<div class="queue-item">
						<div class="type-icon">
							{#if item.file.type.startsWith('video/')}
								<Film size={20} />
							{:else}
								<ImageIcon size={20} />
							{/if}
						</div>

						<div class="item-details">
							<div class="item-header">
								<span class="filename" title={item.file.name}>{item.file.name}</span>
								<span class="status-badge">
									{#if item.status === 'uploading'}
										{item.progress}%
									{:else if item.status === 'processing'}
										<Loader2 size={14} class="spin" /> Verarbeite...
									{:else if item.status === 'done'}
										<span class="text-success"><Check size={14} /> Bereit</span>
									{:else if item.status === 'error'}
										<span class="text-danger"><AlertCircle size={14} /> Fehler</span>
									{/if}
								</span>
							</div>

							{#if item.status === 'uploading'}
								<div class="progress-bar-bg">
									<div class="progress-bar-fill" style="width: {item.progress}%;"></div>
								</div>
							{:else if item.status === 'error'}
								<p class="error-msg">{item.error}</p>
							{/if}
						</div>

						<div class="actions">
							{#if item.status === 'uploading'}
								<button class="action-btn" onclick={() => cancelUpload(item.id)} title="Abbrechen">
									<X size={16} />
								</button>
							{:else}
								<button
									class="action-btn"
									onclick={() => removeFinished(item.id)}
									title="Entfernen"
								>
									<X size={16} />
								</button>
							{/if}
						</div>
					</div>
				</Card>
			{/each}
		</div>
	{/if}
</div>

<style>
	.upload-zone-wrapper {
		display: flex;
		flex-direction: column;
		gap: 16px;
		margin-bottom: 24px;
	}

	.hidden-input {
		display: none;
	}

	.drop-target {
		border: 2px dashed var(--color-border);
		border-radius: var(--radius-lg, 16px);
		background: var(--color-surface);
		padding: 32px 20px;
		text-align: center;
		transition: all 0.2s ease;
	}

	.drop-target.dragging {
		border-color: var(--color-primary);
		background: var(--color-primary-subtle, rgba(0, 122, 255, 0.08));
		transform: scale(1.01);
	}

	.drop-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
	}

	.icon-circle {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: var(--color-bg-secondary, #f2f2f7);
		color: var(--color-primary);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.drop-text h3 {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 600;
	}

	.drop-text p {
		margin: 4px 0 0 0;
		font-size: 0.875rem;
		color: var(--color-text-secondary);
	}

	.queue-list {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	:global(.queue-card) {
		padding: 12px 16px !important;
	}

	.queue-item {
		display: flex;
		align-items: center;
		gap: 14px;
	}

	.type-icon {
		width: 36px;
		height: 36px;
		border-radius: 8px;
		background: var(--color-bg-secondary, #f2f2f7);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.item-details {
		flex: 1;
		min-width: 0;
	}

	.item-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 6px;
	}

	.filename {
		font-size: 0.875rem;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 65%;
	}

	.status-badge {
		font-size: 0.75rem;
		display: flex;
		align-items: center;
		gap: 4px;
		color: var(--color-text-secondary);
	}

	.text-success {
		color: #34c759;
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.text-danger {
		color: #ff3b30;
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.progress-bar-bg {
		width: 100%;
		height: 4px;
		background: var(--color-bg-secondary, #e5e5ea);
		border-radius: 2px;
		overflow: hidden;
	}

	.progress-bar-fill {
		height: 100%;
		background: var(--color-primary);
		transition: width 0.2s ease;
	}

	.error-msg {
		margin: 4px 0 0 0;
		font-size: 0.75rem;
		color: #ff3b30;
	}

	.action-btn {
		background: transparent;
		border: none;
		cursor: pointer;
		color: var(--color-text-secondary);
		padding: 6px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.15s ease;
	}

	.action-btn:hover {
		background: var(--color-bg-secondary, #e5e5ea);
		color: var(--color-text);
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
