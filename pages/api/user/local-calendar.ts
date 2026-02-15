import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '../../../lib/session';
import { getUserLocalCalendar, updateUserLocalCalendar } from '../../../lib/users';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getSession(req, res);

  if (!session.loggedIn || !session.userId) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  if (req.method === 'GET') {
    try {
      const data = await getUserLocalCalendar(session.userId);
      return res.status(200).json(data);
    } catch (error: any) {
      return res.status(500).json({ message: 'Failed to load local calendar data', error: error.message });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { events, calendars } = req.body || {};
      if (!Array.isArray(events) || !Array.isArray(calendars)) {
        return res.status(400).json({ message: 'Invalid calendar payload' });
      }
      const saved = await updateUserLocalCalendar(session.userId, { events, calendars });
      return res.status(200).json(saved);
    } catch (error: any) {
      return res.status(500).json({ message: 'Failed to save local calendar data', error: error.message });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}
