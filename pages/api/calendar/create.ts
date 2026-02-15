import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { google } from 'googleapis';
import { authOptions } from '../auth/[...nextauth]';
import { getSession } from '../../../lib/session';
import { getUserGoogleCalendarMirror, updateUserGoogleCalendarMirror } from '../../../lib/users';

const normalizeText = (value: unknown): string => String(value ?? '').trim();

const toComparableDateTime = (value?: string | null): string => {
    if (!value) return '';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
};

const toISOStringOrFallback = (timestamp: number, fallback: string): string => {
    if (!Number.isFinite(timestamp)) return fallback;
    const parsed = new Date(timestamp);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
};

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

const isIdenticalEvent = (googleEvent: any, incoming: any): boolean => {
    const incomingIsAllDay = !!incoming?.start?.date;
    const googleIsAllDay = !!googleEvent?.start?.date;
    if (incomingIsAllDay !== googleIsAllDay) return false;

    const sameTitle = normalizeText(googleEvent?.summary) === normalizeText(incoming?.summary);
    const sameDescription = normalizeText(googleEvent?.description) === normalizeText(incoming?.description);
    const sameLocation = normalizeText(googleEvent?.location) === normalizeText(incoming?.location);

    if (!sameTitle || !sameDescription || !sameLocation) return false;

    if (incomingIsAllDay) {
        return (
            String(googleEvent?.start?.date || '') === String(incoming?.start?.date || '') &&
            String(googleEvent?.end?.date || '') === String(incoming?.end?.date || '')
        );
    }

    return (
        toComparableDateTime(googleEvent?.start?.dateTime) === toComparableDateTime(incoming?.start?.dateTime) &&
        toComparableDateTime(googleEvent?.end?.dateTime) === toComparableDateTime(incoming?.end?.dateTime)
    );
};

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'POST') {
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

        const { summary, description, location, start, end, calendarId, color } = req.body;
        const targetCalendarId = calendarId || 'primary';

        // Prevent creation of exact duplicate events for sync stability.
        if (start && end) {
            const timeMin = start?.dateTime
                ? toISOStringOrFallback(new Date(String(start.dateTime)).getTime() - 24 * 60 * 60 * 1000, new Date(0).toISOString())
                : `${start?.date}T00:00:00.000Z`;
            const timeMax = end?.dateTime
                ? toISOStringOrFallback(new Date(String(end.dateTime)).getTime() + 24 * 60 * 60 * 1000, new Date(8640000000000000).toISOString())
                : `${end?.date}T23:59:59.999Z`;

            const existing = await calendar.events.list({
                calendarId: targetCalendarId,
                timeMin,
                timeMax,
                singleEvents: true,
                maxResults: 250,
                orderBy: 'startTime',
            });

            const duplicate = (existing.data.items || []).find((googleEvent) =>
                isIdenticalEvent(googleEvent, { summary, description, location, start, end })
            );

            if (duplicate?.id) {
                return res.status(200).json({ event: duplicate, deduped: true });
            }
        }

        const colorId = closestGoogleColorId(color);
        const response = await calendar.events.insert({
            calendarId: targetCalendarId,
            requestBody: {
                summary,
                description,
                location,
                start,
                end,
                ...(colorId ? { colorId } : {}),
            },
        });

        const appSession = await getSession(req, res);
        if (appSession.loggedIn && appSession.userId) {
            const list = await calendar.calendarList.list();
            const calendars = list.data.items || [];
            const existing = await getUserGoogleCalendarMirror(appSession.userId);
            await updateUserGoogleCalendarMirror(appSession.userId, {
                calendars,
                events: [...existing.events, { ...response.data, calendarId: targetCalendarId }],
            });
        }

        res.status(200).json({ event: response.data });
    } catch (error) {
        console.error('Calendar API error:', error);
        res.status(500).json({ error: 'Failed to create event' });
    }
}
