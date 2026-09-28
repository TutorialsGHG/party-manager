import { z } from 'zod';

export const registerSchema = z.object({
	email: z.string().email().max(255),
	password: z.string().min(8).max(128),
	challenge: z.string().min(1),
	nonce: z.string().min(1),
	difficulty: z.coerce.number().int().min(1).max(8),
	expiresAt: z.coerce.number().int(),
	signature: z.string().min(1)
});

export const loginSchema = z.object({
	email: z.string().email().max(255),
	password: z.string().min(1).max(128)
});

export const eventSchema = z.object({
	title: z.string().min(1).max(120),
	description: z.string().max(4000).optional().default(''),
	dateStart: z.string().min(1),
	dateEnd: z.string().optional().nullable(),
	locationName: z.string().max(120).optional().default(''),
	locationAddress: z.string().max(300).optional().default(''),
	accentColor: z
		.string()
		.regex(/^#[0-9A-Fa-f]{6}$/)
		.default('#007AFF'),
	maxCompanions: z.coerce.number().int().min(0).max(20).default(0)
});

export const rsvpSchema = z.object({
	status: z.enum(['yes', 'maybe', 'no']),
	companionCount: z.coerce.number().int().min(0).max(20).default(0),
	companionNames: z.string().max(500).optional().default(''),
	notes: z.string().max(1000).optional().default('')
});

export const wallPostSchema = z.object({
	content: z.string().min(1).max(2000)
});

export const pollVoteSchema = z.object({
	pollId: z.string().min(1),
	optionIds: z.array(z.string().min(1)).min(1)
});
