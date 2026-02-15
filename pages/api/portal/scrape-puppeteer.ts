import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '../../../lib/session';
import { logger } from '../../../lib/logger';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

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

interface PortalData {
    user: {
        name: string;
        school: string;
    };
    timetable: TimetableEntry[];
    notices: Notice[];
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

    let browser;

    try {
        const session = await getSession(req, res);

        if (!session.loggedIn || !session.username || !session.password) {
            return res.status(401).json({ message: 'Not authenticated' });
        }

        logger.info(`[Puppeteer] Starting scrape for ${session.username}`);

        // Launch browser
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Navigate to Millennium homepage (which should have login form)
        logger.debug('[Puppeteer] Navigating to Millennium');
        await page.goto('https://millennium.education/', { waitUntil: 'networkidle2' });

        // Check what's on the page
        const pageTitle = await page.title();
        logger.debug(`[Puppeteer] Page title: ${pageTitle}`);

        // Look for login form - it might be on the homepage or we need to click a login button
        const hasLoginForm = await page.$('input[name="email"]');

        if (!hasLoginForm) {
            // Maybe need to click a login link first
            logger.debug('[Puppeteer] Looking for login link');
            const loginLink = await page.$('a[href*="login"]');
            if (loginLink) {
                await loginLink.click();
                await page.waitForNavigation({ waitUntil: 'networkidle2' });
            }
        }

        // Debug: dump the HTML to see what form fields exist
        const html = await page.content();
        fs.writeFileSync(path.join(process.cwd(), 'debug-login-page.html'), html);
        logger.debug('[Puppeteer] Saved login page HTML to debug-login-page.html');

        // Look for any input fields to see what exists
        const inputs = await page.$$eval('input', (elements) =>
            elements.map(el => ({ name: el.getAttribute('name'), type: el.getAttribute('type'), id: el.id }))
        );
        logger.debug('[Puppeteer] Found inputs:', JSON.stringify(inputs));

        // Now fill in the login form
        logger.debug('[Puppeteer] Filling login form');
        await page.waitForSelector('input[name="UserName"]', { timeout: 5000 });

        // Fill in the form fields (NSW DoE SSO login page)
        // SSO requires full email format
        const ssoUsername = session.username.includes('@') ? session.username : `${session.username}@education.nsw.gov.au`;
        await page.type('input[name="UserName"]', ssoUsername);
        await page.type('input[name="Password"]', session.password || '');

        // Note: No sitename/school field on SSO login page

        // Click submit button and wait for navigation
        logger.debug('[Puppeteer] Submitting login form');
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
            page.click('input[type="submit"], button[type="submit"], #submitButton')
        ]);

        let currentUrl = page.url();
        logger.debug(`[Puppeteer] After login URL: ${currentUrl}`);

        // Handle SSO/ADFS flow - may need to wait for additional redirects
        if (currentUrl.includes('adfs') || currentUrl.includes('pullStatus')) {
            logger.debug('[Puppeteer] Waiting for SSO/ADFS authentication to complete...');

            // Wait for up to 30 seconds for SSO flow to complete
            let attempts = 0;
            while (attempts < 30 && !currentUrl.includes('portal') && !currentUrl.includes('millennium.education/portal')) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                currentUrl = page.url();
                attempts++;

                if (attempts % 5 === 0) {
                    logger.debug(`[Puppeteer] Still waiting for SSO... (${attempts}s) Current: ${currentUrl.substring(0, 100)}`);
                }
            }

            currentUrl = page.url();
            logger.debug(`[Puppeteer] Final URL after SSO: ${currentUrl}`);
        }

        if (!currentUrl.includes('portal')) {
            logger.error('[Puppeteer] Login failed - not redirected to portal');
            return res.status(401).json({ message: 'Login failed' });
        }

        // Extract user info
        const userName = await page.$eval('table.grey td b', el => el.textContent || '').catch(() => '');
        const schoolName = session.school || '';

        logger.debug(`[Puppeteer] Logged in as: ${userName}`);

        // Extract timetable
        const timetable: TimetableEntry[] = await page.evaluate(() => {
            const entries: any[] = [];
            const rows = document.querySelectorAll('table.table1 tr');

            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 4) {
                    const periodText = cells[0].querySelector('b')?.textContent?.trim() || cells[0].textContent?.trim() || '';

                    if (periodText.match(/^P\d+[ab]?$/i)) {
                        const period = periodText;
                        const room = cells[1].textContent?.trim() || '';
                        const subject = cells[2].textContent?.trim() || '';
                        const teacher = cells[3].textContent?.trim() || '';

                        let attendanceStatus: 'present' | 'absent' | 'partial' | 'unmarked' = 'unmarked';
                        if (cells.length >= 5) {
                            const span = cells[4].querySelector('span');
                            if (span) {
                                const style = span.getAttribute('style') || '';
                                if (style.includes('#20e020')) {
                                    attendanceStatus = 'present';
                                } else if (style.includes('#ff0000')) {
                                    attendanceStatus = 'absent';
                                } else if (style.includes('#ffa500')) {
                                    attendanceStatus = 'partial';
                                }
                            }
                        }

                        if (subject && teacher) {
                            entries.push({ period, room, subject, teacher, attendanceStatus });
                        }
                    }
                }
            });

            return entries;
        });

        logger.info(`[Puppeteer] Found ${timetable.length} timetable entries`);

        // Navigate to notices page
        logger.debug('[Puppeteer] Navigating to notices page');
        await page.goto('https://millennium.education/portal/notices.asp', { waitUntil: 'networkidle2' });

        // Extract notices
        const notices: Notice[] = await page.evaluate(() => {
            const noticesList: any[] = [];
            const headings = document.querySelectorAll('h4');
            let currentNoticeDate = new Date().toISOString().split('T')[0];

            headings.forEach(heading => {
                const text = heading.textContent?.trim() || '';

                // Check if this h4 is actually a date header (e.g. "Friday 7 February 2026")
                const dateMatch = text.match(/^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+\d+\s+(?:\w+)\s+\d{4}$/i);
                if (dateMatch) {
                    try {
                        const parsedDate = new Date(text);
                        if (!isNaN(parsedDate.getTime())) {
                            currentNoticeDate = parsedDate.toISOString().split('T')[0];
                        }
                    } catch (e) { }
                    return;
                }

                const title = text;
                const noticeDiv = heading.nextElementSibling;

                if (noticeDiv && noticeDiv.classList.contains('notice')) {
                    const content = noticeDiv.innerHTML || '';
                    const textContent = noticeDiv.textContent?.trim() || '';
                    const preview = textContent.length > 150 ? textContent.substring(0, 150) + '...' : textContent;

                    if (title && preview) {
                        noticesList.push({ title, preview, content, date: currentNoticeDate });
                    }
                }
            });

            return noticesList;
        });

        logger.info(`[Puppeteer] Found ${notices.length} notices`);

        const portalData: PortalData = {
            user: {
                name: userName,
                school: schoolName
            },
            timetable,
            notices,
            lastUpdated: new Date().toISOString()
        };

        // Cache in session
        session.portalData = portalData;
        await session.save();

        return res.status(200).json(portalData);

    } catch (error: any) {
        logger.error('[Puppeteer] Scraping error:', error);
        return res.status(500).json({
            message: 'Failed to scrape portal data',
            error: error.message
        });
    } finally {
        if (browser) {
            await browser.close();
            logger.debug('[Puppeteer] Browser closed');
        }
    }
}
