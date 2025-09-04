import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '../../../lib/session';
import axios from 'axios';
import * as cheerio from 'cheerio';

interface TimetableEntry {
  period: string;
  room: string;
  subject: string;
  teacher: string;
  isActive?: boolean;
}

interface Notice {
  title: string;
  preview: string;
  content: string;
}

interface DiaryEntry {
  date: string;
  title: string;
  description?: string;
}

interface PortalData {
  user: {
    name: string;
    school: string;
  };
  timetable: TimetableEntry[];
  notices: Notice[];
  diary: DiaryEntry[];
  lastUpdated: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const session = await getSession(req, res);
    
    if (!session.loggedIn) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    // If debug mode, return mock data
    if (session.isDebug) {
      const mockData: PortalData = {
        user: {
          name: session.username || 'Debug User',
          school: session.school || 'Test School',
        },
        timetable: [
          { period: 'P1', room: 'E4', subject: 'HMAA.B', teacher: 'Mrs B Rizal', isActive: true },
          { period: 'P2', room: 'E4', subject: 'HMAA.B', teacher: 'Mrs B Rizal', isActive: false },
          { period: 'P3b', room: 'F101', subject: 'HENS.C2', teacher: 'Ms K Ellis', isActive: true },
          { period: 'P4', room: 'F101', subject: 'HENS.C2', teacher: 'Ms K Ellis', isActive: false },
          { period: 'P5', room: 'F101', subject: 'HENS.C2', teacher: 'Ms K Ellis', isActive: false },
          { period: 'P6b', room: 'M1', subject: 'HBIO.A', teacher: 'Ms A Pobjie', isActive: false },
          { period: 'P7', room: 'M1', subject: 'HBIO.A', teacher: 'Ms A Pobjie', isActive: false },
          { period: 'P8', room: 'M1', subject: 'HBIO.A', teacher: 'Ms A Pobjie', isActive: false },
        ],
        notices: [
          {
            title: '🌟 Pulse Alive 2026 🌟',
            preview: 'Students are invited to take part in Pulse Alive 2026, a performing arts festival...',
            content: 'Students are invited to take part in Pulse Alive 2026, a performing arts festival event held at Sydney Olympic Park in March next year.'
          },
          {
            title: '📢 Jersey Day - Trick Shot Comp 📢',
            preview: 'Next Friday we are celebrating Jersey Day! Wear a jersey over your school uniform...',
            content: 'Next Friday we are celebrating Jersey Day! Wear a jersey over your school uniform to show your support for organ donation.'
          },
          {
            title: 'Debug Mode Notice',
            preview: 'This is a test notice for debug mode...',
            content: 'You are currently using debug mode. Real portal data would be displayed here for actual users.'
          }
        ],
        diary: [
          { date: 'Sep 4', title: 'Debug Event 1', description: 'Test event' },
          { date: 'Sep 5', title: 'Debug Event 2', description: 'Test event' },
          { date: 'Sep 6', title: 'Debug Event 3', description: 'Test event' },
        ],
        lastUpdated: new Date().toISOString()
      };

      return res.status(200).json(mockData);
    }

    // For real users, scrape the portal
    if (!session.sessionCookies || session.sessionCookies.length === 0) {
      return res.status(400).json({ message: 'No session cookies available for scraping' });
    }

    // Create cookie header from stored session cookies
    const cookieHeader = session.sessionCookies.join('; ');

    // Scrape the main portal page
    const portalResponse = await axios.get('https://millennium.education/portal/', {
      headers: {
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const $ = cheerio.load(portalResponse.data);
    
    // Extract user information
    const userInfoText = $('table.grey td:first-child b').text() || '';
    const userParts = userInfoText.split(' : ');
    const schoolName = userParts[0] || session.school || 'Unknown School';
    const userName = userParts[1] || session.username || 'Unknown User';

    // Extract timetable data
    const timetable: TimetableEntry[] = [];
    $('#timetable .jdash-body table.table1 tr').each((i, el) => {
      const cells = $(el).find('td');
      if (cells.length >= 4) {
        const period = $(cells[0]).text().trim();
        const room = $(cells[1]).text().trim();
        const subject = $(cells[2]).text().trim();
        const teacher = $(cells[3]).text().trim();
        
        // Check if period is currently active (has green background)
        const isActive = $(cells[4]).find('span[style*="background-color:#20e020"]').length > 0;
        
        if (period && subject) {
          timetable.push({
            period,
            room,
            subject,
            teacher,
            isActive
          });
        }
      }
    });

    // Extract notices
    const notices: Notice[] = [];
    $('#notices .jdash-body table.table1 li').each((i, el) => {
      const $link = $(el).find('a');
      const title = $link.text().trim();
      const fullContent = $link.attr('title') || '';
      
      if (title) {
        // Create preview from content (first 100 characters)
        const preview = fullContent.length > 100 
          ? fullContent.substring(0, 100) + '...'
          : fullContent;
        
        notices.push({
          title,
          preview,
          content: fullContent
        });
      }
    });

    // Extract diary entries
    const diary: DiaryEntry[] = [];
    $('#mydiary .jdash-body #diary div').each((i, el) => {
      const $el = $(el);
      const title = $el.find('b').text().trim();
      const dateText = $el.find('small i').text().trim();
      
      if (title && dateText) {
        // Extract date from text like "Thu 4 SEP 2025"
        const dateMatch = dateText.match(/(\w{3} \d{1,2} \w{3})/);
        const date = dateMatch ? dateMatch[1] : dateText;
        
        // Extract description (everything after the date)
        const descriptionMatch = dateText.match(/\d{4}\s*(.+)/);
        const description = descriptionMatch ? descriptionMatch[1].trim() : undefined;
        
        diary.push({
          date,
          title,
          description
        });
      }
    });

    const portalData: PortalData = {
      user: {
        name: userName,
        school: schoolName
      },
      timetable,
      notices,
      diary,
      lastUpdated: new Date().toISOString()
    };

    // Store scraped data in session for caching
    session.portalData = portalData;
    await session.save();

    return res.status(200).json(portalData);

  } catch (error: any) {
    console.error('Portal scraping error:', error);
    
    if (error.response?.status === 401 || error.response?.status === 403) {
      return res.status(401).json({ 
        message: 'Session expired. Please log in again.',
        expired: true 
      });
    }
    
    return res.status(500).json({ 
      message: 'Failed to scrape portal data',
      error: error.message 
    });
  }
}
