import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { google } from 'googleapis';
import { authOptions } from '../auth/[...nextauth]';

const GOOGLE_EVENT_COLORS: Record<string, string> = {
    '1': '#7986cb',
    '2': '#33b679',
    '3': '#8e24aa',
    '4': '#e67c73',
    '5': '#f6c026',
    '6': '#f5511d',
    '7': '#039be5',
    '8': '#616161',
    '9': '#3f51b5',
    '10': '#0b8043',
    '11': '#d60000',
};

const hexToRgb = (hex: string): [number, number, number] | null => {
    const cleaned = hex.replace('#', '').trim();
    if (![3, 6].includes(cleaned.length)) return null;
    const full = cleaned.length === 3 ? cleaned.split('').map((c) => c + c).join('') : cleaned;
    const value = Number.parseInt(full, 16);
    if (Number.isNaN(value)) return null;
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

const closestGoogleColorId = (hex?: string): string | undefined => {
    if (!hex) return undefined;
    const target = hexToRgb(hex);
    if (!target) return undefined;

    let bestId: string | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const [id, paletteHex] of Object.entries(GOOGLE_EVENT_COLORS)) {
        const rgb = hexToRgb(paletteHex);
        if (!rgb) continue;
        const distance =
            Math.pow(target[0] - rgb[0], 2) +
            Math.pow(target[1] - rgb[1], 2) +
            Math.pow(target[2] - rgb[2], 2);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestId = id;
        }
    }
    return bestId;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'PATCH' && req.method !== 'DELETE') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const session = await getServerSession(req, res, authOptions);
    if (!(session as any)?.accessToken) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: (session as any).accessToken as string });
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const { eventId, calendarId = 'primary', targetCalendarId, summary, description, location, start, end, allDay, color } = req.body || {};
        if (!eventId || typeof eventId !== 'string') {
            return res.status(400).json({ error: 'Missing eventId' });
        }

        if (req.method === 'DELETE') {
            try {
                await calendar.events.delete({
                    calendarId,
                    eventId,
                });
            } catch (error: any) {
                const status = error?.code || error?.response?.status;
                if (status === 404 || status === 410) {
                    // Fallback: event can exist in a different calendar than the client cached.
                    const calendarList = await calendar.calendarList.list();
                    const allCalendars = (calendarList.data.items || []).filter((c) => c.id);
                    let removedElsewhere = false;

                    for (const candidate of allCalendars) {
                        if (!candidate.id || candidate.id === calendarId) continue;
                        try {
                            await calendar.events.delete({
                                calendarId: candidate.id,
                                eventId,
                            });
                            removedElsewhere = true;
                            break;
                        } catch (innerError: any) {
                            const innerStatus = innerError?.code || innerError?.response?.status;
                            if (innerStatus === 404 || innerStatus === 410) continue;
                            throw innerError;
                        }
                    }

                    if (!removedElsewhere) {
                        return res.status(200).json({ ok: true, alreadyDeleted: true });
                    }
                } else {
                    throw error;
                }
            }
            return res.status(200).json({ ok: true });
        }

        let effectiveCalendarId = calendarId as string;
        let effectiveEventId = eventId as string;

        if (targetCalendarId && typeof targetCalendarId === 'string' && targetCalendarId !== calendarId) {
            const moved = await calendar.events.move({
                calendarId,
                eventId,
                destination: targetCalendarId,
            });
            effectiveCalendarId = targetCalendarId;
            effectiveEventId = moved.data.id || eventId;
        }

        const colorId = closestGoogleColorId(color);
        const response = await calendar.events.patch({
            calendarId: effectiveCalendarId,
            eventId: effectiveEventId,
            requestBody: {
                summary,
                description,
                location,
                start,
                end,
                ...(colorId ? { colorId } : {}),
                ...(allDay !== undefined ? { transparency: allDay ? 'transparent' : 'opaque' } : {}),
            },
        });

        return res.status(200).json({ event: response.data });
    } catch (error) {
        console.error('Calendar event API error:', error);
        return res.status(500).json({ error: 'Failed to process calendar event' });
    }
}
