import { NextApiRequest, NextApiResponse } from 'next';
import { logger } from '../../../lib/logger';
import { upsertUserFromSync } from '../../../lib/users';
import { createLoginToken } from '../../../lib/tokens';

// API endpoint to receive data from the browser extension
export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    // Enable CORS for extension
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    try {
        const data = req.body;

        logger.info('[Extension Sync] Received data from extension:', {
            user: data.user,
            timetableCount: data.timetable?.weekA?.length || data.timetable?.length || 0,
            noticesCount: data.notices?.length || 0,
            gradesCount: data.grades?.length || 0,
            attendanceYearly: data.attendance?.yearly?.length || 0,
            attendanceSubjects: data.attendance?.subjects?.length || 0
        });

        // Validate the data
        if (!data || !data.lastUpdated) {
            return res.status(400).json({ message: 'Invalid data format' });
        }

        // Create or update user account
        const user = await upsertUserFromSync({
            user: {
                name: data.user?.name || '',
                school: data.user?.school || '',
                uid: data.user?.uid || ''
            },
            timetable: data.timetable,
            notices: data.notices,
            grades: data.grades,
            attendance: data.attendance,
            calendar: data.calendar,
            reports: data.reports,
            classes: data.classes,
            lastUpdated: data.lastUpdated
        });

        logger.info('[Extension Sync] User account updated:', user.id);

        // Generate a one-time login token for the browser
        const loginToken = await createLoginToken(user.id);

        logger.info('[Extension Sync] Login token generated:', loginToken.substring(0, 8) + '...');

        return res.status(200).json({
            success: true,
            message: 'Data synced successfully',
            userId: user.id,
            loginToken: loginToken,
            counts: {
                timetable: data.timetable?.weekA?.length || data.timetable?.length || 0,
                notices: data.notices?.length || 0,
                grades: data.grades?.length || 0,
                attendanceYears: data.attendance?.yearly?.length || 0,
                attendanceSubjects: data.attendance?.subjects?.length || 0,
                calendar: data.calendar?.length || 0,
                reports: data.reports?.length || 0
            }
        });

    } catch (error: any) {
        logger.error('[Extension Sync] Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to sync data',
            error: error.message
        });
    }
}
