import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { google } from 'googleapis';
import { authOptions } from '../auth/[...nextauth]';
import { getSession } from '../../../lib/session';
import { updateUserGoogleCalendarMirror } from '../../../lib/users';

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const session = await getServerSession(req, res, authOptions);

    if (!session?.accessToken) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({
            access_token: session.accessToken as string,
        });

        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const { timeMin, timeMax } = req.query;
        const calendarListResponse = await calendar.calendarList.list();
        const calendars = (calendarListResponse.data.items || []).filter((c) => c.id);

        const eventResponses = await Promise.all(
            calendars.map(async (cal) => {
                const response = await calendar.events.list({
                    calendarId: cal.id as string,
                    timeMin: timeMin as string,
                    timeMax: timeMax as string,
                    singleEvents: true,
                    orderBy: 'startTime',
                    maxResults: 250,
                });

                return (response.data.items || []).map((event) => ({
                    ...event,
                    calendarId: cal.id,
                }));
            })
        );

        const events = eventResponses.flat();

        const appSession = await getSession(req, res);
        if (appSession.loggedIn && appSession.userId) {
            await updateUserGoogleCalendarMirror(appSession.userId, { events, calendars });
        }

        res.status(200).json({ events });
    } catch (error) {
        console.error('Calendar API error:', error);
        res.status(500).json({ error: 'Failed to fetch calendar events' });
    }
}
