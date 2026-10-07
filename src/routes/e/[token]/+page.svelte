<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onMount, untrack } from 'svelte';
	import { t, formatDate } from '$lib/i18n';
	import { deriveThemeTokens } from '$lib/ui/tokens/colors';
	import { getAppleMapsUrl, getOsmUrl, getGoogleMapsUrl } from '$lib/features/events/maps';
	import Card from '$lib/ui/components/Card.svelte';
	import Button from '$lib/ui/components/Button.svelte';
	import Input from '$lib/ui/components/Input.svelte';
	import Badge from '$lib/ui/components/Badge.svelte';
	import Sheet from '$lib/ui/components/Sheet.svelte';
	import Countdown from '$lib/features/events/Countdown.svelte';
	import {
		Calendar,
		Users,
		Check,
		HelpCircle,
		X,
		ExternalLink,
		UserCheck,
		MessageSquare,
		Vote,
		Pin,
		Trash2,
		Send,
		Plus,
		Camera,
		Share2,
		Copy
	} from '@lucide/svelte';
	import GalleryGrid from '$lib/features/gallery/GalleryGrid.svelte';
	import type { MediaItem } from '$lib/features/gallery/types';

	let { data, form } = $props();

	let activeTab = $state<'info' | 'wall' | 'polls' | 'gallery'>('info');

	let guestName = $state('');
	let showNameSheet = $state(false);

	// RSVP state
	let rsvpStatus = $state<'yes' | 'maybe' | 'no'>('yes');
	let companionCount = $state(0);
	let companionNames = $state('');
	let companionLinkCopied = $state(false);
	let lastCompanionToken = $state<string | null>(null);
	let existingCompanionToken = $derived(
		(data.companionInvites as any[])?.find((i: any) => i.token)?.token || null
	);
	let activeCompanionToken = $derived(
		lastCompanionToken || form?.companionToken || existingCompanionToken
	);
	let notes = $state('');
	let isSubmitting = $state(false);
	let showRsvpEditor = $state(false);

	// Wall state
	let newPostText = $state('');
	let isPosting = $state(false);
	let posts = $state<any[]>([]);
	let announcements = $state<any[]>([]);

	// Polls state
	let polls = $state<any[]>([]);
	let newOptionText = $state<Record<string, string>>({});

	// Gallery state
	let mediaList = $state<MediaItem[]>([]);

	$effect(() => {
		if (data.currentGuest) {
			guestName = data.currentGuest.name;
			showNameSheet = false;
		} else {
			showNameSheet = true;
		}

		if (data.rsvp) {
			rsvpStatus = data.rsvp.status;
			companionCount = data.rsvp.companionCount;
			companionNames = data.rsvp.companionNames || '';
			notes = data.rsvp.notes || '';
		}
		showRsvpEditor = !data.rsvp;

		posts = data.wallPosts || [];
		announcements = data.announcements || [];
		polls = data.polls || [];
		// Wrap in untrack so reading/writing newOptionText doesn't create a reactive
		// dependency that would cause this $effect to loop infinitely.
		untrack(() => {
			for (const poll of polls) {
				if (newOptionText[poll.id] === undefined) {
					newOptionText[poll.id] = '';
				}
			}
		});
		mediaList = data.mediaItems || [];
	});

	async function handleDeleteMedia(item: MediaItem) {
		const res = await fetch(`/api/media/${item.id}`, {
			method: 'DELETE',
			headers: {
				'X-Guest-Token': data.deviceToken || ''
			}
		});
		if (res.ok) {
			mediaList = mediaList.filter((m) => m.id !== item.id);
		} else {
			alert('Löschen fehlgeschlagen.');
		}
	}

	// Connect to SSE stream for live updates
	onMount(() => {
		const eventSource = new EventSource(`/api/events/${data.event.id}/sse`);

		eventSource.addEventListener('wall:new', (e) => {
			const newPost = JSON.parse(e.data);
			if (!posts.some((p) => p.id === newPost.id)) {
				posts = [newPost, ...posts];
			}
		});

		eventSource.addEventListener('announcement:new', (e) => {
			const announcement = JSON.parse(e.data);
			if (!announcements.some((a) => a.id === announcement.id)) {
				announcements = [announcement, ...announcements];
			}
		});

		eventSource.addEventListener('announcement:delete', (e) => {
			const { announcementId } = JSON.parse(e.data);
			announcements = announcements.filter((a) => a.id !== announcementId);
		});

		eventSource.addEventListener('wall:delete', (e) => {
			const { postId } = JSON.parse(e.data);
			posts = posts.filter((p) => p.id !== postId);
		});

		// The host pinning a post broadcasts 'wall:update' (src/routes/(app)/events/
		// [id]/+page.server.ts -> toggleWallPostPin). Without this listener the guest
		// keeps the pre-pin state until a full page reload: the rendered markup is
		// correct either way, which is exactly why the missing subscription stayed
		// unnoticed. Re-sort locally instead of invalidating, so a pin does not refetch
		// the whole page - and match the repository order (is_pinned DESC, created_at DESC).
		//
		// The payload carries the ABSOLUTE isPinned state, not just the id. A client that
		// blindly toggled its own copy would, after a single lost event, flip the wrong
		// way and stay inverted until something unrelated triggered a reload. Assigning the
		// authoritative value makes a replayed or out-of-order event converge instead.
		eventSource.addEventListener('wall:update', (e) => {
			const { postId, isPinned } = JSON.parse(e.data);
			posts = posts.map((p) => (p.id === postId ? { ...p, isPinned: !!isPinned } : p));
			posts = [...posts].sort((a, b) => {
				if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
				return b.createdAt - a.createdAt;
			});
		});

		const refreshPolls = () => void invalidateAll();
		eventSource.addEventListener('poll:vote', refreshPolls);
		eventSource.addEventListener('poll:update', refreshPolls);
		eventSource.addEventListener('rsvp:update', () => void invalidateAll());
		eventSource.addEventListener('event:companions', () => void invalidateAll());

		eventSource.addEventListener('media:new', (e) => {
			const newMedia = JSON.parse(e.data);
			if (!mediaList.some((m) => m.id === newMedia.id)) {
				mediaList = [newMedia, ...mediaList];
			}
		});

		eventSource.addEventListener('media:delete', (e) => {
			const { mediaId } = JSON.parse(e.data);
			mediaList = mediaList.filter((m) => m.id !== mediaId);
		});

		return () => {
			eventSource.close();
		};
	});

	async function copyToClipboard(text: string): Promise<boolean> {
		if (!text || typeof window === 'undefined') return false;

		if (navigator?.clipboard?.writeText) {
			try {
				await navigator.clipboard.writeText(text);
				return true;
			} catch (err) {
				console.warn('navigator.clipboard.writeText failed, using fallback:', err);
			}
		}

		try {
			const textArea = document.createElement('textarea');
			textArea.value = text;
			textArea.style.position = 'fixed';
			textArea.style.left = '-9999px';
			textArea.style.top = '-9999px';
			textArea.style.opacity = '0';
			textArea.setAttribute('readonly', '');
			document.body.appendChild(textArea);
			textArea.focus();
			textArea.select();
			textArea.setSelectionRange(0, 99999);
			const successful = document.execCommand('copy');
			document.body.removeChild(textArea);
			return successful;
		} catch (err) {
			console.error('execCommand copy failed:', err);
			return false;
		}
	}

	async function copyCompanionLink(companionToken?: string) {
		const token = companionToken || activeCompanionToken;
		if (!token || typeof window === 'undefined') return;
		const url = `${window.location.origin}/e/${data.inviteToken}?companion=${token}`;
		const success = await copyToClipboard(url);
		if (success) {
			companionLinkCopied = true;
			window.setTimeout(() => (companionLinkCopied = false), 2500);
		}
	}

	let themeTokens = $derived(deriveThemeTokens(data.event.accentColor));
	let mapQuery = $derived(
		[data.event.locationName, data.event.locationAddress].filter(Boolean).join(', ')
	);
</script>

<svelte:head>
	<title>{data.event.title}</title>
	<meta name="robots" content="noindex, nofollow, noarchive" />
</svelte:head>

<div
	class="guest-page"
	style:--accent={themeTokens.accent}
	style:--accent-hover={themeTokens.accentHover}
	style:--accent-active={themeTokens.accentActive}
	style:--accent-contrast={themeTokens.accentContrast}
	style:--accent-subtle={themeTokens.accentSubtle}
	style:--accent-border={themeTokens.accentBorder}
>
	<header class="event-hero">
		<div class="hero-card">
			<div class="date-chip">
				<Calendar size={14} />
				<span>{formatDate(data.event.dateStart, { dateStyle: 'full', timeStyle: 'short' })}</span>
			</div>

			<h1 class="event-title">{data.event.title}</h1>

			{#if data.event.description}
				<p class="event-desc">{data.event.description}</p>
			{/if}

			<div class="countdown-section">
				<Countdown targetDate={data.event.dateStart} />
			</div>
		</div>
	</header>

	<!-- Segmented Navigation Bar -->
	<nav class="tabs-nav" aria-label="Event-Navigation">
		<button
			type="button"
			class="tab-btn {activeTab === 'info' ? 'active' : ''}"
			onclick={() => (activeTab = 'info')}
		>
			<Users size={16} />
			<span>Infos & RSVP</span>
		</button>

		<button
			type="button"
			class="tab-btn {activeTab === 'wall' ? 'active' : ''}"
			onclick={() => (activeTab = 'wall')}
		>
			<MessageSquare size={16} />
			<span>Pinnwand</span>
			{#if posts.length > 0}
				<span class="tab-badge">{posts.length}</span>
			{/if}
		</button>

		<button
			type="button"
			class="tab-btn {activeTab === 'polls' ? 'active' : ''}"
			onclick={() => (activeTab = 'polls')}
			onpointerdown={() => (activeTab = 'polls')}
		>
			<Vote size={16} />
			<span>Umfragen</span>
			{#if polls.length > 0}
				<span class="tab-badge">{polls.length}</span>
			{/if}
		</button>

		<button
			type="button"
			class="tab-btn {activeTab === 'gallery' ? 'active' : ''}"
			onclick={() => (activeTab = 'gallery')}
		>
			<Camera size={16} />
			<span>Galerie</span>
			{#if mediaList.length > 0}
				<span class="tab-badge">{mediaList.length}</span>
			{/if}
		</button>
	</nav>

	<main class="content-body">
		<!-- TAB 1: INFOS & RSVP -->
		{#if activeTab === 'info'}
			<Card
				title={t('rsvp.title')}
				subtitle="Bist du dabei? Gib Bescheid, damit der Host planen kann."
			>
				{#if !data.currentGuest}
					<div class="name-gate-banner">
						<p>Bitte trage deinen Namen ein, um deine Rückmeldung zu speichern.</p>
						<Button variant="primary" onclick={() => (showNameSheet = true)}>
							<UserCheck size={16} />
							<span>Namen eingeben</span>
						</Button>
					</div>
				{:else}
					{#if data.currentGuest.isCompanion}
						<p class="companion-notice">
							Du bist als Begleitperson dabei. Die Rückmeldung wird von deinem Hauptgast verwaltet.
						</p>
					{:else if data.rsvp && !showRsvpEditor}
						<div class="rsvp-summary">
							<div>
								<strong
									>{data.rsvp.status === 'yes'
										? t('rsvp.yes')
										: data.rsvp.status === 'maybe'
											? t('rsvp.maybe')
											: t('rsvp.no')}</strong
								>
								<p>Deine Rückmeldung ist gespeichert.</p>
							</div>
							<Button variant="secondary" size="sm" onclick={() => (showRsvpEditor = true)}
								>Ändern</Button
							>
						</div>
						{#if data.rsvp.status === 'yes' && data.event.maxCompanions > 0}
							<div class="companion-share">
								{#if data.rsvp.companionCount > 0}
									<p>
										Du hast {data.rsvp.companionCount} Begleitplatz{data.rsvp.companionCount === 1
											? ''
											: 'e'}
										{#if data.rsvp.companionNames}
											für <strong>{data.rsvp.companionNames}</strong>
										{/if}
										reserviert.
									</p>

									{#if activeCompanionToken}
										<div class="companion-link-box">
											<div class="link-display">
												<code
													>{typeof window !== 'undefined'
														? `${window.location.origin}/e/${data.inviteToken}?companion=${activeCompanionToken}`
														: `/e/${data.inviteToken}?companion=${activeCompanionToken}`}</code
												>
											</div>
											<Button
												variant="primary"
												size="sm"
												onclick={() => void copyCompanionLink(activeCompanionToken)}
											>
												{#if companionLinkCopied}
													<Check size={16} />
													<span>Link kopiert!</span>
												{:else}
													<Copy size={16} />
													<span>Begleitlink kopieren</span>
												{/if}
											</Button>
										</div>
									{:else}
										<form
											action="?/createCompanionInvite"
											method="POST"
											use:enhance={() => {
												return async ({ result, update }) => {
													if (result.type === 'success') {
														const token = (result.data as { companionToken?: string } | undefined)
															?.companionToken;
														if (token) {
															lastCompanionToken = token;
															await copyCompanionLink(token);
														}
													}
													await update({ reset: false });
												};
											}}
										>
											<Button type="submit" variant="secondary" size="sm">
												<Share2 size={16} />
												<span>Begleitlink erstellen</span>
											</Button>
										</form>
									{/if}
								{:else}
									<p>Du hast noch keinen Begleitplatz reserviert.</p>
									<Button variant="secondary" size="sm" onclick={() => (showRsvpEditor = true)}
										>Begleitperson hinzufügen</Button
									>
								{/if}
							</div>
						{/if}
					{:else}
						<form
							action="?/submitRsvp"
							method="POST"
							use:enhance={() => {
								isSubmitting = true;
								return async ({ update }) => {
									isSubmitting = false;
									await update();
								};
							}}
							class="rsvp-form"
						>
							<div class="user-greeting">
								<span>Rückmeldung für: <strong>{data.currentGuest.name}</strong></span>
								<button
									type="button"
									class="change-name-btn"
									onclick={() => (showNameSheet = true)}
								>
									(ändern)
								</button>
							</div>

							<!-- Status Selector -->
							<div class="status-selector">
								<button
									type="button"
									class="status-btn yes {rsvpStatus === 'yes' ? 'selected' : ''}"
									onclick={() => (rsvpStatus = 'yes')}
								>
									<Check size={20} />
									<span>{t('rsvp.yes')}</span>
								</button>

								<button
									type="button"
									class="status-btn maybe {rsvpStatus === 'maybe' ? 'selected' : ''}"
									onclick={() => (rsvpStatus = 'maybe')}
								>
									<HelpCircle size={20} />
									<span>{t('rsvp.maybe')}</span>
								</button>

								<button
									type="button"
									class="status-btn no {rsvpStatus === 'no' ? 'selected' : ''}"
									onclick={() => (rsvpStatus = 'no')}
								>
									<X size={20} />
									<span>{t('rsvp.no')}</span>
								</button>
							</div>

							<input type="hidden" name="status" value={rsvpStatus} />

							{#if rsvpStatus === 'yes' && data.event.maxCompanions > 0}
								<div class="companions-box">
									<label for="companionCount" class="field-label"
										>Begleitpersonen: <strong>{companionCount}</strong> von maximal {data.event
											.maxCompanions}</label
									>
									<div class="counter-row">
										<Button
											type="button"
											variant="secondary"
											size="sm"
											disabled={companionCount <= 0}
											onclick={() => (companionCount = Math.max(0, companionCount - 1))}>−</Button
										>
										<input
											id="companionCount"
											type="number"
											name="companionCount"
											bind:value={companionCount}
											min="0"
											max={data.event.maxCompanions}
											readonly
											class="counter-input"
											aria-label="Anzahl der Begleitpersonen"
										/>
										<Button
											type="button"
											variant="secondary"
											size="sm"
											disabled={companionCount >= data.event.maxCompanions}
											onclick={() =>
												(companionCount = Math.min(data.event.maxCompanions, companionCount + 1))}
											>+</Button
										>
									</div>
									<Input
										label="Name der Begleitperson"
										name="companionNames"
										bind:value={companionNames}
										placeholder="z.B. Laura"
										required={companionCount > 0}
									/>
								</div>
							{/if}

							<Input
								label={t('rsvp.notes')}
								name="notes"
								bind:value={notes}
								placeholder="z.B. Vegetarier, fahre ab Hauptbahnhof..."
							/>

							<Button type="submit" variant="primary" size="lg" loading={isSubmitting}>
								{t('rsvp.submit')}
							</Button>
						</form>
					{/if}
				{/if}
			</Card>

			<!-- Location Card -->
			{#if data.event.locationName || data.event.locationAddress}
				<Card title={t('events.location')}>
					<div class="location-details">
						{#if data.event.locationName}
							<h4 class="loc-title">{data.event.locationName}</h4>
						{/if}
						{#if data.event.locationAddress}
							<p class="loc-addr">{data.event.locationAddress}</p>
						{/if}

						<div class="map-links">
							<a href={getAppleMapsUrl(mapQuery)} target="_blank" rel="noopener noreferrer">
								<Button variant="secondary" size="sm">
									<span>{t('events.openAppleMaps')}</span>
									<ExternalLink size={14} />
								</Button>
							</a>

							<a href={getOsmUrl(mapQuery)} target="_blank" rel="noopener noreferrer">
								<Button variant="secondary" size="sm">
									<span>{t('events.openOsm')}</span>
									<ExternalLink size={14} />
								</Button>
							</a>

							<a href={getGoogleMapsUrl(mapQuery)} target="_blank" rel="noopener noreferrer">
								<Button variant="secondary" size="sm">
									<span>{t('events.openGoogleMaps')}</span>
									<ExternalLink size={14} />
								</Button>
							</a>
						</div>
					</div>
				</Card>
			{/if}

			<!-- Attendees Card -->
			<Card title="Gästeliste ({data.summary.totalAttending} Zusagen)">
				{#if data.summary.attendees.length === 0}
					<p class="empty-text">Noch keine Zusagen. Sei der Erste!</p>
				{:else}
					<div class="attendee-chips">
						{#each data.summary.attendees as attendee}
							<div class="guest-chip">
								<span class="chip-name">{attendee.name}</span>
								{#if attendee.companionCount > 0}
									<span class="chip-comp">+{attendee.companionCount}</span>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</Card>

			<!-- TAB 2: WALL -->
		{:else if activeTab === 'wall'}
			<Card title="Pinnwand" subtitle="Hinterlasse eine Nachricht oder Glückwünsche.">
				{#if !data.currentGuest}
					<div class="name-gate-banner">
						<p>Bitte trage zuerst deinen Namen ein, um Beiträge zu verfassen.</p>
						<Button variant="primary" onclick={() => (showNameSheet = true)}>
							<UserCheck size={16} />
							<span>Namen eingeben</span>
						</Button>
					</div>
				{:else}
					<form
						action="?/addWallPost"
						method="POST"
						use:enhance={() => {
							isPosting = true;
							return async ({ update }) => {
								isPosting = false;
								newPostText = '';
								await update();
							};
						}}
						class="post-form"
					>
						<textarea
							name="content"
							bind:value={newPostText}
							rows="3"
							class="wall-textarea"
							placeholder="Schreibe eine Nachricht..."
							required></textarea>

						<div class="post-actions">
							<Button
								type="submit"
								variant="primary"
								size="sm"
								loading={isPosting}
								disabled={!newPostText.trim()}
							>
								<Send size={14} />
								<span>Senden</span>
							</Button>
						</div>
					</form>
				{/if}

				{#if announcements.length > 0}
					<div class="announcement-stream">
						<h4 class="list-title">Ankündigungen</h4>
						{#each announcements as announcement (announcement.id)}
							<div class="announcement-card">
								<p>{announcement.content}</p>
								<span class="post-time"
									>{formatDate(announcement.createdAt, {
										dateStyle: 'short',
										timeStyle: 'short'
									})}</span
								>
							</div>
						{/each}
					</div>
				{/if}

				<div class="posts-stream">
					{#if posts.length === 0}
						<p class="empty-text">Noch keine Beiträge vorhanden. Schreibe den ersten Eintrag!</p>
					{:else}
						{#each posts as post (post.id)}
							<div class="post-card {post.isPinned ? 'pinned' : ''}">
								<div class="post-header">
									<div class="author-meta">
										<span class="author-name">{post.authorName}</span>
										<span class="post-time"
											>{formatDate(post.createdAt, {
												dateStyle: 'short',
												timeStyle: 'short'
											})}</span
										>
									</div>

									<div class="post-badges">
										{#if post.isPinned}
											<Badge variant="accent">
												<Pin size={12} />
												<span>Angepinnt</span>
											</Badge>
										{/if}

										{#if data.currentGuest?.id === post.guestId || data.currentGuest?.isHost}
											<form action="?/deleteWallPost" method="POST" use:enhance>
												<input type="hidden" name="postId" value={post.id} />
												<button type="submit" class="delete-icon-btn" title="Beitrag löschen">
													<Trash2 size={14} />
												</button>
											</form>
										{/if}
									</div>
								</div>

								<p class="post-content">{post.content}</p>
							</div>
						{/each}
					{/if}
				</div>
			</Card>

			<!-- TAB 3: POLLS -->
		{:else if activeTab === 'polls'}
			<div class="polls-container">
				{#if polls.length === 0}
					<Card>
						<p class="empty-text">Aktuell gibt es keine Abstimmungen für dieses Event.</p>
					</Card>
				{:else}
					{#each polls as poll (poll.id)}
						<Card
							title={poll.question}
							subtitle={poll.isMultiple ? 'Mehrfachauswahl möglich' : 'Einfachauswahl'}
						>
							<form action="?/votePoll" method="POST" use:enhance class="poll-form">
								<input type="hidden" name="pollId" value={poll.id} />

								<div class="poll-options-list">
									{#each poll.options as opt}
										{@const pct =
											poll.totalVotes > 0 ? Math.round((opt.voteCount / poll.totalVotes) * 100) : 0}
										<label class="poll-opt-card {opt.hasVoted ? 'voted' : ''}">
											<div class="opt-tally-bar" style:width="{pct}%"></div>
											<div class="opt-inner">
												<div class="opt-label">
													<input
														type={poll.isMultiple ? 'checkbox' : 'radio'}
														name="optionId"
														value={opt.id}
														checked={opt.hasVoted}
														disabled={poll.isClosed}
														class="opt-input"
													/>
													<span class="opt-text">{opt.text}</span>
												</div>
												<span class="opt-count">{opt.voteCount} ({pct}%)</span>
											</div>
										</label>
									{/each}
								</div>

								{#if !poll.isClosed}
									<Button type="submit" variant="primary" size="sm">Stimme speichern</Button>
								{:else}
									<Badge variant="neutral">Abstimmung beendet</Badge>
								{/if}
							</form>

							{#if poll.allowGuestOptions && !poll.isClosed}
								<form action="?/addPollOption" method="POST" use:enhance class="add-opt-form">
									<input type="hidden" name="pollId" value={poll.id} />
									<Input
										name="text"
										bind:value={newOptionText[poll.id]}
										placeholder="Eigene Option hinzufügen..."
										required
									/>
									<Button type="submit" variant="secondary" size="sm">
										<Plus size={14} />
										<span>Hinzufügen</span>
									</Button>
								</form>
							{/if}
						</Card>
					{/each}
				{/if}
			</div>
		{:else if activeTab === 'gallery'}
			<Card
				title="Fotos & Videos"
				subtitle="Lade deine Aufnahmen hoch oder stöbere durch die Galerie."
			>
				<GalleryGrid
					bind:items={mediaList}
					eventId={data.event.id}
					guestToken={data.deviceToken}
					canDelete={(item) =>
						!!(data.currentGuest?.isHost || data.currentGuest?.id === item.uploaderGuestId)}
					onDelete={handleDeleteMedia}
					onUploadComplete={() => {
						// New items arrive automatically via SSE
					}}
				/>
			</Card>
		{/if}
	</main>
</div>

<!-- Guest Name Onboarding Sheet -->
<Sheet bind:open={showNameSheet} title="Wie heißt du?">
	<form
		action="?/setName"
		method="POST"
		use:enhance={() => {
			return async ({ update }) => {
				showNameSheet = false;
				await update();
			};
		}}
		class="name-form"
	>
		<p class="sheet-desc">
			Gib deinen Namen ein, damit der Host und die anderen Gäste sehen, wer du bist.
		</p>

		<Input
			label="Dein Name"
			name="name"
			bind:value={guestName}
			required
			placeholder="z.B. Lisa Müller"
		/>

		<Button type="submit" variant="primary" size="lg" fullWidth>Speichern</Button>
	</form>
</Sheet>

<style>
	.guest-page {
		min-height: 100dvh;
		background-color: var(--bg-canvas);
		padding: var(--space-4) var(--space-4) calc(var(--space-8) + env(safe-area-inset-bottom, 0));
		max-width: var(--max-content-width);
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.event-hero {
		margin-top: var(--space-2);
	}

	.hero-card {
		background: var(--bg-surface);
		border-radius: var(--radius-xl);
		border: 1px solid var(--border-subtle);
		border-top: 6px solid var(--accent);
		padding: var(--space-6) var(--space-4);
		box-shadow: var(--shadow-sm);
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: var(--space-3);
	}

	.date-chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		background-color: var(--accent-subtle);
		color: var(--accent);
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-pill);
		font-size: var(--text-xs);
		font-weight: 700;
	}

	.event-title {
		font-size: var(--text-2xl);
		font-weight: 800;
		line-height: 1.15;
		color: var(--text-primary);
	}

	.event-desc {
		font-size: var(--text-base);
		color: var(--text-secondary);
		line-height: 1.5;
		max-width: 480px;
		white-space: pre-wrap;
	}

	.countdown-section {
		padding-top: var(--space-2);
		width: 100%;
		display: flex;
		justify-content: center;
	}

	/* Segmented Navigation */
	.tabs-nav {
		display: flex;
		position: relative;
		z-index: 2;
		background-color: var(--bg-surface);
		padding: var(--space-1);
		border-radius: var(--radius-lg);
		border: 1px solid var(--border-subtle);
		box-shadow: var(--shadow-sm);
		gap: var(--space-1);
	}

	.tab-btn {
		flex: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		border: none;
		background: transparent;
		color: var(--text-secondary);
		font-family: inherit;
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
		pointer-events: auto;
		touch-action: manipulation;
		min-height: 40px;
		transition:
			background-color var(--duration-fast) ease,
			color var(--duration-fast) ease;
	}

	.tab-btn.active {
		background-color: var(--accent-subtle);
		color: var(--accent);
	}

	.tab-badge {
		background-color: var(--accent);
		color: var(--accent-contrast);
		border-radius: var(--radius-pill);
		font-size: 11px;
		padding: 1px 6px;
		font-weight: 700;
	}

	.content-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.name-gate-banner {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: var(--space-3);
		padding: var(--space-4) 0;
	}

	.user-greeting {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--text-sm);
		color: var(--text-secondary);
		margin-bottom: var(--space-1);
	}

	.change-name-btn {
		background: none;
		border: none;
		color: var(--accent);
		cursor: pointer;
		font-size: var(--text-xs);
		font-weight: 600;
	}

	.rsvp-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.status-selector {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--space-2);
	}

	.status-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-1);
		padding: var(--space-3) var(--space-1);
		border-radius: var(--radius-md);
		border: 2px solid var(--border-subtle);
		background: var(--bg-surface);
		color: var(--text-secondary);
		cursor: pointer;
		font-family: inherit;
		font-weight: 600;
		font-size: var(--text-sm);
		min-height: 64px;
		transition:
			transform var(--duration-fast) var(--ease-spring),
			border-color var(--duration-fast) ease;
	}

	.status-btn:active {
		transform: scale(0.95);
	}

	.status-btn.selected.yes {
		border-color: var(--color-success);
		background-color: rgba(52, 199, 89, 0.12);
		color: var(--color-success);
	}

	.status-btn.selected.maybe {
		border-color: var(--color-warning);
		background-color: rgba(255, 149, 0, 0.12);
		color: var(--color-warning);
	}

	.status-btn.selected.no {
		border-color: var(--color-danger);
		background-color: rgba(255, 59, 48, 0.12);
		color: var(--color-danger);
	}

	.companions-box {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.counter-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.counter-input {
		width: 64px;
		text-align: center;
		font-size: var(--text-lg);
		font-weight: 700;
		padding: var(--space-1);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		background: var(--bg-surface);
		color: var(--text-primary);
		appearance: textfield;
		-moz-appearance: textfield;
	}

	.counter-input::-webkit-inner-spin-button,
	.counter-input::-webkit-outer-spin-button {
		appearance: none;
		margin: 0;
	}

	.rsvp-summary,
	.companion-share,
	.companion-notice {
		padding: var(--space-3);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		background: var(--bg-canvas);
	}

	.rsvp-summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.rsvp-summary p,
	.companion-share p,
	.companion-notice {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.companion-share {
		margin-top: var(--space-3);
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: var(--space-2);
	}

	.companion-share form {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2);
		width: 100%;
	}

	.companion-link-box {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-top: var(--space-2);
		padding: var(--space-3);
		background-color: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
	}

	.link-display {
		background-color: var(--bg-canvas);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		border: 1px solid var(--border-subtle);
		overflow-x: auto;
		word-break: break-all;
	}

	.link-display code {
		font-family: var(--font-family-mono);
		font-size: var(--text-xs);
		color: var(--text-primary);
	}

	.location-details {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.loc-title {
		font-size: var(--text-lg);
		font-weight: 700;
	}

	.loc-addr {
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.map-links {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}

	.map-links a {
		text-decoration: none;
	}

	.attendee-chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.guest-chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-1) var(--space-3);
		background: var(--bg-subtle);
		border-radius: var(--radius-pill);
		font-size: var(--text-sm);
		font-weight: 500;
	}

	.chip-comp {
		color: var(--accent);
		font-weight: 700;
		font-size: var(--text-xs);
	}

	.empty-text {
		font-size: var(--text-sm);
		color: var(--text-secondary);
		text-align: center;
		padding: var(--space-2) 0;
	}

	/* Wall styles */
	.post-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
	}

	.wall-textarea {
		width: 100%;
		padding: var(--space-2) var(--space-3);
		font-family: inherit;
		font-size: 16px;
		color: var(--text-primary);
		background-color: var(--bg-canvas);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		outline: none;
		resize: vertical;
	}

	.wall-textarea:focus {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-subtle);
	}

	.post-actions {
		display: flex;
		justify-content: flex-end;
	}

	.posts-stream {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.post-card {
		background-color: var(--bg-canvas);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		padding: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.post-card.pinned {
		border-color: var(--accent);
		background-color: var(--accent-subtle);
	}

	.post-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.author-meta {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.author-name {
		font-weight: 600;
		font-size: var(--text-sm);
	}

	.post-time {
		font-size: var(--text-xs);
		color: var(--text-tertiary);
	}

	.post-badges {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.delete-icon-btn {
		background: none;
		border: none;
		color: var(--text-tertiary);
		cursor: pointer;
		display: inline-flex;
		padding: 4px;
		border-radius: var(--radius-xs);
	}

	.delete-icon-btn:hover {
		color: var(--color-danger);
	}

	.post-content {
		font-size: var(--text-sm);
		line-height: 1.5;
		color: var(--text-primary);
		white-space: pre-wrap;
	}

	/* Poll styles */
	.polls-container {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.poll-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.poll-options-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.poll-opt-card {
		position: relative;
		overflow: hidden;
		background-color: var(--bg-canvas);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		padding: var(--space-3);
		cursor: pointer;
		display: flex;
		align-items: center;
	}

	.poll-opt-card.voted {
		border-color: var(--accent);
	}

	.opt-tally-bar {
		position: absolute;
		inset: 0 auto 0 0;
		background-color: var(--accent-subtle);
		z-index: 0;
		transition: width var(--duration-normal) ease;
	}

	.opt-inner {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
	}

	.opt-label {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.opt-input {
		accent-color: var(--accent);
	}

	.opt-text {
		font-size: var(--text-sm);
		font-weight: 500;
	}

	.opt-count {
		font-size: var(--text-xs);
		font-weight: 700;
		color: var(--text-secondary);
	}

	.add-opt-form {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}

	.name-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.sheet-desc {
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}
</style>
