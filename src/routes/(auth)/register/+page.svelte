<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n';
	import Card from '$lib/ui/components/Card.svelte';
	import Button from '$lib/ui/components/Button.svelte';
	import Input from '$lib/ui/components/Input.svelte';
	import { Copy, Check, KeyRound } from '@lucide/svelte';

	let { data, form } = $props();

	let email = $state('');
	let password = $state('');
	let isSolvingPoW = $state(false);
	let nonce = $state('');
	let copied = $state(false);

	$effect(() => {
		if (form?.values?.email) {
			email = form.values.email;
		}
	});

	async function solvePoW(): Promise<string> {
		isSolvingPoW = true;
		const challenge = data.pow.challenge;
		const difficulty = data.pow.difficulty;
		const prefix = '0'.repeat(difficulty);
		let n = 0;

		const encoder = new TextEncoder();
		while (true) {
			const dataToHash = encoder.encode(challenge + n);
			const hashBuffer = await crypto.subtle.digest('SHA-256', dataToHash);
			const hashArray = Array.from(new Uint8Array(hashBuffer));
			const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

			if (hashHex.startsWith(prefix)) {
				isSolvingPoW = false;
				return String(n);
			}
			n++;
			// Yield to main thread every 500 iterations to keep UI responsive
			if (n % 500 === 0) {
				await new Promise((r) => setTimeout(r, 0));
			}
		}
	}

	async function handleSubmit(event: SubmitEvent) {
		if (!nonce) {
			event.preventDefault();
			try {
				const solvedNonce = await solvePoW();
				nonce = solvedNonce;
				// Resubmit with solved nonce
				const targetForm = event.target as HTMLFormElement;
				setTimeout(() => targetForm.requestSubmit(), 10);
			} catch (err) {
				console.error('PoW solve failed:', err);
				isSolvingPoW = false;
			}
		}
	}

	function copyRecoveryCodes() {
		if (form?.recoveryCodes) {
			navigator.clipboard.writeText(form.recoveryCodes.join('\n'));
			copied = true;
			setTimeout(() => (copied = false), 2000);
		}
	}
</script>

<div class="auth-page">
	<div class="auth-container">
		<div class="auth-header">
			<h1 class="title">{t('auth.register')}</h1>
			<p class="subtitle">
				{#if data.isFirstUser}
					<strong>Ersteinrichtung:</strong> Dieser Account erhält Administrator-Rechte.
				{:else}
					Erstelle ein Konto, um eigene Events und Einladungen zu erstellen.
				{/if}
			</p>
		</div>

		{#if form?.success && form?.recoveryCodes}
			<Card title={t('auth.recoveryCodes')} subtitle={t('auth.recoveryCodeNotice')}>
				<div class="codes-grid">
					{#each form.recoveryCodes as code}
						<div class="code-item">
							<KeyRound size={14} class="key-icon" />
							<code>{code}</code>
						</div>
					{/each}
				</div>

				<div class="recovery-actions">
					<Button variant="secondary" onclick={copyRecoveryCodes}>
						{#if copied}
							<Check size={16} />
							<span>{t('app.copied')}</span>
						{:else}
							<Copy size={16} />
							<span>{t('app.copy')}</span>
						{/if}
					</Button>

					<a href="/dashboard" class="action-link">
						<Button variant="primary" fullWidth>Weiter zum Dashboard</Button>
					</a>
				</div>
			</Card>
		{:else}
			<Card>
				<form method="POST" use:enhance onsubmit={handleSubmit} class="auth-form">
					<!-- Hidden PoW fields -->
					<input type="hidden" name="challenge" value={data.pow.challenge} />
					<input type="hidden" name="difficulty" value={data.pow.difficulty} />
					<input type="hidden" name="expiresAt" value={data.pow.expiresAt} />
					<input type="hidden" name="signature" value={data.pow.signature} />
					<input type="hidden" name="nonce" value={nonce} />

					{#if form?.error}
						<div class="form-error" role="alert">
							{form.error}
						</div>
					{/if}

					<Input
						label={t('auth.email')}
						type="email"
						name="email"
						bind:value={email}
						required
						autocomplete="username"
						placeholder="name@beispiel.de"
					/>

					<Input
						label={t('auth.password')}
						type="password"
						name="password"
						bind:value={password}
						required
						autocomplete="new-password"
						hint="Mindestens 8 Zeichen"
					/>

					<div class="submit-wrap">
						<Button type="submit" variant="primary" size="lg" fullWidth loading={isSolvingPoW}>
							{isSolvingPoW ? t('auth.powSolving') : t('auth.register')}
						</Button>
					</div>
				</form>

				<div class="switch-auth">
					<span>Bereits ein Konto?</span>
					<a href="/login" class="link">{t('auth.login')}</a>
				</div>
			</Card>
		{/if}
	</div>
</div>

<style>
	.auth-page {
		min-height: 100dvh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-6) var(--space-4);
	}

	.auth-container {
		width: 100%;
		max-width: 440px;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.auth-header {
		text-align: center;
	}

	.title {
		font-size: var(--text-2xl);
		font-weight: 700;
		color: var(--text-primary);
	}

	.subtitle {
		font-size: var(--text-sm);
		color: var(--text-secondary);
		margin-top: var(--space-1);
	}

	.auth-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.form-error {
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		background-color: rgba(255, 59, 48, 0.12);
		color: var(--color-danger);
		font-size: var(--text-sm);
		font-weight: 500;
	}

	.submit-wrap {
		margin-top: var(--space-2);
	}

	.switch-auth {
		display: flex;
		justify-content: center;
		gap: var(--space-1);
		font-size: var(--text-sm);
		color: var(--text-secondary);
		padding-top: var(--space-2);
	}

	.link {
		color: var(--accent);
		text-decoration: none;
		font-weight: 600;
	}

	.codes-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--space-2);
		padding: var(--space-2) 0;
	}

	.code-item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		background-color: var(--bg-canvas);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		font-family: var(--font-family-mono);
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.recovery-actions {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}

	.action-link {
		text-decoration: none;
	}
</style>
