import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A backup that cannot be restored is worth nothing, and BACKUP.md states outright
 * that /data without /config is worthless. Nothing in the suite proved that: every
 * existing crypto test runs inside one process, where `master-key.ts` serves the
 * unwrapped private key from a module-level cache. A restore performed in-process
 * would therefore pass even if the key files on disk were corrupt or absent.
 *
 * These tests run the writer and the reader as separate child processes against
 * separate directory trees, so a restore has to survive a genuine cold start -
 * which is what a real restore after a container or host restart is.
 */
// This file lives at tests/unit/security/, so the helpers directory is two levels up.
const TESTS_DIR = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const HELPERS = path.join(TESTS_DIR, 'helpers');
const WRITER = path.join(HELPERS, 'backup-writer.ts');
const READER = path.join(HELPERS, 'backup-reader.ts');
const LOADER = path.join(HELPERS, 'run-helper.ts');
const ROOT = path.resolve('.roundtrip-tmp');
const PASSPHRASE = 'roundtrip-fixture-passphrase-not-secret';

interface WriterResult {
	ok: boolean;
	userId: string;
	eventId: string;
	guestId: string;
	mediaId: string;
	plaintextSize: number;
	blobSha: string;
}

interface ReaderResult {
	title: string;
	description: string;
	locationName: string;
	originalFilename: string;
	plaintextSize: number;
	blobSha: string;
	blobOnDisk: number;
}

/**
 * Runs one helper in a cold child process and returns its JSON stdout.
 *
 * The child is plain `node` running tests/helpers/run-helper.ts, which loads the
 * helper through Vite's own module runner. It used to be `npx vite-node`, which
 * pulled an undeclared package from the npm registry on every run - see issue #10
 * and the reasoning in run-helper.ts.
 */
function runHelper(script: string, env: Record<string, string>): any {
	const out = execFileSync(
		process.execPath,
		['--experimental-strip-types', '--no-warnings', LOADER, script],
		{
			env: { ...process.env, ENCRYPTION_PASSPHRASE: PASSPHRASE, ...env },
			encoding: 'utf8',
			cwd: path.resolve('.'),
			stdio: ['ignore', 'pipe', 'pipe']
		}
	);
	const line = out
		.trim()
		.split('\n')
		.filter((l) => l.startsWith('{'))
		.pop();
	return JSON.parse(line!);
}

function copyDir(from: string, to: string): void {
	fs.cpSync(from, to, { recursive: true });
}

describe('Backup / Restore round-trip', () => {
	let written: WriterResult;
	let restoredRoot: string;

	beforeAll(() => {
		fs.rmSync(ROOT, { recursive: true, force: true });
		fs.mkdirSync(ROOT, { recursive: true });

		// Phase 1: fresh install, write encrypted data.
		written = runHelper(WRITER, { ROUNDTRIP_DIR: path.join(ROOT, 'live') });

		// Phase 2: the "backup" is a copy of both volumes, as BACKUP.md prescribes.
		restoredRoot = path.join(ROOT, 'restored');
		copyDir(path.join(ROOT, 'live', 'data'), path.join(restoredRoot, 'data'));
		copyDir(path.join(ROOT, 'live', 'config'), path.join(restoredRoot, 'config'));
	}, 120_000);

	afterAll(() => {
		fs.rmSync(ROOT, { recursive: true, force: true });
	});

	it('writes both volumes: the database with data AND the key store', () => {
		expect(written.ok).toBe(true);
		const dataFiles = fs.readdirSync(path.join(ROOT, 'live', 'data')).sort();
		const keyFiles = fs.readdirSync(path.join(ROOT, 'live', 'config', 'keys'));
		expect(dataFiles).toContain('app.db');
		expect(keyFiles).toContain('master_pub.pem');
		expect(keyFiles).toContain('master_priv.pem.enc');
	});

	it('stores the database ciphertext, never the plaintext it contains', () => {
		const db = fs.readFileSync(path.join(ROOT, 'live', 'data', 'app.db'));
		// The event title only ever exists as ciphertext in the database file.
		expect(db.includes(Buffer.from('Backup Runtrip Sommerfest', 'utf8'))).toBe(false);
		expect(db.includes(Buffer.from('Glutenfrei', 'utf8'))).toBe(false);
	});

	it('restores every encrypted field after a cold restart', () => {
		const read = runHelper(READER, {
			ROUNDTRIP_DIR: restoredRoot,
			ROUNDTRIP_EVENT_ID: written.eventId,
			ROUNDTRIP_USER_ID: written.userId,
			ROUNDTRIP_MEDIA_ID: written.mediaId
		}) as ReaderResult;

		expect(read.title).toBe('Backup Runtrip Sommerfest');
		expect(read.description).toBe('Wiederherstellung muss diesen Klartext liefern');
		expect(read.locationName).toBe('Schulhof');
		expect(read.originalFilename).toBe('rundtrip.jpg');
	}, 120_000);

	it('restores the encrypted media blob bit-for-bit', () => {
		const read = runHelper(READER, {
			ROUNDTRIP_DIR: restoredRoot,
			ROUNDTRIP_EVENT_ID: written.eventId,
			ROUNDTRIP_USER_ID: written.userId,
			ROUNDTRIP_MEDIA_ID: written.mediaId
		}) as ReaderResult;

		expect(read.blobSha).toBe(written.blobSha);
		expect(read.plaintextSize).toBe(written.plaintextSize);
		// The blob on disk is larger than the plaintext: chunk overhead proves it is
		// genuinely encrypted rather than merely stored.
		expect(read.blobOnDisk).toBeGreaterThan(written.plaintextSize);
	}, 120_000);

	it('fails loudly when /config is missing - the documented data-loss case', () => {
		const dataOnly = path.join(ROOT, 'data-only');
		fs.rmSync(dataOnly, { recursive: true, force: true });
		copyDir(path.join(ROOT, 'live', 'data'), path.join(dataOnly, 'data'));

		// No config directory at all: this is the backup people take by accident.
		let failed = false;
		let output = '';
		try {
			runHelper(READER, {
				ROUNDTRIP_DIR: dataOnly,
				ROUNDTRIP_EVENT_ID: written.eventId,
				ROUNDTRIP_USER_ID: written.userId,
				ROUNDTRIP_MEDIA_ID: written.mediaId
			});
		} catch (err) {
			failed = true;
			output = String((err as { stderr?: string }).stderr || err);
		}

		expect(failed).toBe(true);
		// It must not silently succeed with empty/garbage data.
		expect(output.length).toBeGreaterThan(0);
	}, 120_000);

	it('refuses to decrypt with the wrong passphrase instead of returning garbage', () => {
		let failed = false;
		try {
			execFileSync(
				process.execPath,
				['--experimental-strip-types', '--no-warnings', LOADER, READER],
				{
					env: {
						...process.env,
						ENCRYPTION_PASSPHRASE: 'wrong-passphrase',
						ROUNDTRIP_DIR: restoredRoot,
						ROUNDTRIP_EVENT_ID: written.eventId,
						ROUNDTRIP_USER_ID: written.userId,
						ROUNDTRIP_MEDIA_ID: written.mediaId
					},
					encoding: 'utf8',
					cwd: path.resolve('.'),
					stdio: ['ignore', 'pipe', 'pipe']
				}
			);
		} catch {
			failed = true;
		}
		expect(failed).toBe(true);
	}, 120_000);
});
