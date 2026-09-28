<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatDate } from '$lib/i18n';
	import Card from '$lib/ui/components/Card.svelte';
	import Button from '$lib/ui/components/Button.svelte';
	import Input from '$lib/ui/components/Input.svelte';
	import Badge from '$lib/ui/components/Badge.svelte';
	import Dialog from '$lib/ui/components/Dialog.svelte';
	import {
		Shield,
		Server,
		HardDrive,
		Cpu,
		Settings,
		Users,
		Mail,
		Check,
		AlertCircle,
		Trash2,
		Lock,
		Unlock,
		ArrowLeft,
		Send,
		Activity,
		CheckCircle2
	} from '@lucide/svelte';

	let { data, form } = $props();

	let activeTab = $state<'overview' | 'settings' | 'users'>('overview');

	let testMailTarget = $state('');
	let isSendingTestMail = $state(false);
	let isSavingSettings = $state(false);

	let deleteTargetUser = $state<{ id: string; email: string } | null>(null);

	$effect(() => {
		testMailTarget = data.adminEmail;
	});

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	}
</script>

<svelte:head>
	<title>Administration - Einladung</title>
</svelte:head>

<div class="admin-page">
	<header class="admin-header">
		<div class="header-top">
			<a href="/dashboard">
				<Button variant="ghost" size="sm">
					<ArrowLeft size={16} />
					<span>Dashboard</span>
				</Button>
			</a>
			<Badge variant="accent">
				<Shield size={14} />
				<span>Admin-Bereich</span>
			</Badge>
		</div>

		<div class="header-title-wrap">
			<h1>Systemverwaltung</h1>
			<p class="subtitle">Zentrale Steuerung für Speicher, Benutzer und Server-Dienste</p>
		</div>
	</header>

	<!-- Navigation Tabs -->
	<nav class="admin-tabs" aria-label="Admin Navigation">
		<button
			class="tab-btn {activeTab === 'overview' ? 'active' : ''}"
			onclick={() => (activeTab = 'overview')}
		>
			<Activity size={16} />
			<span>Status & Übersicht</span>
		</button>

		<button
			class="tab-btn {activeTab === 'settings' ? 'active' : ''}"
			onclick={() => (activeTab = 'settings')}
		>
			<Settings size={16} />
			<span>Einstellungen & SMTP</span>
		</button>

		<button
			class="tab-btn {activeTab === 'users' ? 'active' : ''}"
			onclick={() => (activeTab = 'users')}
		>
			<Users size={16} />
			<span>Benutzer ({data.users.length})</span>
		</button>
	</nav>

	<!-- Feedback Messages -->
	{#if form?.settingsSaved}
		<div class="alert success">
			<CheckCircle2 size={18} />
			<span>Einstellungen wurden erfolgreich aktualisiert.</span>
		</div>
	{/if}

	{#if form?.testMailSuccess}
		<div class="alert success">
			<CheckCircle2 size={18} />
			<span>Test-E-Mail wurde erfolgreich an {form.sentTo} versendet!</span>
		</div>
	{/if}

	{#if form?.testMailError}
		<div class="alert error">
			<AlertCircle size={18} />
			<span>E-Mail-Fehler: {form.testMailError}</span>
		</div>
	{/if}

	{#if form?.error}
		<div class="alert error">
			<AlertCircle size={18} />
			<span>{form.error}</span>
		</div>
	{/if}

	<main class="admin-content">
		<!-- TAB 1: OVERVIEW -->
		{#if activeTab === 'overview'}
			<div class="stats-grid">
				<!-- Service Status Card -->
				<Card title="Dienste & Engines">
					<div class="status-items">
						<div class="status-row">
							<div class="status-meta">
								<Cpu size={18} />
								<span>ffmpeg Video-Transcoder</span>
							</div>
							{#if data.system.ffmpegAvailable}
								<Badge variant="accent">
									<Check size={12} /> Verfügbar
								</Badge>
							{:else}
								<Badge variant="neutral">Nicht installiert</Badge>
							{/if}
						</div>

						<div class="status-row">
							<div class="status-meta">
								<Server size={18} />
								<span>Medien-Warteschlange</span>
							</div>
							<Badge variant={data.system.queueBusy ? 'accent' : 'neutral'}>
								{data.system.queueBusy ? 'Verarbeitet...' : 'Bereit'} ({data.system.queueLength} anstehend)
							</Badge>
						</div>

						<div class="status-row">
							<div class="status-meta">
								<Mail size={18} />
								<span>SMTP-Server</span>
							</div>
							{#if data.settings.smtpHost}
								<Badge variant="accent">Konfiguriert</Badge>
							{:else}
								<Badge variant="neutral">Deaktiviert</Badge>
							{/if}
						</div>
					</div>
				</Card>

				<!-- Storage Card -->
				<Card title="Speicherverbrauch">
					<div class="status-items">
						<div class="status-row">
							<div class="status-meta">
								<HardDrive size={18} />
								<span>Verschlüsselte Mediendateien</span>
							</div>
							<span class="storage-val">{formatBytes(data.system.blobsSizeBytes)}</span>
						</div>

						<div class="status-row">
							<div class="status-meta">
								<Server size={18} />
								<span>SQLite-Datenbank (WAL)</span>
							</div>
							<span class="storage-val">{formatBytes(data.system.dbSizeBytes)}</span>
						</div>
					</div>
				</Card>

				<!-- Database Totals Card -->
				<Card title="Objekte im System">
					<div class="counts-grid">
						<div class="count-card">
							<span class="count-number">{data.system.counts.users}</span>
							<span class="count-label">Benutzer / Hosts</span>
						</div>
						<div class="count-card">
							<span class="count-number">{data.system.counts.events}</span>
							<span class="count-label">Partys & Events</span>
						</div>
						<div class="count-card">
							<span class="count-number">{data.system.counts.guests}</span>
							<span class="count-label">Registrierte Gäste</span>
						</div>
						<div class="count-card">
							<span class="count-number">{data.system.counts.media}</span>
							<span class="count-label">Fotos & Videos</span>
						</div>
					</div>
				</Card>
			</div>

			<!-- TAB 2: SETTINGS & SMTP -->
		{:else if activeTab === 'settings'}
			<div class="settings-container">
				<form
					action="?/saveSettings"
					method="POST"
					use:enhance={() => {
						isSavingSettings = true;
						return async ({ update }) => {
							isSavingSettings = false;
							await update();
						};
					}}
					class="settings-form"
				>
					<!-- General System Settings -->
					<Card
						title="Allgemeine Einstellungen"
						subtitle="Regeln für Registrierungen und Upload-Kapazitäten"
					>
						<div class="form-fields">
							<label class="toggle-row">
								<div class="toggle-text">
									<span class="toggle-label">Neue Registrierungen erlauben</span>
									<span class="toggle-desc"
										>Wenn deaktiviert, können sich keine neuen Benutzer auf der Login-Seite
										registrieren.</span
									>
								</div>
								<input
									type="checkbox"
									name="registrationEnabled"
									checked={data.settings.registrationEnabled}
									class="toggle-checkbox"
								/>
							</label>

							<div class="fields-row">
								<Input
									label="Max. Dateigröße pro Upload (MB)"
									name="maxUploadSizeMb"
									type="number"
									value={String(data.settings.maxUploadSizeMb)}
									required
								/>

								<Input
									label="Speicher-Quota pro Event (MB)"
									name="quotaPerEventMb"
									type="number"
									value={String(data.settings.quotaPerEventMb)}
									required
								/>
							</div>
						</div>
					</Card>

					<!-- SMTP Settings -->
					<Card
						title="SMTP E-Mail-Konfiguration"
						subtitle="Zugangsdaten werden verschlüsselt mit dem Master-Key gespeichert"
					>
						<div class="form-fields">
							<div class="fields-row">
								<Input
									label="SMTP Server / Host"
									name="smtpHost"
									placeholder="z.B. mail.example.com"
									value={data.settings.smtpHost}
								/>

								<Input
									label="Port"
									name="smtpPort"
									type="number"
									placeholder="587"
									value={String(data.settings.smtpPort)}
								/>
							</div>

							<label class="toggle-row">
								<div class="toggle-text">
									<span class="toggle-label">SSL / TLS Verschlüsselung erzwingen</span>
									<span class="toggle-desc"
										>Typischerweise für Port 465 aktiv, für Port 587 (STARTTLS) in der Regel
										deaktiviert.</span
									>
								</div>
								<input
									type="checkbox"
									name="smtpSecure"
									checked={data.settings.smtpSecure}
									class="toggle-checkbox"
								/>
							</label>

							<div class="fields-row">
								<Input
									label="SMTP Benutzer"
									name="smtpUser"
									placeholder="benutzer@example.com"
									value={data.settings.smtpUser}
								/>

								<Input
									label={data.settings.hasSmtpPass
										? 'SMTP Passwort (gespeichert - leer lassen zum Beibehalten)'
										: 'SMTP Passwort'}
									name="smtpPass"
									type="password"
									placeholder="••••••••••••"
								/>
							</div>

							<Input
								label="Absender-Adresse (From)"
								name="smtpFrom"
								placeholder="Einladung <noreply@example.com>"
								value={data.settings.smtpFrom}
							/>
						</div>

						<div class="form-submit-row">
							<Button type="submit" variant="primary" loading={isSavingSettings}>
								Einstellungen speichern
							</Button>
						</div>
					</Card>
				</form>

				<!-- Test Email Card -->
				<Card
					title="SMTP-Funktionstest"
					subtitle="Prüfe sofort, ob dein Server E-Mails erfolgreich versenden kann"
				>
					<form
						action="?/sendTestEmail"
						method="POST"
						use:enhance={() => {
							isSendingTestMail = true;
							return async ({ update }) => {
								isSendingTestMail = false;
								await update();
							};
						}}
						class="test-mail-form"
					>
						<Input
							label="Empfänger E-Mail-Adresse"
							name="targetEmail"
							type="email"
							bind:value={testMailTarget}
							required
						/>

						<Button
							type="submit"
							variant="secondary"
							loading={isSendingTestMail}
							disabled={!data.settings.smtpHost}
						>
							<Send size={16} />
							<span>Test-E-Mail senden</span>
						</Button>
					</form>
				</Card>
			</div>

			<!-- TAB 3: USER MANAGEMENT -->
		{:else if activeTab === 'users'}
			<Card title="Registrierte Benutzer" subtitle="Übersicht aller Konten und Rollen im System">
				<div class="users-table-wrap">
					<table class="users-table">
						<thead>
							<tr>
								<th>E-Mail</th>
								<th>Rolle</th>
								<th>Status</th>
								<th>Events</th>
								<th>Registriert am</th>
								<th class="actions-col">Aktionen</th>
							</tr>
						</thead>
						<tbody>
							{#each data.users as user (user.id)}
								<tr class:locked={!user.isActive}>
									<td class="email-col">
										<strong>{user.email}</strong>
									</td>
									<td>
										<Badge variant={user.role === 'admin' ? 'accent' : 'neutral'}>
											{user.role === 'admin' ? 'Administrator' : 'Host'}
										</Badge>
									</td>
									<td>
										{#if user.isActive}
											<span class="active-pill">Aktiv</span>
										{:else}
											<span class="locked-pill">Gesperrt</span>
										{/if}
									</td>
									<td>{user.eventCount}</td>
									<td>{formatDate(user.createdAt, { dateStyle: 'medium' })}</td>
									<td class="actions-col">
										<div class="user-actions">
											<!-- Toggle active/lock -->
											{#if user.id !== data.adminUser.id}
												<form action="?/toggleUserActive" method="POST" use:enhance>
													<input type="hidden" name="userId" value={user.id} />
													<input type="hidden" name="isActive" value={String(!user.isActive)} />
													<button
														type="submit"
														class="action-icon-btn"
														title={user.isActive ? 'Konto sperren' : 'Konto entsperren'}
													>
														{#if user.isActive}
															<Lock size={16} />
														{:else}
															<Unlock size={16} />
														{/if}
													</button>
												</form>

												<!-- Toggle role -->
												<form action="?/toggleUserRole" method="POST" use:enhance>
													<input type="hidden" name="userId" value={user.id} />
													<input
														type="hidden"
														name="role"
														value={user.role === 'admin' ? 'host' : 'admin'}
													/>
													<button
														type="submit"
														class="action-icon-btn"
														title={user.role === 'admin'
															? 'Zu Host herabstufen'
															: 'Zu Admin befördern'}
													>
														<Shield size={16} />
													</button>
												</form>

												<!-- Delete button -->
												<button
													type="button"
													class="action-icon-btn delete"
													onclick={() => (deleteTargetUser = { id: user.id, email: user.email })}
													title="Benutzer löschen"
												>
													<Trash2 size={16} />
												</button>
											{:else}
												<span class="current-user-tag">(Du)</span>
											{/if}
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</Card>
		{/if}
	</main>
</div>

<!-- Delete User Dialog -->
<Dialog
	bind:open={
		() => !!deleteTargetUser,
		(val) => {
			if (!val) deleteTargetUser = null;
		}
	}
	title="Benutzer endgültig löschen?"
	onclose={() => (deleteTargetUser = null)}
>
	<p class="dialog-text">
		Möchtest du das Konto von <strong>{deleteTargetUser?.email}</strong> wirklich löschen? Alle zugehörigen
		Events und Daten werden unwiderruflich entfernt.
	</p>

	{#snippet actions()}
		<Button variant="secondary" onclick={() => (deleteTargetUser = null)}>Abbrechen</Button>
		<form
			action="?/deleteUser"
			method="POST"
			use:enhance={() => {
				return async ({ update }) => {
					deleteTargetUser = null;
					await update();
				};
			}}
		>
			<input type="hidden" name="userId" value={deleteTargetUser?.id} />
			<Button type="submit" variant="danger">Endgültig löschen</Button>
		</form>
	{/snippet}
</Dialog>

<style>
	.admin-page {
		max-width: 1024px;
		margin: 0 auto;
		padding: 24px 16px 64px;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.admin-header {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.header-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.header-title-wrap h1 {
		margin: 0;
		font-size: 1.75rem;
		font-weight: 700;
	}

	.subtitle {
		margin: 4px 0 0;
		color: var(--color-text-secondary);
		font-size: 0.95rem;
	}

	.admin-tabs {
		display: flex;
		gap: 8px;
		border-bottom: 1px solid var(--color-border);
		padding-bottom: 12px;
		overflow-x: auto;
	}

	.tab-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 16px;
		border-radius: var(--radius-md, 12px);
		border: none;
		background: transparent;
		color: var(--color-text-secondary);
		font-family: inherit;
		font-weight: 600;
		font-size: 0.9rem;
		cursor: pointer;
		transition: all 0.15s ease;
		white-space: nowrap;
	}

	.tab-btn:hover {
		background: var(--color-bg-secondary, #f2f2f7);
		color: var(--color-text);
	}

	.tab-btn.active {
		background: var(--color-primary);
		color: #ffffff;
	}

	.alert {
		padding: 12px 16px;
		border-radius: var(--radius-md, 12px);
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 0.9rem;
	}

	.alert.success {
		background: rgba(52, 199, 89, 0.12);
		color: #34c759;
		border: 1px solid rgba(52, 199, 89, 0.25);
	}

	.alert.error {
		background: rgba(255, 59, 48, 0.12);
		color: #ff3b30;
		border: 1px solid rgba(255, 59, 48, 0.25);
	}

	.admin-content {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.stats-grid {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.status-items {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.status-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 0;
		border-bottom: 1px solid var(--color-border);
	}

	.status-row:last-child {
		border-bottom: none;
	}

	.status-meta {
		display: flex;
		align-items: center;
		gap: 10px;
		font-weight: 500;
	}

	.storage-val {
		font-weight: 600;
		font-family: monospace;
		font-size: 0.95rem;
	}

	.counts-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 12px;
	}

	@media (min-width: 640px) {
		.counts-grid {
			grid-template-columns: repeat(4, 1fr);
		}
	}

	.count-card {
		background: var(--color-bg-secondary, #f2f2f7);
		padding: 16px;
		border-radius: var(--radius-md, 12px);
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 4px;
	}

	.count-number {
		font-size: 1.75rem;
		font-weight: 700;
		color: var(--color-primary);
	}

	.count-label {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
	}

	.settings-container {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.settings-form {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.form-fields {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.fields-row {
		display: grid;
		grid-template-columns: 1fr;
		gap: 16px;
	}

	@media (min-width: 640px) {
		.fields-row {
			grid-template-columns: 1fr 1fr;
		}
	}

	.toggle-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		cursor: pointer;
		padding: 12px 14px;
		background: var(--color-bg-secondary, #f2f2f7);
		border-radius: var(--radius-md, 12px);
		gap: 16px;
	}

	.toggle-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.toggle-label {
		font-weight: 600;
		font-size: 0.95rem;
	}

	.toggle-desc {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
	}

	.toggle-checkbox {
		width: 22px;
		height: 22px;
		accent-color: var(--color-primary);
		cursor: pointer;
		flex-shrink: 0;
	}

	.form-submit-row {
		display: flex;
		justify-content: flex-end;
		margin-top: 16px;
	}

	.test-mail-form {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.users-table-wrap {
		overflow-x: auto;
	}

	.users-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
		text-align: left;
	}

	.users-table th {
		padding: 12px 10px;
		border-bottom: 2px solid var(--color-border);
		color: var(--color-text-secondary);
		font-weight: 600;
	}

	.users-table td {
		padding: 12px 10px;
		border-bottom: 1px solid var(--color-border);
		vertical-align: middle;
	}

	.users-table tr.locked {
		opacity: 0.6;
		background: rgba(0, 0, 0, 0.02);
	}

	.active-pill {
		color: #34c759;
		font-weight: 600;
	}

	.locked-pill {
		color: #ff3b30;
		font-weight: 600;
	}

	.actions-col {
		text-align: right;
	}

	.user-actions {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.action-icon-btn {
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

	.action-icon-btn:hover {
		background: var(--color-bg-secondary, #e5e5ea);
		color: var(--color-text);
	}

	.action-icon-btn.delete:hover {
		background: rgba(255, 59, 48, 0.15);
		color: #ff3b30;
	}

	.current-user-tag {
		font-size: 0.8rem;
		color: var(--color-text-secondary);
		font-style: italic;
	}

	.dialog-text {
		font-size: 0.95rem;
		color: var(--color-text);
		line-height: 1.5;
	}
</style>
