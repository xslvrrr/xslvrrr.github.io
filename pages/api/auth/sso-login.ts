import { NextApiRequest, NextApiResponse } from 'next';
import { logger } from '../../../lib/logger';

/**
 * NSW DoE SSO Login Handler
 * 
 * The DoE SSO system is complex and requires the user to authenticate directly
 * on the Millennium portal. Since we can't intercept the SSO handshake without
 * being registered as an OAuth application with DoE, we use a simpler approach:
 * 
 * Strategy: Open SSO login in a popup/new tab, let user authenticate there,
 * then they can close it and return to our portal to login normally.
 * 
 * Alternative: Redirect to a landing page that explains they should use
 * their DoE email in the regular login form (which skips password).
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    logger.info('Redirecting to DoE SSO explanation page');
    
    // Redirect to login page with a message about using DoE email
    // This is simpler and more user-friendly than trying to intercept SSO
    res.redirect(302, '/login?doe=true');
    
  } catch (error) {
    logger.error('SSO redirect error:', error);
    return res.status(500).json({ 
      message: 'Failed to redirect to login',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
