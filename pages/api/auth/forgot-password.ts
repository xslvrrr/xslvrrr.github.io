import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import { logger } from '../../../lib/logger';

interface ForgotPasswordRequest {
  email: string;
  school: string;
}

interface ForgotPasswordResponse {
  success: boolean;
  message: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ForgotPasswordResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { email, school }: ForgotPasswordRequest = req.body;

  // Validate input
  if (!email || !school) {
    return res.status(400).json({
      success: false,
      message: 'Email and school are required'
    });
  }

  try {
    logger.info(`Forgot password request for ${email} at ${school}`);

    // Submit to Millennium's forgot password endpoint
    const response = await axios.get('https://millennium.education/forgot.asp', {
      params: {
        email: email,
        sitename: school,
        send: ' SEND EMAIL '
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      maxRedirects: 5,
      validateStatus: (status) => status < 500
    });

    logger.debug(`Forgot password response status: ${response.status}`);

    // The Millennium portal doesn't give clear success/failure indicators
    // We'll assume success if we don't get an error
    if (response.status === 200) {
      return res.status(200).json({
        success: true,
        message: 'If an account exists with that email and school, you will receive an email with your login details shortly.'
      });
    } else {
      logger.warn(`Unexpected status from forgot password: ${response.status}`);
      return res.status(200).json({
        success: true,
        message: 'Password reset request submitted. If your details are correct, you will receive an email shortly.'
      });
    }

  } catch (error) {
    logger.error('Forgot password error:', error);
    
    // Don't reveal whether the account exists or not for security
    return res.status(200).json({
      success: true,
      message: 'Password reset request submitted. If your details are correct, you will receive an email shortly.'
    });
  }
}
