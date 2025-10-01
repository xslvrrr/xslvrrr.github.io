import { NextApiRequest, NextApiResponse } from 'next';
import { logger } from '../../../lib/logger';

/**
 * NSW DoE SSO Login Handler
 * Redirects to the Millennium portal's SSO login endpoint
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    logger.info('Initiating NSW DoE SSO login');
    
    // Redirect to the actual Millennium portal SSO endpoint
    const ssoUrl = 'https://millennium.education/ssologin/login.asp';
    
    // In a production environment, you would:
    // 1. Register a callback URL with the DoE SSO system
    // 2. Include state parameter for CSRF protection
    // 3. Handle the callback to exchange the authorization code for tokens
    // 4. Store the session and redirect to dashboard
    
    // For now, redirect to the SSO login page
    // The user will need to complete the SSO flow on the Millennium portal
    res.redirect(302, ssoUrl);
    
  } catch (error) {
    logger.error('SSO login error:', error);
    return res.status(500).json({ 
      message: 'Failed to initiate SSO login',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
