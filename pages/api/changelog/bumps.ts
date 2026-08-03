import type { NextApiRequest, NextApiResponse } from 'next';

import { isChangelogSectionId } from '../../../lib/changelog';
import {
    VISITOR_COOKIE_NAME,
    bumpChangelogSection,
    loadChangelogBumpState,
    readCookieValue,
    resolveVoterIdentity,
} from '../../../lib/changelog-bumps';
import { logger } from '../../../lib/logger';
import { consumeRateLimit } from '../../../lib/rate-limit';

const BUMP_RATE_LIMIT = 12;
const BUMP_RATE_WINDOW_SECONDS = 60 * 60;

function firstHeader(value: string | string[] | undefined): string | null {
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
}

/** Rejects browser mutations that did not originate from this site. */
function isCrossOrigin(req: NextApiRequest): boolean {
    if (firstHeader(req.headers['sec-fetch-site']) === 'cross-site') return true;

    const origin = firstHeader(req.headers.origin);
    if (!origin) return false;

    const host = firstHeader(req.headers.host);
    if (!host) return true;

    try {
        return new URL(origin).host !== host;
    } catch {
        return true;
    }
}

function networkDiscriminator(req: NextApiRequest): string {
    const forwarded = firstHeader(req.headers['x-vercel-forwarded-for'])
        || firstHeader(req.headers['x-forwarded-for'])
        || firstHeader(req.headers['x-real-ip'])
        || req.socket.remoteAddress
        || 'unknown';
    return forwarded.split(',')[0]?.trim().slice(0, 128) || 'unknown';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'GET' && req.method !== 'POST') {
        res.setHeader('Allow', 'GET, POST');
        return res.status(405).json({ message: 'Method not allowed' });
    }

    if (req.method === 'POST' && isCrossOrigin(req)) {
        return res.status(403).json({ message: 'Cross-origin request rejected' });
    }

    // The changelog is public, so the network discriminator is the only durable handle on a
    // caller that keeps discarding its visitor cookie.
    if (req.method === 'POST') {
        const limit = await consumeRateLimit(
            'changelog-bump',
            networkDiscriminator(req),
            BUMP_RATE_LIMIT,
            BUMP_RATE_WINDOW_SECONDS,
        );
        if (!limit.allowed) {
            res.setHeader('Retry-After', String(Math.max(1, limit.retryAfterSeconds || 30)));
            return res.status(limit.available ? 429 : 503).json({
                message: limit.available
                    ? 'Too many requests. Please try again later.'
                    : 'Request protection is temporarily unavailable. Please try again.',
            });
        }
    }

    const voter = resolveVoterIdentity(readCookieValue(req.headers.cookie, VISITOR_COOKIE_NAME));
    if (voter.setCookie) res.setHeader('Set-Cookie', voter.setCookie);

    try {
        if (req.method === 'GET') {
            return res.status(200).json(await loadChangelogBumpState(voter.voterKey));
        }

        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
        const sectionId = (body as Record<string, unknown>).sectionId;
        if (!isChangelogSectionId(sectionId)) {
            return res.status(400).json({ message: 'Unknown changelog section' });
        }

        return res.status(200).json(await bumpChangelogSection(voter.voterKey, sectionId));
    } catch (error) {
        logger.error('Changelog bump request failed', error);
        return res.status(500).json({ message: 'Failed to load bumps' });
    }
}
