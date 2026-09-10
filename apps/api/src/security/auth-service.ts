import type { FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AppError } from '@talentmatch/shared';

export type AuthRole = 'candidate' | 'employer';

export interface AuthIdentity {
  readonly subject: string;
  readonly roles: readonly AuthRole[];
}

export interface TokenVerifier {
  verify(token: string): Promise<AuthIdentity>;
}

interface AuthServiceOptions {
  readonly enabled: boolean;
  readonly verifier?: TokenVerifier;
}

export class AuthService {
  public constructor(private readonly options: AuthServiceOptions) {}

  public async require(request: FastifyRequest, role: AuthRole): Promise<AuthIdentity> {
    const identity = this.options.enabled
      ? await this.verifyBearer(request.headers.authorization)
      : developmentIdentity(request);
    if (!identity.roles.includes(role)) {
      throw new AppError('FORBIDDEN', 'Insufficient permissions', 403);
    }
    return identity;
  }

  private async verifyBearer(authorization: string | undefined): Promise<AuthIdentity> {
    if (authorization === undefined || !authorization.startsWith('Bearer ')) {
      throw new AppError('UNAUTHORIZED', 'Bearer token is required', 401);
    }
    const token = authorization.slice('Bearer '.length).trim();
    if (token === '' || this.options.verifier === undefined) {
      throw new AppError('UNAUTHORIZED', 'Bearer token is invalid', 401);
    }
    try {
      return await this.options.verifier.verify(token);
    } catch {
      throw new AppError('UNAUTHORIZED', 'Bearer token is invalid', 401);
    }
  }
}

export function createOidcVerifier(
  issuer: string,
  audience: string,
  jwksUrl: string,
): TokenVerifier {
  const keySet = createRemoteJWKSet(new URL(jwksUrl), { timeoutDuration: 3_000 });
  return {
    verify: async (token) => {
      const { payload } = await jwtVerify(token, keySet, { issuer, audience });
      if (payload.sub === undefined) throw new Error('Token subject is missing');
      const roleValues = Array.isArray(payload['roles'])
        ? payload['roles']
        : typeof payload['role'] === 'string' ? [payload['role']] : [];
      const roles = roleValues.filter((role): role is AuthRole => (
        role === 'candidate' || role === 'employer'
      ));
      return { subject: payload.sub, roles };
    },
  };
}

function developmentIdentity(request: FastifyRequest): AuthIdentity {
  const subjectHeader = request.headers['x-development-subject'];
  const roleHeader = request.headers['x-development-role'];
  const subject = typeof subjectHeader === 'string' && subjectHeader !== ''
    ? subjectHeader
    : 'development-user';
  const roles: AuthRole[] = roleHeader === 'candidate' || roleHeader === 'employer'
    ? [roleHeader]
    : ['candidate', 'employer'];
  return { subject, roles };
}
