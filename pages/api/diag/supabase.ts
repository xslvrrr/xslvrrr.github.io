import { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const results: any = {
        config: {
            hasUrl: !!process.env.SUPABASE_URL,
            hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
            urlPrefix: process.env.SUPABASE_URL?.substring(0, 15),
            keyPrefix: process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 10),
        },
        tables: {}
    };

    const tablesToCheck = ['users', 'login_tokens', 'classroom_data'];

    for (const table of tablesToCheck) {
        try {
            const { data, error, count } = await supabaseAdmin
                .from(table)
                .select('*', { count: 'exact', head: true });

            results.tables[table] = {
                status: error ? 'error' : 'ok',
                error: error ? {
                    code: error.code,
                    message: error.message,
                    details: error.details
                } : null,
                count: count
            };
        } catch (err: any) {
            results.tables[table] = {
                status: 'exception',
                error: err.message
            };
        }
    }

    return res.status(200).json(results);
}
