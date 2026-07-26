import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Tests run sequentially since they depend on each other 
    // (e.g. create → get → report → verify hidden)
    sequence: {
      concurrent: false,
    },
    // Increase timeout for API tests (network calls + rate limiting)
    testTimeout: 30000,
    // Don't watch — run once
    watch: false,
    // Load env files
    env: {
      NODE_ENV: 'test',
    },
  },
});
