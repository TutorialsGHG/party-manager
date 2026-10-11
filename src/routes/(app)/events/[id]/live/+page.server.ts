import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { findEventById } from '$lib/server/db/repositories/event.repository';
import { MediaRepository } from '$lib/server/db/repositories/media.repository';
import { requireUser } from '$lib/server/auth/require-user';
import { config } from '$lib/server/config/env';
import { generateQrSvg } from '$lib/features/events/qr';

export const load: PageServerLoad = async ({ params, locals }) => {
	const user = requireUser(locals);
	const event = findEventById(params.id!, user.id);
	if (!event) {
		throw error(404, 'Event nicht gefunden oder keine Berechtigung.');
	}

	const mediaItems = MediaRepository.listByEvent(event.id).filter((m) => m.status === 'ready');
	const inviteToken = event.token || '';
	const inviteUrl = inviteToken ? `${config.baseUrl}/e/${inviteToken}` : '';
	const qrSvg = inviteUrl ? await generateQrSvg(inviteUrl, '#ffffff') : '';

	const { tokenHash: _tokenHash, ...safeEvent } = event;

	return {
		event: safeEvent,
		mediaItems,
		inviteUrl,
		qrSvg
	};
};
