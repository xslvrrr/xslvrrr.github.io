// Test if we can scrape by following redirects properly in one flow
import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import * as cheerio from 'cheerio';

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const { username, password, school } = req.body;

    try {
        // Create a cookie jar to maintain session
        const jar = new CookieJar();
        const client = wrapper(axios.create({ jar }));

        // Step 1: Login with cookie jar
        const formData = new URLSearchParams();
        formData.append('account', '2');
        formData.append('email', username);
        formData.append('password', password);
        formData.append('sitename', school);

        console.log('TEST3: Logging in with cookie jar...');
        await client.post('https://millennium.education/login.asp', formData, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            maxRedirects: 5  // Follow redirects automatically
        });

        console.log('TEST3: Cookies after login:', await jar.getCookies('https://millennium.education'));

        // Step 2: Access portal (cookies are automatically sent by jar)
        console.log('TEST3: Accessing portal...');
        const portalResponse = await client.get('https://millennium.education/portal/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://millennium.education/login.asp'
            }
        });

        const html = portalResponse.data;
        console.log('TEST3: Portal HTML length:', html.length);

        // Parse timetable
        const $ = cheerio.load(html);
        const timetable: any[] = [];

        $('table.table1 tr').each((i, el) => {
            const cells = $(el).find('td');
            if (cells.length >= 4) {
                const period = $(cells[0]).text().trim();
                if (period.match(/^P\d+[ab]?$/i)) {
                    timetable.push({
                        period,
                        room: $(cells[1]).text().trim(),
                        subject: $(cells[2]).text().trim(),
                        teacher: $(cells[3]).text().trim()
                    });
                }
            }
        });

        console.log('TEST3: Found timetable entries:', timetable.length);

        return res.status(200).json({
            success: true,
            htmlLength: html.length,
            timetableCount: timetable.length,
            timetable: timetable.slice(0, 5),
            firstEntry: timetable[0]
        });

    } catch (error: any) {
        console.error('TEST3: Error:', error.message);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}
