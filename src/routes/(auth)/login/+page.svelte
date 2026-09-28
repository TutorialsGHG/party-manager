<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n';
	import Card from '$lib/ui/components/Card.svelte';
	import Button from '$lib/ui/components/Button.svelte';
	import Input from '$lib/ui/components/Input.svelte';

	let { form } = $props();

	let email = $state('');
	let password = $state('');
	let loading = $state(false);

	$effect(() => {
		if (form?.values?.email) {
			email = form.values.email;
		}
	});
</script>

<div class="auth-page">
	<div class="auth-container">
		<div class="auth-header">
			<h1 class="title">{t('auth.login')}</h1>
			<p class="subtitle">Melde dich an, um deine Events zu verwalten.</p>
		</div>

		<Card>
			<form
				method="POST"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update();
					};
				}}
				class="auth-form"
			>
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
					autocomplete="current-password"
				/>

				<div class="submit-wrap">
					<Button type="submit" variant="primary" size="lg" fullWidth {loading}>
						{t('auth.login')}
					</Button>
				</div>
			</form>

			<div class="switch-auth">
				<span>Noch kein Konto?</span>
				<a href="/register" class="link">{t('auth.register')}</a>
			</div>
		</Card>
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
</style>
