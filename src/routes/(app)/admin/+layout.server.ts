import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(303, '/login');
	}

	if (locals.user.role !== 'admin') {
		throw error(403, 'Zugriff verweigert: Du benötigst Administratorrechte für diesen Bereich.');
	}

	return {
		adminUser: locals.user
	};
};
