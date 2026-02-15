import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '../../../lib/session';
import { getUserThemeBuilder, updateUserThemeBuilder } from '../../../lib/users';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getSession(req, res);

  if (!session.loggedIn || !session.userId) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  if (req.method === 'GET') {
    try {
      const data = await getUserThemeBuilder(session.userId);
      return res.status(200).json(data);
    } catch (error: any) {
      return res.status(500).json({ message: 'Failed to load theme builder data', error: error.message });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { state, customThemes } = req.body || {};
      const updated = await updateUserThemeBuilder(session.userId, { state, customThemes });
      return res.status(200).json(updated);
    } catch (error: any) {
      return res.status(500).json({ message: 'Failed to save theme builder data', error: error.message });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}
