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

  // Check if this is a DoE email login (no password required)
  const isDoEEmail = username && username.toLowerCase().endsWith('@education.nsw.gov.au');

  // Validate input
  if (!username || !school) {
    return res.status(400).json({
      success: false,
      message: 'Username and school are required'
    });
  }

  // For non-DoE logins, password is required
  if (!isDoEEmail && !password) {
    return res.status(400).json({
      success: false,
      message: 'Password is required for non-DoE logins'
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
      loginResponse = await axios.post('https://millennium.education/login.asp', formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        maxRedirects: 0,
        validateStatus: (status) => status < 400
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

    // Check if redirect indicates success
    const isSuccess = responseStatus === 302 || 
                     (redirectUrl && redirectUrl.includes('portal'));
    
    if (isSuccess) {
      // Extract session cookies - KEEP FULL COOKIE STRINGS
      const cookies = loginResponse.headers['set-cookie'] || [];
      
      logger.debug(`Login successful for ${username} at ${school}. Cookies: ${cookies.length}`);
      
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
    logger.error('Login failed:', {
      status: responseStatus,
      redirectUrl,
      username,
      school
    });
    
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials. Please check your username, password, and school name.',
      debug: process.env.NODE_ENV === 'development' ? {
        status: responseStatus,
        hasRedirect: !!redirectUrl,
        redirectUrl: redirectUrl
      } : undefined
    });

  } catch (error: any) {
    logger.error('Login error:', error);
    
    // Handle 302 redirect in catch (when maxRedirects: 0)
    if (error.response?.status === 302 || error.response?.status === 301) {
      const cookies = error.response.headers['set-cookie'] || [];
      
      logger.debug(`Login successful (redirect caught) for ${username} at ${school}. Cookies: ${cookies.length}`);
      
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
