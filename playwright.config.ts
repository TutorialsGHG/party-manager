import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'npm run build && npm run preview',
		port: 4173,
		env: { ORIGIN: 'http://localhost:4173' }
	},
	testMatch: '**/*.e2e.{ts,js}'
});
