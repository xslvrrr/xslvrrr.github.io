// Google Classroom content script for Millennium Portal Sync (Firefox)
// Complete rewrite with multi-page navigation and incremental sync support

(function () {
    'use strict';

    if (!window.location.hostname.includes('classroom.google.com')) {
        return;
    }

    // ============================================
    // CONFIGURATION
    // ============================================

    const urlPath = window.location.pathname;
    const userMatch = urlPath.match(/\/u\/(\d+)/);
    const userNumber = userMatch ? userMatch[1] : '0';
    const baseUrl = `https://classroom.google.com/u/${userNumber}/`;

    // Use browser API for Firefox (falls back to chrome for compatibility)
    const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

    console.log('[Millennium Sync] Version: FIX_PAGINATION_V4_FIREFOX'); // Updated version log
    console.log('[Millennium Sync] Classroom content script loaded on:', window.location.href);

    // Sync state
    let syncInProgress = false;
    let syncAborted = false;
    let lastSyncTime = null;

    // ============================================
    // UTILITIES
    // ============================================

    const wait = ms => new Promise(r => setTimeout(r, ms));

    function generateContentHash(item) {
        // Create a hash from item content for edit detection
        const content = `${item.title}|${item.description || ''}|${item.dueDate || ''}|${item.maxPoints || ''}`;
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(16);
    }

    function parseRelativeTime(text) {
        // Parse "Posted X ago" or "Due X" text to approximate timestamp
        if (!text) return null;

        const now = new Date();
        const lower = text.toLowerCase().trim();

        // Handle "X minutes/hours/days ago"
        const agoMatch = lower.match(/(\d+)\s*(minute|hour|day|week|month)s?\s*ago/i);
        if (agoMatch) {
            const value = parseInt(agoMatch[1]);
            const unit = agoMatch[2].toLowerCase();
            const date = new Date(now);

            switch (unit) {
                case 'minute': date.setMinutes(date.getMinutes() - value); break;
                case 'hour': date.setHours(date.getHours() - value); break;
                case 'day': date.setDate(date.getDate() - value); break;
                case 'week': date.setDate(date.getDate() - (value * 7)); break;
                case 'month': date.setMonth(date.getMonth() - value); break;
            }
            return date.toISOString();
        }

        // Handle "yesterday"
        if (lower.includes('yesterday')) {
            const date = new Date(now);
            date.setDate(date.getDate() - 1);
            return date.toISOString();
        }

        // Handle specific date patterns (Jan 15, 2024)
        const dateMatch = lower.match(/(\w{3})\s+(\d{1,2})(?:,?\s*(\d{4}))?/i);
        if (dateMatch) {
            const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
            const month = months[dateMatch[1].toLowerCase()];
            if (month !== undefined) {
                const day = parseInt(dateMatch[2]);
                const year = dateMatch[3] ? parseInt(dateMatch[3]) : now.getFullYear();
                return new Date(year, month, day).toISOString();
            }
        }

        return null;
    }

    function parseDueDate(text) {
        if (!text) return null;

        const now = new Date();
        const clean = text.toLowerCase().trim();

        if (clean.includes('no due')) return null;

        if (clean.includes('tomorrow')) {
            const d = new Date(now);
            d.setDate(d.getDate() + 1);
            d.setHours(23, 59, 59);
            return d.toISOString();
        }

        if (clean.includes('today')) {
            const d = new Date(now);
            d.setHours(23, 59, 59);
            return d.toISOString();
        }

        // Handle "Due in X hours/days"
        const inMatch = clean.match(/(?:due\s+)?in\s+(\d+)\s*(hour|day|week)s?/i);
        if (inMatch) {
            const value = parseInt(inMatch[1]);
            const unit = inMatch[2].toLowerCase();
            const d = new Date(now);
            switch (unit) {
                case 'hour': d.setHours(d.getHours() + value); break;
                case 'day': d.setDate(d.getDate() + value); break;
                case 'week': d.setDate(d.getDate() + (value * 7)); break;
            }
            return d.toISOString();
        }

        const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
        const match = text.match(/(\w{3})\s+(\d{1,2})(?:,?\s*(\d{4}))?(?:,?\s*(\d{1,2}):(\d{2})\s*(AM|PM)?)?/i);

        if (match) {
            const [, m, d, y, h, min, ampm] = match;
            const monthNum = months[m.toLowerCase()];

            if (monthNum !== undefined) {
                const year = y ? parseInt(y) : now.getFullYear();
                const date = new Date(year, monthNum, parseInt(d));

                if (!y && date < now) date.setFullYear(date.getFullYear() + 1);

                if (h && min) {
                    let hours = parseInt(h);
                    if (ampm?.toUpperCase() === 'PM' && hours !== 12) hours += 12;
                    if (ampm?.toUpperCase() === 'AM' && hours === 12) hours = 0;
                    date.setHours(hours, parseInt(min), 0);
                } else {
                    date.setHours(23, 59, 59);
                }

                return date.toISOString();
            }
        }

        return null;
    }

    function sanitizeHtml(html) {
        if (!html) return '';
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const dangerousTags = ['script', 'style', 'iframe', 'object', 'embed', 'base', 'meta', 'link', 'applet'];
            dangerousTags.forEach(tag => {
                doc.querySelectorAll(tag).forEach(el => el.remove());
            });
            const all = doc.querySelectorAll('*');
            all.forEach(el => {
                const attrs = el.attributes;
                for (let i = attrs.length - 1; i >= 0; i--) {
                    const attr = attrs[i].name;
                    if (attr.startsWith('on') || attr === 'style') {
                        el.removeAttribute(attr);
                    }
                }
            });
            return doc.body.innerHTML;
        } catch (e) {
            console.error('[Millennium Sync] Sanitization error:', e);
            return '';
        }
    }

    // ============================================
    // COURSE SCRAPING - Improved reliability
    // ============================================

    async function scrapeCourses() {
        console.log('[Millennium Sync] Scraping courses...');
        await wait(1500);

        const courses = [];
        const seenIds = new Set();

        // Method 1: Find course cards directly by their container class
        // The R4EiSb class is the main course card container
        const courseCards = document.querySelectorAll('.R4EiSb, [class*="gHz6xd"], [role="listitem"]');

        console.log('[Millennium Sync] Found', courseCards.length, 'potential course cards');

        for (const card of courseCards) {
            // Find the course link within this card
            const link = card.querySelector('a[href*="/c/"]');
            if (!link) continue;

            const href = link.href || '';
            const match = href.match(/\/c\/([A-Za-z0-9_-]+)/);
            if (!match) continue;

            const courseId = match[1];
            if (seenIds.has(courseId)) continue;

            // Extract course info from the card
            const courseInfo = extractCourseInfo(card, link);

            if (!courseInfo.name || courseInfo.name.length < 2) continue;

            seenIds.add(courseId);
            courses.push({
                id: courseId,
                name: courseInfo.name,
                section: courseInfo.section || '',
                teacher: courseInfo.teacher || '',
                link: `${baseUrl}c/${courseId}`,
                classworkLink: `${baseUrl}w/${courseId}/t/all`,
                streamLink: `${baseUrl}c/${courseId}/`,
            });

            console.log('[Millennium Sync] Found course:', courseInfo.name, '| Teacher:', courseInfo.teacher);
        }

        // Fallback: If no cards found, try the old method
        if (courses.length === 0) {
            console.log('[Millennium Sync] No cards found, trying link-based method...');
            const courseLinks = document.querySelectorAll('a[href*="/c/"]');

            for (const link of courseLinks) {
                const href = link.href || '';
                const match = href.match(/\/c\/([A-Za-z0-9_-]+)\/?(?:\?|$|#)/);
                if (!match) continue;

                const courseId = match[1];
                if (seenIds.has(courseId)) continue;

                // Walk up to find the card container
                let card = link.closest('.R4EiSb') || link.closest('[role="listitem"]');
                if (!card) {
                    // Manual traversal
                    card = link;
                    for (let i = 0; i < 10 && card; i++) {
                        if (card.classList?.contains('R4EiSb') || card.querySelector('.jJIbcc, .gmNu1d')) {
                            break;
                        }
                        card = card.parentElement;
                    }
                }

                if (!card) continue;

                const courseInfo = extractCourseInfo(card, link);
                if (!courseInfo.name || courseInfo.name.length < 2) continue;

                seenIds.add(courseId);
                courses.push({
                    id: courseId,
                    name: courseInfo.name,
                    section: courseInfo.section || '',
                    teacher: courseInfo.teacher || '',
                    link: `${baseUrl}c/${courseId}`,
                    classworkLink: `${baseUrl}w/${courseId}/t/all`,
                    streamLink: `${baseUrl}c/${courseId}/`,
                });
            }
        }

        console.log('[Millennium Sync] Total courses found:', courses.length);
        return courses;
    }

    function extractCourseInfo(card, link) {
        let name = '';
        let section = '';
        let teacher = '';

        // Google Classroom HTML structure (as of 2024):
        // <div class="R4EiSb"> (card container)
        //   <h2 class="prWPdf">
        //     <a ...>
        //       <div class="ScpeUc Vu2fZd XwD7Ke">Course Name</div>
        //       <div class="FWGURc Vu2fZd Svw0vd">Section (optional)</div>
        //     </a>
        //   </h2>
        //   <div class="gmNu1d">
        //     <div class="z07MGc Vu2fZd jJIbcc T30lh">Teacher Name</div>
        //   </div>
        // </div>

        // Debug: Log card structure
        console.log('[Millennium Sync] Parsing card:', card.className, card.innerHTML?.substring(0, 200));

        // COURSE NAME: Use specific Google Classroom selectors
        // Try multiple selectors in order of specificity
        const nameSelectors = ['.ScpeUc', '.XwD7Ke', 'h2 a div:first-child', 'h2 div:first-child'];
        for (const selector of nameSelectors) {
            const el = card.querySelector(selector);
            if (el && el.textContent?.trim()) {
                name = el.textContent.trim();
                break;
            }
        }

        // Fallback: Try heading
        if (!name) {
            const heading = card.querySelector('h2, [role="heading"]');
            if (heading) {
                const firstDiv = heading.querySelector('div');
                name = firstDiv?.textContent?.trim() || heading.textContent?.trim() || '';
            }
        }

        // Fallback: aria-label
        if (!name) {
            const ariaLabel = link.getAttribute('aria-label');
            if (ariaLabel && ariaLabel.length > 2 && ariaLabel.length < 200) {
                name = ariaLabel.split(/\s*[-–]\s*/)[0].trim();
            }
        }

        // Clean up name
        name = name.replace(/\s+/g, ' ').trim();
        if (name.length > 150) name = name.substring(0, 150);

        // TEACHER: Use specific Google Classroom selectors
        // The teacher name is in the gmNu1d container, inside div.jJIbcc
        const teacherSelectors = ['.jJIbcc', '.T30lh', '.gmNu1d > div:first-child', '.gmNu1d div'];
        for (const selector of teacherSelectors) {
            const el = card.querySelector(selector);
            if (el) {
                const text = el.textContent?.trim();
                // Make sure it's not empty and not the same as the course name
                if (text && text.length > 0 && text !== name && !text.includes(name)) {
                    teacher = text;
                    console.log('[Millennium Sync] Found teacher with selector', selector, ':', teacher);
                    break;
                }
            }
        }

        // SECTION: Look in the secondary line
        const sectionSelectors = ['.FWGURc', '.Svw0vd', 'h2 a div:nth-child(2)'];
        for (const selector of sectionSelectors) {
            const el = card.querySelector(selector);
            if (el) {
                const text = el.textContent?.trim();
                if (text && text.length > 0 && text !== name) {
                    section = text;
                    break;
                }
            }
        }

        // Fallback section detection from name
        if (!section) {
            const sectionPatterns = [
                /Line\s+([A-Z])\b/i,
                /Period\s*(\d+)/i,
                /Block\s*([A-Z]|\d+)/i,
                /Section\s*(\d+|[A-Z])/i,
            ];

            for (const pattern of sectionPatterns) {
                const match = name.match(pattern);
                if (match) {
                    section = match[0].trim();
                    break;
                }
            }
        }

        console.log('[Millennium Sync] Extracted:', { name, section, teacher });

        return { name, section, teacher };
    }

    // ============================================
    // ITEM SCRAPING - From course pages
    // ============================================

    async function scrapeItemsFromPage(courseId, courseName) {
        console.log(`[Millennium Sync] Scraping items from course: ${courseName}`);
        console.log(`[Millennium Sync] Current URL: ${window.location.href}`);

        const items = [];
        const seenIds = new Set();

        // Wait for page to fully load
        await waitForPageLoad();

        // Click "Load more" button until all assignments are loaded
        await clickLoadMoreUntilDone();

        // Scroll to load all content
        await scrollToLoadAll();

        // Click "Load more" again after scrolling (in case more appeared)
        await clickLoadMoreUntilDone();

        // Wait a bit more for any dynamically loaded content
        await wait(500);

        // Find all item containers directly - MORE ROBUST STRATEGY
        // Instead of finding links first, find the card containers 
        // This handles cases where links are obscure or hidden
        const containerSelectors = [
            '[data-stream-item-id]',
            '[data-coursework-id]',
            'li.tfGBod',
            'div.cODFqb',
            'div.oBkhNd'
        ];

        const containers = document.querySelectorAll(containerSelectors.join(', '));
        console.log(`[Millennium Sync] Found ${containers.length} potential item containers`);

        for (const container of containers) {
            // Find the main link within this container
            // Look for specific item link types
            let link = container.querySelector([
                'a[href*="/a/"]',   // Assignments
                'a[href*="/sa/"]',  // Short answer
                'a[href*="/m/"]',   // Materials
                'a[href*="/p/"]'    // Posts
            ].join(', '));

            // Fallback: any link in the container if we can't find specific ones
            if (!link) {
                const anyLink = container.querySelector('a[href*="classroom.google.com"]');
                if (anyLink) link = anyLink;
            }

            // If still no link, skip this container
            if (!link) continue;

            const href = link.href || '';

            // Extract IDs - item type and ID if possible from URL
            let type = 'announcement';
            let itemId = '';

            // Try to deduce ID from container attributes first (MOST RELIABLE)
            if (container.hasAttribute('data-stream-item-id')) {
                itemId = container.getAttribute('data-stream-item-id');
            } else if (container.hasAttribute('data-coursework-id')) {
                itemId = container.getAttribute('data-coursework-id');
            }

            // Fallback to URL matching
            if (!itemId) {
                const itemMatch = href.match(/\/(a|sa|m|p)\/([A-Za-z0-9_-]+)/);
                if (itemMatch) {
                    const [, typeCode, id] = itemMatch;
                    itemId = id;
                    if (typeCode === 'a' || typeCode === 'sa') type = 'assignment';
                    else if (typeCode === 'm') type = 'material';
                } else {
                    // Try getting ID from query params or strict end of URL
                    const lastPart = href.split('/').pop()?.split('?')[0];
                    if (lastPart && lastPart.match(/^[0-9]+$/)) itemId = lastPart;
                }
            }

            if (!itemId) continue;

            const uniqueKey = `${courseId}-${itemId}`;
            if (seenIds.has(uniqueKey)) continue;

            // Extract item info using our new robust function
            const itemInfo = extractItemInfo(link, container, type);

            if (!itemInfo.title || itemInfo.title.length < 2) continue;

            // Skip navigation items
            if (isNavigationItem(itemInfo.title)) continue;

            const now = new Date().toISOString();

            const item = {
                id: itemId,
                courseId,
                courseName,
                type,
                title: itemInfo.title,
                description: itemInfo.description || '',
                descriptionHtml: itemInfo.descriptionHtml || '',
                dueDate: itemInfo.dueDate,
                dueText: itemInfo.dueText || '',
                maxPoints: itemInfo.maxPoints,
                submissionState: itemInfo.submissionState || 'NEW',
                link: href,
                postedTime: itemInfo.postedTime,
                scrapedAt: now,
            };

            // Generate content hash for edit detection
            item.contentHash = generateContentHash(item);

            seenIds.add(uniqueKey);
            items.push(item);

            console.log(`[Millennium Sync] Found item: ${itemInfo.title} (${type})`);
        }

        console.log(`[Millennium Sync] Scraped ${items.length} items from ${courseName}`);
        return items;
    }

    async function clickLoadMoreUntilDone() {
        // Specifically target the "Load more" button to load all assignments
        // This avoids clicking random expandable elements which caused infinite loops
        const maxAttempts = 50; // Allow many iterations for large classes
        let clickCount = 0;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            // Look specifically for "Load more" button
            const loadMoreButton = findLoadMoreButton();

            if (!loadMoreButton) {
                if (clickCount > 0) {
                    console.log(`[Millennium Sync] "Load more" finished after ${clickCount} clicks`);
                }
                break;
            }

            try {
                // Scroll button into view before clicking
                loadMoreButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await wait(200);

                loadMoreButton.click();
                clickCount++;
                console.log(`[Millennium Sync] Clicked "Load more" (${clickCount})`);

                // Wait for new content to load - may take a moment
                await wait(1000);
            } catch (e) {
                console.log('[Millennium Sync] Error clicking Load more:', e);
                break;
            }
        }

        if (clickCount >= maxAttempts) {
            console.log('[Millennium Sync] Reached max attempts for Load more button');
        }

        return clickCount;
    }

    function findLoadMoreButton() {
        // Safety check: "Load more" buttons are simple. 
        // We should avoid clicking things that are clearly not it.
        const isSafetyBlocked = (text, btn) => {
            const lower = text.toLowerCase();
            if (lower.length > 50) return true; // generic container check
            if (lower.includes('google account') || lower.includes('google apps')) return true;
            if (lower.includes('help') || lower.includes('feedback')) return true;
            if (lower.includes('menu') || lower.includes('settings')) return true;
            return false;
        };

        // Strategy 1: Button with "Load more" text (case-insensitive)
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
            const text = btn.textContent?.trim() || '';
            const lower = text.toLowerCase();

            if (lower === 'load more' || (lower.includes('load more') && !isSafetyBlocked(text, btn))) {
                // Make sure button is visible and clickable
                const rect = btn.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    return btn;
                }
            }
        }

        // Strategy 2: Any clickable element with "Load more" aria-label
        const labeled = document.querySelectorAll('[aria-label*="Load more" i], [aria-label*="load more" i]');
        for (const el of labeled) {
            const text = el.getAttribute('aria-label') || '';
            if (isSafetyBlocked(text, el)) continue;

            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                return el;
            }
        }

        // Strategy 3: Material design button with load more text
        const mdButtons = document.querySelectorAll('.VfPpkd-LgbsSe, [role="button"]');
        for (const btn of mdButtons) {
            const text = btn.textContent?.trim() || '';
            const lower = text.toLowerCase();

            if (lower.includes('load more') && !isSafetyBlocked(text, btn)) {
                const rect = btn.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    return btn;
                }
            }
        }

        return null;
    }

    function findItemContainer(link) {
        // Strategy: Walk up to find the main list item container
        let container = link;
        let attempts = 0;

        while (container && container !== document.body && attempts < 20) {
            attempts++;

            // Check for explicit Stream Item attributes
            if (container.hasAttribute('data-stream-item-id') ||
                container.hasAttribute('data-coursework-id') ||
                container.getAttribute('role') === 'listitem') {
                return container;
            }

            // detailed class checks for the specific li element user provided
            if (container.tagName === 'LI' && container.classList.contains('tfGBod')) {
                return container;
            }

            // Fallback for older layouts
            if (container.classList && (
                container.classList.contains('cODFqb') ||
                container.classList.contains('oBkhNd') ||
                container.classList.contains('asQXV')
            )) {
                return container;
            }

            container = container.parentElement;
        }

        return null; // Return null if no container found, don't return link
    }

    function isNavigationItem(text) {
        if (!text) return true;
        const lower = text.toLowerCase().trim();
        const navItems = [
            'to-do', 'todo', 'stream', 'classwork', 'people', 'grades',
            'home', 'calendar', 'enrolled', 'archived', 'settings',
            'class comments', 'view all', 'see all', 'all topics',
            'add class comment', 'open', 'turn in', 'mark as done'
        ];
        return navItems.some(nav => lower === nav || lower.startsWith(nav + ' '));
    }

    function extractItemInfo(link, container, defaultType) {
        let title = '';
        let description = '';
        let dueDate = null;
        let dueText = '';
        let maxPoints = null;
        let submissionState = 'NEW';
        let postedTime = null;
        let descriptionHtml = '';

        // Try aria-label first
        const ariaLabel = link.getAttribute('aria-label') || '';
        if (ariaLabel && ariaLabel.length > 2 && ariaLabel.length < 300) {
            title = ariaLabel
                .replace(/^(Assignment|Material|Post|Announcement|Question):\s*/i, '')
                .replace(/,?\s*(Due|Posted).*$/i, '')
                .trim();
        }

        // If no aria-label, get text from the link
        if (!title) {
            const clone = link.cloneNode(true);
            clone.querySelectorAll('button, svg, img, [aria-hidden="true"]').forEach(el => el.remove());
            title = clone.textContent?.trim().replace(/\s+/g, ' ') || '';
        }

        // Look for heading in container
        if (!title && container) {
            const heading = container.querySelector('[role="heading"], h1, h2, h3, h4');
            if (heading) {
                title = heading.textContent?.trim() || '';
            }
        }

        // Clean up title
        title = title.replace(/\s+/g, ' ').trim();
        if (title.length > 250) title = title.substring(0, 250);

        // Extract from container
        if (container) {
            const containerText = container.textContent || '';

            // Due date extraction
            const duePatterns = [
                /Due\s+([\w\s,:\d]+?)(?:\s*\n|\s*$|\s*\||\s*·)/i,
                /(Tomorrow|Today)(?:,?\s*[\d:]+\s*(AM|PM)?)?/i,
                /Due\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:,?\s*\d{4})?(?:,?\s*\d{1,2}:\d{2}\s*(?:AM|PM)?)?)/i,
                /Due\s+in\s+(\d+\s*(?:hour|day|week)s?)/i,
            ];

            for (const pattern of duePatterns) {
                const match = containerText.match(pattern);
                if (match) {
                    dueText = match[1] || match[0];
                    dueText = dueText.replace(/^Due\s*/i, '').trim();
                    dueDate = parseDueDate(dueText);
                    if (dueDate) break;
                }
            }

            // Points extraction
            const pointsPatterns = [
                /(\d+)\s*(?:points?|pts)\b/i,
                /(\d+)\/(\d+)\s*(?:points?|pts)/i, // Graded: 8/10 points
            ];

            for (const pattern of pointsPatterns) {
                const match = containerText.match(pattern);
                if (match) {
                    maxPoints = parseInt(match[2] || match[1]);
                    break;
                }
            }

            // Submission state extraction
            const lowerText = containerText.toLowerCase();
            if (lowerText.includes('turned in') || lowerText.includes('done') || lowerText.includes('submitted')) {
                submissionState = 'TURNED_IN';
            } else if (lowerText.includes('returned') || lowerText.includes('graded')) {
                submissionState = 'RETURNED';
            } else if (lowerText.includes('missing')) {
                submissionState = 'MISSING';
            } else if (lowerText.includes('late')) {
                submissionState = 'LATE';
            } else if (lowerText.includes('assigned')) {
                submissionState = 'ASSIGNED';
            }

            // Posted time extraction
            const postedPatterns = [
                /Posted\s+([\w\s,:\d]+?)(?:\s*\n|\s*$|\s*·)/i,
                /(\d+)\s*(minute|hour|day|week|month)s?\s*ago/i,
            ];

            for (const pattern of postedPatterns) {
                const match = containerText.match(pattern);
                if (match) {
                    postedTime = parseRelativeTime(match[0]);
                    if (postedTime) break;
                }
            }

            // Description - look for secondary text
            const descElements = container.querySelectorAll('[class*="description"], [class*="body"], p');
            for (const el of descElements) {
                const text = el.textContent?.trim();
                if (text && text !== title && text.length > 10 && text.length < 500) {
                    description = text;
                    descriptionHtml = sanitizeHtml(el.innerHTML);
                    break;
                }
            }
        }

        return { title, description, descriptionHtml, dueDate, dueText, maxPoints, submissionState, postedTime };
    }

    async function waitForPageLoad() {
        // Wait for the page to be fully loaded and for dynamic content
        const maxWait = 10000; // 10 seconds max
        const checkInterval = 200;
        let waited = 0;

        // Wait for document ready state
        while (document.readyState !== 'complete' && waited < maxWait) {
            await wait(checkInterval);
            waited += checkInterval;
        }

        // Wait for Google Classroom specific content to appear
        // Look for common elements on the classwork page
        const contentSelectors = [
            '[role="main"]',
            '.asQXV', // Stream items
            '.cODFqb', // Classwork items
            '[data-coursework-id]',
            'a[href*="/a/"]', // Assignment links
            'a[href*="/m/"]', // Material links
        ];

        waited = 0;
        while (waited < maxWait) {
            for (const selector of contentSelectors) {
                const el = document.querySelector(selector);
                if (el) {
                    console.log(`[Millennium Sync] Page loaded - found: ${selector}`);
                    await wait(500); // Extra wait for JS to finish
                    return;
                }
            }
            await wait(checkInterval);
            waited += checkInterval;
        }

        console.log('[Millennium Sync] Timeout waiting for content, proceeding anyway');
    }

    async function scrollToLoadAll() {
        let lastHeight = 0;
        let stableCount = 0;
        const maxScrolls = 30;

        for (let i = 0; i < maxScrolls && !syncAborted; i++) {
            window.scrollTo(0, document.body.scrollHeight);
            await wait(300);

            const currentHeight = document.body.scrollHeight;
            if (currentHeight === lastHeight) {
                stableCount++;
                if (stableCount >= 3) break;
            } else {
                stableCount = 0;
            }
            lastHeight = currentHeight;
        }

        window.scrollTo(0, 0);
        await wait(200);
    }

    // ============================================
    // MULTI-PAGE SYNC ORCHESTRATION
    // ============================================

    async function performFullSync(isIncremental = false) {
        if (syncInProgress) {
            console.log('[Millennium Sync] Sync already in progress');
            return null;
        }

        syncInProgress = true;
        syncAborted = false;

        console.log(`[Millennium Sync] Starting ${isIncremental ? 'incremental' : 'full'} sync...`);
        showOverlay();

        try {
            // Step 1: Get last sync time from server if incremental
            if (isIncremental) {
                updateStatus('Checking last sync time...', 0);
                try {
                    const response = await fetch('http://localhost:3000/api/extension/classroom-sync');
                    const data = await response.json();
                    if (data.success && data.data?.lastUpdated) {
                        lastSyncTime = data.data.lastUpdated;
                        console.log('[Millennium Sync] Last sync:', lastSyncTime);
                    }
                } catch (e) {
                    console.log('[Millennium Sync] Could not get last sync time, doing full sync');
                    isIncremental = false;
                }
            }

            // Step 2: Navigate to home page if not there
            updateStatus('Finding your classes...', 5);

            const onHomePage = window.location.pathname.match(/\/u\/\d+\/?(?:h|home)?$/i) ||
                window.location.pathname === '/' ||
                window.location.pathname.match(/\/u\/\d+\/?$/);

            if (!onHomePage) {
                console.log('[Millennium Sync] Navigating to home page...');
                window.location.href = baseUrl;
                // Script will re-run when page loads
                return null;
            }

            // Step 3: Scrape all courses from home page
            const courses = await scrapeCourses();

            if (courses.length === 0) {
                throw new Error('No courses found. Make sure you are enrolled in classes.');
            }

            updateStatus(`Found ${courses.length} classes`, 10);

            // Step 4: Scrape items from each course's Classwork page
            const allItems = [];
            const courseResults = [];

            for (let i = 0; i < courses.length && !syncAborted; i++) {
                const course = courses[i];
                const progress = 10 + ((i / courses.length) * 75);

                updateStatus(`Syncing: ${course.name} (${i + 1}/${courses.length})`, progress);

                try {
                    // Navigate to course's Classwork page
                    const items = await navigateAndScrape(course);
                    allItems.push(...items);

                    courseResults.push({
                        courseId: course.id,
                        courseName: course.name,
                        itemCount: items.length,
                        success: true,
                    });

                    console.log(`[Millennium Sync] ${course.name}: ${items.length} items`);

                } catch (error) {
                    console.error(`[Millennium Sync] Error syncing ${course.name}:`, error);
                    courseResults.push({
                        courseId: course.id,
                        courseName: course.name,
                        itemCount: 0,
                        success: false,
                        error: error.message,
                    });
                }

                // Small delay between courses
                await wait(500);
            }

            if (syncAborted) {
                throw new Error('Sync was cancelled');
            }

            // Step 5: Deduplicate items
            updateStatus('Processing items...', 88);

            const itemMap = new Map();
            for (const item of allItems) {
                const key = `${item.courseId}-${item.id}`;
                // Keep the most recent version if duplicate
                const existing = itemMap.get(key);
                if (!existing || item.scrapedAt > existing.scrapedAt) {
                    itemMap.set(key, item);
                }
            }

            const uniqueItems = Array.from(itemMap.values());

            // Step 6: Navigate back to home
            updateStatus('Finishing up...', 92);

            // Step 7: Send to server
            updateStatus('Sending to Millennium...', 95);

            const data = {
                courses,
                items: uniqueItems,
                userNumber,
                syncMode: isIncremental ? 'incremental' : 'full',
                lastSyncTime: lastSyncTime,
                lastUpdated: new Date().toISOString(),
                syncResults: courseResults,
            };

            console.log('[Millennium Sync] Sync complete:', {
                courses: courses.length,
                items: uniqueItems.length,
                mode: isIncremental ? 'incremental' : 'full',
            });

            await sendToApp(data);
            showComplete(data);

            return data;

        } catch (error) {
            console.error('[Millennium Sync] Error:', error);
            showError(error.message);
            throw error;
        } finally {
            syncInProgress = false;
        }
    }

    async function navigateAndScrape(course) {
        return new Promise(async (resolve, reject) => {
            try {
                // Use the current page if we're already on this course
                const currentCourseMatch = window.location.pathname.match(/\/c\/([A-Za-z0-9_-]+)/);
                if (currentCourseMatch && currentCourseMatch[1] === course.id) {
                    const items = await scrapeItemsFromPage(course.id, course.name);
                    resolve(items);
                    return;
                }

                // For other courses, scrape items visible on the current page that belong to this course
                const items = await scrapeVisibleItemsForCourse(course.id, course.name);
                resolve(items);

            } catch (error) {
                reject(error);
            }
        });
    }

    async function scrapeVisibleItemsForCourse(courseId, courseName) {
        // Scrape items from the current page that belong to the specified course
        const items = [];
        const seenIds = new Set();

        const selectors = 'a[href*="/a/"], a[href*="/sa/"], a[href*="/m/"], a[href*="/p/"]';
        const itemLinks = document.querySelectorAll(selectors);

        for (const link of itemLinks) {
            const href = link.href || '';

            const itemMatch = href.match(/\/(a|sa|m|p)\/([A-Za-z0-9_-]+)/);
            // Support both /c/ and /w/ URL patterns
            const linkCourseMatch = href.match(/\/(?:c|w)\/([A-Za-z0-9_-]+)/);

            if (!itemMatch) continue;

            const [, typeCode, itemId] = itemMatch;
            const linkCourseId = linkCourseMatch?.[1];

            // Only include items from this course
            if (linkCourseId !== courseId) continue;

            const uniqueKey = `${courseId}-${itemId}`;
            if (seenIds.has(uniqueKey)) continue;

            let type = 'announcement';
            if (typeCode === 'a' || typeCode === 'sa') type = 'assignment';
            else if (typeCode === 'm') type = 'material';

            const container = findItemContainer(link);
            const itemInfo = extractItemInfo(link, container, type);

            if (!itemInfo.title || itemInfo.title.length < 2 || isNavigationItem(itemInfo.title)) continue;

            const now = new Date().toISOString();

            const item = {
                id: itemId,
                courseId,
                courseName,
                type,
                title: itemInfo.title,
                description: itemInfo.description || '',
                dueDate: itemInfo.dueDate,
                dueText: itemInfo.dueText || '',
                maxPoints: itemInfo.maxPoints,
                submissionState: itemInfo.submissionState || 'NEW',
                link: href,
                postedTime: itemInfo.postedTime,
                scrapedAt: now,
            };

            item.contentHash = generateContentHash(item);

            seenIds.add(uniqueKey);
            items.push(item);
        }

        return items;
    }

    // ============================================
    // SEQUENTIAL COURSE SYNC (Full Navigation)
    // ============================================

    async function performDeepSync() {
        if (syncInProgress) {
            console.log('[Millennium Sync] Sync already in progress');
            return null;
        }

        syncInProgress = true;
        syncAborted = false;

        console.log('[Millennium Sync] Starting deep sync with full navigation...');
        showOverlay();

        try {
            updateStatus('Finding your classes...', 5);

            // First scrape courses from home
            const courses = await scrapeCourses();

            if (courses.length === 0) {
                throw new Error('No courses found. Make sure you are enrolled in classes.');
            }

            // Store courses and sync state
            await browserAPI.storage.local.set({
                classroomSyncState: {
                    courses,
                    currentIndex: 0,
                    allItems: [],
                    startTime: new Date().toISOString(),
                    mode: 'deep',
                },
            });

            // Start navigating to first course
            updateStatus(`Syncing: ${courses[0].name} (1/${courses.length})`, 10);

            // Navigate to first course's classwork page
            window.location.href = courses[0].classworkLink;

            return null; // Will continue in onPageLoad handler

        } catch (error) {
            console.error('[Millennium Sync] Error:', error);
            showError(error.message);
            syncInProgress = false;
            throw error;
        }
    }

    async function continueSyncFromState() {
        const result = await browserAPI.storage.local.get('classroomSyncState');
        const state = result.classroomSyncState;

        if (!state || !state.courses) {
            return false; // No sync in progress
        }

        syncInProgress = true;
        syncAborted = false;

        showOverlay();

        try {
            const { courses, currentIndex, allItems, mode } = state;

            // Check if we're on a course page (supports both /c/ and /w/ URLs)
            // /c/{id} - stream page
            // /w/{id}/t/all - classwork/all topics page
            const courseMatch = window.location.pathname.match(/\/(?:c|w)\/([A-Za-z0-9_-]+)/);

            console.log('[Millennium Sync] continueSyncFromState - URL:', window.location.pathname, 'Match:', courseMatch);

            if (courseMatch) {
                const courseId = courseMatch[1];
                const expectedCourse = courses[currentIndex];

                console.log('[Millennium Sync] Course ID:', courseId, 'Expected:', expectedCourse?.id);

                if (expectedCourse && courseId === expectedCourse.id) {
                    // Scrape this course
                    const progress = 10 + ((currentIndex / courses.length) * 75);
                    updateStatus(`Syncing: ${expectedCourse.name} (${currentIndex + 1}/${courses.length})`, progress);

                    await wait(1500); // Wait for content
                    const items = await scrapeItemsFromPage(expectedCourse.id, expectedCourse.name);
                    allItems.push(...items);

                    console.log(`[Millennium Sync] ${expectedCourse.name}: ${items.length} items`);

                    // Move to next course
                    const nextIndex = currentIndex + 1;

                    if (nextIndex < courses.length && !syncAborted) {
                        // Update state and navigate to next course
                        await browserAPI.storage.local.set({
                            classroomSyncState: {
                                ...state,
                                currentIndex: nextIndex,
                                allItems,
                            },
                        });

                        updateStatus(`Syncing: ${courses[nextIndex].name} (${nextIndex + 1}/${courses.length})`,
                            10 + ((nextIndex / courses.length) * 75));

                        await wait(500);
                        window.location.href = courses[nextIndex].classworkLink;
                        return true;
                    } else {
                        // All courses done, finalize
                        updateStatus('Processing items...', 88);

                        // Deduplicate
                        const itemMap = new Map();
                        for (const item of allItems) {
                            const key = `${item.courseId}-${item.id}`;
                            const existing = itemMap.get(key);
                            if (!existing || item.scrapedAt > existing.scrapedAt) {
                                itemMap.set(key, item);
                            }
                        }

                        const uniqueItems = Array.from(itemMap.values());

                        updateStatus('Sending to Millennium...', 95);

                        const data = {
                            courses,
                            items: uniqueItems,
                            syncMode: 'deep',
                            lastUpdated: new Date().toISOString(),
                        };

                        await sendToApp(data);

                        // Clear state
                        await browserAPI.storage.local.remove('classroomSyncState');

                        showComplete(data);

                        // Navigate back to home
                        setTimeout(() => {
                            window.location.href = baseUrl;
                        }, 3000);

                        return true;
                    }
                }
            }

            return false;

        } catch (error) {
            console.error('[Millennium Sync] Error continuing sync:', error);
            showError(error.message);
            await browserAPI.storage.local.remove('classroomSyncState');
            syncInProgress = false;
            return false;
        }
    }

    // ============================================
    // COMMUNICATION
    // ============================================

    async function sendToApp(data) {
        return new Promise((resolve, reject) => {
            browserAPI.runtime.sendMessage({ type: 'CLASSROOM_DATA', data }, response => {
                if (browserAPI.runtime.lastError) {
                    reject(new Error(browserAPI.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });
    }

    // ============================================
    // UI OVERLAY
    // ============================================

    function showOverlay() {
        document.getElementById('millennium-sync-overlay')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'millennium-sync-overlay';
        overlay.innerHTML = `
            <style>
                #millennium-sync-overlay {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: #1a1a2e;
                    border: 1px solid rgba(100,104,240,0.3);
                    border-radius: 16px;
                    padding: 24px;
                    color: white;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    z-index: 2147483647;
                    min-width: 320px;
                    max-width: 400px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.4);
                    animation: mcsSlideIn 0.3s ease;
                }
                @keyframes mcsSlideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                .mcs-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
                .mcs-icon { 
                    width: 40px; height: 40px; 
                    background: linear-gradient(135deg, #6468F0, #8B8EF5); 
                    border-radius: 10px; 
                    display: flex; align-items: center; justify-content: center; 
                    font-weight: bold; font-size: 18px; 
                }
                .mcs-title { font-size: 18px; font-weight: 600; flex: 1; }
                .mcs-close-btn {
                    background: none; border: none; color: #888; cursor: pointer;
                    padding: 4px; font-size: 20px; line-height: 1;
                }
                .mcs-close-btn:hover { color: white; }
                .mcs-progress { 
                    background: rgba(255,255,255,0.1); 
                    border-radius: 8px; height: 8px; 
                    margin-bottom: 12px; overflow: hidden; 
                }
                .mcs-bar { 
                    height: 100%; 
                    background: linear-gradient(90deg, #6468F0, #8B8EF5); 
                    width: 0%; 
                    transition: width 0.3s ease; 
                }
                .mcs-status { font-size: 13px; color: #aaa; min-height: 20px; margin-bottom: 8px; }
                .mcs-substatus { font-size: 11px; color: #666; }
                .mcs-complete { display: none; }
                .mcs-complete.visible { display: block; }
                .mcs-in-progress.hidden { display: none; }
                .mcs-stats { 
                    display: grid; grid-template-columns: repeat(3, 1fr); 
                    gap: 12px; margin: 20px 0; 
                }
                .mcs-stat { 
                    text-align: center; padding: 12px; 
                    background: rgba(255,255,255,0.05); border-radius: 10px; 
                }
                .mcs-stat-value { font-size: 24px; font-weight: 700; color: #8B8EF5; }
                .mcs-stat-label { font-size: 10px; color: #888; text-transform: uppercase; margin-top: 4px; }
                .mcs-btn { 
                    width: 100%; padding: 12px; border: none; border-radius: 10px; 
                    font-size: 14px; font-weight: 600; cursor: pointer; margin-top: 8px; 
                    transition: opacity 0.2s;
                }
                .mcs-btn:hover { opacity: 0.9; }
                .mcs-btn-primary { background: linear-gradient(135deg, #6468F0, #8B8EF5); color: white; }
                .mcs-btn-secondary { background: rgba(255,255,255,0.1); color: white; }
                .mcs-btn-danger { background: rgba(255,100,100,0.2); color: #ff6b6b; }
                .mcs-error { 
                    color: #ff6b6b; background: rgba(255,107,107,0.1); 
                    padding: 12px; border-radius: 8px; margin-top: 12px; 
                    font-size: 13px; display: none; 
                }
                .mcs-tip { font-size: 11px; color: #666; margin-top: 12px; text-align: center; }
            </style>
            <div class="mcs-header">
                <div class="mcs-icon">M</div>
                <div class="mcs-title">Syncing Classroom</div>
                <button class="mcs-close-btn" id="mcsAbort" title="Cancel sync">×</button>
            </div>
            <div class="mcs-in-progress" id="mcsProgress">
                <div class="mcs-progress"><div class="mcs-bar" id="mcsBar"></div></div>
                <div class="mcs-status" id="mcsStatus">Starting...</div>
                <div class="mcs-substatus" id="mcsSubstatus"></div>
            </div>
            <div class="mcs-complete" id="mcsComplete">
                <div class="mcs-stats" id="mcsStats"></div>
                <button class="mcs-btn mcs-btn-primary" id="mcsOpen">Open Dashboard</button>
                <button class="mcs-btn mcs-btn-secondary" id="mcsClose">Close</button>
            </div>
            <div class="mcs-error" id="mcsError"></div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('mcsOpen')?.addEventListener('click', () => {
            window.open('http://localhost:3000/dashboard', '_blank');
            overlay.remove();
        });
        document.getElementById('mcsClose')?.addEventListener('click', () => overlay.remove());
        document.getElementById('mcsAbort')?.addEventListener('click', () => {
            syncAborted = true;
            overlay.remove();
            browserAPI.storage.local.remove('classroomSyncState');
        });
    }

    function updateStatus(msg, pct, substatus = '') {
        const bar = document.getElementById('mcsBar');
        const status = document.getElementById('mcsStatus');
        const sub = document.getElementById('mcsSubstatus');
        if (bar) bar.style.width = pct + '%';
        if (status) status.textContent = msg;
        if (sub) sub.textContent = substatus;
    }

    function showComplete(data) {
        document.getElementById('mcsProgress')?.classList.add('hidden');
        document.getElementById('mcsComplete')?.classList.add('visible');

        const stats = document.getElementById('mcsStats');
        if (stats) {
            const assignments = data.items?.filter(i => i.type === 'assignment').length || 0;
            const materials = data.items?.filter(i => i.type === 'material').length || 0;
            const announcements = data.items?.filter(i => i.type === 'announcement').length || 0;

            stats.innerHTML = `
                <div class="mcs-stat">
                    <div class="mcs-stat-value">${data.courses?.length || 0}</div>
                    <div class="mcs-stat-label">Classes</div>
                </div>
                <div class="mcs-stat">
                    <div class="mcs-stat-value">${assignments}</div>
                    <div class="mcs-stat-label">Assignments</div>
                </div>
                <div class="mcs-stat">
                    <div class="mcs-stat-value">${materials + announcements}</div>
                    <div class="mcs-stat-label">Other</div>
                </div>
            `;
        }
    }

    function showError(msg) {
        const err = document.getElementById('mcsError');
        const progress = document.getElementById('mcsProgress');
        if (err) { err.textContent = msg; err.style.display = 'block'; }
        if (progress) progress.classList.add('hidden');
    }

    // ============================================
    // MESSAGE HANDLING
    // ============================================

    browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('[Millennium Sync] Message received:', message.type);

        if (message.type === 'CLASSROOM_SYNC') {
            // Quick sync - just scrape current page
            performFullSync(false).then(data => {
                sendResponse({ success: true, data });
            }).catch(error => {
                sendResponse({ success: false, error: error.message });
            });
            return true;
        }

        if (message.type === 'CLASSROOM_DEEP_SYNC') {
            // Deep sync - navigate to each course
            performDeepSync().then(data => {
                sendResponse({ success: true, data });
            }).catch(error => {
                sendResponse({ success: false, error: error.message });
            });
            return true;
        }

        if (message.type === 'CLASSROOM_INCREMENTAL_SYNC') {
            // Incremental sync
            performFullSync(true).then(data => {
                sendResponse({ success: true, data });
            }).catch(error => {
                sendResponse({ success: false, error: error.message });
            });
            return true;
        }
    });

    // ============================================
    // INITIALIZATION
    // ============================================

    async function init() {
        // Check if there's an ongoing deep sync
        const continued = await continueSyncFromState();

        if (!continued) {
            console.log('[Millennium Sync] Ready. Use extension popup or window.millenniumSync');
        }
    }

    // Expose for debugging
    window.millenniumSync = {
        sync: () => performFullSync(false),
        deepSync: performDeepSync,
        incrementalSync: () => performFullSync(true),
        scrapeCourses,
        scrapeItems: scrapeItemsFromPage,
        abort: () => { syncAborted = true; },
    };

    // Initialize
    init();

})();
