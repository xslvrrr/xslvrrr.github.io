import { supabaseAdmin } from './supabase';

const TOKEN_TTL_MS = 10 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;

export async function createLoginToken(userId: string, codeChallenge?: string): Promise<string> {
    if (codeChallenge && !CODE_CHALLENGE_PATTERN.test(codeChallenge)) {
        throw new Error('Invalid desktop login challenge');
    }
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

    const { error } = await supabaseAdmin
        .from('login_tokens')
        .insert({
            token,
            user_id: userId,
            expires_at: expiresAt,
            code_challenge: codeChallenge || null,
        });

    if (error) throw error;
    return token;
}

export async function validateAndConsumeToken(
    token: string,
    codeVerifier?: string,
): Promise<string | null> {
    if (!UUID_PATTERN.test(token)) return null;

    const desktopFlow = typeof codeVerifier === 'string';
    if (desktopFlow && !CODE_VERIFIER_PATTERN.test(codeVerifier)) return null;
    const { data, error } = desktopFlow
        ? await supabaseAdmin.rpc('consume_desktop_login_token', {
            p_token: token,
            p_code_verifier: codeVerifier,
        })
        : await supabaseAdmin.rpc('consume_login_token', { p_token: token });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return typeof row?.user_id === 'string' ? row.user_id : null;
}
