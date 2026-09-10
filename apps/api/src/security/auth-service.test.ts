import { describe, expect, it } from 'vitest';
import { AuthService, type TokenVerifier } from './auth-service.js';

function request(headers: Record<string, string> = {}) {
  return { headers } as Parameters<AuthService['require']>[0];
}

describe('AuthService', () => {
  it('rejects missing bearer credentials when enabled', async () => {
    const verifier: TokenVerifier = {
      verify: async () => ({ subject: 'candidate-1', roles: ['candidate'] }),
    };
    await expect(new AuthService({ enabled: true, verifier }).require(
      request(),
      'candidate',
    )).rejects.toMatchObject({ code: 'UNAUTHORIZED', statusCode: 401 });
  });

  it('enforces required roles after verification', async () => {
    const verifier: TokenVerifier = {
      verify: async () => ({ subject: 'candidate-1', roles: ['candidate'] }),
    };
    const auth = new AuthService({ enabled: true, verifier });

    await expect(auth.require(
      request({ authorization: 'Bearer valid-token' }),
      'candidate',
    )).resolves.toMatchObject({ subject: 'candidate-1' });
    await expect(auth.require(
      request({ authorization: 'Bearer valid-token' }),
      'employer',
    )).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
  });

  it('supports explicit development identities only when verification is disabled', async () => {
    const auth = new AuthService({ enabled: false });
    await expect(auth.require(request({
      'x-development-subject': 'employer-1',
      'x-development-role': 'employer',
    }), 'employer')).resolves.toEqual({ subject: 'employer-1', roles: ['employer'] });
  });
});
