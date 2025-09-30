import { getIronSession, SessionOptions } from 'iron-session';
import { NextApiRequest, NextApiResponse } from 'next';

export interface SessionData {
  loggedIn: boolean;
  username?: string;
  school?: string;
  sessionCookies?: string[];
  timestamp?: string;
  portalData?: any;
}

const defaultSession: SessionData = {
  loggedIn: false,
};

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET || 'this-is-a-development-secret-change-in-production-minimum-32-chars',
  cookieName: 'millennium_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
  },
};

export async function getSession(req: NextApiRequest, res: NextApiResponse) {
  const session = await getIronSession<SessionData>(req, res, sessionOptions);

  if (!session.loggedIn) {
    session.loggedIn = defaultSession.loggedIn;
  }

  return session;
}
