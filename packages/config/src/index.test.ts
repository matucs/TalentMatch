import { describe, expect, it } from 'vitest';
import { ConfigurationError, loadConfig } from './index.js';

describe('loadConfig', () => {
  it('coerces numeric configuration and applies defaults', () => {
    const config = loadConfig({ PORT: '4000', NODE_ENV: 'test' });

    expect(config.PORT).toBe(4000);
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.NODE_ENV).toBe('test');
  });

  it('fails fast with actionable validation issues', () => {
    expect(() => loadConfig({ PORT: 'invalid' })).toThrow(ConfigurationError);
    expect(() => loadConfig({ PORT: 'invalid' })).toThrow(/PORT/);
  });

  it('parses explicit production hardening flags', () => {
    const config = loadConfig({ ENABLE_SWAGGER: 'false', TRUST_PROXY: 'true' });
    expect(config.ENABLE_SWAGGER).toBe(false);
    expect(config.TRUST_PROXY).toBe(true);
  });

  it('requires complete OIDC configuration when authentication is enabled', () => {
    expect(() => loadConfig({ AUTH_ENABLED: 'true' })).toThrow(/OIDC_ISSUER_URL/);
    expect(loadConfig({
      AUTH_ENABLED: 'true',
      OIDC_ISSUER_URL: 'https://identity.example.com/',
      OIDC_AUDIENCE: 'talentmatch-api',
      OIDC_JWKS_URL: 'https://identity.example.com/.well-known/jwks.json',
    }).AUTH_ENABLED).toBe(true);
  });
});
