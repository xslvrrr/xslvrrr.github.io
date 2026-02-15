import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const session = await getServerSession(req, res, authOptions);
    const token = (session as any)?.accessToken as string | undefined;

    if (!token) {
        return res.status(200).json({ ok: true });
    }

    try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        return res.status(200).json({ ok: true });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to revoke token' });
    }
}
