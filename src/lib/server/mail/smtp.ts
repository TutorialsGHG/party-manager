import nodemailer from 'nodemailer';
import { SettingsRepository } from '$lib/server/db/repositories/settings.repository.js';

export interface SendMailResult {
	success: boolean;
	error?: string;
	messageId?: string;
}

/**
 * Sends a test email using the encrypted system SMTP settings.
 */
export async function sendTestMail(toEmail: string): Promise<SendMailResult> {
	const settings = SettingsRepository.getAllSettings();

	if (!settings.smtpHost) {
		return {
			success: false,
			error: 'Kein SMTP-Host konfiguriert. Bitte trage die Serverdaten ein.'
		};
	}

	try {
		const transportOptions = {
			host: settings.smtpHost,
			port: settings.smtpPort,
			secure: settings.smtpSecure,
			auth: settings.smtpUser
				? {
						user: settings.smtpUser,
						pass: settings.smtpPass
					}
				: undefined,
			connectionTimeout: 10000,
			greetingTimeout: 10000,
			socketTimeout: 15000
		};

		const transporter = nodemailer.createTransport(transportOptions as any);

		// Verify SMTP connection
		await transporter.verify();

		const info = await transporter.sendMail({
			from: settings.smtpFrom || `"Einladung App" <noreply@${settings.smtpHost}>`,
			to: toEmail,
			subject: 'Einladung - SMTP Test-E-Mail',
			text: 'Herzlichen Glückwunsch! Deine SMTP-Konfiguration in Einladung funktioniert einwandfrei.',
			html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: #1c1c1e;">
          <h2 style="color: #007AFF; margin-top: 0;">SMTP Test-E-Mail</h2>
          <p>Herzlichen Glückwunsch!</p>
          <p>Deine E-Mail-Einstellungen in der <strong>Einladung</strong> App sind korrekt eingerichtet und einsatzbereit.</p>
          <hr style="border: none; border-top: 1px solid #e5e5ea; margin: 20px 0;" />
          <p style="font-size: 12px; color: #8e8e93;">Gesendet von deiner selbst gehosteten Party-App Einladung.</p>
        </div>
      `
		});

		return {
			success: true,
			messageId: info.messageId
		};
	} catch (err: any) {
		console.error('SMTP test mail failed:', err);
		return {
			success: false,
			error: err.message || 'Verbindung zum SMTP-Server fehlgeschlagen.'
		};
	}
}
