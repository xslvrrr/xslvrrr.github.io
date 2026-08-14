export const REQUIRED_PRODUCTION_ENVIRONMENT = [
  'SESSION_SECRET',
  'EXPORT_SIGNING_SECRET',
  'PORTAL_CREDENTIALS_SECRET',
  'CLASSROOM_SYNC_TOKEN_SECRET',
  'CRON_SECRET',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENROUTER_API_KEY',
] as const;

export type RequiredProductionEnvironmentName = typeof REQUIRED_PRODUCTION_ENVIRONMENT[number];
export type ServerEnvironmentSource = Readonly<Record<string, string | undefined>>;

function readTrimmed(environment: ServerEnvironmentSource, name: RequiredProductionEnvironmentName): string | null {
  const value = environment[name]?.trim();
  return value || null;
}

const APPLICATION_SECRET_NAMES = [
  'SESSION_SECRET',
  'EXPORT_SIGNING_SECRET',
  'PORTAL_CREDENTIALS_SECRET',
  'CLASSROOM_SYNC_TOKEN_SECRET',
  'CRON_SECRET',
] as const;

function looksLikePlaceholder(value: string): boolean {
  const normalized = value.toLowerCase();
  return normalized.startsWith('replace-with-')
    || normalized.includes('your-project')
    || normalized.includes('example-secret')
    || normalized === 'changeme'
    || normalized === 'password';
}

function hasAdequateSecretDiversity(value: string): boolean {
  return new Set(value).size >= 16;
}

export function validateProductionEnvironment(environment: ServerEnvironmentSource = process.env): void {
  if (environment.NODE_ENV !== 'production') return;

  const issues: string[] = [];
  const values = Object.fromEntries(
    REQUIRED_PRODUCTION_ENVIRONMENT.map((name) => [name, readTrimmed(environment, name)]),
  ) as Record<RequiredProductionEnvironmentName, string | null>;

  for (const name of REQUIRED_PRODUCTION_ENVIRONMENT) {
    const value = values[name];
    if (!value) {
      issues.push(`${name} is required`);
    } else if (looksLikePlaceholder(value)) {
      issues.push(`${name} must not use a documented placeholder value`);
    }
  }

  for (const name of APPLICATION_SECRET_NAMES) {
    const value = values[name];
    if (value && !hasAdequateSecretDiversity(value)) {
      issues.push(`${name} must be generated with adequate random character diversity`);
    }
  }

  if (values.SESSION_SECRET && values.SESSION_SECRET.length < 32) {
    issues.push('SESSION_SECRET must contain at least 32 characters');
  }
  if (values.EXPORT_SIGNING_SECRET && values.EXPORT_SIGNING_SECRET.length < 32) {
    issues.push('EXPORT_SIGNING_SECRET must contain at least 32 characters');
  }
  if (values.PORTAL_CREDENTIALS_SECRET && values.PORTAL_CREDENTIALS_SECRET.length < 32) {
    issues.push('PORTAL_CREDENTIALS_SECRET must contain at least 32 characters');
  }
  if (values.CLASSROOM_SYNC_TOKEN_SECRET && values.CLASSROOM_SYNC_TOKEN_SECRET.length < 32) {
    issues.push('CLASSROOM_SYNC_TOKEN_SECRET must contain at least 32 characters');
  }
  if (values.CRON_SECRET && values.CRON_SECRET.length < 32) {
    issues.push('CRON_SECRET must contain at least 32 characters');
  }
  if (
    values.SESSION_SECRET
    && values.PORTAL_CREDENTIALS_SECRET
    && values.SESSION_SECRET === values.PORTAL_CREDENTIALS_SECRET
  ) {
    issues.push('SESSION_SECRET and PORTAL_CREDENTIALS_SECRET must be different');
  }
  if (
    values.EXPORT_SIGNING_SECRET
    && (
      values.EXPORT_SIGNING_SECRET === values.SESSION_SECRET
      || values.EXPORT_SIGNING_SECRET === values.PORTAL_CREDENTIALS_SECRET
      || values.EXPORT_SIGNING_SECRET === values.CRON_SECRET
    )
  ) {
    issues.push('EXPORT_SIGNING_SECRET must be different from other application secrets');
  }
  if (
    values.CRON_SECRET
    && (
      values.CRON_SECRET === values.SESSION_SECRET
      || values.CRON_SECRET === values.PORTAL_CREDENTIALS_SECRET
    )
  ) {
    issues.push('CRON_SECRET must be different from session and portal credential secrets');
  }
  if (
    values.CLASSROOM_SYNC_TOKEN_SECRET
    && (
      values.CLASSROOM_SYNC_TOKEN_SECRET === values.SESSION_SECRET
      || values.CLASSROOM_SYNC_TOKEN_SECRET === values.EXPORT_SIGNING_SECRET
      || values.CLASSROOM_SYNC_TOKEN_SECRET === values.PORTAL_CREDENTIALS_SECRET
      || values.CLASSROOM_SYNC_TOKEN_SECRET === values.CRON_SECRET
    )
  ) {
    issues.push('CLASSROOM_SYNC_TOKEN_SECRET must be different from other application secrets');
  }

  if (values.SUPABASE_URL) {
    try {
      const url = new URL(values.SUPABASE_URL);
      if (url.protocol !== 'https:') issues.push('SUPABASE_URL must use HTTPS in production');
    } catch {
      issues.push('SUPABASE_URL must be a valid absolute URL');
    }
  }

  if (issues.length > 0) {
    throw new Error(`Invalid production environment:\n- ${issues.join('\n- ')}`);
  }
}

export interface SupabaseServerEnvironment {
  url: string;
  serviceRoleKey: string;
}

export function readSupabaseServerEnvironment(
  environment: ServerEnvironmentSource = process.env,
): SupabaseServerEnvironment | null {
  validateProductionEnvironment(environment);
  const url = environment.SUPABASE_URL?.trim();
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && serviceRoleKey ? { url, serviceRoleKey } : null;
}
