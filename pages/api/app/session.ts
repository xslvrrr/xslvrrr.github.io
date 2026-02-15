import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '../../../lib/session';
import { findUserById } from '../../../lib/users';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const session = await getSession(req, res);

    // Validate session has userId and user exists in database
    if (session.loggedIn && session.userId) {
      const user = await findUserById(session.userId);

      if (user) {
        // Valid session with existing user
        return res.status(200).json({
          loggedIn: true,
          username: user.name,
          school: user.school,
          userId: user.id,
          timestamp: session.timestamp,
          profileImage: user.profileImage || null
        });
      } else {
        // User was deleted or doesn't exist - invalidate session
        session.loggedIn = false;
        session.userId = undefined;
        await session.save();
      }
    }

    // Not logged in or invalid user
    return res.status(200).json({
      loggedIn: false,
      username: null,
      school: null,
      timestamp: null
    });
  } catch (error) {
    console.error('Session check error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}
