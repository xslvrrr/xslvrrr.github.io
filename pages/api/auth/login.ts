import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import { getSession } from '../../../lib/session';
import { logger } from '../../../lib/logger';

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

    // Make request to millennium.education with axios
    let loginResponse;
    try {
      loginResponse = await axios.post('https://millennium.education/login.asp', formData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400
      });
    } catch (error: any) {
      // Axios throws on 3xx when maxRedirects is 0, but we need the redirect
      if (error.response && error.response.status === 302) {
        loginResponse = error.response;
      } else {
        throw error;
      }
    }

    // Check for successful login (302 redirect to portal)
    const redirectUrl = loginResponse.headers['location'] || '';
    
    logger.debug(`Login response status: ${loginResponse.status}, Redirect URL: ${redirectUrl}`);

    if (loginResponse.status === 302 && redirectUrl.includes('portal')) {
      // Extract and parse session cookies
      const rawCookies = loginResponse.headers['set-cookie'] || [];
      const cookies = rawCookies.map((cookie: string) => cookie.split(';')[0].trim());
      
      logger.debug(`Login successful for ${username} at ${school}. Cookies: ${cookies.length}`);
      logger.debug('Following redirect to:', redirectUrl);
      
      try {
        // Make a request to the portal to verify the cookies work
        const portalCheckResponse = await axios.get(redirectUrl, {
          headers: {
            'Cookie': cookies.join('; '),
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          },
          maxRedirects: 5
        });
        
        const portalHTML = portalCheckResponse.data;
        
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
        const additionalCookies = portalCheckResponse.headers['set-cookie'] || [];
        if (additionalCookies.length > 0) {
          cookies.push(...additionalCookies.map((cookie: string) => cookie.split(';')[0].trim()));
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

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
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
