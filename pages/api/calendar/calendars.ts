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
    if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'PATCH') {
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

        if (req.method === 'POST') {
            const { summary, backgroundColor } = req.body || {};
            if (!summary || typeof summary !== 'string') {
                return res.status(400).json({ error: 'Missing calendar summary' });
            }

            const created = await calendar.calendars.insert({
                requestBody: {
                    summary,
                },
            } as any);

            if (created.data.id && backgroundColor) {
                try {
                    await calendar.calendarList.patch({
                        calendarId: created.data.id,
                        requestBody: {
                            backgroundColor,
                        } as any,
                    });
                } catch {
                    // Best effort: color updates can fail on some calendar types.
                }
            }

            const list = await calendar.calendarList.list();
            const calendars = list.data.items || [];

            const appSession = await getSession(req, res);
            if (appSession.loggedIn && appSession.userId) {
                await updateUserGoogleCalendarMirror(appSession.userId, { calendars });
            }

            return res.status(200).json({ calendar: created.data, calendars });
        }

        if (req.method === 'PATCH') {
            const { calendarId, backgroundColor } = req.body || {};
            if (!calendarId || typeof calendarId !== 'string' || !backgroundColor || typeof backgroundColor !== 'string') {
                return res.status(400).json({ error: 'Missing calendarId or backgroundColor' });
            }

            const updated = await calendar.calendarList.patch({
                calendarId,
                requestBody: {
                    backgroundColor,
                } as any,
            });

            const list = await calendar.calendarList.list();
            const calendars = list.data.items || [];

            const appSession = await getSession(req, res);
            if (appSession.loggedIn && appSession.userId) {
                await updateUserGoogleCalendarMirror(appSession.userId, { calendars });
            }

            return res.status(200).json({ calendar: updated.data, calendars });
        }

        const response = await calendar.calendarList.list();
        const calendars = response.data.items || [];

        const appSession = await getSession(req, res);
        if (appSession.loggedIn && appSession.userId) {
            await updateUserGoogleCalendarMirror(appSession.userId, { calendars });
        }

        res.status(200).json({ calendars });
    } catch (error) {
        console.error('Calendar API error:', error);
        res.status(500).json({ error: 'Failed to fetch calendars' });
    }
}
