import { supabaseAdmin } from './supabase';

const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface TokenRow {
    token: string;
    user_id: string;
    expires_at: string;
}

function isNotFoundError(error: any): boolean {
    return error?.code === 'PGRST116';
}

export async function createLoginToken(userId: string): Promise<string> {
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

    const { error } = await supabaseAdmin
        .from('login_tokens')
        .insert({ token, user_id: userId, expires_at: expiresAt });

    if (error) {
        throw error;
    }

    return token;
}

export async function validateAndConsumeToken(token: string): Promise<string | null> {
    const { data, error } = await supabaseAdmin
        .from('login_tokens')
        .select('*')
        .eq('token', token)
        .maybeSingle();

    if (error && !isNotFoundError(error)) {
        throw error;
    }

    if (!data) {
        return null;
    }

    const row = data as TokenRow;
    const expiresAt = new Date(row.expires_at).getTime();
    if (Number.isNaN(expiresAt) || expiresAt < Date.now()) {
        await supabaseAdmin.from('login_tokens').delete().eq('token', token);
        return null;
    }

    await supabaseAdmin.from('login_tokens').delete().eq('token', token);
    return row.user_id;
}
