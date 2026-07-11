// tests/launchToken.test.js
//
// Unit tests for src/utils/launchToken.js
// Covers the new system-backend verification flow.

import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';

const VALID_CLAIMS = {
  phone: '251911223344',
  username: 'Abebe',
  balance: 500,
  gameId: 'game_abc',
};

const { verifyLaunchToken } = await import('../src/utils/launchToken.js');

describe('verifyLaunchToken', () => {
  let originalSystemBackendUrl;

  beforeEach(() => {
    originalSystemBackendUrl = process.env.SYSTEM_BACKEND_URL;
    process.env.SYSTEM_BACKEND_URL = 'https://system-backend.example';
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    if (originalSystemBackendUrl === undefined) {
      delete process.env.SYSTEM_BACKEND_URL;
    } else {
      process.env.SYSTEM_BACKEND_URL = originalSystemBackendUrl;
    }
    vi.unstubAllGlobals();
  });

  it('returns the claims from the system-backend verification response', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ valid: true, ...VALID_CLAIMS }),
    });

    const result = await verifyLaunchToken('token');

    expect(fetch).toHaveBeenCalledWith(
      'https://system-backend.example/api/verify-launch-token',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ launch: 'token' }),
      })
    );
    expect(result).toEqual({
      phone: '251911223344',
      username: 'Abebe',
      balance: 500,
      gameId: 'game_abc',
    });
  });

  it('returns null when the system backend reports an invalid launch token', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ valid: false }),
    });

    await expect(verifyLaunchToken('token')).resolves.toBeNull();
  });

  it('throws when the system backend URL is missing', async () => {
    delete process.env.SYSTEM_BACKEND_URL;

    await expect(verifyLaunchToken('token')).rejects.toThrow('SYSTEM_BACKEND_URL is not configured');
  });

  it('returns null for empty tokens before contacting the system backend', async () => {
    await expect(verifyLaunchToken('   ')).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
