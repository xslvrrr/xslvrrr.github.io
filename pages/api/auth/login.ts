import { NextApiRequest, NextApiResponse } from 'next';
import axios, { AxiosResponse } from 'axios';
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
  debug?: {
    status: number;
    hasRedirect: boolean;
    redirectUrl: string;
    bodyPreview?: string;
  };
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
    formData.append('account', '2'); // Student account type
    formData.append('email', username);
    formData.append('password', password);
    formData.append('sitename', school);
    
    logger.debug(`Attempting login for ${username} at ${school}`);

    // Make request to millennium.education with axios
    // Using maxRedirects: 0 to capture the redirect and cookies
    let loginResponse: AxiosResponse;
    try {
      loginResponse = await axios.post('https://millennium.education/login.asp', formData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Referer': 'https://millennium.education/',
          'Origin': 'https://millennium.education',
          'DNT': '1'
        },
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400
      });
    } catch (error: any) {
      // Axios throws on 3xx when maxRedirects is 0, but we need the redirect
      if (error.response && (error.response.status === 302 || error.response.status === 301)) {
        loginResponse = error.response;
        logger.debug(`Caught redirect ${error.response.status}`);
      } else {
        logger.error('Login request failed:', error.message);
        throw error;
      }
    }

    // Check for successful login (302 redirect to portal)
    const redirectUrl = loginResponse.headers['location'] || loginResponse.headers['Location'] || '';
    const responseStatus = loginResponse.status;
    
    logger.debug(`Login response status: ${responseStatus}, Redirect URL: ${redirectUrl}`);
    logger.debug(`Response headers:`, Object.keys(loginResponse.headers));

    // Check if redirect indicates success (portal or dashboard)
    const isSuccessRedirect = (responseStatus === 302 || responseStatus === 301) && 
                              (redirectUrl.includes('portal') || redirectUrl.includes('dashboard') || redirectUrl.includes('home'));
    
    if (isSuccessRedirect) {
      // Extract and parse session cookies - preserve full cookie strings
      const rawCookies = loginResponse.headers['set-cookie'] || [];
      const cookieMap = new Map<string, string>();
      
      // Parse cookies properly, keeping only the name=value part
      rawCookies.forEach((cookie: string) => {
        const cookieParts = cookie.split(';')[0].trim();
        const [name, ...valueParts] = cookieParts.split('=');
        if (name && valueParts.length > 0) {
          cookieMap.set(name, valueParts.join('='));
        }
      });
      
      logger.debug(`Login successful for ${username} at ${school}. Cookies received: ${cookieMap.size}`);
      logger.debug(`Cookie names: ${Array.from(cookieMap.keys()).join(', ')}`);
      logger.debug('Following redirect to:', redirectUrl);
      
      // Build the full portal URL if redirect is relative
      let fullPortalUrl = redirectUrl;
      if (!redirectUrl.startsWith('http')) {
        fullPortalUrl = `https://millennium.education${redirectUrl.startsWith('/') ? '' : '/'}${redirectUrl}`;
      }
      
      try {
        // Make a request to the portal to verify the cookies work
        const cookieHeader = Array.from(cookieMap.entries())
          .map(([name, value]) => `${name}=${value}`)
          .join('; ');
          
        const portalCheckResponse = await axios.get(fullPortalUrl, {
          headers: {
            'Cookie': cookieHeader,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Referer': 'https://millennium.education/'
          },
          maxRedirects: 5,
          validateStatus: (status) => status < 400
        });
        
        const portalHTML = portalCheckResponse.data;
        
        // Check if we successfully accessed the portal - updated detection
        const isPortalPage = portalHTML.includes('Student & Parent Portal') || 
                            portalHTML.includes('Welcome to Millennium') ||
                            portalHTML.includes('jdash-widget') ||
                            portalHTML.includes('portal/notices') ||
                            (portalHTML.includes('timetable') && portalHTML.includes('notices'));
        
        // Check if we got redirected back to login
        const isLoginPage = portalHTML.includes('login.asp') || 
                           portalHTML.includes('name="email"') ||
                           portalHTML.includes('name="password"');
        
        if (isLoginPage) {
          logger.error('Portal verification failed: Redirected back to login page');
          return res.status(401).json({
            success: false,
            message: 'Invalid credentials. Please check your username, password, and school name.'
          });
        }
        
        if (!isPortalPage) {
          logger.warn('Portal verification uncertain: Page structure not recognized, continuing anyway');
        } else {
          logger.debug('Portal verification successful - recognized portal page');
        }
        
        // If portal check returned additional cookies, merge them
        const additionalCookies = portalCheckResponse.headers['set-cookie'] || [];
        if (additionalCookies.length > 0) {
          additionalCookies.forEach((cookie: string) => {
            const cookieParts = cookie.split(';')[0].trim();
            const [name, ...valueParts] = cookieParts.split('=');
            if (name && valueParts.length > 0) {
              cookieMap.set(name, valueParts.join('='));
            }
          });
          logger.debug(`Merged ${additionalCookies.length} additional cookies from portal`);
        }
      } catch (verifyError: any) {
        logger.error('Portal verification request failed:', verifyError.message);
        if (verifyError.response?.status === 401 || verifyError.response?.status === 403) {
          return res.status(401).json({
            success: false,
            message: 'Login failed: Could not establish session with portal'
          });
        }
        // Continue anyway for other errors - cookies might still work
        logger.warn('Continuing despite verification error');
      }
      
      // Save session with properly formatted cookies
      const cookieStrings = Array.from(cookieMap.entries())
        .map(([name, value]) => `${name}=${value}`);
      
      logger.debug(`Saving ${cookieStrings.length} cookies to session`);
      
      const session = await getSession(req, res);
      session.loggedIn = true;
      session.username = username;
      session.school = school;
      session.sessionCookies = cookieStrings;
      session.timestamp = new Date().toISOString();
      await session.save();

      return res.status(200).json({
        success: true,
        message: 'Login successful! You can now use the redesigned interface.'
      });
    }
    
    // Login failed - check why
    const responseBody = typeof loginResponse.data === 'string' 
      ? loginResponse.data.substring(0, 500) 
      : JSON.stringify(loginResponse.data).substring(0, 500);
    
    logger.error('Login failed:', {
      status: responseStatus,
      redirectUrl,
      username,
      school,
      bodyPreview: responseBody
    });
    
    // Check if response indicates wrong credentials
    const bodyLower = typeof loginResponse.data === 'string' 
      ? loginResponse.data.toLowerCase() 
      : '';
    const hasErrorMessage = bodyLower.includes('incorrect') || 
                           bodyLower.includes('invalid') || 
                           bodyLower.includes('error');
    
    return res.status(401).json({
      success: false,
      message: hasErrorMessage 
        ? 'Invalid credentials. Please check your username, password, and school name.'
        : 'Login failed. Please verify your credentials and try again.',
      debug: process.env.NODE_ENV === 'development' ? {
        status: responseStatus,
        hasRedirect: !!redirectUrl,
        redirectUrl: redirectUrl,
        bodyPreview: responseBody
      } : undefined
    });

  } catch (error: any) {
    logger.error('Login error:', error);
    logger.error('Error details:', {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText
    });

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return res.status(503).json({
        success: false,
        message: 'Unable to connect to Millennium servers. Please try again later.'
      });
    }

    // Provide more detailed error for debugging
    const errorMessage = process.env.NODE_ENV === 'development' 
      ? `Error: ${error.message}` 
      : 'An unexpected error occurred during login. Please try again.';

    return res.status(500).json({
      success: false,
      message: errorMessage
    });
  }
}
