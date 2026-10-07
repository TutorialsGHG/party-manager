/**
 * Entry point for one backup/restore helper, spawned as its own Node process.
 *
 * Why this exists (issue #10): the round-trip test used to shell out to
 * `npx vite-node <script>`. `vite-node` was declared nowhere - not in package.json,
 * not in the lockfile, not in node_modules/.bin - so `npx` silently downloaded it
 * from registry.npmjs.org on every run. That broke two things at once:
 *
 *   1. AGENTS.md 5.1 "no external requests". The test suite fetched code at
 *      runtime, contradicting the one promise this app makes.
 *   2. Offline runs. With a cold npx cache the test failed with ENOTCACHED and
 *      silently skipped all six of its assertions, so a broken restore path could
 *      still look green.
 *
 * The fix is not to *declare* vite-node - that would keep the registry round-trip
 * and only document it better. It is to stop needing it.
 *
 * The helpers import `$lib/...` aliases, which plain Node cannot resolve, so the
 * loader still has to be Vite. Vite is already a declared devDependency (^8.0.16)
 * and its module runner replaces vite-node outright - vite-node is deprecated
 * upstream in favour of exactly this API.
 *
 * This file is the child process, so `master-key.ts` starts with a cold module
 * registry. That cold start is the entire point of the round-trip test: an
 * in-process restore would read the unwrapped key from a module-level cache and
 * prove nothing about the keys on disk.
 *
 * Usage: node --experimental-strip-types run-helper.ts <helper-script.ts>
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer, isRunnableDevEnvironment } from 'vite';

const script = process.argv[2];
if (!script) {
	console.error('usage: run-helper.ts <helper-script.ts>');
	process.exit(2);
}

const server = await createServer({
	configFile: path.resolve(import.meta.dirname, '..', '..', 'vite.config.ts'),
	// No HTTP server, no file watcher: this loads modules and nothing else.
	server: { middlewareMode: true, hmr: false, watch: null },
	appType: 'custom',
	logLevel: 'error'
});

try {
	const ssr = server.environments.ssr;
	if (!isRunnableDevEnvironment(ssr)) {
		throw new Error('Vite SSR environment is not runnable - cannot load helpers');
	}
	const mod = await ssr.runner.import(pathToFileURL(path.resolve(script)).href);
	// The helpers export the promise from main() so the loader can await it.
	// Closing the server before that promise settles would cut the transport out
	// from under the running helper ("transport was disconnected").
	await mod.default;
} finally {
	await server.close();
}
