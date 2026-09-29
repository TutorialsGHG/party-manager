import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter()
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					fileParallelism: false,
					env: {
						// Isolated storage per test run. Without this, unit tests write their
						// master key and database into the default ./config and ./data
						// directories, which the dev/e2e server then tries to open - and
						// fails as soon as the two disagree about the encryption passphrase.
						ENCRYPTION_PASSPHRASE: 'test-passphrase-not-a-real-secret',
						DATA_DIR: '.test-data',
						DATABASE_PATH: '.test-data/app.db',
						BLOB_STORAGE_PATH: '.test-data/blobs',
						CONFIG_DIR: '.test-config',
						MASTER_KEY_DIR: '.test-config/keys',
						EVENTS_KEY_DIR: '.test-config/keys/events'
					}
				}
			}
		]
	}
});
