import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '../../../lib/session';
import axios from 'axios';
import * as cheerio from 'cheerio';

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
    // Create axios instance that maintains cookies across requests
    const cookieJar: string[] = [];
    
    // Create form data for millennium.education login
    const formData = new URLSearchParams();
    formData.append('account', '2'); // Student account
    formData.append('email', username);
    formData.append('password', password);
    formData.append('sitename', school);

    // Helper function to parse cookies from set-cookie header
    const parseCookies = (setCookieArray: string[] = []): string[] => {
      return setCookieArray.map(cookie => {
        // Extract just the cookie name=value part (before the first semicolon)
        const cookiePart = cookie.split(';')[0].trim();
        return cookiePart;
      });
    };

    // Make request to millennium.education
    const loginResponse = await axios.post(
      'https://millennium.education/login.asp',
      formData,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        maxRedirects: 0,
        validateStatus: (status) => status < 400 // Don't throw on redirects
      }
    );

    // Check for successful login
    const isSuccess = loginResponse.status === 302 || 
                     (loginResponse.headers.location && 
                      loginResponse.headers.location.includes('portal'));

    if (isSuccess) {
      // Extract and parse session cookies
      const rawCookies = loginResponse.headers['set-cookie'] || [];
      const cookies = parseCookies(rawCookies);
      
      console.log(`Login successful for ${username} at ${school}. Raw cookies: ${rawCookies.length}, Parsed: ${cookies.length}`);
      console.log('Parsed cookies:', cookies);
      
      // Follow the redirect to establish the session properly
      const redirectUrl = loginResponse.headers.location || 'https://millennium.education/portal/';
      console.log('Following redirect to:', redirectUrl);
      
      try {
        // Make a request to the portal to verify the cookies work
        const portalCheckResponse = await axios.get(redirectUrl, {
          headers: {
            'Cookie': cookies.join('; '),
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          },
          maxRedirects: 5,
          validateStatus: (status) => status < 400
        });
        
        // Check if we successfully accessed the portal
        const isPortalPage = portalCheckResponse.data.includes('Student & Parent Portal') || 
                            portalCheckResponse.data.includes('Welcome to Millennium');
        
        if (!isPortalPage) {
          console.error('Portal verification failed: Not on portal page after redirect');
          return res.status(401).json({
            success: false,
            message: 'Login failed: Could not establish session with portal'
          });
        }
        
        console.log('Portal verification successful');
        
        // If portal check returned additional cookies, add them
        if (portalCheckResponse.headers['set-cookie']) {
          const additionalCookies = parseCookies(portalCheckResponse.headers['set-cookie']);
          cookies.push(...additionalCookies);
          console.log('Added additional cookies from portal:', additionalCookies);
        }
      } catch (verifyError: any) {
        console.error('Portal verification request failed:', verifyError.message);
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
    } else {
      // Check response content for error messages
      const $ = cheerio.load(loginResponse.data);
      const errorMessage = $('.error, .alert, [class*="error"]').text().trim() || 
                          'Invalid credentials. Please check your username, password, and school name.';

      return res.status(401).json({
        success: false,
        message: errorMessage
      });
    }

  } catch (error: any) {
    console.error('Login error:', error);
    
    // Handle specific error cases
    if (error.response?.status === 302) {
      // Redirect means successful login - parse cookies properly
      const parseCookies = (setCookieArray: string[] = []): string[] => {
        return setCookieArray.map(cookie => {
          const cookiePart = cookie.split(';')[0].trim();
          return cookiePart;
        });
      };
      
      const rawCookies = error.response.headers['set-cookie'] || [];
      const cookies = parseCookies(rawCookies);
      
      console.log(`Login successful (302 redirect) for ${username} at ${school}. Raw cookies: ${rawCookies.length}, Parsed: ${cookies.length}`);
      console.log('Parsed cookies:', cookies);
      
      // Follow redirect to verify session
      const redirectUrl = error.response.headers.location || 'https://millennium.education/portal/';
      try {
        const portalCheckResponse = await axios.get(redirectUrl, {
          headers: {
            'Cookie': cookies.join('; '),
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          },
          maxRedirects: 5
        });
        
        // Add any additional cookies from portal
        if (portalCheckResponse.headers['set-cookie']) {
          const additionalCookies = parseCookies(portalCheckResponse.headers['set-cookie']);
          cookies.push(...additionalCookies);
        }
      } catch (verifyError) {
        console.error('Portal verification in catch block failed:', verifyError);
      }
      
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

    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
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
