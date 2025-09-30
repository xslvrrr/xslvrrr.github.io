import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '../../../lib/session';
import { logger } from '../../../lib/logger';
import { parseCookies } from '../../../lib/http';

interface LoginRequest {
  username: string;
  password: string;
  school: string;
}

interface LoginResponse {
  success: boolean;
  message: string;
  sessionId?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LoginResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { username, password, school }: LoginRequest = req.body;

  // Validate input
  if (!username || !password || !school) {
    return res.status(400).json({
      success: false,
      message: 'All fields are required'
    });
  }


  try {
    // Create form data for millennium.education login
    const formData = new URLSearchParams();
    formData.append('account', '2'); // Student account
    formData.append('email', username);
    formData.append('password', password);
    formData.append('sitename', school);

    // Make request to millennium.education
    const loginResponse = await fetch('https://millennium.education/login.asp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      body: formData.toString(),
      redirect: 'manual'
    });

    // Check for successful login (302 redirect to portal)
    const isSuccess = loginResponse.status === 302;
    const redirectUrl = loginResponse.headers.get('location') || '';

    if (isSuccess && redirectUrl.includes('portal')) {
      // Extract and parse session cookies
      const rawCookies = loginResponse.headers.get('set-cookie')?.split(', ') || [];
      const cookies = parseCookies(rawCookies);
      
      logger.debug(`Login successful for ${username} at ${school}. Cookies: ${cookies.length}`);
      
      logger.debug('Following redirect to:', redirectUrl);
      
      try {
        // Make a request to the portal to verify the cookies work
        const portalCheckResponse = await fetch(redirectUrl, {
          headers: {
            'Cookie': cookies.join('; '),
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          },
          redirect: 'follow'
        });
        
        const portalHTML = await portalCheckResponse.text();
        
        // Check if we successfully accessed the portal
        const isPortalPage = portalHTML.includes('Student & Parent Portal') || 
                            portalHTML.includes('Welcome to Millennium');
        
        if (!isPortalPage) {
          logger.error('Portal verification failed: Not on portal page after redirect');
          return res.status(401).json({
            success: false,
            message: 'Login failed: Could not establish session with portal'
          });
        }
        
        logger.debug('Portal verification successful');
        
        // If portal check returned additional cookies, add them
        const additionalCookieHeader = portalCheckResponse.headers.get('set-cookie');
        if (additionalCookieHeader) {
          const additionalCookies = parseCookies(additionalCookieHeader.split(', '));
          cookies.push(...additionalCookies);
          logger.debug(`Added ${additionalCookies.length} additional cookies from portal`);
        }
      } catch (verifyError: any) {
        logger.error('Portal verification request failed:', verifyError);
        // Continue anyway - cookies might still work
      }
      
      // Save session
      const session = await getSession(req, res);
      session.loggedIn = true;
      session.username = username;
      session.school = school;
      session.sessionCookies = cookies;
      session.timestamp = new Date().toISOString();
      await session.save();

      return res.status(200).json({
        success: true,
        message: 'Login successful! You can now use the redesigned interface.'
      });
    }
    
    // Login failed
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials. Please check your username, password, and school name.'
    });

  } catch (error: any) {
    logger.error('Login error:', error);

    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return res.status(503).json({
        success: false,
        message: 'Unable to connect to Millennium servers. Please try again later.'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'An unexpected error occurred during login. Please try again.'
    });
  }
}
