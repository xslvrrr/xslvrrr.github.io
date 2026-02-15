import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '../../../lib/session';
import { getUserNotificationStates, updateUserNotificationStates } from '../../../lib/users';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getSession(req, res);

  if (!session.loggedIn || !session.userId) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  if (req.method === 'GET') {
    try {
      const states = await getUserNotificationStates(session.userId);
      return res.status(200).json({ states });
    } catch (error: any) {
      return res.status(500).json({ message: 'Failed to load notification states', error: error.message });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { states } = req.body || {};
      if (!states || typeof states !== 'object') {
        return res.status(400).json({ message: 'Invalid notification state payload' });
      }
      const saved = await updateUserNotificationStates(session.userId, states);
      return res.status(200).json({ states: saved });
    } catch (error: any) {
      return res.status(500).json({ message: 'Failed to save notification states', error: error.message });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}
