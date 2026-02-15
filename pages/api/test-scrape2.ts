import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
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
        // Step 1: Login
        const formData = new URLSearchParams();
        formData.append('account', '2');
        formData.append('email', username);
        formData.append('password', password);
        formData.append('sitename', school);

        console.log('TEST2: Logging in...');
        let loginResponse;
        try {
            loginResponse = await axios.post('https://millennium.education/login.asp', formData, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                maxRedirects: 0,
                validateStatus: (status) => status < 400
            });
        } catch (error: any) {
            if (error.response?.status === 302) {
                loginResponse = error.response;
            } else {
                throw error;
            }
        }

        const redirectUrl = loginResponse.headers['location'] || '';
        console.log('TEST2: Redirect URL:', redirectUrl);

        // Extract cookies
        const setCookieHeaders = loginResponse.headers['set-cookie'] || [];
        const cookies = setCookieHeaders.map((c: string) => c.split(';')[0].trim());

        console.log('TEST2: Got cookies:', cookies);

        // Step 2: Follow the redirect
        const fullRedirectUrl = redirectUrl.startsWith('?')
            ? `https://millennium.education/portal/${redirectUrl}`
            : redirectUrl;

        console.log('TEST2: Following redirect to:', fullRedirectUrl);
        const redirectResponse = await axios.get(fullRedirectUrl, {
            headers: {
                'Cookie': cookies.join('; '),
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://millennium.education/login.asp'
            },
            maxRedirects: 5
        });

        const html = redirectResponse.data;
        console.log('TEST2: Portal HTML length:', html.length);

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

        console.log('TEST2: Found timetable entries:', timetable.length);

        return res.status(200).json({
            success: true,
            redirectUrl: fullRedirectUrl,
            htmlLength: html.length,
            timetableCount: timetable.length,
            timetable: timetable.slice(0, 3)
        });

    } catch (error: any) {
        console.error('TEST2: Error:', error.message);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}
