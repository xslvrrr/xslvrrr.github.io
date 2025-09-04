import { getIronSession } from 'iron-session';
import { NextApiRequest, NextApiResponse } from 'next';

export interface SessionData {
  loggedIn: boolean;
  isDebug?: boolean;
  username?: string;
  school?: string;
  sessionCookies?: string[];
  timestamp?: string;
}

const defaultSession: SessionData = {
  loggedIn: false,
};

const sessionOptions = {
  password: process.env.SESSION_SECRET || 'development-secret-key-minimum-32-characters-long',
  cookieName: 'millennium-session',
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
