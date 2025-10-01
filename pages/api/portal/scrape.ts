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

    const $ = cheerio.load(portalResponse.data);
    
    // Debug logging and verification
    logger.debug(`Scraping portal for ${session.username} at ${session.school}`);
    logger.debug(`Portal response length: ${portalResponse.data.length} characters`);
    
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
    
    logger.debug(`Portal verification: isLoggedIn=${isLoggedIn}, isLoginPage=${isLoginPage}`);
    
    // Only fail if we're clearly on a login page, not just because there's no timetable data
    if (isLoginPage && !isLoggedIn) {
      logger.error('Portal scraping failed: Redirected to login page');
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
    
    logger.debug(`Extracted user info: "${userInfoText}", School: "${schoolName}", User: "${userName}"`);
    
    // Additional verification - check for specific portal elements
    const hasPortalElements = {
      dashboard: $('#dashboard').length > 0,
      timetable: $('#timetable').length > 0,
      notices: $('#notices').length > 0,
      diary: $('#mydiary').length > 0,
      jdashWidget: $('.jdash-widget').length > 0
    };
    
    logger.debug('Portal elements found:', hasPortalElements);
    
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
    
    logger.debug(`Found ${timetable.length} timetable entries`);

    // Scrape notices from /portal/notices.asp
    let notices: Notice[] = [];
    
    try {
      const noticesResponse = await axios.get('https://millennium.education/portal/notices.asp', {
        headers: {
          'Cookie': cookieHeader,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (noticesResponse.status === 200) {
        const noticesHtml = noticesResponse.data;
        const $notices = cheerio.load(noticesHtml);
        
        // Extract notices based on the actual notices page structure
        $notices('h4').each((i, el) => {
          const $heading = $notices(el);
          const title = $heading.text().trim();
          
          // Get the notice content from the following .notice div
          const $noticeDiv = $heading.next('.notice');
          let content = '';
          let preview = '';
          
          if ($noticeDiv.length > 0) {
            content = $noticeDiv.html() || '';
            // Create preview from text content
            const textContent = $noticeDiv.text().trim();
            preview = textContent.length > 150 
              ? textContent.substring(0, 150) + '...'
              : textContent;
          } else {
            // Fallback: get content from next sibling elements until next h4
            let $current = $heading.next();
            const contentParts: string[] = [];
            
            while ($current.length > 0 && !$current.is('h4')) {
              if ($current.hasClass('notice')) {
                contentParts.push($current.html() || '');
                const textContent = $current.text().trim();
                if (!preview && textContent) {
                  preview = textContent.length > 150
                    ? textContent.substring(0, 150) + '...'
                    : textContent;
                }
              }
              $current = $current.next();
            }
            
            content = contentParts.join('\n');
          }
          
          // Skip empty or invalid notices
          if (title && title.length > 3 && preview) {
            notices.push({
              title: title.replace(/[\u1F300-\u1F9FF]/g, '').trim(), // Remove emojis for cleaner titles
              preview,
              content
            });
          }
        });
        
        logger.debug(`Found ${notices.length} notices from notices page`);
      } else {
        logger.debug('Failed to fetch notices page, status:', noticesResponse.status);
      }
    } catch (error) {
      logger.debug('Error fetching notices:', error);
    }
    
    logger.debug(`Found ${notices.length} notices`);

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

    const finalNotices = notices;

    const finalDiary = diary;

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

    logger.info(`Final portal data: ${finalTimetable.length} timetable, ${finalNotices.length} notices, ${finalDiary.length} diary entries`);
    
    // Add debug info for troubleshooting
    logger.debug('Debug info:', {
      cookieHeader: cookieHeader ? 'Present' : 'Missing',
      userName,
      schoolName,
      noticesCount: notices.length,
      timetableCount: timetable.length,
      diaryCount: diary.length
    });

    // Store scraped data in session for caching
    session.portalData = portalData;
    await session.save();

    return res.status(200).json(portalData);

  } catch (error: any) {
    logger.error('Portal scraping error:', error);
    
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
