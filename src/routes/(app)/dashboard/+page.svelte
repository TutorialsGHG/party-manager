<script lang="ts">
	import { formatDate } from '$lib/i18n';
	import Card from '$lib/ui/components/Card.svelte';
	import Button from '$lib/ui/components/Button.svelte';
	import Badge from '$lib/ui/components/Badge.svelte';
	import { Calendar, Users, MapPin, Plus } from '@lucide/svelte';

	let { data } = $props();
</script>

<div class="dashboard">
	<div class="dashboard-header">
		<div>
			<h1 class="page-title">Meine Events</h1>
			<p class="page-desc">Erstelle und verwalte deine Einladungen.</p>
		</div>

		<a href="/events/new">
			<Button variant="primary">
				<Plus size={16} />
				<span>Event erstellen</span>
			</Button>
		</a>
	</div>

	<section class="events-section">
		<h2 class="section-title">Bevorstehende Events ({data.upcoming.length})</h2>

		{#if data.upcoming.length === 0}
			<Card>
				<div class="empty-state">
					<div class="empty-icon">
						<Calendar size={40} />
					</div>
					<h3>Noch keine bevorstehenden Events</h3>
					<p>Erstelle dein erstes Event und lade Freunde und Familie ein.</p>
					<a href="/events/new">
						<Button variant="primary" size="md">
							<Plus size={16} />
							<span>Jetzt Event anlegen</span>
						</Button>
					</a>
				</div>
			</Card>
		{:else}
			<div class="events-grid">
				{#each data.upcoming as event}
					<a href="/events/{event.id}" class="event-card-link">
						<Card interactive padding="md">
							<div class="card-inner">
								<div class="event-color-strip" style:background-color={event.accentColor}></div>
								<div class="event-details">
									<div class="event-top">
										<span class="event-date">
											{formatDate(event.dateStart, { dateStyle: 'medium', timeStyle: 'short' })}
										</span>
										<Badge variant="accent">
											<Users size={12} />
											<span>{event.totalAttending} Zusagen</span>
										</Badge>
									</div>

									<h3 class="event-title">{event.title}</h3>

									{#if event.locationName || event.locationAddress}
										<div class="event-loc">
											<MapPin size={14} />
											<span>{event.locationName || event.locationAddress}</span>
										</div>
									{/if}
								</div>
							</div>
						</Card>
					</a>
				{/each}
			</div>
		{/if}
	</section>

	{#if data.past.length > 0}
		<section class="events-section past-section">
			<h2 class="section-title">Vergangene Events ({data.past.length})</h2>
			<div class="events-grid">
				{#each data.past as event}
					<a href="/events/{event.id}" class="event-card-link past-link">
						<Card interactive padding="md">
							<div class="card-inner">
								<div class="event-details">
									<span class="event-date">
										{formatDate(event.dateStart, { dateStyle: 'medium' })}
									</span>
									<h3 class="event-title">{event.title}</h3>
								</div>
							</div>
						</Card>
					</a>
				{/each}
			</div>
		</section>
	{/if}
</div>

<style>
	.dashboard {
		display: flex;
		flex-direction: column;
		gap: var(--space-8);
	}

	.dashboard-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
	}

	.dashboard-header a {
		text-decoration: none;
	}

	.page-title {
		font-size: var(--text-2xl);
		font-weight: 700;
		color: var(--text-primary);
	}

	.page-desc {
		font-size: var(--text-sm);
		color: var(--text-secondary);
		margin-top: var(--space-1);
	}

	.events-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.section-title {
		font-size: var(--text-lg);
		font-weight: 600;
		color: var(--text-primary);
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: var(--space-8) var(--space-4);
		gap: var(--space-3);
	}

	.empty-icon {
		color: var(--text-tertiary);
	}

	.empty-state h3 {
		font-size: var(--text-lg);
		font-weight: 600;
	}

	.empty-state p {
		font-size: var(--text-sm);
		color: var(--text-secondary);
		max-width: 320px;
	}

	.empty-state a {
		text-decoration: none;
		margin-top: var(--space-2);
	}

	.events-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-4);
	}

	@media (min-width: 640px) {
		.events-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	.event-card-link {
		text-decoration: none;
		color: inherit;
	}

	.card-inner {
		display: flex;
		gap: var(--space-3);
	}

	.event-color-strip {
		width: 6px;
		border-radius: var(--radius-pill);
		flex-shrink: 0;
	}

	.event-details {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		width: 100%;
	}

	.event-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}

	.event-date {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-secondary);
		text-transform: uppercase;
	}

	.event-title {
		font-size: var(--text-lg);
		font-weight: 700;
		color: var(--text-primary);
		line-height: 1.25;
	}

	.event-loc {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--text-xs);
		color: var(--text-secondary);
	}

	.past-section {
		opacity: 0.75;
	}
</style>
