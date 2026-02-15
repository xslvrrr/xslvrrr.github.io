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
  date?: string;
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
  grades?: any[];
  attendance?: any;
  calendar?: any[];
  reports?: any[];
  classes?: any[];
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
    const startTime = Date.now();
    const session = await getSession(req, res);
    logger.debug(`Session fetch: ${Date.now() - startTime}ms`);

    // Debug: Log session state
    logger.debug('Session state:', {
      loggedIn: session.loggedIn,
      username: session.username,
      school: session.school,
      hasCookies: !!session.sessionCookies,
      cookiesCount: session.sessionCookies?.length || 0
    });

    if (!session.loggedIn) {
      logger.error('Session check failed: not logged in');
      return res.status(401).json({ message: 'Not authenticated' });
    }

    // Scrape the portal
    if (!session.sessionCookies || session.sessionCookies.length === 0) {
      logger.error('No session cookies available for scraping');
      logger.error('Session details:', JSON.stringify({
        loggedIn: session.loggedIn,
        username: session.username,
        school: session.school,
        timestamp: session.timestamp
      }));
      return res.status(400).json({
        message: 'No session cookies available for scraping',
        debug: {
          loggedIn: session.loggedIn,
          hasUsername: !!session.username,
          hasSchool: !!session.school
        }
      });
    }

    logger.debug(`Session cookies count: ${session.sessionCookies.length}`);
    logger.debug(`Session cookies: ${JSON.stringify(session.sessionCookies)}`);

    // Create cookie header from stored session cookies
    const cookieHeader = session.sessionCookies.join('; ');
    logger.debug(`Cookie header for scraping: ${cookieHeader}`);

    // Configure axios with timeout for faster failures and redirect following
    const axiosConfig = {
      headers: {
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://millennium.education/login.asp',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      timeout: 8000, // 8 second timeout
      maxRedirects: 5, // Follow up to 5 redirects
      validateStatus: (status: number) => status < 400 // Accept all 2xx and 3xx
    };

    // Parallelize both portal requests for faster loading
    // Use the personalized portal URL from login redirect if available
    const portalUrl = session.portalUrl || 'https://millennium.education/portal/';
    logger.debug(`Using portal URL: ${portalUrl}`);

    const requestStart = Date.now();
    const [portalResponse, noticesResponse] = await Promise.allSettled([
      axios.get(portalUrl, axiosConfig),
      axios.get('https://millennium.education/portal/notices.asp', axiosConfig)
    ]);
    logger.debug(`Parallel requests: ${Date.now() - requestStart}ms`);

    // Handle portal response
    if (portalResponse.status === 'rejected') {
      logger.error('Portal main page request failed:', portalResponse.reason);
      return res.status(500).json({ message: 'Failed to load portal data' });
    }

    const parseStart = Date.now();
    const portalHtml = portalResponse.value.data;
    const $ = cheerio.load(portalHtml);
    logger.debug(`HTML parsing: ${Date.now() - parseStart}ms`);

    // Debug: Save the HTML response to a file for inspection
    if (portalHtml.length < 5000) {
      const fs = require('fs');
      const path = require('path');
      const debugPath = path.join(process.cwd(), 'debug-portal-response.html');
      fs.writeFileSync(debugPath, portalHtml);
      logger.debug(`Saved small portal response (${portalHtml.length} chars) to debug-portal-response.html`);
    }

    // Debug logging and verification
    logger.debug(`Scraping portal for ${session.username} at ${session.school}`);
    logger.debug(`Portal response length: ${portalHtml.length} characters`);

    // Verify we're actually on the portal page and not redirected to login
    const isLoggedIn = portalHtml.includes('Student & Parent Portal') ||
      portalHtml.includes('Welcome to Millennium') ||
      portalHtml.includes('jdash-widget') ||
      portalHtml.includes('table.grey') ||
      portalHtml.includes('Millennium Schools Pty Ltd');

    const isLoginPage = portalHtml.includes('<input') &&
      (portalHtml.includes('username') ||
        portalHtml.includes('password') ||
        portalHtml.includes('login'));

    logger.debug(`Portal verification: isLoggedIn=${isLoggedIn}, isLoginPage=${isLoginPage}`);

    // Only fail if we're clearly on a login page, not just because there's no timetable data
    if (isLoginPage && !isLoggedIn) {
      logger.error('Portal scraping failed: Redirected to login page');
      return res.status(401).json({
        message: 'Session expired or invalid. Please log in again.',
        expired: true,
        debug: {
          responseLength: portalHtml.length,
          containsPortalElements: isLoggedIn,
          containsLoginElements: isLoginPage
        }
      });
    }

    // Extract user information from the portal
    const userInfoText = $('table.grey td:first-child b').text() || '';
    logger.debug(`Raw user info text: "${userInfoText}"`);

    const userParts = userInfoText.split(' : ');
    logger.debug(`User parts after split: [${userParts.map(p => `"${p}"`).join(', ')}]`);

    // Only use scraped data if we actually got both parts, otherwise fallback
    const schoolName = (userParts.length === 2 && userParts[0]) ? userParts[0].trim() : (session.school || 'Unknown School');
    const userName = (userParts.length === 2 && userParts[1]) ? userParts[1].trim() : '';

    logger.debug(`Final extracted - School: "${schoolName}", User: "${userName}"`);

    // If userName is empty, log warning - frontend will use fallback parser
    if (!userName) {
      logger.warn('Could not extract user name from portal HTML - frontend will use fallback name parser');
    }

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
    let selectorIndex = 0;
    for (const selector of timetableSelectors) {
      logger.debug(`Trying timetable selector ${selectorIndex}: "${selector}"`);
      let rowsFound = 0;
      let rowsMatched = 0;

      $(selector).each((i, el) => {
        rowsFound++;
        const cells = $(el).find('td');
        if (cells.length >= 4) {
          const firstCellText = $(cells[0]).find('b').text().trim() || $(cells[0]).text().trim();

          // Check if this looks like a timetable row (starts with P1, P2, P3b, etc.)
          if (firstCellText.match(/^P\d+[ab]?$/i)) {
            rowsMatched++;
            const period = firstCellText;
            const room = $(cells[1]).text().trim();
            const subject = $(cells[2]).text().trim();
            const teacher = $(cells[3]).text().trim();

            logger.debug(`Timetable row found: period=${period}, subject="${subject}", teacher="${teacher}", room="${room}"`);

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
              logger.debug(`Added timetable entry for ${period}`);
            } else {
              logger.debug(`Skipped timetable entry - missing subject or teacher: subject="${subject}", teacher="${teacher}"`);
            }
          }
        }
      });

      logger.debug(`Selector ${selectorIndex}: found ${rowsFound} total rows, ${rowsMatched} matched period pattern, ${timetable.length} valid entries`);
      selectorIndex++;

      if (foundTimetable) break; // Found timetable, stop looking
    }

    logger.debug(`Found ${timetable.length} timetable entries`);

    // Process notices from parallel request
    let notices: Notice[] = [];

    if (noticesResponse.status === 'fulfilled' && noticesResponse.value.status === 200) {
      try {
        const noticesHtml = noticesResponse.value.data;
        const $notices = cheerio.load(noticesHtml);

        // Extract notices based on the actual notices page structure
        let currentNoticeDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });

        $notices('h4').each((i, el) => {
          const $heading = $notices(el);
          const text = $heading.text().trim();

          // Check if this h4 is actually a date header (e.g. "Friday 7 February 2026")
          const dateMatch = text.match(/^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+\d+\s+(?:\w+)\s+\d{4}$/i);
          if (dateMatch) {
            try {
              const parsedDate = new Date(text);
              if (!isNaN(parsedDate.getTime())) {
                currentNoticeDate = parsedDate.toLocaleDateString('en-CA');
              }
            } catch (e) {
              logger.debug(`Failed to parse notice date heading: ${text}`);
            }
            return; // Skip date headings as titles
          }

          const title = text;

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
              content,
              date: currentNoticeDate
            });
          }
        });

        logger.debug(`Found ${notices.length} notices from notices page`);
      } catch (error) {
        logger.debug('Error parsing notices:', error);
      }
    } else {
      logger.debug('Failed to fetch notices page:', noticesResponse.status === 'rejected' ? noticesResponse.reason : `status ${noticesResponse.value?.status}`);
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

    // Store scraped data in session for caching with explicit save()
    // Only save if there's meaningful data to cache
    const saveStart = Date.now();
    if (finalNotices.length > 0 || finalTimetable.length > 0) {
      session.portalData = portalData;
      await session.save();
      logger.debug(`Session data cached: ${Date.now() - saveStart}ms`);
    }

    logger.info(`Total scrape time: ${Date.now() - startTime}ms`);
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
