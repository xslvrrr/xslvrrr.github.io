import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '../../../lib/session';

interface DashboardData {
  user: {
    name: string;
    school: string;
    year: string;
    uid: string;
  };
  timetable: Array<{
    period: string;
    room: string;
    subject: string;
    teacher: string;
    current: boolean;
  }>;
  notices: Array<{
    title: string;
    content: string;
    date?: string;
  }>;
  diary: Array<{
    title: string;
    date: string;
    time: string;
  }>;
  navigation: Array<{
    section: string;
    links: Array<{
      name: string;
      url: string;
    }>;
  }>;
}

function parsePortalHTML(html: string): DashboardData {
  // Extract student name and school
  const schoolMatch = html.match(/<B>([^:]+)\s*:\s*([^<]+)<\/B>/);
  const schoolName = schoolMatch ? schoolMatch[1].trim() : '';
  const studentName = schoolMatch ? schoolMatch[2].trim() : '';
  
  // Extract year
  const yearMatch = html.match(/<option[^>]*SELECTED[^>]*>(\d{4})<\/option>/);
  const year = yearMatch ? yearMatch[1] : '';
  
  // Extract UID from URLs
  const uidMatch = html.match(/uid=(\d+)/);
  const uid = uidMatch ? uidMatch[1] : '';

  // Parse timetable
  const timetable: DashboardData['timetable'] = [];
  const timetableMatch = html.match(/<div id="timetable"[^>]*>.*?<table[^>]*>(.*?)<\/table>/s);
  if (timetableMatch) {
    const tableContent = timetableMatch[1];
    const rowMatches = tableContent.matchAll(/<tr><td><B>([^<]+)<\/B><\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><td[^>]*><span[^>]*style='background-color:#20e020;'[^>]*>/g);
    
    for (const row of rowMatches) {
      timetable.push({
        period: row[1],
        room: row[2],
        subject: row[3],
        teacher: row[4],
        current: true // Green background indicates current
      });
    }

    // Get non-current periods
    const allRowMatches = tableContent.matchAll(/<tr><td><B>([^<]+)<\/B><\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><td[^>]*><span[^>]*(?!style='background-color:#20e020;')[^>]*>/g);
    
    for (const row of allRowMatches) {
      timetable.push({
        period: row[1],
        room: row[2],
        subject: row[3],
        teacher: row[4],
        current: false
      });
    }
  }

  // Parse notices
  const notices: DashboardData['notices'] = [];
  const noticesMatch = html.match(/<div id="notices"[^>]*>.*?<div class="jdash-body">(.*?)<\/div>/s);
  if (noticesMatch) {
    const noticesContent = noticesMatch[1];
    const noticeMatches = noticesContent.matchAll(/<li><a[^>]*title="([^"]*)"[^>]*>([^<]+)<\/a>/g);
    
    for (const notice of noticeMatches) {
      notices.push({
        title: notice[2].replace(/&#\d+;/g, ''), // Remove HTML entities
        content: notice[1].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
      });
    }
  }

  // Parse diary
  const diary: DashboardData['diary'] = [];
  const diaryMatch = html.match(/<div id="mydiary"[^>]*>.*?<div id="diary">(.*?)<\/div>/s);
  if (diaryMatch) {
    const diaryContent = diaryMatch[1];
    const eventMatches = diaryContent.matchAll(/<div[^>]*><B>([^<]+)<\/B><BR><small><I[^>]*>([^<]+)<BR>\s*([^<]*)\s*<\/I><\/small><\/div>/g);
    
    for (const event of eventMatches) {
      diary.push({
        title: event[1],
        date: event[2].trim(),
        time: event[3].trim()
      });
    }
  }

  // Parse navigation
  const navigation: DashboardData['navigation'] = [
    {
      section: 'Account',
      links: [
        { name: 'Home', url: '/dashboard' },
        { name: 'My Account', url: '#' },
        { name: 'Log Out', url: '#' }
      ]
    },
    {
      section: 'Resources',
      links: [
        { name: 'Resources', url: '#' },
        { name: 'Notices', url: '#' }
      ]
    },
    {
      section: 'Academic',
      links: [
        { name: 'Classes', url: '#' },
        { name: 'Lessons', url: '#' },
        { name: 'Timetable', url: '#' },
        { name: 'Diary', url: '#' }
      ]
    },
    {
      section: 'Reports',
      links: [
        { name: 'Markbook', url: '#' },
        { name: 'Reports', url: '#' }
      ]
    },
    {
      section: 'Attendance',
      links: [
        { name: 'Register', url: '#' },
        { name: 'Attendance', url: '#' }
      ]
    }
  ];

  return {
    user: {
      name: studentName,
      school: schoolName,
      year,
      uid
    },
    timetable,
    notices,
    diary,
    navigation
  };
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

    // For debug mode, return mock data
    if (session.isDebug) {
      const mockData: DashboardData = {
        user: {
          name: session.username || 'Debug User',
          school: session.school || 'Test School',
          year: '2025',
          uid: 'debug'
        },
        timetable: [
          { period: 'P1', room: 'A101', subject: 'Mathematics', teacher: 'Mr. Johnson', current: true },
          { period: 'P2', room: 'B205', subject: 'English', teacher: 'Ms. Smith', current: false },
          { period: 'P3', room: 'C301', subject: 'Science', teacher: 'Dr. Brown', current: false }
        ],
        notices: [
          { title: 'Welcome to Debug Mode', content: 'This is a test notice for debug mode.' },
          { title: 'School Sports Day', content: 'Annual sports day coming up next Friday.' }
        ],
        diary: [
          { title: 'Math Test', date: 'Mon 9 SEP 2025', time: '9:00 AM' },
          { title: 'Science Project Due', date: 'Wed 11 SEP 2025', time: 'All Day' }
        ],
        navigation: [
          {
            section: 'Account',
            links: [
              { name: 'Home', url: '/dashboard' },
              { name: 'My Account', url: '#' },
              { name: 'Log Out', url: '#' }
            ]
          },
          {
            section: 'Academic',
            links: [
              { name: 'Classes', url: '#' },
              { name: 'Timetable', url: '#' },
              { name: 'Reports', url: '#' }
            ]
          }
        ]
      };
      
      return res.status(200).json(mockData);
    }

    // For real authentication, fetch from millennium.education
    if (!session.sessionCookies || session.sessionCookies.length === 0) {
      return res.status(401).json({ message: 'No valid session cookies' });
    }

    try {
      const response = await fetch('https://millennium.education/portal/', {
        method: 'GET',
        headers: {
          'Cookie': session.sessionCookies.join('; '),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://millennium.education/portal/'
        },
      });

      if (!response.ok) {
        throw new Error(`Portal request failed: ${response.status}`);
      }

      const html = await response.text();
      
      // Check if we're still logged in (presence of user data)
      if (!html.includes('class="jdash-widget"') || html.includes('login.asp')) {
        return res.status(401).json({ message: 'Session expired' });
      }

      const portalData = parsePortalHTML(html);
      return res.status(200).json(portalData);

    } catch (fetchError) {
      console.error('Error fetching portal data:', fetchError);
      return res.status(500).json({ message: 'Failed to fetch portal data' });
    }

  } catch (error) {
    console.error('Dashboard API error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}
