// Comprehensive content script for Millennium Portal (Firefox)
// Extracts data from ALL portal pages with proper HTML parsing

(function () {
    'use strict';

    // Use browser API with chrome fallback
    const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

    // Only run on /portal path
    if (!window.location.href.includes('millennium.education/portal')) {
        console.log('[Millennium Sync] Not on portal, skipping');
        return;
    }

    console.log('[Millennium Sync] Content script loaded on:', window.location.href);
    console.log('[Millennium Sync] DEBUG: SCRIPT VERSION SC-2-FF (FIREFOX)');

    // Extract user ID from navbar links
    function extractUserId() {
        const links = document.querySelectorAll('a[href*="uid="]');
        for (const link of links) {
            const match = link.href.match(/uid=(\d+)/);
            if (match) return match[1];
        }
        return null;
    }

    // Extract user info from the header bar
    function extractUserInfo() {
        const cells = document.querySelectorAll('td');
        for (const cell of cells) {
            const b = cell.querySelector('b');
            if (b && b.textContent.includes(':')) {
                const text = b.textContent.trim();
                const parts = text.split(':').map(p => p.trim());
                if (parts.length >= 2) {
                    return { school: parts[0], name: parts[1], uid: extractUserId() };
                }
            }
        }
        return { school: '', name: '', uid: extractUserId() };
    }

    // ============================================
    // IMPROVED PAGE SCRAPERS
    // ============================================

    // Scrape full timetable - handles Week A/B structure with contentSM class
    function scrapeTimetable(doc = document) {
        const timetable = {
            weekA: [],
            weekB: []
        };

        // Find the timetable table (class contentSM)
        const tables = doc.querySelectorAll('table.contentSM, table[width="98%"]');

        tables.forEach(table => {
            let currentWeek = 'weekA';
            let currentDay = '';

            const rows = table.querySelectorAll('tr');
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                const firstCellText = cells[0]?.textContent?.trim() || '';

                // Check for week header
                if (firstCellText.includes('Week A')) {
                    currentWeek = 'weekA';
                    return;
                }
                if (firstCellText.includes('Week B')) {
                    currentWeek = 'weekB';
                    return;
                }

                // Check for day header (has colspan and background)
                if (cells.length === 1 || (cells[0]?.getAttribute('colspan') && cells[0]?.getAttribute('bgcolor'))) {
                    const dayMatch = firstCellText.match(/^(Monday|Tuesday|Wednesday|Thursday|Friday)/i);
                    if (dayMatch) {
                        currentDay = dayMatch[1];
                        return;
                    }
                }

                // Check for timetable data row (6 columns: empty, period, course, class, teacher, location)
                if (cells.length >= 6 && currentDay) {
                    const periodCell = cells[1]?.textContent?.trim() || '';

                    if (/^P\d+[ab]?$/i.test(periodCell)) {
                        const entry = {
                            day: currentDay,
                            period: periodCell,
                            course: cells[2]?.textContent?.trim() || '',
                            classCode: cells[3]?.textContent?.trim() || '',
                            teacher: cells[4]?.textContent?.trim() || '',
                            room: cells[5]?.textContent?.trim() || ''
                        };

                        if (entry.course) {
                            timetable[currentWeek].push(entry);
                        }
                    }
                }
            });
        });

        return timetable;
    }

    function parseNoticeDateParam(value) {
        if (!value) return null;
        const decoded = decodeURIComponent(value).trim();
        const match = decoded.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
        if (match) {
            const day = parseInt(match[1], 10);
            const monthLabel = match[2].toUpperCase();
            const year = parseInt(match[3], 10);
            const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
            const monthIndex = months.indexOf(monthLabel);
            if (monthIndex >= 0) {
                return new Date(year, monthIndex, day);
            }
        }
        const fallback = new Date(decoded);
        return Number.isNaN(fallback.getTime()) ? null : fallback;
    }

    function formatNoticeDate(value) {
        if (!value) return new Date().toISOString().split('T')[0];
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return new Date().toISOString().split('T')[0];
        return date.toISOString().split('T')[0];
    }

    // Scrape notices - preserves HTML formatting for rich content
    function scrapeNotices(doc = document, noticeDateOverride = null) {
        const noticeDate = formatNoticeDate(noticeDateOverride);
        const currentDay = formatNoticeDate(new Date());
        const notices = [];

        doc.querySelectorAll('a.help').forEach(link => {
            const title = link.textContent?.trim() || '';
            const content = link.getAttribute('title') || '';
            if (title && content) {
                notices.push({
                    title,
                    content,
                    contentHtml: content, // For tooltip content, HTML may not be available
                    preview: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
                    date: noticeDate,
                    currentDay,
                    dates: [noticeDate]
                });
            }
        });

        doc.querySelectorAll('h4').forEach(heading => {
            const title = heading.textContent?.trim() || '';
            const nextEl = heading.nextElementSibling;
            if (nextEl && !notices.some(n => n.title === title)) {
                const content = nextEl.textContent?.trim() || ''; // Plain text fallback
                const contentHtml = nextEl.innerHTML || ''; // Preserve HTML formatting
                if (title && content.length > 10) {
                    notices.push({
                        title,
                        content,
                        contentHtml,
                        preview: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
                        date: noticeDate,
                        currentDay,
                        dates: [noticeDate]
                    });
                }
            }
        });

        return notices;
    }

    // Scrape grades
    function scrapeGrades(doc = document) {
        const grades = [];
        let currentSubject = '';

        const elements = doc.querySelectorAll('h3, h4, table');
        elements.forEach(el => {
            if (el.tagName === 'H3' || el.tagName === 'H4') {
                currentSubject = el.textContent?.trim() || '';
            } else if (el.tagName === 'TABLE' && currentSubject) {
                const rows = el.querySelectorAll('tr');
                rows.forEach((row, idx) => {
                    if (idx === 0) return;
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 2) {
                        const task = cells[0]?.textContent?.trim() || '';
                        const result = cells[cells.length - 1]?.textContent?.trim() || '';
                        if (task && task.length > 2 && task.length < 100 && !task.includes('Year:')) {
                            grades.push({ subject: currentSubject, task, result, date: '' });
                        }
                    }
                });
            }
        });

        return grades;
    }

    // Scrape attendance - captures both yearly and per-subject data
    function scrapeAttendance(doc = document) {
        const attendance = { yearly: [], subjects: [] };
        const tables = doc.querySelectorAll('table.table1sm');

        tables.forEach(table => {
            const headerRow = table.querySelector('tr.title, tr:first-child');
            const headerText = headerRow?.textContent || '';

            // Official School Attendance table (yearly data)
            if (headerText.includes('Year') && headerText.includes('School') && headerText.includes('Days')) {
                const rows = table.querySelectorAll('tr');
                rows.forEach((row, idx) => {
                    if (idx === 0) return; // Skip header row
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 6) {
                        const year = cells[0]?.textContent?.trim() || '';
                        if (/^20\d{2}$/.test(year)) {
                            // Parse percentage values (remove % and parse as float)
                            const parsePercent = (str) => {
                                const match = str?.match(/[\d.]+/);
                                return match ? parseFloat(match[0]) : 0;
                            };

                            attendance.yearly.push({
                                year,
                                schoolDays: parseInt(cells[1]?.textContent?.trim() || '0') || 0,
                                wholeDayAbsences: parseInt(cells[2]?.textContent?.trim() || '0') || 0,
                                wholeDayPercentage: parsePercent(cells[3]?.textContent?.trim()),
                                partialAbsences: parseFloat(cells[4]?.textContent?.trim() || '0') || 0,
                                totalPercentage: parsePercent(cells[5]?.textContent?.trim())
                            });
                        }
                    }
                });
            }

            // Whole Period Statistics table (per-subject data)
            if (headerText.includes('Class') && headerText.includes('RollsMarked')) {
                const rows = table.querySelectorAll('tr');
                rows.forEach((row, idx) => {
                    if (idx === 0) return; // Skip header row
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 5) {
                        const classCode = cells[0]?.textContent?.trim() || '';
                        if (classCode && classCode.length > 1) {
                            const percentText = cells[4]?.textContent?.trim() || '-';
                            const percentMatch = percentText.match(/[\d.]+/);

                            attendance.subjects.push({
                                classCode,
                                rollsMarked: parseInt(cells[1]?.textContent?.trim() || '0') || 0,
                                absent: parseInt(cells[2]?.textContent?.trim() || '0') || 0,
                                percentage: percentMatch ? parseFloat(percentMatch[0]) : null
                            });
                        }
                    }
                });
            }
        });

        // Fallback: if table1sm didn't match, try generic tables
        if (attendance.yearly.length === 0) {
            const allTables = doc.querySelectorAll('table');
            allTables.forEach(table => {
                const headerRow = table.querySelector('tr');
                const headerText = headerRow?.textContent || '';

                if (headerText.includes('Year') && headerText.includes('School') && !attendance.yearly.length) {
                    const rows = table.querySelectorAll('tr');
                    rows.forEach((row, idx) => {
                        if (idx === 0) return;
                        const cells = row.querySelectorAll('td');
                        if (cells.length >= 6) {
                            const year = cells[0]?.textContent?.trim() || '';
                            if (/^20\d{2}$/.test(year)) {
                                const parsePercent = (str) => {
                                    const match = str?.match(/[\d.]+/);
                                    return match ? parseFloat(match[0]) : 0;
                                };
                                attendance.yearly.push({
                                    year,
                                    schoolDays: parseInt(cells[1]?.textContent?.trim() || '0') || 0,
                                    wholeDayAbsences: parseInt(cells[2]?.textContent?.trim() || '0') || 0,
                                    wholeDayPercentage: parsePercent(cells[3]?.textContent?.trim()),
                                    partialAbsences: parseFloat(cells[4]?.textContent?.trim() || '0') || 0,
                                    totalPercentage: parsePercent(cells[5]?.textContent?.trim())
                                });
                            }
                        }
                    });
                }
            });
        }

        console.log('[Millennium Sync] Scraped attendance:', {
            yearly: attendance.yearly.length,
            subjects: attendance.subjects.length
        });

        return attendance;
    }

    // Scrape reports - captures year level, semester, and calendar year
    function scrapeReports(doc = document) {
        const reports = [];
        doc.querySelectorAll('a[href*="viewreport"]').forEach(link => {
            const href = link.href || '';
            const text = link.textContent?.trim() || '';

            if (text.includes('Report')) {
                // Parse "Year 11 - Semester 1 Report - 2025" format
                const yearLevelMatch = text.match(/Year\s*(\d+)/i);
                const semesterMatch = text.match(/Semester\s*(\d)/i);
                const calendarYearMatch = text.match(/\b(20\d{2})\b/);

                // Also try to get year from URL as fallback
                const urlYearMatch = href.match(/year=(\d{4})/);
                const urlSemesterMatch = href.match(/s=(\d)/);

                reports.push({
                    title: text,
                    url: href,
                    yearLevel: yearLevelMatch ? `Year ${yearLevelMatch[1]}` : '',
                    semester: parseInt(semesterMatch?.[1] || urlSemesterMatch?.[1] || '0') || 0,
                    calendarYear: parseInt(calendarYearMatch?.[1] || urlYearMatch?.[1] || '0') || 0
                });
            }
        });

        // Sort by calendar year (desc), then semester (desc)
        reports.sort((a, b) => {
            if (b.calendarYear !== a.calendarYear) return b.calendarYear - a.calendarYear;
            return b.semester - a.semester;
        });

        console.log('[Millennium Sync] Scraped reports:', reports.length);
        return reports;
    }

    // Scrape classes
    function scrapeClasses(doc = document) {
        const classes = [];

        // Look for the classes table - try multiple strategies
        const tables = doc.querySelectorAll('table');

        tables.forEach((table, tIdx) => {
            const rows = table.querySelectorAll('tr');
            if (rows.length < 2) return;

            const headerRow = rows[0];
            const headerCells = headerRow.querySelectorAll('th, td');
            const headerText = headerRow.textContent?.toLowerCase() || '';

            // Permissive check
            const hasCourse = headerText.includes('course');
            const hasClass = headerText.includes('class');
            const hasTeacher = headerText.includes('teacher');

            const isClassesTable = (hasCourse || headerText.includes('subject')) && (hasClass || hasTeacher);

            if (isClassesTable) {
                // Try to determine column indices from header
                let courseIdx = -1, classIdx = -1, teacherIdx = -1, lessonsIdx = -1,
                    meritsIdx = -1, rollsIdx = -1, absencesIdx = -1, roomIdx = -1;

                headerCells.forEach((cell, idx) => {
                    const text = cell.textContent?.toLowerCase() || '';
                    if (text.includes('course') || text.includes('subject')) courseIdx = idx;
                    else if (text.includes('class') && !text.includes('classes')) classIdx = idx;
                    else if (text.includes('teacher')) teacherIdx = idx;
                    else if (text.includes('lesson')) lessonsIdx = idx;
                    else if (text.includes('merit')) meritsIdx = idx;
                    else if (text.includes('roll')) rollsIdx = idx;
                    else if (text.includes('absence')) absencesIdx = idx;
                    else if (text.includes('room') || text.includes('location')) roomIdx = idx;
                });

                // If we found course/subject index, process data rows
                if (courseIdx >= 0) {
                    for (let i = 1; i < rows.length; i++) {
                        const row = rows[i];
                        const cells = row.querySelectorAll('td');

                        if (cells.length > courseIdx) {
                            const course = cells[courseIdx]?.textContent?.trim() || '';
                            const classCode = classIdx >= 0 ? (cells[classIdx]?.textContent?.trim() || '') : '';
                            const teacher = teacherIdx >= 0 ? (cells[teacherIdx]?.textContent?.trim() || '') : '';
                            const room = roomIdx >= 0 ? (cells[roomIdx]?.textContent?.trim() || '') : '';

                            // Only add if we have a valid course name
                            if (course && course.length > 2 && !course.includes('Total:')) {
                                classes.push({
                                    course,
                                    classCode: classCode || course,
                                    teacher,
                                    room,
                                    lessons: lessonsIdx >= 0 ? (parseInt(cells[lessonsIdx]?.textContent?.trim() || '0') || 0) : 0,
                                    quickMerits: meritsIdx >= 0 ? (parseInt(cells[meritsIdx]?.textContent?.trim() || '0') || 0) : 0,
                                    rollsMarked: rollsIdx >= 0 ? (parseInt(cells[rollsIdx]?.textContent?.trim() || '0') || 0) : 0,
                                    absences: absencesIdx >= 0 ? (parseInt(cells[absencesIdx]?.textContent?.trim() || '0') || 0) : 0
                                });
                            }
                        }
                    }
                }
            }
        });

        console.log('[Millennium Sync] Scraped classes:', classes.length);
        return classes;
    }

    // Scrape calendar events from a month page
    function scrapeCalendarPage(doc = document) {
        const events = [];

        // Look for event links
        doc.querySelectorAll('a.eventitem, a[data]').forEach(link => {
            const title = link.textContent?.trim() || '';
            const data = link.getAttribute('data') || '';
            if (title && !title.includes('--')) {
                events.push({ title, data });
            }
        });

        // Look for cells with events
        doc.querySelectorAll('td').forEach(cell => {
            const text = cell.textContent?.trim() || '';
            // Check for holiday or event markers
            if (text.includes('Holidays') || text.includes('Event')) {
                const dateMatch = text.match(/(\d{1,2}\s\w{3})/);
                const eventMatch = text.match(/--\s*(.+?)\s*--/);
                if (eventMatch) {
                    events.push({
                        date: dateMatch ? dateMatch[1] : '',
                        title: eventMatch[1],
                        type: 'holiday'
                    });
                }
            }
        });

        return events;
    }

    // ============================================
    // FULL SYNC WITH CALENDAR MONTHS
    // ============================================

    async function performFullSync() {
        const user = extractUserInfo();
        const uid = user.uid;

        if (!uid) {
            console.error('[Millennium Sync] No user ID found');
            return null;
        }

        console.log('[Millennium Sync] Starting full sync for UID:', uid);
        showSyncOverlay();

        const baseUrl = 'https://millennium.education/portal';
        const allData = {
            user,
            timetable: { weekA: [], weekB: [] },
            notices: [],
            grades: [],
            attendance: { yearly: [], subjects: [] },
            reports: [],
            calendar: [],
            classes: [],
            lastUpdated: new Date().toISOString()
        };

        // Calendar month values (current month ± 6 months)
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        // December 2025 is value 251, calculate from there
        const baseMonthValue = 251; // December 2025
        const monthValues = [];
        for (let i = -3; i <= 6; i++) {
            monthValues.push(baseMonthValue + i);
        }

        // Pages to scrape
        const pages = [
            { name: 'Timetable', url: `${baseUrl}/timetable.asp?uid=${uid}`, type: 'timetable' },
            { name: 'Notices', url: `${baseUrl}/notices.asp`, type: 'notices' },
            { name: 'Grades', url: `${baseUrl}/activities.asp?uid=${uid}`, type: 'grades' },
            { name: 'Attendance', url: `${baseUrl}/attendance.asp?uid=${uid}`, type: 'attendance' },
            { name: 'Reports', url: `${baseUrl}/reports.asp?uid=${uid}`, type: 'reports' },
            { name: 'Classes (Clean)', url: `${baseUrl}/classes.asp`, type: 'classes' },
            { name: 'Classes (UID)', url: `${baseUrl}/classes.asp?uid=${uid}`, type: 'classes' }
        ];

        // Add calendar months
        monthValues.forEach((val, idx) => {
            pages.push({
                name: `Calendar (Month ${idx + 1})`,
                url: `${baseUrl}/calendar.asp?uid=${uid}&month=${val}`,
                type: 'calendar'
            });
        });

        // Add notice date pages (past week and next week)
        const today = new Date();
        for (let i = -7; i <= 7; i++) {
            if (i === 0) continue;
            const date = new Date(today);
            date.setDate(date.getDate() + i);
            const day = date.getDate();
            const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
            const month = months[date.getMonth()];
            const year = date.getFullYear();
            const dateStr = encodeURIComponent(`${day} ${month} ${year}`);
            pages.push({
                name: `Notices (${i > 0 ? '+' : ''}${i}d)`,
                url: `${baseUrl}/notices.asp?date=${dateStr}`,
                type: 'notices'
            });
        }

        // Scrape each page
        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            console.log(`[Millennium Sync] Processing page ${i + 1}/${pages.length}: ${page.name}`);
            updateSyncProgress(i + 1, pages.length, page.name);

            try {
                const response = await fetch(page.url, { credentials: 'include' });

                if (!response.ok) {
                    console.error(`[Millennium Sync] Failed to fetch ${page.name}: ${response.status} ${response.statusText}`);
                    continue;
                }

                const html = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');

                switch (page.type) {
                    case 'timetable':
                        allData.timetable = scrapeTimetable(doc);
                        break;
                    case 'notices':
                        const noticesUrl = new URL(page.url);
                        const dateParam = noticesUrl.searchParams.get('date');
                        const noticeDate = dateParam ? parseNoticeDateParam(dateParam) : new Date();
                        const notices = scrapeNotices(doc, noticeDate);
                        notices.forEach(n => {
                            const key = `${n.title}::${n.content || n.preview}`;
                            const existing = allData.notices.find(entry =>
                                `${entry.title}::${entry.content || entry.preview}` === key
                            );
                            if (existing) {
                                const existingDates = new Set([...(existing.dates || []), ...(existing.date ? [existing.date] : [])]);
                                existingDates.add(n.date);
                                existing.dates = Array.from(existingDates);
                                existing.date = existing.dates[0];
                            } else {
                                allData.notices.push(n);
                            }
                        });
                        break;
                    case 'grades':
                        allData.grades = scrapeGrades(doc);
                        break;
                    case 'attendance':
                        const att = scrapeAttendance(doc);
                        if (att.yearly.length > 0 || att.subjects.length > 0) allData.attendance = att;
                        break;
                    case 'reports':
                        allData.reports = scrapeReports(doc);
                        break;
                    case 'classes':
                        const scrapedClasses = scrapeClasses(doc);
                        allData.classes = scrapedClasses;
                        break;
                    case 'calendar':
                        const events = scrapeCalendarPage(doc);
                        events.forEach(e => {
                            if (!allData.calendar.some(existing => existing.title === e.title && existing.date === e.date)) {
                                allData.calendar.push(e);
                            }
                        });
                        break;
                }
            } catch (error) {
                console.error(`[Millennium Sync] Error fetching ${page.name}:`, error);
            }

            await new Promise(r => setTimeout(r, 150));
        }

        console.log('[Millennium Sync] Sync complete:', {
            timetableA: allData.timetable.weekA?.length || 0,
            timetableB: allData.timetable.weekB?.length || 0,
            notices: allData.notices.length,
            grades: allData.grades.length,
            reports: allData.reports.length,
            classes: allData.classes.length,
            calendar: allData.calendar.length
        });

        const syncResult = await sendDataToApp(allData);
        showSyncComplete(allData);

        // Send completion message to popup (handle both Promise and callback styles)
        if (browserAPI.runtime) {
            try {
                const sendPromise = browserAPI.runtime.sendMessage({
                    type: 'SYNC_COMPLETE',
                    data: allData
                });
                // Handle if it returns a Promise (Firefox)
                if (sendPromise && typeof sendPromise.catch === 'function') {
                    sendPromise.catch(() => {
                        // Ignore errors if no listeners
                    });
                }
            } catch (e) {
                // Ignore errors if no listeners
            }
        }

        return allData;
    }

    // Store the login token from the sync response
    let currentLoginToken = null;

    function showSyncOverlay() {
        const existing = document.getElementById('millennium-sync-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'millennium-sync-overlay';

        // CSS matching popup.html style
        overlay.innerHTML = `
      <style>
        #millennium-sync-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(8, 9, 10, 0.9);
          backdrop-filter: blur(5px);
          z-index: 2147483647; /* Max z-index */
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Geist Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        .sync-modal {
          background: #0F1011;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 32px;
          text-align: center;
          color: #F7F8F8;
          width: 400px;
          max-width: 90vw;
          box-shadow: 0 20px 40px rgba(0,0,0,0.4);
          animation: slideUp 0.3s ease-out;
        }
        @keyframes slideUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
        .sync-logo {
          width: 60px; height: 60px;
          margin: 0 auto 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          overflow: hidden;
          background: #08090A;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .sync-logo img {
            width: 100%; height: 100%; object-fit: contain;
        }
        .sync-logo-fallback {
            width: 100%; height: 100%;
            background: #6468F0;
            display: flex; align-items: center; justify-content: center;
            color: white; font-size: 32px; font-weight: bold;
        }
        
        .sync-title { font-size: 20px; font-weight: 600; margin-bottom: 8px; color: #F7F8F8; }
        .sync-subtitle { color: #6A6A75; font-size: 14px; margin-bottom: 24px; }
        
        .sync-progress-container {
          height: 8px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 12px;
        }
        .sync-progress-bar {
          height: 100%;
          background: #6468F0;
          width: 0%;
          transition: width 0.3s ease-out;
          border-radius: 4px;
        }
        
        .sync-status { font-size: 13px; color: #A1A5A9; font-weight: 500; }
        
        .sync-complete { display: none; }
        .sync-complete.visible { display: block; animation: fadeIn 0.3s ease; }
        
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        
        .sync-in-progress.hidden { display: none; }
        
        .sync-stats-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            margin: 24px 0;
        }
        
        .sync-stat-card {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 8px;
            padding: 12px 8px;
            text-align: center;
        }
        
        .sync-stat-value { font-size: 20px; font-weight: 600; color: #6468F0; }
        .sync-stat-label { font-size: 10px; color: #6A6A75; text-transform: uppercase; margin-top: 4px; font-weight: 500; }
        
        .sync-btn {
          width: 100%;
          padding: 12px 16px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          margin-top: 10px;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .sync-btn:hover { transform: translateY(-1px); }
        .sync-btn-primary { background: #6468F0; color: white; }
        .sync-btn-primary:hover { background: #7377F2; }
        .sync-btn-secondary { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); color: #F7F8F8; }
        .sync-btn-secondary:hover { background: rgba(255,255,255,0.06); }
        
      </style>
      <div class="sync-modal">
        <div class="sync-logo">
            <img id="syncLogoImg" src="" style="display:none">
            <div class="sync-logo-fallback">M</div>
        </div>
        
        <div class="sync-in-progress" id="syncProgress">
          <div class="sync-title">Syncing Portal</div>
          <div class="sync-subtitle">Collecting your timetable, grades & notices</div>
          
          <div class="sync-progress-container">
            <div class="sync-progress-bar" id="syncProgressBar"></div>
          </div>
          <div class="sync-status" id="syncStatus">Starting sync...</div>
        </div>
        
        <div class="sync-complete" id="syncComplete">
          <div class="sync-title">Sync Complete!</div>
          <div class="sync-subtitle">Your data is ready to use</div>
          
          <div class="sync-stats-grid" id="syncStats">
            <!-- Stats injected here -->
          </div>
          
          <button class="sync-btn sync-btn-primary" id="openLogin">
            Open Dashboard
          </button>
          <button class="sync-btn sync-btn-secondary" id="closeSyncOverlay">
            Stay Here
          </button>
        </div>
      </div>
    `;
        document.body.appendChild(overlay);

        // Try to load logo
        if (browserAPI.runtime) {
            try {
                const img = document.getElementById('syncLogoImg');
                const fallback = document.querySelector('.sync-logo-fallback');
                img.src = browserAPI.runtime.getURL('icons/icon128.png');
                img.onload = () => {
                    img.style.display = 'block';
                    if (fallback) fallback.style.display = 'none';
                };
            } catch (e) { console.error(e); }
        }

        document.getElementById('openLogin')?.addEventListener('click', () => {
            // Redirect to login with token (token should always be available after sync)
            console.log('[Millennium Sync] Opening login with token:', currentLoginToken ? 'YES' : 'NO');
            const loginUrl = currentLoginToken
                ? `http://localhost:3000/login?token=${currentLoginToken}`
                : `http://localhost:3000/login`;
            console.log('[Millennium Sync] Redirecting to:', loginUrl);
            window.open(loginUrl, '_blank');
            overlay.remove();
        });

        document.getElementById('closeSyncOverlay')?.addEventListener('click', () => {
            overlay.remove();
        });
    }

    function updateSyncProgress(current, total, pageName) {
        const bar = document.getElementById('syncProgressBar');
        const status = document.getElementById('syncStatus');

        if (bar) bar.style.width = `${(current / total) * 100}%`;
        if (status) status.textContent = `Scanning: ${pageName}`;

        // Send progress to popup and background (handle both Promise and callback styles)
        if (browserAPI.runtime) {
            try {
                const sendPromise = browserAPI.runtime.sendMessage({
                    type: 'SYNC_PROGRESS',
                    progress: {
                        current,
                        total,
                        page: pageName
                    }
                });
                if (sendPromise && typeof sendPromise.catch === 'function') {
                    sendPromise.catch(() => { });
                }
            } catch (e) {
                // Ignore errors
            }
        }
    }

    function showSyncComplete(data) {
        const progress = document.getElementById('syncProgress');
        const complete = document.getElementById('syncComplete');
        const stats = document.getElementById('syncStats');

        if (progress) progress.classList.add('hidden');
        if (complete) complete.classList.add('visible');

        if (stats) {
            stats.innerHTML = `
        <div class="sync-stat-card">
          <div class="sync-stat-value">${data.classes?.length || 0}</div>
          <div class="sync-stat-label">Classes</div>
        </div>
        <div class="sync-stat-card">
          <div class="sync-stat-value">${data.notices?.length || 0}</div>
          <div class="sync-stat-label">Notices</div>
        </div>
        <div class="sync-stat-card">
          <div class="sync-stat-value">${data.grades?.length || 0}</div>
          <div class="sync-stat-label">Grades</div>
        </div>
      `;
        }
    }

    // ============================================
    // COMMUNICATION
    // ============================================

    async function sendDataToApp(data) {
        try {
            // Firefox content scripts can't fetch to localhost directly due to CORS
            // Send to background script to make the API call
            console.log('[Millennium Sync] Sending data to background script...');

            const sendPromise = browserAPI.runtime.sendMessage({
                type: 'SEND_TO_APP',
                data: data
            });

            let result;
            if (sendPromise && typeof sendPromise.then === 'function') {
                // Firefox Promise-based
                result = await sendPromise;
            } else {
                // Fallback: shouldn't happen in Firefox but just in case
                result = await new Promise((resolve) => {
                    browserAPI.runtime.sendMessage({
                        type: 'SEND_TO_APP',
                        data: data
                    }, resolve);
                });
            }

            console.log('[Millennium Sync] API response:', result);

            // Store the login token for redirect
            if (result && result.loginToken) {
                currentLoginToken = result.loginToken;
                console.log('[Millennium Sync] ✓ Login token stored:', currentLoginToken.substring(0, 12) + '...');
            } else {
                console.warn('[Millennium Sync] ⚠️ No loginToken in API response');
            }

            return result;
        } catch (error) {
            console.error('[Millennium Sync] Send error:', error);
            return { success: false, error: error.message };
        }
    }

    function storeData(data) {
        if (browserAPI.storage) {
            browserAPI.storage.local.set({ portalData: data });
        }
    }

    // ============================================
    // MESSAGE HANDLING
    // ============================================

    if (browserAPI.runtime) {
        browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'FULL_SYNC') {
                performFullSync().then(data => {
                    if (data) storeData(data);
                    sendResponse({ success: !!data, data });
                });
                return true;
            }
            return true;
        });
    }

    // ============================================
    // AUTO-SYNC ON PAGE LOAD
    // ============================================

    function checkAutoSync() {
        const uid = extractUserId();
        if (!uid) {
            console.log('[Millennium Sync] No UID found, waiting for login...');
            return;
        }

        const lastSync = localStorage.getItem('millennium-last-sync');
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;

        if (!lastSync || (now - parseInt(lastSync)) > fiveMinutes) {
            console.log('[Millennium Sync] Starting auto-sync...');
            localStorage.setItem('millennium-last-sync', now.toString());
            performFullSync();
        } else {
            console.log('[Millennium Sync] Recently synced, skipping');
        }
    }

    if (document.readyState === 'complete') {
        setTimeout(checkAutoSync, 1500);
    } else {
        window.addEventListener('load', () => setTimeout(checkAutoSync, 1500));
    }

})();
