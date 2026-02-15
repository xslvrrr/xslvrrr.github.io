import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '../../../lib/session';
import { findUserById } from '../../../lib/users';
import { validateAndConsumeToken } from '../../../lib/tokens';

// API endpoint to exchange a login token for a session
export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({ success: false, message: 'Token required' });
        }

        console.log('[Token Login] Validating token:', token.substring(0, 8) + '...');

        // Validate and consume the token
        const userId = await validateAndConsumeToken(token);

        if (!userId) {
            console.log('[Token Login] Token invalid or expired');
            return res.status(401).json({ success: false, message: 'Invalid or expired token' });
        }

        // Token is valid - get user and create session
        const user = await findUserById(userId);
        if (!user) {
            console.log('[Token Login] User not found:', userId);
            return res.status(401).json({ success: false, message: 'User not found' });
        }

        // Create session
        const session = await getSession(req, res);
        session.loggedIn = true;
        session.username = user.name;
        session.school = user.school;
        session.userId = user.id;
        session.timestamp = new Date().toISOString();
        await session.save();

        console.log('[Token Login] Session created for user:', user.id);

        return res.status(200).json({
            success: true,
            message: 'Login successful',
            user: {
                name: user.name,
                school: user.school
            }
        });

    } catch (error: any) {
        console.error('[Token Login] Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to login',
            error: error.message
        });
    }
}
