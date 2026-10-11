<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n';
	import { PRESET_ACCENT_COLORS, deriveThemeTokens } from '$lib/ui/tokens/colors';
	import Card from '$lib/ui/components/Card.svelte';
	import Button from '$lib/ui/components/Button.svelte';
	import Input from '$lib/ui/components/Input.svelte';
	import { ArrowLeft, Check } from '@lucide/svelte';

	let { form } = $props();

	let title = $state('');
	let description = $state('');
	let dateStart = $state('');
	let dateEnd = $state('');
	let locationName = $state('');
	let locationAddress = $state('');
	let selectedColor = $state<string>(PRESET_ACCENT_COLORS[0].hex);
	let playlistUrl = $state('');
	let maxCompanions = $state('0');
	let loading = $state(false);

	let derivedTokens = $derived(deriveThemeTokens(selectedColor));
</script>

<div class="new-event-page">
	<div class="header-nav">
		<a href="/dashboard" class="back-link">
			<Button variant="ghost" size="sm">
				<ArrowLeft size={16} />
				<span>Zurück</span>
			</Button>
		</a>
		<h1 class="page-title">{t('events.create')}</h1>
	</div>

	<form
		method="POST"
		use:enhance={() => {
			loading = true;
			return async ({ update }) => {
				loading = false;
				await update();
			};
		}}
		class="event-form"
	>
		{#if form?.error}
			<div class="form-error" role="alert">
				{form.error}
			</div>
		{/if}

		<Card title="Basis-Informationen">
			<Input
				label={t('events.title')}
				name="title"
				bind:value={title}
				required
				placeholder="z.B. Timos 30. Geburtstag 🎉"
			/>

			<div class="date-grid">
				<Input
					label="Beginn Datum & Uhrzeit"
					type="datetime-local"
					name="dateStart"
					bind:value={dateStart}
					required
				/>

				<Input label="Ende (optional)" type="datetime-local" name="dateEnd" bind:value={dateEnd} />
			</div>

			<div class="field">
				<label for="description" class="field-label">{t('events.description')}</label>
				<textarea
					id="description"
					name="description"
					bind:value={description}
					rows="4"
					class="textarea"
					placeholder="Infos zum Ablauf, Mitbringsel, Musikwünsche..."></textarea>
			</div>
		</Card>

		<Card title="Ort & Anfahrt">
			<Input
				label="Name des Ortes (z.B. Vereinsheim oder Timos Garten)"
				name="locationName"
				bind:value={locationName}
				placeholder="z.B. Bootshaus am See"
			/>

			<Input
				label="Adresse (für Kartendienste)"
				name="locationAddress"
				bind:value={locationAddress}
				placeholder="Musterstraße 12, 12345 Musterstadt"
			/>
		</Card>

		<Card title="Begleitpersonen">
			<Input
				label="Begleitpersonen pro Einladung"
				type="number"
				name="maxCompanions"
				bind:value={maxCompanions}
				hint="Diese Plätze werden Gästen fest zugeteilt. Gäste können die Anzahl nicht selbst ändern."
			/>
		</Card>

		<Card title="Musik-Playlist (optional)">
			<Input
				label="Link zur Playlist (Spotify oder YouTube Music)"
				name="playlistUrl"
				bind:value={playlistUrl}
				placeholder="https://open.spotify.com/playlist/... oder https://music.youtube.com/playlist?list=..."
				hint="💡 Tipp: Spotify-Playlists zeigen Gästen eine durchscrollbare Song-Liste. YouTube-Playlists zeigen den YouTube-Player mit Menü."
			/>
		</Card>

		<Card title={t('events.featuresTitle')} subtitle={t('events.featuresSubtitle')}>
			<div class="features-list">
				<label class="feature-item">
					<input type="checkbox" name="showWall" checked />
					<div class="feature-meta">
						<strong>{t('events.showWall')}</strong>
						<span>Nachrichten, Ankündigungen und Pinnwand-Beiträge.</span>
					</div>
				</label>

				<label class="feature-item">
					<input type="checkbox" name="showPolls" checked />
					<div class="feature-meta">
						<strong>{t('events.showPolls')}</strong>
						<span>Umfragen für gemeinsame Entscheidungen (Essen, Musik, etc.).</span>
					</div>
				</label>

				<label class="feature-item">
					<input type="checkbox" name="showPotluck" checked />
					<div class="feature-meta">
						<strong>{t('events.showPotluck')}</strong>
						<span>Mitbringliste für Speisen, Getränke und Snacks.</span>
					</div>
				</label>

				<label class="feature-item">
					<input type="checkbox" name="showGallery" checked />
					<div class="feature-meta">
						<strong>{t('events.showGallery')}</strong>
						<span>Gemeinsame Foto- und Video-Galerie für Gäste.</span>
					</div>
				</label>
			</div>
		</Card>

		<Card title="Design & Akzentfarbe">
			<p class="section-desc">
				Wähle eine Akzentfarbe für deine Einladung. Schriftfarben und Kontraste werden für maximale
				Lesbarkeit automatisch berechnet.
			</p>

			<div class="colors-grid">
				{#each PRESET_ACCENT_COLORS as preset}
					<button
						type="button"
						class="color-swatch {selectedColor === preset.hex ? 'active' : ''}"
						style:background-color={preset.hex}
						onclick={() => (selectedColor = preset.hex)}
						aria-label={preset.nameDe}
					>
						{#if selectedColor === preset.hex}
							<Check size={18} color={derivedTokens.accentContrast} />
						{/if}
					</button>
				{/each}
			</div>

			<input type="hidden" name="accentColor" value={selectedColor} />
		</Card>

		<div class="form-actions">
			<Button type="submit" variant="primary" size="lg" {loading}>
				Event erstellen & Einladungslink generieren
			</Button>
		</div>
	</form>
</div>

<style>
	.new-event-page {
		max-width: var(--max-content-width);
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}

	.header-nav {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.back-link {
		text-decoration: none;
	}

	.page-title {
		font-size: var(--text-2xl);
		font-weight: 700;
	}

	.event-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.form-error {
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		background-color: rgba(255, 59, 48, 0.12);
		color: var(--color-danger);
		font-size: var(--text-sm);
	}

	.date-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-3);
	}

	@media (min-width: 600px) {
		.date-grid {
			grid-template-columns: 1fr 1fr;
		}
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.field-label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--text-secondary);
	}

	.textarea {
		width: 100%;
		padding: var(--space-2) var(--space-3);
		font-family: inherit;
		font-size: 16px;
		color: var(--text-primary);
		background-color: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		outline: none;
		resize: vertical;
	}

	.textarea:focus {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-subtle);
	}

	.section-desc {
		font-size: var(--text-sm);
		color: var(--text-secondary);
		margin-bottom: var(--space-3);
	}

	.colors-grid {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.color-swatch {
		width: 44px;
		height: 44px;
		border-radius: var(--radius-full);
		border: 2px solid transparent;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: transform var(--duration-fast) var(--ease-spring);
	}

	.color-swatch:active {
		transform: scale(0.92);
	}

	.color-swatch.active {
		border-color: var(--text-primary);
		transform: scale(1.08);
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
		margin-top: var(--space-2);
	}

	.features-list {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: var(--space-3);
	}

	.feature-item {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-3);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		background-color: var(--bg-canvas);
		cursor: pointer;
		user-select: none;
	}

	.feature-item input[type='checkbox'] {
		margin-top: 3px;
		accent-color: var(--accent);
		width: 18px;
		height: 18px;
		cursor: pointer;
	}

	.feature-meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.feature-meta strong {
		font-size: var(--text-sm);
		color: var(--text-primary);
	}

	.feature-meta span {
		font-size: var(--text-xs);
		color: var(--text-secondary);
	}
</style>
