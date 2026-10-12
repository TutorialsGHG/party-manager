<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { formatDate, t } from '$lib/i18n';
	import { deriveThemeTokens } from '$lib/ui/tokens/colors';
	import Card from '$lib/ui/components/Card.svelte';
	import Button from '$lib/ui/components/Button.svelte';
	import Badge from '$lib/ui/components/Badge.svelte';
	import Input from '$lib/ui/components/Input.svelte';
	import Dialog from '$lib/ui/components/Dialog.svelte';
	import Countdown from '$lib/features/events/Countdown.svelte';
	import {
		ArrowLeft,
		Share2,
		Copy,
		Check,
		Calendar,
		MapPin,
		RefreshCw,
		Trash2,
		Download,
		Vote,
		Pin,
		Send,
		Plus,
		Tv,
		Music,
		ExternalLink
	} from '@lucide/svelte';
	import GalleryGrid from '$lib/features/gallery/GalleryGrid.svelte';
	import type { MediaItem } from '$lib/features/gallery/types';

	let { data, form } = $props();

	let copied = $state(false);
	let showDeleteDialog = $state(false);

	let showWall = $state(true);
	let showPolls = $state(true);
	let showPotluck = $state(true);
	let showGallery = $state(true);
	let showPlaylist = $state(true);
	$effect(() => {
		showWall = data.event.showWall !== false;
		showPolls = data.event.showPolls !== false;
		showPotluck = data.event.showPotluck !== false;
		showGallery = data.event.showGallery !== false;
		showPlaylist = data.event.showPlaylist !== false;
	});

	let newPotluckTitle = $state('');
	let playlistUrl = $state('');
	$effect(() => {
		playlistUrl = data.event.playlistUrl || '';
	});
	let potluckItems = $derived(data.potluckItems || []);

	let themeTokens = $derived(deriveThemeTokens(data.event.accentColor));

	// Determine current active invite link
	let currentToken = $derived(form?.newToken || (data.event as any).token || '');
	let inviteUrl = $derived(currentToken ? `${data.baseUrl}/e/${currentToken}` : '');

	async function copyLink() {
		if (inviteUrl) {
			await navigator.clipboard.writeText(inviteUrl);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		}
	}

	async function shareLink() {
		if (navigator.share && inviteUrl) {
			try {
				await navigator.share({
					title: data.event.title,
					text: `Du bist eingeladen: ${data.event.title}`,
					url: inviteUrl
				});
			} catch {
				// Fallback to copy
				copyLink();
			}
		} else {
			copyLink();
		}
	}

	let mediaItems = $state<MediaItem[]>([]);
	let wallPosts = $state<any[]>([]);
	let polls = $state<any[]>([]);
	let pollOptionCount = $state(2);
	let maxCompanions = $state('0');
	$effect(() => {
		mediaItems = data.mediaItems || [];
		wallPosts = data.wallPosts || [];
		polls = data.polls || [];
		maxCompanions = String(data.event.maxCompanions);
	});

	async function handleDeleteMedia(item: MediaItem) {
		const res = await fetch(`/api/media/${item.id}`, {
			method: 'DELETE'
		});
		if (res.ok) {
			mediaItems = mediaItems.filter((m) => m.id !== item.id);
		} else {
			alert('Löschen fehlgeschlagen.');
		}
	}

	function downloadIcs() {
		window.location.href = `/events/${data.event.id}/ics`;
	}

	onMount(() => {
		const source = new EventSource(`/api/events/${data.event.id}/sse`);
		const refresh = () => void invalidateAll();
		for (const eventName of [
			'rsvp:update',
			'poll:vote',
			'poll:update',
			'media:new',
			'media:delete'
		]) {
			source.addEventListener(eventName, refresh);
		}
		return () => source.close();
	});
</script>

<div
	class="manage-page"
	style:--accent={themeTokens.accent}
	style:--accent-contrast={themeTokens.accentContrast}
>
	<div class="header-nav">
		<a href="/dashboard" class="back-link">
			<Button variant="ghost" size="sm">
				<ArrowLeft size={16} />
				<span>Zur Übersicht</span>
			</Button>
		</a>

		<div class="event-status-wrap">
			<Badge variant="accent">Host-Ansicht</Badge>
		</div>
	</div>

	<div class="hero-card" style:border-top-color={data.event.accentColor}>
		<div class="hero-content">
			<span class="date-badge">
				{formatDate(data.event.dateStart, { dateStyle: 'full', timeStyle: 'short' })}
			</span>
			<h1 class="hero-title">{data.event.title}</h1>

			{#if data.event.locationName || data.event.locationAddress}
				<div class="loc-row">
					<MapPin size={16} />
					<span
						>{[data.event.locationName, data.event.locationAddress]
							.filter(Boolean)
							.join(' • ')}</span
					>
				</div>
			{/if}
		</div>

		<div class="countdown-wrap">
			<Countdown targetDate={data.event.dateStart} />
		</div>
	</div>

	<!-- Share & Invite Link Section -->
	<Card
		title="Einladungs-Link"
		subtitle="Teile diesen geheimen Link mit deinen Gästen. Sie können ohne Registrierung öffnen und antworten."
	>
		<div class="share-box">
			{#if inviteUrl}
				<div class="link-display">
					<code>{inviteUrl}</code>
				</div>
			{:else}
				<p class="regenerate-notice">
					Der Einladungslink wurde aus Sicherheitsgründen ausgeblendet. Klicke unten auf "Neuen Link
					generieren", um einen neuen 128-Bit Einladungslink zu erzeugen.
				</p>
			{/if}

			<div class="share-actions">
				{#if inviteUrl}
					<Button variant="primary" onclick={shareLink}>
						<Share2 size={16} />
						<span>Teilen</span>
					</Button>

					<Button variant="secondary" onclick={copyLink}>
						{#if copied}
							<Check size={16} />
							<span>Kopiert!</span>
						{:else}
							<Copy size={16} />
							<span>Link kopieren</span>
						{/if}
					</Button>
				{/if}

				<Button variant="secondary" onclick={downloadIcs}>
					<Calendar size={16} />
					<span>.ics Kalender</span>
				</Button>

				<a href={`/events/${data.event.id}/live`} class="party-mode-launch-link">
					<Tv size={16} />
					<span>Party-Modus (Bar / Beamer)</span>
				</a>
			</div>
		</div>
	</Card>

	<!-- Gäste-Funktionen & Reiter (Prominent platziert) -->
	<Card title={t('events.featuresTitle')} subtitle={t('events.featuresSubtitle')}>
		<form action="?/updateFeatures" method="POST" use:enhance class="host-form">
			<div class="features-toggles-grid">
				<label class="feature-toggle-item">
					<input type="checkbox" name="showWall" bind:checked={showWall} />
					<div class="toggle-text">
						<strong>{t('events.showWall')}</strong>
						<span>Nachrichten, Ankündigungen und Pinnwand-Beiträge erlauben.</span>
					</div>
				</label>

				<label class="feature-toggle-item">
					<input type="checkbox" name="showPolls" bind:checked={showPolls} />
					<div class="toggle-text">
						<strong>{t('events.showPolls')}</strong>
						<span>Umfragen für gemeinsame Entscheidungen (z. B. Essen, Musik) bereitstellen.</span>
					</div>
				</label>

				<label class="feature-toggle-item">
					<input type="checkbox" name="showPotluck" bind:checked={showPotluck} />
					<div class="toggle-text">
						<strong>{t('events.showPotluck')}</strong>
						<span>Mitbringliste für Speisen, Getränke und Mitbringsel aktivieren.</span>
					</div>
				</label>

				<label class="feature-toggle-item">
					<input type="checkbox" name="showGallery" bind:checked={showGallery} />
					<div class="toggle-text">
						<strong>{t('events.showGallery')}</strong>
						<span>Gemeinsame Foto- und Video-Galerie für Gäste aktivieren.</span>
					</div>
				</label>

				<label class="feature-toggle-item">
					<input type="checkbox" name="showPlaylist" bind:checked={showPlaylist} />
					<div class="toggle-text">
						<strong>{t('events.showPlaylist')}</strong>
						<span>Playlist-Reiter für Gäste ein- oder ausblenden.</span>
					</div>
				</label>
			</div>

			<div class="host-form-actions">
				<Button type="submit" variant="primary">Funktionen speichern</Button>
			</div>
		</form>
	</Card>

	<!-- RSVP Summary Section -->
	<Card
		title="Rückmeldungen ({data.rsvp.totalAttending} Gäste)"
		subtitle="Übersicht aller Zu- und Absagen"
	>
		<div class="rsvp-stats-grid">
			<div class="stat-card yes">
				<span class="stat-num">{data.rsvp.totalAttending}</span>
				<span class="stat-label">Zusagen</span>
			</div>

			<div class="stat-card maybe">
				<span class="stat-num">{data.rsvp.maybeCount}</span>
				<span class="stat-label">Vielleicht</span>
			</div>

			<div class="stat-card no">
				<span class="stat-num">{data.rsvp.noCount}</span>
				<span class="stat-label">Absagen</span>
			</div>
		</div>

		{#if data.rsvp.attendees.length > 0}
			<div class="attendees-list">
				<h4 class="list-title">Zusagen im Detail:</h4>
				{#each data.rsvp.attendees as att}
					<div class="attendee-row">
						<span class="guest-name">{att.name}</span>
						{#if att.companionCount > 0}
							<span
								class="companion-badge"
								title={att.companionNames.length > 0
									? att.companionNames.join(', ')
									: 'Name wird beim Begleitlink hinterlegt'}
							>
								<Badge variant="neutral">+{att.companionCount} Begleitung</Badge>
							</span>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</Card>

	<Card title="Ankündigungen" subtitle="Nur für Gäste, die zugesagt haben.">
		<form action="?/sendAnnouncement" method="POST" use:enhance class="host-form">
			<label class="sr-only" for="announcement">Neue Ankündigung</label>
			<textarea
				id="announcement"
				name="content"
				class="host-textarea"
				rows="2"
				maxlength="500"
				placeholder="Bitte Getränke bis Freitag mitbringen..."></textarea>
			<Button type="submit" size="sm">An alle Zusagen senden</Button>
		</form>

		{#if data.announcements.length === 0}
			<p class="empty-hint">Noch keine Ankündigungen versendet.</p>
		{:else}
			<div class="host-items">
				{#each data.announcements as announcement (announcement.id)}
					<article class="host-item">
						<p>{announcement.content}</p>
						<form action="?/deleteAnnouncement" method="POST" use:enhance>
							<input type="hidden" name="announcementId" value={announcement.id} />
							<Button type="submit" variant="ghost" size="sm">
								<Trash2 size={16} />
								<span class="sr-only">Ankündigung löschen</span>
							</Button>
						</form>
					</article>
				{/each}
			</div>
		{/if}
	</Card>

	<Card
		title="Teilnehmende ({data.guestOverview.length})"
		subtitle="Alle, die die Einladung geöffnet haben — auch ohne Rückmeldung."
	>
		{#if data.guestOverview.length === 0}
			<p class="empty-hint">Noch hat niemand die Einladung geöffnet.</p>
		{:else}
			<div class="attendees-list">
				{#each data.guestOverview as guest (guest.guestId)}
					<div class="attendee-row">
						<div class="overview-main">
							<span class="guest-name">{guest.name}</span>
							{#if guest.isHost}
								<Badge variant="neutral">Host</Badge>
							{:else if guest.isCompanion}
								<Badge variant="neutral">Begleitung</Badge>
							{/if}
							{#if guest.status === 'yes'}
								<Badge variant="success">Zusage</Badge>
							{:else if guest.status === 'maybe'}
								<Badge variant="neutral">Vielleicht</Badge>
							{:else if guest.status === 'no'}
								<Badge variant="danger">Absage</Badge>
							{:else}
								<Badge variant="neutral">Ohne Rückmeldung</Badge>
							{/if}
						</div>
						<div class="overview-meta">
							{#if guest.companionCount > 0}
								<span class="meta-chip" title={guest.companionNames.join(', ')}>
									+{guest.companionCount}
								</span>
							{/if}
							{#if guest.wallPostCount > 0}
								<span class="meta-chip" title="Beiträge auf der Pinnwand">
									✎ {guest.wallPostCount}
								</span>
							{/if}
							{#if guest.uploadCount > 0}
								<span class="meta-chip" title="Hochgeladene Fotos und Videos">
									⬆ {guest.uploadCount}
								</span>
							{/if}
						</div>
					</div>
					{#if guest.notes}
						<p class="guest-note">{guest.notes}</p>
					{/if}
				{/each}
			</div>
		{/if}
	</Card>

	<Card
		title="Pinnwand"
		subtitle="Veröffentliche Ankündigungen und moderiere Nachrichten deiner Gäste."
	>
		<form action="?/addWallPost" method="POST" use:enhance class="host-form">
			<label class="sr-only" for="wall-post">Neue Nachricht</label>
			<textarea
				id="wall-post"
				name="content"
				class="host-textarea"
				rows="3"
				maxlength="2000"
				placeholder="Neue Ankündigung für deine Gäste …"
				required></textarea>
			<div class="host-form-actions">
				<Button type="submit" variant="primary">
					<Send size={16} />
					<span>Veröffentlichen</span>
				</Button>
			</div>
		</form>

		{#if wallPosts.length === 0}
			<p class="empty-text">Noch keine Beiträge auf der Pinnwand.</p>
		{:else}
			<div class="host-items">
				{#each wallPosts as post}
					<article class="host-item" class:pinned={post.isPinned}>
						<div>
							<strong>{post.authorName}</strong>
							<p>{post.content}</p>
						</div>
						<div class="item-actions">
							<form action="?/toggleWallPostPin" method="POST" use:enhance>
								<input type="hidden" name="postId" value={post.id} />
								<Button type="submit" variant="secondary" size="sm">
									<Pin size={14} />
									<span>{post.isPinned ? 'Lösen' : 'Anpinnen'}</span>
								</Button>
							</form>
							<form action="?/deleteWallPost" method="POST" use:enhance>
								<input type="hidden" name="postId" value={post.id} />
								<Button type="submit" variant="danger" size="sm">Löschen</Button>
							</form>
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</Card>

	<Card
		title="Umfragen"
		subtitle="Erstelle Fragen, die Gäste direkt über ihren Einladungslink beantworten können."
	>
		<form action="?/createPoll" method="POST" use:enhance class="host-form">
			<label class="field-label" for="poll-question">Frage</label>
			<input
				id="poll-question"
				name="question"
				class="host-input"
				maxlength="300"
				placeholder="z. B. Was sollen wir essen?"
				required
			/>
			{#each Array(pollOptionCount) as _, index}
				<label class="sr-only" for={`poll-option-${index}`}>Option {index + 1}</label>
				<input
					id={`poll-option-${index}`}
					name="option"
					class="host-input"
					maxlength="100"
					placeholder={`Option ${index + 1}`}
					required={index < 2}
				/>
			{/each}
			{#if pollOptionCount < 10}
				<Button type="button" variant="secondary" size="sm" onclick={() => (pollOptionCount += 1)}>
					<Plus size={14} />
					<span>Option hinzufügen</span>
				</Button>
			{/if}
			<label class="check-label"
				><input type="checkbox" name="isMultiple" /> Mehrere Antworten erlauben</label
			>
			<label class="check-label"
				><input type="checkbox" name="allowGuestOptions" /> Gäste dürfen Optionen ergänzen</label
			>
			<div class="host-form-actions">
				<Button type="submit" variant="primary">
					<Vote size={16} />
					<span>Umfrage erstellen</span>
				</Button>
			</div>
		</form>

		{#if polls.length === 0}
			<p class="empty-text">Noch keine Umfragen erstellt.</p>
		{:else}
			<div class="host-items">
				{#each polls as poll}
					<article class="host-item">
						<div>
							<strong>{poll.question}</strong>
							<p>
								{poll.totalVotes} Stimme{poll.totalVotes === 1 ? '' : 'n'} · {poll.isClosed
									? 'Geschlossen'
									: 'Offen'}
							</p>
							<ul class="poll-results" aria-label="Aktueller Stand">
								{#each poll.options as option}
									<li>{option.text}: {option.voteCount}</li>
								{/each}
							</ul>
						</div>
						<form action="?/togglePoll" method="POST" use:enhance>
							<input type="hidden" name="pollId" value={poll.id} />
							<Button type="submit" variant="secondary" size="sm"
								>{poll.isClosed ? 'Öffnen' : 'Schließen'}</Button
							>
						</form>
					</article>
				{/each}
			</div>
		{/if}
	</Card>

	<!-- Media Gallery Card -->
	<Card
		title="Fotos & Videos ({mediaItems.length})"
		subtitle="Alle geteilten Erinnerungen dieses Events"
	>
		<GalleryGrid
			bind:items={mediaItems}
			eventId={data.event.id}
			canDelete={() => true}
			onDelete={handleDeleteMedia}
			onUploadComplete={() => {
				// Uploaded as host
			}}
		/>
		{#if mediaItems.some((item) => item.status === 'ready')}
			<div class="gallery-download-bar">
				<a href={`/events/${data.event.id}/gallery/zip`} class="zip-download-button" download>
					<Download size={16} />
					<span>Alle Medien herunterladen (.zip)</span>
				</a>
			</div>
		{/if}
		{#if mediaItems.some((item) => item.status === 'failed')}
			<form action="?/retryFailedMedia" method="POST" use:enhance class="retry-media-form">
				<p>Mindestens ein Video konnte nicht verarbeitet werden.</p>
				<Button type="submit" variant="secondary">Fehlgeschlagene Medien erneut verarbeiten</Button>
			</form>
		{/if}
	</Card>

	<Card
		title="Begleitpersonen"
		subtitle="Lege fest, wie viele Begleitplätze jeder Hauptgast einladen darf."
	>
		<form action="?/updateMaxCompanions" method="POST" use:enhance class="host-form">
			<Input
				label="Begleitplätze pro Einladung"
				type="number"
				name="maxCompanions"
				bind:value={maxCompanions}
				hint="Bei einer Zusage erscheint Gästen ein persönlicher Link für ihre Begleitpersonen."
			/>
			<div class="host-form-actions">
				<Button type="submit" variant="primary">Begleitplätze speichern</Button>
			</div>
		</form>
	</Card>

	<!-- Potluck List Card -->
	<Card
		title="Mitbringliste ({potluckItems.length})"
		subtitle="Behalte im Überblick, wer was mitbringt, und füge Wünsche hinzu."
	>
		<form
			action="?/addPotluckItem"
			method="POST"
			use:enhance={() => {
				return async ({ update }) => {
					newPotluckTitle = '';
					await update();
				};
			}}
			class="host-inline-form"
		>
			<input
				name="title"
				bind:value={newPotluckTitle}
				class="host-input"
				placeholder="Z. B. Baguette, Kasten Bier, Eiswürfel..."
				required
			/>
			<Button type="submit" variant="primary">
				<Plus size={16} />
				<span>Hinzufügen</span>
			</Button>
		</form>

		{#if potluckItems.length === 0}
			<p class="empty-text">Noch keine Einträge auf der Mitbringliste.</p>
		{:else}
			<div class="potluck-host-items">
				{#each potluckItems as item (item.id)}
					<div class="potluck-host-row">
						<div class="potluck-host-info">
							<strong>{item.title}</strong>
							{#if item.claimedByGuestId}
								<span class="claim-tag claimed">
									<Check size={12} /> Mitgebracht von: {item.claimedByName || 'Gast'}
								</span>
							{:else}
								<span class="claim-tag open">Noch offen</span>
							{/if}
						</div>
						<div class="potluck-host-actions">
							{#if item.claimedByGuestId}
								<form action="?/unclaimPotluckItem" method="POST" use:enhance>
									<input type="hidden" name="itemId" value={item.id} />
									<Button type="submit" variant="secondary" size="sm">Freigeben</Button>
								</form>
							{/if}
							<form action="?/deletePotluckItem" method="POST" use:enhance>
								<input type="hidden" name="itemId" value={item.id} />
								<button type="submit" class="host-delete-btn" title="Löschen">
									<Trash2 size={14} />
								</button>
							</form>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</Card>
	<!-- Party Playlist Card -->
	<Card
		title="Musik-Playlist"
		subtitle="Hinterlege einen Link zu einer Spotify oder YouTube Music Playlist für Gäste und den Bar-PC."
	>
		<form action="?/updatePlaylistUrl" method="POST" use:enhance class="host-form">
			<Input
				label="Playlist-Link (Spotify oder YouTube Music)"
				name="playlistUrl"
				bind:value={playlistUrl}
				placeholder="https://open.spotify.com/playlist/... oder https://music.youtube.com/playlist?list=..."
				hint="💡 Tipp: Spotify-Playlists zeigen Gästen eine durchscrollbare Song-Liste. YouTube-Playlists zeigen den YouTube-Player mit Menü."
			/>
			<div class="host-form-actions">
				<Button type="submit" variant="primary">Playlist-Link speichern</Button>
				{#if data.event.playlistUrl}
					<a
						href={data.event.playlistUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="playlist-link-btn"
					>
						<Music size={14} />
						<span>Playlist testen</span>
						<ExternalLink size={14} />
					</a>
				{/if}
			</div>
		</form>
	</Card>

	<!-- Danger Zone & Management -->
	<Card title="Sicherheit & Verwaltung">
		<div class="danger-actions">
			<form action="?/regenerateToken" method="POST" use:enhance>
				<Button type="submit" variant="secondary">
					<RefreshCw size={16} />
					<span>Neuen Einladungslink generieren (alter wird ungültig)</span>
				</Button>
			</form>

			<Button variant="danger" onclick={() => (showDeleteDialog = true)}>
				<Trash2 size={16} />
				<span>Event unwiderruflich löschen (Crypto-Shredding)</span>
			</Button>
		</div>
	</Card>
</div>

<!-- Delete Confirmation Dialog -->
<Dialog
	bind:open={showDeleteDialog}
	title="Event wirklich löschen?"
	onclose={() => (showDeleteDialog = false)}
>
	<p class="dialog-p">
		Möchtest du <strong>{data.event.title}</strong> wirklich löschen?
	</p>
	<p class="dialog-warning">
		<strong>Echte Löschgarantie (Crypto-Shredding):</strong> Der Event-Schlüssel wird sofort vernichtet.
		Sämtliche Chats, RSVPs und Fotos werden mathematisch unlesbar und unwiderruflich gelöscht.
	</p>

	{#snippet actions()}
		<Button variant="secondary" onclick={() => (showDeleteDialog = false)}>Abbrechen</Button>
		<form action="?/deleteEvent" method="POST" use:enhance>
			<Button type="submit" variant="danger">Endgültig vernichten</Button>
		</form>
	{/snippet}
</Dialog>

<style>
	.manage-page {
		max-width: var(--max-content-width);
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}

	.header-nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.back-link {
		text-decoration: none;
	}

	.hero-card {
		background: var(--bg-surface);
		border-radius: var(--radius-xl);
		border: 1px solid var(--border-subtle);
		border-top: 6px solid var(--accent);
		padding: var(--space-6);
		box-shadow: var(--shadow-sm);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.hero-content {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.date-badge {
		font-size: var(--text-xs);
		font-weight: 700;
		color: var(--accent);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.hero-title {
		font-size: var(--text-2xl);
		font-weight: 800;
		line-height: 1.2;
		color: var(--text-primary);
	}

	.loc-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.countdown-wrap {
		display: flex;
		justify-content: center;
		padding-top: var(--space-2);
	}

	.share-box {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.link-display {
		background-color: var(--bg-canvas);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		border: 1px solid var(--border-subtle);
		overflow-x: auto;
	}

	.link-display code {
		font-family: var(--font-family-mono);
		font-size: var(--text-sm);
		color: var(--text-primary);
	}

	.regenerate-notice {
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.share-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.rsvp-stats-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--space-3);
		text-align: center;
	}

	.stat-card {
		padding: var(--space-3);
		border-radius: var(--radius-md);
		background-color: var(--bg-canvas);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.stat-card.yes .stat-num {
		color: var(--color-success);
	}
	.stat-card.maybe .stat-num {
		color: var(--color-warning);
	}
	.stat-card.no .stat-num {
		color: var(--text-tertiary);
	}

	.stat-num {
		font-size: var(--text-2xl);
		font-weight: 700;
	}

	.stat-label {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-secondary);
	}

	.attendees-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding-top: var(--space-2);
		border-top: 1px solid var(--border-subtle);
	}

	.list-title {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text-secondary);
	}

	.attendee-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-2);
		background-color: var(--bg-canvas);
		border-radius: var(--radius-sm);
	}

	.companion-badge {
		cursor: help;
	}

	.overview-main {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
		min-width: 0;
	}

	.overview-meta {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-shrink: 0;
	}

	.meta-chip {
		font-size: var(--text-xs);
		color: var(--text-secondary);
		background-color: var(--bg-surface-elevated);
		border-radius: var(--radius-sm);
		padding: 2px var(--space-2);
		cursor: help;
		white-space: nowrap;
	}

	.empty-hint {
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	.guest-note {
		margin: var(--space-1) 0 0;
		padding-left: var(--space-3);
		border-left: 2px solid var(--accent-subtle);
		color: var(--text-secondary);
		font-size: var(--text-sm);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.host-form,
	.host-items {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.host-form {
		margin-bottom: var(--space-4);
	}

	.features-toggles-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: var(--space-3);
		margin-bottom: var(--space-2);
	}

	.feature-toggle-item {
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

	.feature-toggle-item input[type='checkbox'] {
		margin-top: 3px;
		accent-color: var(--accent);
		width: 18px;
		height: 18px;
		cursor: pointer;
	}

	.toggle-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.toggle-text strong {
		font-size: var(--text-sm);
		color: var(--text-primary);
	}

	.toggle-text span {
		font-size: var(--text-xs);
		color: var(--text-secondary);
	}

	.host-textarea,
	.host-input {
		width: 100%;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		background: var(--bg-canvas);
		color: var(--text-primary);
		font: inherit;
		padding: var(--space-2) var(--space-3);
	}

	.host-textarea:focus,
	.host-input:focus {
		border-color: var(--accent);
		outline: none;
		box-shadow: 0 0 0 3px var(--accent-subtle);
	}

	.host-textarea {
		resize: vertical;
	}

	.host-form-actions,
	.item-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.retry-media-form {
		margin-top: var(--space-3);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.check-label {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	.host-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		background: var(--bg-canvas);
		padding: var(--space-3);
	}

	.host-item.pinned {
		border-color: var(--accent);
		background: var(--accent-subtle);
	}

	.host-item p {
		margin-top: var(--space-1);
		color: var(--text-secondary);
		font-size: var(--text-sm);
		white-space: pre-wrap;
	}

	.poll-results {
		margin: var(--space-2) 0 0;
		padding-left: var(--space-4);
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	@media (max-width: 480px) {
		.host-item {
			align-items: flex-start;
			flex-direction: column;
		}
	}

	.guest-name {
		font-size: var(--text-sm);
		font-weight: 500;
	}

	.danger-actions {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.dialog-p {
		font-size: var(--text-base);
		color: var(--text-primary);
	}

	.dialog-warning {
		font-size: var(--text-sm);
		color: var(--color-danger);
		background: rgba(255, 59, 48, 0.08);
		padding: var(--space-3);
		border-radius: var(--radius-md);
		line-height: 1.4;
	}

	.gallery-download-bar {
		margin-top: var(--space-4);
		display: flex;
		justify-content: flex-end;
	}

	.zip-download-button {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		background: var(--bg-surface-elevated, var(--bg-surface));
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		color: var(--text-primary);
		font-size: var(--text-sm);
		font-weight: 500;
		text-decoration: none;
		transition:
			background var(--transition-fast),
			border-color var(--transition-fast);
	}

	.zip-download-button:hover {
		border-color: var(--border-medium, var(--text-muted));
	}

	.party-mode-launch-link {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		background-color: var(--accent);
		color: #ffffff;
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		font-weight: 600;
		text-decoration: none;
		transition: opacity var(--transition-fast);
	}

	.party-mode-launch-link:hover {
		opacity: 0.9;
	}

	.host-inline-form {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
	}

	.potluck-host-items {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.potluck-host-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-2) var(--space-3);
		background: var(--bg-surface-elevated, var(--bg-surface));
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		gap: var(--space-3);
	}

	.potluck-host-info {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.claim-tag {
		font-size: var(--text-xs);
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}

	.claim-tag.claimed {
		color: var(--accent);
		font-weight: 500;
	}

	.claim-tag.open {
		color: var(--text-secondary);
	}

	.potluck-host-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.host-delete-btn {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text-secondary);
		padding: var(--space-1);
		display: inline-flex;
		align-items: center;
		transition: color var(--transition-fast);
	}

	.host-delete-btn:hover {
		color: var(--color-danger);
	}

	.playlist-link-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		color: var(--accent);
		text-decoration: none;
		font-weight: 600;
	}
</style>
