import { NextApiRequest, NextApiResponse } from 'next';
import { logger } from '../../../lib/logger';

/**
 * NSW DoE SSO Login Handler
 * Redirects to the Millennium portal's SSO login endpoint
 * After successful auth, the portal will have established a session
 * Then we redirect to our scraper to capture the session
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    logger.info('Initiating NSW DoE SSO login - redirecting to portal');
    
    // The SSO flow:
    // 1. User clicks DoE login -> redirects to millennium.education/ssologin/login.asp
    // 2. Portal redirects to NSW DoE authentication
    // 3. User authenticates with DoE credentials
    // 4. DoE redirects back to millennium.education portal with session cookies
    // 5. Portal redirects to our app (we need to handle the callback)
    
    // For now, we need to open the portal in a way that allows us to capture cookies
    // This is complex due to CORS and third-party cookie restrictions
    // The simplest approach is to use the portal directly and scrape after
    
    const ssoUrl = 'https://millennium.education/ssologin/login.asp';
    res.redirect(302, ssoUrl);
    
  } catch (error) {
    logger.error('SSO login error:', error);
    return res.status(500).json({ 
      message: 'Failed to initiate SSO login',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
