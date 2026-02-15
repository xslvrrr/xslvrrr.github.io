import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '../../../lib/session';
import { getUserPreferences, updateUserPreferences } from '../../../lib/users';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getSession(req, res);

  if (!session.loggedIn || !session.userId) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  if (req.method === 'GET') {
    try {
      const data = await getUserPreferences(session.userId);
      return res.status(200).json(data);
    } catch (error: any) {
      return res.status(500).json({ message: 'Failed to load preferences', error: error.message });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { homeSettings, notificationFolders } = req.body || {};
      const updated = await updateUserPreferences(session.userId, {
        homeSettings,
        notificationFolders
      });
      return res.status(200).json(updated);
    } catch (error: any) {
      return res.status(500).json({ message: 'Failed to save preferences', error: error.message });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}
