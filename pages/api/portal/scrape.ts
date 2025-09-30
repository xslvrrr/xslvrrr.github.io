import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '../../../lib/session';
import { logger } from '../../../lib/logger';
import axios from 'axios';
import * as cheerio from 'cheerio';

interface TimetableEntry {
  period: string;
  room: string;
  subject: string;
  teacher: string;
  attendanceStatus: 'present' | 'absent' | 'partial' | 'unmarked';
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


    // Scrape the portal
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
    const portalHTML = portalResponse.data;
    const $ = cheerio.load(portalHTML);
    
    logger.debug(`Scraping portal for ${session.username} at ${session.school}`);
    
    // Verify we're on the portal page (not login page)
    const isLoggedIn = portalHTML.includes('Student & Parent Portal') || 
                      portalHTML.includes('jdash-widget');
    
    if (!isLoggedIn) {
      return res.status(401).json({ 
        message: 'Session expired. Please log in again.',
        expired: true
      });
    }
    
    // Extract user information
    const userInfoText = $('table.grey td:first-child b').text() || '';
    const userParts = userInfoText.split(' : ');
    const schoolName = userParts[0] || session.school || 'Unknown School';
    const userName = userParts[1] || session.username || 'Unknown User';
    
    // Check if it's a holiday or weekend
    const calendarWidget = $('#calendar .jdash-body').html() || '';
    const isHoliday = calendarWidget.includes('[ Holiday ]') || calendarWidget.includes('Holiday');
    
    // Check day of week
    const today = new Date();
    const dayOfWeek = today.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Extract timetable data - simplified and clean
    const timetable: TimetableEntry[] = [];
    
    // Only scrape if it's not a weekend or holiday
    if (!isWeekend && !isHoliday) {
      $('#timetable .jdash-body table.table1 tr').each((i, el) => {
        const cells = $(el).find('td');
        if (cells.length >= 4) {
          const period = $(cells[0]).find('b').text().trim() || $(cells[0]).text().trim();
          
          // Check if this is a valid period (P1, P2, P3a, etc.)
          if (period.match(/^P\d+[ab]?$/i)) {
            const room = $(cells[1]).text().trim();
            const subject = $(cells[2]).text().trim();
            const teacher = $(cells[3]).text().trim();
            
            // Check attendance status from the periods column
            let attendanceStatus: 'present' | 'absent' | 'partial' | 'unmarked' = 'unmarked';
            if (cells.length >= 5) {
              const span = $(cells[4]).find('span');
              const style = span.attr('style') || '';
              if (style.includes('#20e020')) attendanceStatus = 'present';
              else if (style.includes('#ff0000')) attendanceStatus = 'absent';
              else if (style.includes('#ffa500')) attendanceStatus = 'partial';
            }
            
            if (subject && teacher) {
              timetable.push({ period, room, subject, teacher, attendanceStatus });
            }
          }
        }
      });
    }
    
    logger.debug(`Found ${timetable.length} timetable entries${isWeekend ? ' (weekend)' : ''}${isHoliday ? ' (holiday)' : ''}`);

    // Scrape notices from /portal/notices.asp - simplified
    let notices: Notice[] = [];
    
    try {
      const noticesResponse = await axios.get('https://millennium.education/portal/notices.asp', {
        headers: {
          'Cookie': cookieHeader,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      const noticesHTML = noticesResponse.data;
      const $notices = cheerio.load(noticesHTML);
      
      // Extract notices - each h4 followed by .notice div
      $notices('h4').each((i, el) => {
        const title = $notices(el).text().trim();
        const $noticeDiv = $notices(el).next('.notice');
        
        if ($noticeDiv.length > 0 && title) {
          const content = $noticeDiv.html() || '';
          const textContent = $noticeDiv.text().trim();
          const preview = textContent.length > 150 
            ? textContent.substring(0, 150) + '...'
            : textContent;
          
          if (preview) {
            notices.push({ title, preview, content });
          }
        }
      });
      
      logger.debug(`Found ${notices.length} notices`);
    } catch (error) {
      logger.error('Error fetching notices:', error);
    }

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

    logger.info(`Portal data: ${timetable.length} classes, ${notices.length} notices, ${diary.length} diary entries`);

    // Store scraped data in session for caching
    session.portalData = portalData;
    await session.save();

    return res.status(200).json(portalData);

  } catch (error: any) {
    logger.error('Portal scraping error:', error);
    
    // Check if it's an authentication error
    if (error.message?.includes('401') || error.message?.includes('403')) {
      return res.status(401).json({ 
        message: 'Session expired. Please log in again.',
        expired: true 
      });
    }
    
    // Check if it's a network error
    if (error.name === 'TypeError' || error.message?.includes('fetch')) {
      return res.status(503).json({ 
        message: 'Unable to connect to portal. Please try again later.',
        error: 'Network error'
      });
    }
    
    return res.status(500).json({ 
      message: 'Failed to scrape portal data',
      error: error.message 
    });
  }
}
