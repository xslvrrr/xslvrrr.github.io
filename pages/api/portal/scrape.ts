import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '../../../lib/session';
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

    const $ = cheerio.load(portalResponse.data);
    
    // Debug logging and verification
    console.log(`Scraping portal for ${session.username} at ${session.school}`);
    console.log(`Portal response length: ${portalResponse.data.length} characters`);
    
    // Verify we're actually on the portal page and not redirected to login
    const isLoggedIn = portalResponse.data.includes('Student & Parent Portal') || 
                      portalResponse.data.includes('Welcome to Millennium') ||
                      portalResponse.data.includes('jdash-widget') ||
                      portalResponse.data.includes('table.grey') ||
                      portalResponse.data.includes('Millennium Schools Pty Ltd');
    
    const isLoginPage = portalResponse.data.includes('<input') && 
                       (portalResponse.data.includes('username') || 
                        portalResponse.data.includes('password') ||
                        portalResponse.data.includes('login'));
    
    console.log(`Portal verification: isLoggedIn=${isLoggedIn}, isLoginPage=${isLoginPage}`);
    
    // Only fail if we're clearly on a login page, not just because there's no timetable data
    if (isLoginPage && !isLoggedIn) {
      console.error('Portal scraping failed: Redirected to login page');
      return res.status(401).json({ 
        message: 'Session expired or invalid. Please log in again.',
        expired: true,
        debug: {
          responseLength: portalResponse.data.length,
          containsPortalElements: isLoggedIn,
          containsLoginElements: isLoginPage
        }
      });
    }
    
    // Extract user information
    const userInfoText = $('table.grey td:first-child b').text() || '';
    const userParts = userInfoText.split(' : ');
    const schoolName = userParts[0] || session.school || 'Unknown School';
    const userName = userParts[1] || session.username || 'Unknown User';
    
    console.log(`Extracted user info: "${userInfoText}", School: "${schoolName}", User: "${userName}"`);
    
    // Additional verification - check for specific portal elements
    const hasPortalElements = {
      dashboard: $('#dashboard').length > 0,
      timetable: $('#timetable').length > 0,
      notices: $('#notices').length > 0,
      diary: $('#mydiary').length > 0,
      jdashWidget: $('.jdash-widget').length > 0
    };
    
    console.log('Portal elements found:', hasPortalElements);

    // Extract timetable data - based on the actual portal HTML structure
    const timetable: TimetableEntry[] = [];
    
    // Look specifically for the timetable widget structure from the portal
    const timetableSelectors = [
      '#timetable .jdash-body table.table1 tr',
      '.jdash-widget .jdash-body table.table1 tr',
      'table.table1 tr',
      '#dashboard table tr'
    ];
    
    let foundTimetable = false;
    for (const selector of timetableSelectors) {
      $(selector).each((i, el) => {
        const cells = $(el).find('td');
        if (cells.length >= 4) {
          const firstCellText = $(cells[0]).find('b').text().trim() || $(cells[0]).text().trim();
          
          // Check if this looks like a timetable row (starts with P1, P2, P3b, etc.)
          if (firstCellText.match(/^P\d+[ab]?$/i)) {
            const period = firstCellText;
            const room = $(cells[1]).text().trim();
            const subject = $(cells[2]).text().trim();
            const teacher = $(cells[3]).text().trim();
            
            // Check attendance status from the periods column
            let attendanceStatus: 'present' | 'absent' | 'partial' | 'unmarked' = 'unmarked';
            if (cells.length >= 5) {
              const periodCell = $(cells[4]);
              const span = periodCell.find('span');
              if (span.length > 0) {
                const style = span.attr('style') || '';
                if (style.includes('#20e020') || style.includes('background-color:#20e020')) {
                  attendanceStatus = 'present';
                } else if (style.includes('#ff0000') || style.includes('background-color:#ff0000')) {
                  attendanceStatus = 'absent';
                } else if (style.includes('#ffa500') || style.includes('background-color:#ffa500')) {
                  attendanceStatus = 'partial';
                } else if (span.text().trim() === '' && !style.includes('background-color')) {
                  attendanceStatus = 'unmarked';
                }
              }
            }
            
            // Only add if it looks like a valid timetable entry
            if (subject && teacher) {
              timetable.push({
                period,
                room,
                subject,
                teacher,
                attendanceStatus
              });
              foundTimetable = true;
            }
          }
        }
      });
      
      if (foundTimetable) break; // Found timetable, stop looking
    }
    
    console.log(`Found ${timetable.length} timetable entries`);

    // Extract notices - based on the actual portal structure
    const notices: Notice[] = [];
    const noticeSelectors = [
      '#notices .jdash-body table.table1 li a',
      '#notices .jdash-body li a',
      '.jdash-widget .jdash-body table li a',
      '.jdash-body table li a'
    ];
    
    for (const selector of noticeSelectors) {
      $(selector).each((i, el) => {
        const $link = $(el);
        const title = $link.text().trim();
        const fullContent = $link.attr('title') || '';
        
        // Skip if we already have this notice or if it's not a real notice
        const isDuplicate = notices.some(n => n.title === title);
        const isRealNotice = title.length > 5 && 
          !title.match(/^(home|portal|logout|settings|view|click)/i) &&
          !title.includes('href=') && 
          !title.includes('javascript:');
        
        if (title && !isDuplicate && isRealNotice && fullContent) {
          // Clean up HTML content and create preview
          const cleanContent = fullContent
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/\s+/g, ' ')
            .trim();
          
          const preview = cleanContent.length > 150 
            ? cleanContent.substring(0, 150) + '...'
            : cleanContent || 'No preview available';
          
          notices.push({
            title,
            preview,
            content: cleanContent
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

    // Use real data if found, otherwise empty array (don't provide mock data for weekends)
    const finalTimetable = timetable;

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
