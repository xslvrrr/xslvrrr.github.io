import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '../../../lib/session';
import { logger } from '../../../lib/logger';
import { findUserById } from '../../../lib/users';

// API endpoint to get data that was synced from the extension
export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    try {
        const session = await getSession(req, res);

        // Check if user has a valid session
        if (session.loggedIn && session.userId) {
            const user = await findUserById(session.userId);

            if (user?.portalData) {
                // Has session and has data - return it
                logger.debug('[Extension Data] Returning user data from database');
                return res.status(200).json({
                    user: { name: user.name, school: user.school, uid: user.millenniumUid },
                    ...user.portalData,
                    lastUpdated: user.lastSync
                });
            } else {
                // Has session but no data - needs to sync
                logger.debug('[Extension Data] User has session but no data');
                return res.status(401).json({
                    message: 'No data available. Please sync with the browser extension.',
                    needsSync: true,
                    hasSession: true
                });
            }
        }

        // No valid session at all - needs to install extension first
        logger.debug('[Extension Data] No session - needs extension install');
        return res.status(401).json({
            message: 'Please install the browser extension and sync your data.',
            needsSync: false,
            hasSession: false
        });

    } catch (error: any) {
        logger.error('[Extension Data] Error:', error);
        return res.status(500).json({
            message: 'Failed to get data',
            error: error.message
        });
    }
}
