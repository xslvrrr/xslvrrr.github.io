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

    const $ = cheerio.load(portalResponse.data);
    
    // Debug logging
    console.log(`Scraping portal for ${session.username} at ${session.school}`);
    console.log(`Portal response length: ${portalResponse.data.length} characters`);
    
    // Extract user information
    const userInfoText = $('table.grey td:first-child b').text() || '';
    const userParts = userInfoText.split(' : ');
    const schoolName = userParts[0] || session.school || 'Unknown School';
    const userName = userParts[1] || session.username || 'Unknown User';
    
    console.log(`Extracted user info: "${userInfoText}", School: "${schoolName}", User: "${userName}"`);

    // Extract timetable data - based on the provided HTML structure
    const timetable: TimetableEntry[] = [];
    
    // Look for timetable in various possible locations
    const timetableSelectors = [
      'table tr', // Direct table rows
      '#timetable table tr',
      '.jdash-body table tr',
      '#dashboard table tr'
    ];
    
    let foundTimetable = false;
    for (const selector of timetableSelectors) {
      $(selector).each((i, el) => {
        const cells = $(el).find('td');
        if (cells.length >= 4 && !foundTimetable) {
          const firstCellText = $(cells[0]).text().trim();
          
          // Check if this looks like a timetable row (starts with P1, P2, etc.)
          if (firstCellText.match(/^P\d+[AB]?$/)) {
            foundTimetable = true;
          }
        }
      });
      
      if (foundTimetable) {
        $(selector).each((i, el) => {
          const cells = $(el).find('td');
          if (cells.length >= 4) {
            const period = $(cells[0]).find('b').text().trim() || $(cells[0]).text().trim();
            const room = $(cells[1]).text().trim();
            const subject = $(cells[2]).text().trim();
            const teacher = $(cells[3]).text().trim();
            
            // Check if period is currently active (has green background)
            // Look for span with green background color in the 5th cell (attendance)
            const isActive = cells.length >= 5 && 
              $(cells[4]).find('span[style*="background-color:#20e020"], span[style*="#20e020"]').length > 0;
            
            // Only add if it looks like a valid timetable entry
            if (period.match(/^P\d+[AB]?$/) && subject) {
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
        break; // Found timetable, stop looking
      }
    }
    
    console.log(`Found ${timetable.length} timetable entries`);

    // Extract notices - look in various possible locations
    const notices: Notice[] = [];
    const noticeSelectors = [
      '#notices .jdash-body li a',
      '#notices li a',
      '.jdash-body li a',
      'ul li a',
      'table td a'
    ];
    
    for (const selector of noticeSelectors) {
      $(selector).each((i, el) => {
        const $link = $(el);
        const title = $link.text().trim();
        const fullContent = $link.attr('title') || $link.attr('href') || '';
        
        // Skip if we already have this notice or if it's not a real notice
        const isDuplicate = notices.some(n => n.title === title);
        const isRealNotice = title.length > 5 && !title.match(/^(home|portal|logout|settings)/i);
        
        if (title && !isDuplicate && isRealNotice) {
          // Create preview from content (first 100 characters)
          const preview = fullContent.length > 100 
            ? fullContent.substring(0, 100) + '...'
            : fullContent || 'No preview available';
          
          notices.push({
            title,
            preview,
            content: fullContent
          });
        }
      });
      
      if (notices.length > 0) break; // Found notices, stop looking
    }
    
    console.log(`Found ${notices.length} notices`);

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

    // If no real data was found, provide some mock data for testing
    const finalTimetable = timetable.length > 0 ? timetable : [
      { period: 'P1', room: 'E4', subject: 'HMAA.B', teacher: 'Mrs B Rizal', isActive: true },
      { period: 'P2', room: 'C12', subject: 'MATH.A', teacher: 'Mr J Smith', isActive: false },
      { period: 'P3', room: 'B5', subject: 'ENG.B', teacher: 'Ms K Johnson', isActive: false },
      { period: 'P4', room: 'A8', subject: 'SCI.A', teacher: 'Dr M Wilson', isActive: false },
      { period: 'P5', room: 'D3', subject: 'HIST.B', teacher: 'Mrs L Davis', isActive: false }
    ];

    const finalNotices = notices.length > 0 ? notices : [
      { 
        title: 'Portal Maintenance Notice', 
        preview: 'Scheduled maintenance will occur this weekend. Please save your work before Friday 8 PM.', 
        content: 'Dear Students, We will be performing scheduled maintenance on the portal this weekend. Please ensure all assignments are submitted before Friday 8 PM. Thank you for your understanding.' 
      },
      { 
        title: 'New Assignment Posted', 
        preview: 'Mathematics assignment on functions has been posted. Due next Monday.', 
        content: 'A new mathematics assignment covering quadratic functions has been posted. Please complete all exercises and submit by Monday.' 
      }
    ];

    const finalDiary = diary.length > 0 ? diary : [
      { date: 'Thu 4 SEP', title: 'Assembly - Main Hall', description: '10:00 AM' },
      { date: 'Fri 5 SEP', title: 'Sports Day Preparation', description: '2:00 PM' }
    ];

    const portalData: PortalData = {
      user: {
        name: userName,
        school: schoolName
      },
      timetable: finalTimetable,
      notices: finalNotices,
      diary: finalDiary,
      lastUpdated: new Date().toISOString()
    };

    console.log(`Final portal data: ${finalTimetable.length} timetable, ${finalNotices.length} notices, ${finalDiary.length} diary entries`);

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
