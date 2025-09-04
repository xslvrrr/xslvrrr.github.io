import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '../../../lib/session';
import axios from 'axios';
import * as cheerio from 'cheerio';

interface LoginRequest {
  username: string;
  password: string;
  school: string;
  isDebug?: boolean;
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

  const { username, password, school, isDebug }: LoginRequest = req.body;

  // Validate input
  if (!username || !password || !school) {
    return res.status(400).json({
      success: false,
      message: 'All fields are required'
    });
  }

  // Handle debug login
  if (isDebug && username === 'debug' && password === 'debug123') {
    const session = await getSession(req, res);
    session.loggedIn = true;
    session.isDebug = true;
    session.username = username;
    session.school = school;
    session.timestamp = new Date().toISOString();
    await session.save();

    return res.status(200).json({
      success: true,
      message: 'Debug login successful'
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
      // Extract session cookies if available
      const cookies = loginResponse.headers['set-cookie'] || [];
      
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
      // Redirect means successful login
      const session = await getSession(req, res);
      session.loggedIn = true;
      session.username = username;
      session.school = school;
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
