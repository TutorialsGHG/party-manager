<script lang="ts">
	import { APP_NAME } from '$lib/config';
	import { t } from '$lib/i18n';
	import Card from '$lib/ui/components/Card.svelte';
	import Button from '$lib/ui/components/Button.svelte';
	import { Calendar, ShieldCheck, Smartphone } from '@lucide/svelte';
</script>

<div class="landing-container">
	<header class="header">
		<div class="badge-pill">
			<ShieldCheck size={16} />
			<span>100% Privat & Selbst gehostet</span>
		</div>
		<h1 class="hero-title">{APP_NAME}</h1>
		<p class="hero-subtitle">{t('app.tagline')}</p>
	</header>

	<div class="card-grid">
		<Card title="Apple-inspiriert" subtitle="Ruhiges, klares Design ohne unnötige Ablenkung.">
			<p class="card-text">
				Gäste öffnen den Einladungslink sofort ohne Login. Native Gesten, Dark Mode und responsive Darstellung von 320px bis 4K.
			</p>
		</Card>

		<Card title="Envelope-Verschlüsselung" subtitle="Echte Löschgarantie durch Crypto-Shredding.">
			<p class="card-text">
				Alle privaten Event-Details, Gästekommentare und Medien bleiben at-rest verschlüsselt (RSA-4096 + AES-256-GCM Chunks).
			</p>
		</Card>
	</div>

	<footer class="footer-actions">
		<a href="/login">
			<Button variant="primary" size="lg">
				{t('auth.login')}
			</Button>
		</a>
		<a href="/register">
			<Button variant="secondary" size="lg">
				{t('auth.register')}
			</Button>
		</a>
	</footer>
</div>

<style>
	.landing-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100dvh;
		padding: var(--space-8) var(--space-4);
		max-width: var(--max-content-width);
		margin: 0 auto;
		text-align: center;
		gap: var(--space-6);
	}

	.header {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3);
	}

	.badge-pill {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-pill);
		background-color: var(--accent-subtle);
		color: var(--accent);
		font-size: var(--text-xs);
		font-weight: 600;
	}

	.hero-title {
		font-size: var(--text-3xl);
		font-weight: 800;
		letter-spacing: -0.03em;
		color: var(--text-primary);
		line-height: 1.1;
	}

	.hero-subtitle {
		font-size: var(--text-lg);
		color: var(--text-secondary);
		max-width: 440px;
	}

	.card-grid {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		width: 100%;
		text-align: left;
	}

	.card-text {
		font-size: var(--text-sm);
		color: var(--text-secondary);
		line-height: 1.5;
	}

	.footer-actions {
		display: flex;
		gap: var(--space-3);
		width: 100%;
		justify-content: center;
		margin-top: var(--space-2);
	}

	.footer-actions a {
		text-decoration: none;
		flex: 1;
		max-width: 200px;
	}
</style>
