import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db/client';

export const GET: RequestHandler = () => {
	try {
		const db = getDb();
		db.prepare('SELECT 1').get();

		return json(
			{
				status: 'ok',
				uptime: Math.floor(process.uptime()),
				timestamp: new Date().toISOString()
			},
			{
				headers: {
					'Cache-Control': 'no-store'
				}
			}
		);
	} catch (err) {
		console.error('Healthcheck failed:', err);
		return json(
			{
				status: 'error',
				error: 'database_unavailable'
			},
			{
				status: 503,
				headers: {
					'Cache-Control': 'no-store'
				}
			}
		);
	}
};
