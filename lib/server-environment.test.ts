import { describe, expect, it } from 'vitest';
import { validateProductionEnvironment } from './server-environment';

const validProductionEnvironment = {
  NODE_ENV: 'production',
  SESSION_SECRET: 'session-secret-with-at-least-32-characters',
  PORTAL_CREDENTIALS_SECRET: 'different-portal-secret-with-32-characters',
  CRON_SECRET: 'retention-cron-secret-with-at-least-32-characters',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'server-only-service-role-key',
  OPENROUTER_API_KEY: 'server-only-openrouter-key',
};

describe('production environment validation', () => {
  it('accepts a complete production environment', () => {
    expect(() => validateProductionEnvironment(validProductionEnvironment)).not.toThrow();
  });

  it('reports every missing required variable without values', () => {
    expect(() => validateProductionEnvironment({ NODE_ENV: 'production' })).toThrow(
      /SESSION_SECRET is required[\s\S]*OPENROUTER_API_KEY is required/,
    );
  });

  it('requires distinct secrets and an HTTPS Supabase URL', () => {
    const sharedSecret = 'shared-secret-with-at-least-32-characters';
    expect(() => validateProductionEnvironment({
      ...validProductionEnvironment,
      SESSION_SECRET: sharedSecret,
      PORTAL_CREDENTIALS_SECRET: sharedSecret,
      SUPABASE_URL: 'http://example.supabase.co',
    })).toThrow(/must be different[\s\S]*must use HTTPS/);
  });

  it('allows incomplete local development configuration', () => {
    expect(() => validateProductionEnvironment({ NODE_ENV: 'development' })).not.toThrow();
  });
});
