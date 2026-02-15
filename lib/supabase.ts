import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Initialize Supabase Admin client with service role key if available
export const supabaseAdmin = (supabaseUrl && supabaseServiceKey)
    ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            persistSession: false
        }
    })
    : null as any;

if (!supabaseAdmin) {
    console.error('CRITICAL: Supabase environment variables are missing. Supabase functionality will be disabled.');
}
