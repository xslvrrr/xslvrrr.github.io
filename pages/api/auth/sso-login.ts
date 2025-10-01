import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import { getSession } from '../../../lib/session';
import { logger } from '../../../lib/logger';

/**
 * NSW DoE SSO Login Handler
 * This endpoint initiates the DoE SSO flow and captures the authentication cookies
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
    
    // The DoE SSO flow:
    // 1. User goes to https://millennium.education/ssologin/login.asp
    // 2. If already logged in to DoE, auto-authenticates
    // 3. If not, redirects to DoE login
    // 4. After successful auth, redirects back with session cookies
    
    // Strategy: We'll initiate the SSO request and check if the user is already authenticated
    // If they are, we capture the cookies. If not, we redirect them to complete login.
    
    const ssoUrl = 'https://millennium.education/ssologin/login.asp';
    
    try {
      // Try to access the SSO endpoint
      // If user is already logged in to DoE, this will succeed
      const ssoResponse = await axios.get(ssoUrl, {
        maxRedirects: 5,
        validateStatus: (status) => status < 400,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      
      // Check if we got session cookies
      const cookies = ssoResponse.headers['set-cookie'] || [];
      
      if (cookies.length > 0 && ssoResponse.data.includes('portal')) {
        // User is already authenticated! Save the session
        logger.info('DoE SSO successful - user already authenticated');
        
        const session = await getSession(req, res);
        session.loggedIn = true;
        session.username = 'DoE User'; // We'll extract real name from portal
        session.school = 'NSW Department of Education';
        session.sessionCookies = cookies;
        session.timestamp = new Date().toISOString();
        await session.save();
        
        // Redirect to dashboard
        return res.redirect(302, '/dashboard');
      }
    } catch (error) {
      logger.debug('DoE SSO requires user interaction:', error instanceof Error ? error.message : 'Unknown error');
    }
    
    // User needs to authenticate - redirect to SSO login
    // After they log in, they'll be redirected back with ?invalid_login or successful session
    res.redirect(302, ssoUrl);
    
  } catch (error) {
    logger.error('SSO login error:', error);
    return res.status(500).json({ 
      message: 'Failed to initiate SSO login',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
