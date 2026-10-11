import { defineConfig } from 'vitest/config';

// Own config so vitest does not pick up the web app's (jsdom, setup files).
export default defineConfig({ test: { environment: 'node' } });
