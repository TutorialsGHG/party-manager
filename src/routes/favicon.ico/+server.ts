import type { RequestHandler } from './$types';

// Some browsers request the conventional ICO path even though the document
// declares the SVG icon. Redirecting keeps that compatibility request quiet.
export const GET: RequestHandler = () =>
	new Response(null, {
		status: 307,
		headers: {
			Location: '/favicon.svg'
		}
	});
