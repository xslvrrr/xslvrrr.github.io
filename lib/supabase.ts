import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readSupabaseServerEnvironment } from './server-environment';

const supabaseEnvironment = readSupabaseServerEnvironment();

// Database types are not generated in this repository. Keep the admin client
// schema open so Supabase does not infer every table and RPC as `never`.
type SupabaseAdminClient = SupabaseClient<any, any, any>;

function createUnavailableSupabaseAdmin(): SupabaseAdminClient {
    return new Proxy(Object.create(null), {
        get() {
            throw new Error('Supabase is unavailable because SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing');
        },
    }) as SupabaseAdminClient;
}

export const isSupabaseConfigured = supabaseEnvironment !== null;

// Production validation above fails startup before an unavailable client can be used.
// Development keeps preview-only routes usable and fails clearly on first database access.
export const supabaseAdmin: SupabaseAdminClient = supabaseEnvironment
    ? createClient(supabaseEnvironment.url, supabaseEnvironment.serviceRoleKey, {
        auth: {
            persistSession: false
        },
    })
    : createUnavailableSupabaseAdmin();
