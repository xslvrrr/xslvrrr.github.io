import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '../../../lib/session';
import { updateUserProfileImage } from '../../../lib/users';

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function extractDataUrlPayload(dataUrl: string): { mimeType: string; base64: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '35mb'
    }
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getSession(req, res);

  if (!session.loggedIn || !session.userId) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  if (req.method === 'PUT') {
    try {
      const { dataUrl } = req.body || {};

      if (!dataUrl || typeof dataUrl !== 'string') {
        return res.status(400).json({ message: 'Missing dataUrl' });
      }

      const payload = extractDataUrlPayload(dataUrl);
      if (!payload) {
        return res.status(400).json({ message: 'Invalid data URL' });
      }

      if (!ALLOWED_MIME_TYPES.has(payload.mimeType)) {
        return res.status(400).json({ message: 'Unsupported image type' });
      }

      const buffer = Buffer.from(payload.base64, 'base64');
      if (buffer.length > MAX_IMAGE_BYTES) {
        return res.status(413).json({ message: 'Image exceeds 25 MB limit' });
      }

      const updated = await updateUserProfileImage(session.userId, dataUrl);
      return res.status(200).json({ profileImage: updated?.profileImage || null });
    } catch (error: any) {
      return res.status(500).json({ message: 'Failed to save profile image', error: error.message });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const updated = await updateUserProfileImage(session.userId, null);
      return res.status(200).json({ profileImage: updated?.profileImage || null });
    } catch (error: any) {
      return res.status(500).json({ message: 'Failed to remove profile image', error: error.message });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}
