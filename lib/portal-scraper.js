(function (global) {
    'use strict';

    const MONTH_LABELS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const DEFAULT_NOTICE_LOOKBEHIND_DAYS = 2;
    const DEFAULT_NOTICE_LOOKAHEAD_DAYS = 5;
    const BASE_CALENDAR_MONTH_VALUE = 251; // December 2025 on the portal.

    function extractUserId(doc) {
        const links = doc.querySelectorAll('a[href*="uid="]');
        for (const link of links) {
            const match = (link.href || '').match(/uid=(\d+)/);
            if (match) return match[1];
        }
        return null;
    }

    function extractUserInfo(doc) {
        const cells = doc.querySelectorAll('td');
        for (const cell of cells) {
            const b = cell.querySelector('b');
            if (b && b.textContent.includes(':')) {
                const parts = b.textContent.trim().split(':').map((part) => part.trim());
                if (parts.length >= 2) {
                    return { school: parts[0], name: parts[1], uid: extractUserId(doc) };
                }
            }
        }
        return { school: '', name: '', uid: extractUserId(doc) };
    }

    function findAccountPageUrl(doc) {
        const portalBase = 'https://millennium.education/portal/';
        const candidates = Array.from(doc.querySelectorAll('a[href]')).map((link) => {
            const href = link.getAttribute('href')?.trim() || '';
            const text = link.textContent?.trim().toLowerCase() || '';
            const normalizedHref = href.toLowerCase();
            let score = 0;

            if (normalizedHref.includes('modify')) score += 100;
            if (/\bmodify\s+account\b/.test(text)) score += 100;
            if (/\bmy\s+account\b/.test(text)) score += 90;
            if (text === 'account' || text === 'profile') score += 70;
            if (/(?:account|profile|details|personal)/.test(normalizedHref)) score += 50;
            if (/(?:logout|login|forgot|help)/.test(normalizedHref)) score = -1;

            try {
                const url = new URL(href, portalBase);
                if (url.hostname !== 'millennium.education' || !url.pathname.startsWith('/portal/')) score = -1;
                return { url: url.toString(), score };
            } catch {
                return { url: '', score: -1 };
            }
        }).filter((candidate) => candidate.score > 0);

        candidates.sort((left, right) => right.score - left.score);
        return candidates[0]?.url || '';
    }

    function scrapeAccount(doc) {
        const emailInput = doc.querySelector('input[name="email1"]');
        const form = emailInput?.closest('form')
            || doc.querySelector('form[action*="modify.asp"], form[name="form1"]');
        if (!form) return null;

        const rowValue = (label) => {
            const normalizedLabel = label.toLowerCase().replace(/[^a-z]/g, '');
            const row = Array.from(form.querySelectorAll('tr')).find((candidate) => {
                const heading = candidate.querySelector('b')?.textContent || '';
                return heading.toLowerCase().replace(/[^a-z]/g, '') === normalizedLabel;
            });
            const cells = row ? row.querySelectorAll('td') : [];
            return cells[1]?.textContent?.trim() || '';
        };
        const inputValue = (name) => form.querySelector(`[name="${name}"]`)?.value?.trim() || '';

        return {
            username: rowValue('UserName'),
            firstName: rowValue('FirstName'),
            lastName: rowValue('LastName'),
            email: inputValue('email1'),
            nesaStudentNumber: inputValue('bosID'),
            usi: inputValue('usi'),
            mobile: inputValue('mobile'),
            currentYear: inputValue('y')
        };
    }

    function parseNoticeDateParam(value) {
        if (!value) return null;
        const decoded = decodeURIComponent(value).trim();
        const match = decoded.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
        if (match) {
            const monthIndex = MONTH_LABELS.indexOf(match[2].toUpperCase());
            if (monthIndex >= 0) return new Date(parseInt(match[3], 10), monthIndex, parseInt(match[1], 10));
        }
        const fallback = new Date(decoded);
        return Number.isNaN(fallback.getTime()) ? null : fallback;
    }

    function formatNoticeDate(value) {
        const date = value instanceof Date ? value : new Date(value || Date.now());
        if (Number.isNaN(date.getTime())) return new Date().toISOString().split('T')[0];
        return date.toISOString().split('T')[0];
    }

    function parsePortalDate(value, fallback) {
        if (!value) return fallback instanceof Date ? fallback : new Date();
        if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
        if (typeof value === 'string') {
            const inputMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (inputMatch) {
                const parsed = new Date(parseInt(inputMatch[1], 10), parseInt(inputMatch[2], 10) - 1, parseInt(inputMatch[3], 10));
                if (!Number.isNaN(parsed.getTime())) return parsed;
            }
            const noticeDate = parseNoticeDateParam(value);
            if (noticeDate && !Number.isNaN(noticeDate.getTime())) return noticeDate;
        }
        return fallback instanceof Date ? fallback : new Date();
    }

    function formatPortalLegacyDate(value) {
        const date = parsePortalDate(value, new Date());
        return `${date.getDate()} ${MONTH_LABELS[date.getMonth()]} ${date.getFullYear()}`;
    }

    function appendPortalDate(url, portalDate) {
        if (!portalDate) return url;
        const nextUrl = new URL(url);
        nextUrl.searchParams.set('date', formatPortalLegacyDate(portalDate));
        return nextUrl.toString();
    }

    function scrapeTimetable(doc) {
        const timetable = { weekA: [], weekB: [] };
        const tables = doc.querySelectorAll('table.contentSM, table[width="98%"]');

        tables.forEach((table) => {
            let currentWeek = 'weekA';
            let currentDay = '';

            table.querySelectorAll('tr').forEach((row) => {
                const cells = row.querySelectorAll('td');
                const firstCellText = cells[0]?.textContent?.trim() || '';

                if (firstCellText.includes('Week A')) {
                    currentWeek = 'weekA';
                    return;
                }
                if (firstCellText.includes('Week B')) {
                    currentWeek = 'weekB';
                    return;
                }

                if (cells.length === 1 || (cells[0]?.getAttribute('colspan') && cells[0]?.getAttribute('bgcolor'))) {
                    const dayMatch = firstCellText.match(/^(Monday|Tuesday|Wednesday|Thursday|Friday)/i);
                    if (dayMatch) {
                        currentDay = dayMatch[1];
                        return;
                    }
                }

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
                        if (entry.course) timetable[currentWeek].push(entry);
                    }
                }
            });
        });

        return timetable;
    }

    function compactNoticeHtml(html, plainText) {
        if (!html || html === plainText) return undefined;
        const compacted = html
            .replace(/<img\b[^>]*\bsrc\s*=\s*["']?data:[^>]*>/gi, '')
            .replace(/data:[^"'\s>]+/gi, '')
            .trim();
        if (!compacted || compacted === plainText) return undefined;
        return compacted.slice(0, 64 * 1024);
    }

    function scrapeNotices(doc, noticeDateOverride) {
        const noticeDate = formatNoticeDate(noticeDateOverride);
        const currentDay = formatNoticeDate(new Date());
        const notices = [];

        doc.querySelectorAll('a.help').forEach((link) => {
            const title = link.textContent?.trim() || '';
            const content = link.getAttribute('title') || '';
            if (title && content) {
                notices.push({
                    title,
                    content,
                    preview: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
                    date: noticeDate,
                    currentDay,
                    dates: [noticeDate]
                });
            }
        });

        doc.querySelectorAll('h4').forEach((heading) => {
            const title = heading.textContent?.trim() || '';
            const nextEl = heading.nextElementSibling;
            if (nextEl && !notices.some((notice) => notice.title === title)) {
                const content = nextEl.textContent?.trim() || '';
                const contentHtml = compactNoticeHtml(nextEl.innerHTML || '', content);
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

    function scrapeGrades(doc) {
        const grades = [];
        let currentSubject = '';
        doc.querySelectorAll('h3, h4, table').forEach((el) => {
            if (el.tagName === 'H3' || el.tagName === 'H4') {
                currentSubject = el.textContent?.trim() || '';
                return;
            }
            if (el.tagName !== 'TABLE' || !currentSubject) return;
            el.querySelectorAll('tr').forEach((row, idx) => {
                if (idx === 0) return;
                const cells = row.querySelectorAll('td');
                if (cells.length < 2) return;
                const task = cells[0]?.textContent?.trim() || '';
                const result = cells[cells.length - 1]?.textContent?.trim() || '';
                if (task && task.length > 2 && task.length < 100 && !task.includes('Year:')) {
                    grades.push({ subject: currentSubject, task, result, date: '' });
                }
            });
        });
        return grades;
    }

    function scrapeAttendance(doc) {
        const attendance = { yearly: [], subjects: [], absences: [], recentPeriods: [] };
        const parsePercent = (value) => {
            const match = value?.match(/[\d.]+/);
            return match ? parseFloat(match[0]) : 0;
        };

        doc.querySelectorAll('table.table1sm').forEach((table) => {
            const headerText = table.querySelector('tr.title, tr:first-child')?.textContent || '';
            if (headerText.includes('Absent') && headerText.includes('Reason') && headerText.includes('Start')) {
                table.querySelectorAll('tr').forEach((row, idx) => {
                    if (idx === 0) return;
                    const cells = row.querySelectorAll('td');
                    if (cells.length < 4) return;
                    attendance.absences.push({
                        type: cells[0]?.textContent?.trim() || '',
                        reason: cells[1]?.textContent?.replace(/\u00a0/g, ' ')?.trim() || '',
                        start: cells[2]?.textContent?.trim() || '',
                        end: cells[3]?.textContent?.trim() || '',
                        detail: cells[4]?.querySelector('[title]')?.getAttribute('title')?.replace(/<[^>]+>/g, '')?.trim() || ''
                    });
                });
            }

            if (headerText.includes('Date') && headerText.includes('Periods')) {
                table.querySelectorAll('tr').forEach((row, idx) => {
                    if (idx === 0) return;
                    const cells = row.querySelectorAll('td');
                    if (cells.length < 3) return;
                    const periods = Array.from(cells[2].querySelectorAll('span')).map((span) => {
                        const title = span.getAttribute('title')?.trim() || '';
                        const parts = title.split(':').map((part) => part.trim());
                        const background = span.style.backgroundColor.replace(/\s/g, '').toLowerCase();
                        let status = 'unmarked';
                        if (background.includes('32,224,32') || background === '#20e020') status = 'present';
                        else if (background.includes('240,64,64') || background === '#f04040') status = 'absent';
                        else if (background.includes('64,128,240') || background === '#4080f0') status = 'approved';
                        else if (background.includes('240,160,32') || background === '#f0a020') status = 'sick';
                        return { label: parts[0] || '', classCode: parts[1] || '', reason: parts.slice(2).join(': '), status };
                    });
                    attendance.recentPeriods.push({
                        day: cells[0]?.textContent?.trim() || '',
                        date: cells[1]?.textContent?.trim() || '',
                        periods
                    });
                });
            }
            if (headerText.includes('Year') && headerText.includes('School') && headerText.includes('Days')) {
                table.querySelectorAll('tr').forEach((row, idx) => {
                    if (idx === 0) return;
                    const cells = row.querySelectorAll('td');
                    const year = cells[0]?.textContent?.trim() || '';
                    if (cells.length >= 6 && /^20\d{2}$/.test(year)) {
                        attendance.yearly.push({
                            year,
                            schoolDays: parseInt(cells[1]?.textContent?.trim() || '0', 10) || 0,
                            wholeDayAbsences: parseInt(cells[2]?.textContent?.trim() || '0', 10) || 0,
                            wholeDayPercentage: parsePercent(cells[3]?.textContent?.trim()),
                            partialAbsences: parseFloat(cells[4]?.textContent?.trim() || '0') || 0,
                            totalPercentage: parsePercent(cells[5]?.textContent?.trim())
                        });
                    }
                });
            }

            if (headerText.includes('Class') && headerText.includes('RollsMarked')) {
                table.querySelectorAll('tr').forEach((row, idx) => {
                    if (idx === 0) return;
                    const cells = row.querySelectorAll('td');
                    const classCode = cells[0]?.textContent?.trim() || '';
                    if (cells.length >= 5 && classCode.length > 1) {
                        attendance.subjects.push({
                            classCode,
                            rollsMarked: parseInt(cells[1]?.textContent?.trim() || '0', 10) || 0,
                            absent: parseInt(cells[2]?.textContent?.trim() || '0', 10) || 0,
                            percentage: cells[4]?.textContent?.includes('-') ? null : parsePercent(cells[4]?.textContent?.trim())
                        });
                    }
                });
            }
        });

        const totalsMatch = doc.body?.textContent?.match(/Totals\s*:\s*Whole Day\s*=\s*(\d+)\s*-\s*Late Arrivals\s*=\s*(\d+)\s*-\s*Leave\s*=\s*(\d+)\s*-\s*Variation of Routine\s*=\s*(\d+)/i);
        if (totalsMatch) {
            attendance.totals = {
                wholeDay: Number(totalsMatch[1]),
                lateArrivals: Number(totalsMatch[2]),
                leave: Number(totalsMatch[3]),
                variationOfRoutine: Number(totalsMatch[4])
            };
        }

        return attendance;
    }

    function scrapeReports(doc) {
        const reports = [];
        doc.querySelectorAll('a[href*="viewreport"]').forEach((link) => {
            const text = link.textContent?.trim() || '';
            if (!text.includes('Report')) return;
            const href = link.href || '';
            const yearLevelMatch = text.match(/Year\s*(\d+)/i);
            const semesterMatch = text.match(/Semester\s*(\d)/i);
            const calendarYearMatch = text.match(/\b(20\d{2})\b/);
            const urlYearMatch = href.match(/year=(\d{4})/);
            const urlSemesterMatch = href.match(/s=(\d)/);
            reports.push({
                title: text,
                url: href,
                yearLevel: yearLevelMatch ? `Year ${yearLevelMatch[1]}` : '',
                semester: parseInt(semesterMatch?.[1] || urlSemesterMatch?.[1] || '0', 10) || 0,
                calendarYear: parseInt(calendarYearMatch?.[1] || urlYearMatch?.[1] || '0', 10) || 0
            });
        });
        return reports.sort((a, b) => b.calendarYear - a.calendarYear || b.semester - a.semester);
    }

    const CLASS_HEADER_LABELS = new Set([
        'course', 'courses', 'subject', 'subjects', 'class', 'classes', 'teacher', 'teachers',
        'room', 'rooms', 'total', 'totals', 'lessons', 'merits', 'quick merits', 'rolls',
        'rolls marked', 'rollsmarked', 'absences', 'absent'
    ]);

    /**
     * Rows named `100`, `101`, `102` are bleed from unrelated tables on the classes page.
     * Real course names always contain letters, so numeric-only rows and repeated header
     * or total labels are rejected here rather than being stored as classes.
     */
    function isRealClassRow(course) {
        const value = String(course || '').trim();
        if (value.length < 2) return false;
        if (!/[a-z]/i.test(value)) return false;
        const normalized = value.toLowerCase().replace(/\s+/g, ' ');
        if (CLASS_HEADER_LABELS.has(normalized)) return false;
        if (normalized.startsWith('total:')) return false;
        return true;
    }

    function classCountValue(cells, idx) {
        if (idx < 0) return 0;
        const parsed = parseInt((cells[idx]?.textContent || '').replace(/[^\d-]/g, ''), 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    }

    function scrapeClasses(doc) {
        const classes = [];
        const seen = new Set();

        doc.querySelectorAll('table').forEach((table) => {
            // querySelectorAll reaches into nested tables; only this table's own rows are
            // safe to read, otherwise an outer layout table mixes in foreign rows.
            const rows = Array.from(table.querySelectorAll('tr'))
                .filter((row) => (row.closest ? row.closest('table') === table : true));
            if (rows.length < 2) return;

            const headerRow = rows[0];
            const headerCells = Array.from(headerRow.querySelectorAll('th, td'));
            const headerText = headerRow.textContent?.toLowerCase() || '';
            if (!((headerText.includes('course') || headerText.includes('subject')) && (headerText.includes('class') || headerText.includes('teacher')))) return;

            let courseIdx = -1;
            let classIdx = -1;
            let teacherIdx = -1;
            let roomIdx = -1;
            let lessonsIdx = -1;
            let meritsIdx = -1;
            let rollsIdx = -1;
            let absencesIdx = -1;
            headerCells.forEach((cell, idx) => {
                const text = cell.textContent?.toLowerCase() || '';
                if (courseIdx < 0 && (text.includes('course') || text.includes('subject'))) courseIdx = idx;
                else if (classIdx < 0 && text.includes('class') && !text.includes('classes')) classIdx = idx;
                else if (teacherIdx < 0 && text.includes('teacher')) teacherIdx = idx;
                else if (roomIdx < 0 && (text.includes('room') || text.includes('location'))) roomIdx = idx;
                else if (lessonsIdx < 0 && text.includes('lesson')) lessonsIdx = idx;
                else if (meritsIdx < 0 && text.includes('merit')) meritsIdx = idx;
                else if (rollsIdx < 0 && text.includes('roll')) rollsIdx = idx;
                else if (absencesIdx < 0 && (text.includes('absence') || text.includes('absent'))) absencesIdx = idx;
            });
            if (courseIdx < 0) return;

            for (let i = 1; i < rows.length; i += 1) {
                const cells = Array.from(rows[i].querySelectorAll('td'))
                    .filter((cell) => (cell.closest ? cell.closest('tr') === rows[i] : true));
                // A row that never reaches the course column is a spacer or a spanning total.
                if (cells.length <= courseIdx) continue;

                const course = cells[courseIdx]?.textContent?.trim() || '';
                if (!isRealClassRow(course)) continue;

                const classCode = classIdx >= 0 ? (cells[classIdx]?.textContent?.trim() || course) : course;
                const key = `${classCode.toLowerCase()}::${course.toLowerCase()}`;
                if (seen.has(key)) continue;
                seen.add(key);

                classes.push({
                    course,
                    classCode,
                    teacher: teacherIdx >= 0 ? (cells[teacherIdx]?.textContent?.trim() || '') : '',
                    room: roomIdx >= 0 ? (cells[roomIdx]?.textContent?.trim() || '') : '',
                    lessons: classCountValue(cells, lessonsIdx),
                    quickMerits: classCountValue(cells, meritsIdx),
                    rollsMarked: classCountValue(cells, rollsIdx),
                    absences: classCountValue(cells, absencesIdx)
                });
            }
        });
        return classes;
    }

    function calendarMonthValue(year, monthIndex) {
        return BASE_CALENDAR_MONTH_VALUE + ((year - 2025) * 12) + (monthIndex - 11);
    }

    function formatDateParts(year, monthIndex, day) {
        return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    function parseCalendarDay(cell, year) {
        const dayLabel = Array.from(cell.children || []).find((child) => child.tagName === 'I');
        const label = dayLabel?.textContent?.trim() || '';
        const match = label.match(/(\d{1,2})\s+([A-Za-z]{3})/);
        if (!match) return { label: '', iso: '' };
        const monthIndex = MONTH_LABELS.indexOf(match[2].toUpperCase());
        if (monthIndex < 0) return { label: match[0], iso: '' };
        return {
            label: match[0],
            iso: Number.isFinite(year) ? formatDateParts(year, monthIndex, parseInt(match[1], 10)) : ''
        };
    }

    function addCalendarEvent(events, seen, event) {
        const key = `${event.title || ''}::${event.date || ''}::${event.type || ''}`;
        if (seen.has(key)) return;
        seen.add(key);
        events.push(event);
    }

    function scrapeCalendarPage(doc, year) {
        const events = [];
        const seen = new Set();

        doc.querySelectorAll('a.eventitem, a[data]').forEach((link) => {
            const title = link.textContent?.trim() || '';
            const data = link.getAttribute('data') || '';
            if (!title || title.includes('--')) return;
            const day = parseCalendarDay(link.closest('td') || doc.createElement('td'), year);
            if (!day.label) return;
            addCalendarEvent(events, seen, {
                title,
                data,
                date: day.iso || day.label || '',
                allDay: !!day.iso,
                automatic: true
            });
        });

        doc.querySelectorAll('td').forEach((cell) => {
            const text = cell.textContent?.trim() || '';
            if (!text.includes('Holidays') && !text.includes('Event')) return;
            const day = parseCalendarDay(cell, year);
            if (!day.label) return;

            const links = cell.querySelectorAll('a.holiday, a.eventitem, a[data]');
            links.forEach((link) => {
                const title = link.getAttribute('alt')?.trim() || link.textContent?.trim() || '';
                if (!title || title.includes('--')) return;
                addCalendarEvent(events, seen, {
                    date: day.iso || day.label || '',
                    title,
                    type: link.classList.contains('holiday') ? 'holiday' : 'event',
                    allDay: true,
                    automatic: true
                });
            });

            if (links.length === 0) {
                const eventMatch = text.match(/--\s*(.+?)\s*--/);
                if (eventMatch) {
                    addCalendarEvent(events, seen, {
                        date: day.iso || day.label || '',
                        title: eventMatch[1],
                        type: /holiday/i.test(eventMatch[1]) ? 'holiday' : 'event',
                        allDay: true,
                        automatic: true
                    });
                }
            }
        });

        return events;
    }

    function clampInteger(value, min, max, fallback) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.min(max, Math.max(min, Math.trunc(parsed)));
    }

    function normalizeUltraRun(source, fallbackDate) {
        const raw = source && source.ultraRun;
        if (!raw || typeof raw !== 'object') return null;

        const fallbackYear = (fallbackDate instanceof Date && !Number.isNaN(fallbackDate.getTime()))
            ? fallbackDate.getFullYear()
            : new Date().getFullYear();
        const endYear = clampInteger(raw.endYear, 2000, fallbackYear, fallbackYear);
        const startYear = clampInteger(raw.startYear, endYear - 5, endYear, endYear - 5);

        return { startYear, endYear };
    }

    function buildNoticeOffsets(options) {
        const source = options || {};
        const lookbehindDays = clampInteger(
            source.noticeLookbehindDays ?? source.noticeLookBehindDays,
            0,
            60,
            DEFAULT_NOTICE_LOOKBEHIND_DAYS
        );
        const lookaheadDays = clampInteger(
            source.noticeLookaheadDays ?? source.noticeLookAheadDays,
            0,
            60,
            DEFAULT_NOTICE_LOOKAHEAD_DAYS
        );

        const offsets = [];
        for (let i = -lookbehindDays; i <= lookaheadDays; i += 1) {
            if (i !== 0) offsets.push(i);
        }
        return offsets;
    }

    function buildPortalPages(uid, now, options, accountPageUrl) {
        const baseUrl = 'https://millennium.education/portal';
        const source = options || {};
        const pages = [
            { name: 'Account', url: accountPageUrl || `${baseUrl}/modify.asp`, type: 'account' }
        ];

        if (source.includeTimetable !== false) {
            pages.push({ name: 'Timetable', url: appendPortalDate(`${baseUrl}/timetable.asp?uid=${uid}`, source.portalDate), type: 'timetable' });
        }
        if (source.includeNotices !== false) {
            pages.push({ name: 'Notices', url: appendPortalDate(`${baseUrl}/notices.asp`, source.portalDate), type: 'notices' });
        }
        if (source.includeGrades !== false) {
            pages.push({ name: 'Grades', url: `${baseUrl}/activities.asp?uid=${uid}`, type: 'grades' });
        }
        if (source.includeAttendance !== false) {
            pages.push({ name: 'Attendance', url: `${baseUrl}/attendance.asp?uid=${uid}`, type: 'attendance' });
        }
        if (source.includeReports !== false) {
            pages.push({ name: 'Reports', url: `${baseUrl}/reports.asp?uid=${uid}`, type: 'reports' });
        }
        if (source.includeClasses !== false) {
            pages.push({ name: 'Classes', url: `${baseUrl}/classes.asp?uid=${uid}`, type: 'classes' });
        }

        const focusDate = parsePortalDate(source.portalDate, now ? new Date(now) : new Date());
        const ultraRun = normalizeUltraRun(source, focusDate);
        if (source.includeCalendar !== false) {
            if (ultraRun) {
                for (let year = ultraRun.startYear; year <= ultraRun.endYear; year += 1) {
                    for (let month = 0; month < 12; month += 1) {
                        pages.push({
                            name: `Calendar (${MONTH_LABELS[month]} ${year})`,
                            url: `${baseUrl}/calendar.asp?uid=${uid}&month=${calendarMonthValue(year, month)}`,
                            type: 'calendar',
                            year
                        });
                    }
                }
            } else {
                const hasCalendarWindow = source.calendarMonthsPast !== undefined || source.calendarMonthsFuture !== undefined || source.portalDate;
                if (hasCalendarWindow) {
                const monthsPast = clampInteger(source.calendarMonthsPast, 0, 24, focusDate.getMonth());
                const monthsFuture = clampInteger(source.calendarMonthsFuture, 0, 24, 11 - focusDate.getMonth());
                for (let offset = -monthsPast; offset <= monthsFuture; offset += 1) {
                    const calendarDate = new Date(focusDate.getFullYear(), focusDate.getMonth() + offset, 1);
                    const year = calendarDate.getFullYear();
                    const month = calendarDate.getMonth();
                    pages.push({
                        name: `Calendar (${MONTH_LABELS[month]} ${year})`,
                        url: `${baseUrl}/calendar.asp?uid=${uid}&month=${calendarMonthValue(year, month)}`,
                        type: 'calendar',
                        year
                    });
                }
                } else {
                const currentYear = (now ? new Date(now) : new Date()).getFullYear();
                for (let month = 0; month < 12; month += 1) {
                    pages.push({
                        name: `Calendar (${MONTH_LABELS[month]} ${currentYear})`,
                        url: `${baseUrl}/calendar.asp?uid=${uid}&month=${calendarMonthValue(currentYear, month)}`,
                        type: 'calendar',
                        year: currentYear
                    });
                }
                }
            }
        }

        if (source.includeNotices !== false) {
            if (ultraRun) {
                const startDate = new Date(ultraRun.startYear, 0, 1);
                const endDate = new Date(ultraRun.endYear, 11, 31);
                for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
                    const dateStr = encodeURIComponent(`${date.getDate()} ${MONTH_LABELS[date.getMonth()]} ${date.getFullYear()}`);
                    pages.push({ name: `Notices (${date.getDate()} ${MONTH_LABELS[date.getMonth()]} ${date.getFullYear()})`, url: `${baseUrl}/notices.asp?date=${dateStr}`, type: 'notices' });
                }
            } else {
                const today = focusDate;
                buildNoticeOffsets(options).forEach((i) => {
                    const date = new Date(today);
                    date.setDate(date.getDate() + i);
                const dateStr = encodeURIComponent(`${date.getDate()} ${MONTH_LABELS[date.getMonth()]} ${date.getFullYear()}`);
                pages.push({ name: `Notices (${i > 0 ? '+' : ''}${i}d)`, url: `${baseUrl}/notices.asp?date=${dateStr}`, type: 'notices' });
                });
            }
        }

        return pages;
    }

    function applySyncFilters(allData, options, now) {
        const source = options || {};
        const focusDate = parsePortalDate(source.portalDate, now ? new Date(now) : new Date());
        const ultraRun = normalizeUltraRun(source, focusDate);
        const focusYear = focusDate.getFullYear();
        const reportYears = clampInteger(source.reportsYearLookback, 1, 12, 12);
        const attendanceYears = clampInteger(source.attendanceYearLookback, 1, 12, 12);
        const gradeLimit = clampInteger(source.gradeItemLimit, 0, 250, 0);

        if (Array.isArray(allData.reports) && source.reportsYearLookback !== undefined) {
            const minReportYear = ultraRun ? ultraRun.startYear : focusYear - reportYears + 1;
            allData.reports = allData.reports.filter((report) => !report.calendarYear || report.calendarYear >= minReportYear);
        }

        if (allData.attendance && Array.isArray(allData.attendance.yearly) && source.attendanceYearLookback !== undefined) {
            const minAttendanceYear = ultraRun ? ultraRun.startYear : focusYear - attendanceYears + 1;
            allData.attendance.yearly = allData.attendance.yearly.filter((entry) => {
                const year = parseInt(entry.year || '0', 10);
                return !year || year >= minAttendanceYear;
            });
        }

        if (gradeLimit > 0 && Array.isArray(allData.grades)) {
            allData.grades = allData.grades.slice(0, gradeLimit);
        }
    }

    async function limitedMap(items, limit, mapper) {
        const results = new Array(items.length);
        let nextIndex = 0;
        const workerCount = Math.max(1, Math.min(limit || 1, items.length));

        async function worker() {
            while (nextIndex < items.length) {
                const currentIndex = nextIndex;
                nextIndex += 1;
                results[currentIndex] = await mapper(items[currentIndex], currentIndex);
            }
        }

        await Promise.all(Array.from({ length: workerCount }, worker));
        return results;
    }

    function wait(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function isRetryablePageError(error) {
        const message = String(error?.message || error || '').toLowerCase();
        return message.includes('abort')
            || message.includes('timeout')
            || message.includes('failed to fetch')
            || message.includes('network')
            || message.includes('http 429')
            || message.includes('http 500')
            || message.includes('http 502')
            || message.includes('http 503')
            || message.includes('http 504');
    }

    async function fetchPageWithRetries(fetchPage, parseHtml, page, options) {
        const retries = clampInteger(options?.pageRetries, 0, 4, 1);
        let lastError = null;

        for (let attempt = 0; attempt <= retries; attempt += 1) {
            try {
                return parseHtml(await fetchPage(page.url));
            } catch (error) {
                lastError = error;
                if (attempt >= retries || !isRetryablePageError(error)) break;
                await wait(Math.min(3000, 400 * Math.pow(2, attempt)));
            }
        }

        throw lastError || new Error(`Failed to fetch ${page.name}`);
    }

    function getNoticeIndex(target) {
        if (!Object.prototype.hasOwnProperty.call(target, '__millenniumNoticeIndex')) {
            Object.defineProperty(target, '__millenniumNoticeIndex', {
                enumerable: false,
                configurable: false,
                value: new Map(target.map((entry) => [
                    `${entry.title}::${entry.content || entry.preview}`,
                    entry
                ]))
            });
        }
        return target.__millenniumNoticeIndex;
    }

    function mergeNotice(target, notice) {
        const key = `${notice.title}::${notice.content || notice.preview}`;
        const index = getNoticeIndex(target);
        const existing = index.get(key);
        if (existing) {
            const dates = new Set([...(existing.dates || []), ...(existing.date ? [existing.date] : [])]);
            dates.add(notice.date);
            existing.dates = Array.from(dates).filter(Boolean).sort();
            existing.date = existing.dates[existing.dates.length - 1];
            return;
        }
        target.push(notice);
        index.set(key, notice);
    }

    function applyPageResult(allData, result) {
        if (!result || !result.ok) return;
        const page = result.page;
        const doc = result.doc;

        if (page.type === 'account') allData.account = scrapeAccount(doc) || allData.account;
        if (page.type === 'timetable') allData.timetable = scrapeTimetable(doc);
        if (page.type === 'grades') allData.grades = scrapeGrades(doc);
        if (page.type === 'attendance') {
            const attendance = scrapeAttendance(doc);
            if (attendance.yearly.length || attendance.subjects.length) allData.attendance = attendance;
        }
        if (page.type === 'reports') allData.reports = scrapeReports(doc);
        if (page.type === 'classes') allData.classes = scrapeClasses(doc);
        if (page.type === 'calendar') {
            scrapeCalendarPage(doc, page.year).forEach((event) => {
                if (!allData.calendar.some((existing) => existing.title === event.title && existing.date === event.date)) {
                    allData.calendar.push(event);
                }
            });
        }
        if (page.type === 'notices') {
            const dateParam = new URL(page.url).searchParams.get('date');
            const noticeDate = dateParam ? parseNoticeDateParam(dateParam) : new Date();
            scrapeNotices(doc, noticeDate).forEach((notice) => mergeNotice(allData.notices, notice));
        }
    }

    async function scrapePortalSnapshot(options) {
        const startedAt = Date.now();
        const fetchPage = options.fetchPage;
        const parseHtml = options.parseHtml;
        const progress = typeof options.progress === 'function' ? options.progress : function () {};
        const concurrency = Math.max(1, Math.min(Number(options.concurrency) || 16, 24));
        const reliableNow = options.now || fetchPage.lastServerDate || new Date().toISOString();
        const homeUrl = appendPortalDate('https://millennium.education/portal/', options.portalDate);
        // Login transports already receive the portal landing page. Reusing it
        // avoids another request on the latency-sensitive login path.
        const homeDoc = parseHtml(options.homeHtml || await fetchPage(homeUrl));
        const user = extractUserInfo(homeDoc);
        if (!user.uid) throw new Error('Portal session unavailable or UID not found');
        const accountPageUrl = findAccountPageUrl(homeDoc);

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

        const pages = buildPortalPages(user.uid, reliableNow, options, accountPageUrl);
        let completed = 0;
        const failures = [];
        const sectionStats = { home: { requested: 1, succeeded: 1, failed: 0 } };
        pages.forEach((page) => {
            sectionStats[page.type] = sectionStats[page.type] || { requested: 0, succeeded: 0, failed: 0 };
            sectionStats[page.type].requested += 1;
        });
        await limitedMap(pages, concurrency, async (page, index) => {
            try {
                const doc = await fetchPageWithRetries(fetchPage, parseHtml, page, options);
                applyPageResult(allData, { ok: true, page, doc, index });
                sectionStats[page.type].succeeded += 1;
                completed += 1;
                progress({ current: completed, total: pages.length, page: page.name, index });
                return { ok: true, index };
            } catch (error) {
                completed += 1;
                sectionStats[page.type].failed += 1;
                const message = String(error?.message || error || 'Portal page failed')
                    .replace(/https?:\/\/\S+/gi, '[portal page]')
                    .slice(0, 240);
                failures.push({
                    page: page.name,
                    section: page.type,
                    code: isRetryablePageError(error) ? 'PAGE_TRANSIENT_FAILURE' : 'PAGE_FAILURE',
                    message
                });
                progress({ current: completed, total: pages.length, page: page.name, index, error: error.message });
                return { ok: false, index };
            }
        });

        applySyncFilters(allData, options, reliableNow);
        allData.syncMeta = {
            complete: failures.length === 0,
            degraded: failures.length > 0,
            pageCount: pages.length + 1,
            succeededPages: pages.length + 1 - failures.length,
            failedPages: failures,
            sections: sectionStats,
            durationMs: Date.now() - startedAt
        };

        return allData;
    }

    global.MillenniumPortalScraper = {
        extractUserId,
        extractUserInfo,
        findAccountPageUrl,
        scrapeAccount,
        buildPortalPages,
        scrapePortalSnapshot,
        scrapeTimetable,
        scrapeNotices,
        scrapeGrades,
        scrapeAttendance,
        scrapeReports,
        scrapeClasses,
        scrapeCalendarPage,
        _private: {
            limitedMap,
            clampInteger,
            buildNoticeOffsets,
            normalizeUltraRun,
            appendPortalDate,
            applySyncFilters,
            calendarMonthValue,
            getNoticeIndex,
            mergeNotice,
            applyPageResult,
            parseNoticeDateParam,
            parsePortalDate,
            formatPortalLegacyDate
        }
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
