/**
 * Test Environment Guard
 * 
 * Ensures tests never run against production. Validates that DATABASE_URL_TEST
 * is set and differs from DATABASE_URL. Provides a configured fetch wrapper.
 */

export const TEST_BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

/**
 * Validates the test environment is safe to use.
 * Call this before any test suite runs.
 */
export function assertTestEnvironment(): void {
  const testDbUrl = process.env.DATABASE_URL_TEST;
  const prodDbUrl = process.env.DATABASE_URL;

  if (!testDbUrl) {
    console.warn(
      '⚠️  DATABASE_URL_TEST is not set. Tests will run against the in-memory store.\n' +
      '   To test against a real Neon branch, set DATABASE_URL_TEST in .env.test.local'
    );
    return;
  }

  if (testDbUrl === prodDbUrl) {
    throw new Error(
      '🛑 SAFETY CHECK FAILED: DATABASE_URL_TEST is identical to DATABASE_URL.\n' +
      '   Tests must run against an isolated database branch, not production.\n' +
      '   Create a Neon branch and set DATABASE_URL_TEST to the branch connection string.'
    );
  }

  console.log('✅ Test environment validated — using isolated test database.');
}

/**
 * Helper to make API requests to the test server.
 */
export async function testFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${TEST_BASE_URL}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-device-id': 'test-device-001',
      ...options.headers,
    },
  });
}

/**
 * Helper to make API requests with a specific device ID (for rate limiting tests).
 */
export async function testFetchAs(
  deviceId: string,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${TEST_BASE_URL}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-device-id': deviceId,
      ...options.headers,
    },
  });
}
