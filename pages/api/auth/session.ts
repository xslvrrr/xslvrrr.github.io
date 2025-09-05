import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '../../../lib/session';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const session = await getSession(req, res);
    
    return res.status(200).json({
      loggedIn: session.loggedIn,
      username: session.username,
      school: session.school,
      timestamp: session.timestamp
    });
  } catch (error) {
    console.error('Session check error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}
