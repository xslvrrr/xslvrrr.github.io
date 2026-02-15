// Popup script - handles UI interactions for both Portal and Classroom sync
// Use browser API with chrome fallback for Firefox compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

document.addEventListener('DOMContentLoaded', async () => {
    // Set logo
    const logoImg = document.getElementById('logoImg');
    const logoContainer = document.getElementById('logoContainer');
    if (logoImg && browserAPI.runtime) {
        try {
            const logoUrl = browserAPI.runtime.getURL('icons/icon128.png');
            logoImg.src = logoUrl;
            logoImg.onload = () => {
                logoImg.style.display = 'block';
            };
            logoImg.onerror = () => {
                logoImg.style.display = 'none';
                if (logoContainer) {
                    const fallback = document.createElement('div');
                    fallback.style.cssText = 'width:100%; height:100%; background:#6468F0; border-radius:8px; display:flex; align-items:center; justify-content:center; color:#FFFFFF; font-weight:600; font-size:20px;';
                    fallback.textContent = 'M';
                    logoContainer.appendChild(fallback);
                }
            };
        } catch (e) {
            console.error('Error loading logo:', e);
        }
    }

    // UI Elements - Site detection
    const siteBadge = document.getElementById('siteBadge');
    const siteBadgeText = document.getElementById('siteBadgeText');

    // UI Elements - Portal
    const portalSection = document.getElementById('portalSection');
    const portalStatusDot = document.getElementById('portalStatusDot');
    const portalStatusText = document.getElementById('portalStatusText');
    const portalSyncBtn = document.getElementById('portalSyncBtn');
    const portalSyncIcon = document.getElementById('portalSyncIcon');
    const portalSyncText = document.getElementById('portalSyncText');
    const portalLastSync = document.getElementById('portalLastSync');
    const statClasses = document.getElementById('statClasses');
    const statNotices = document.getElementById('statNotices');
    const statGrades = document.getElementById('statGrades');

    // UI Elements - Classroom
    const classroomSection = document.getElementById('classroomSection');
    const classroomStatusDot = document.getElementById('classroomStatusDot');
    const classroomStatusText = document.getElementById('classroomStatusText');
    const classroomSyncBtn = document.getElementById('classroomSyncBtn');
    const classroomSyncIcon = document.getElementById('classroomSyncIcon');
    const classroomSyncText = document.getElementById('classroomSyncText');
    const classroomDeepSyncBtn = document.getElementById('classroomDeepSyncBtn');
    const classroomDeepSyncIcon = document.getElementById('classroomDeepSyncIcon');
    const classroomDeepSyncText = document.getElementById('classroomDeepSyncText');
    const classroomLastSync = document.getElementById('classroomLastSync');
    const statCourses = document.getElementById('statCourses');
    const statAssignments = document.getElementById('statAssignments');
    const statMaterials = document.getElementById('statMaterials');

    // UI Elements - Footer
    const openDashboardBtn = document.getElementById('openDashboardBtn');

    // Current site detection
    let currentSite = 'other'; // 'millennium', 'classroom', or 'other'

    // Detect current site
    async function detectCurrentSite() {
        try {
            const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
            const url = tab?.url || '';

            if (url.includes('millennium.education/portal')) {
                currentSite = 'millennium';
                siteBadge.className = 'site-badge millennium';
                siteBadgeText.textContent = 'On Millennium Portal';
                portalSection.classList.add('active');
                portalSyncText.textContent = 'Sync Now';
            } else if (url.includes('classroom.google.com')) {
                currentSite = 'classroom';
                siteBadge.className = 'site-badge classroom';
                siteBadgeText.textContent = 'On Google Classroom';
                classroomSection.classList.add('active');
                // Keep button text as is since we have two buttons now
            } else {
                currentSite = 'other';
                siteBadge.className = 'site-badge other';
                siteBadgeText.textContent = 'Navigate to sync sites below';
            }
        } catch (e) {
            console.error('Error detecting site:', e);
            currentSite = 'other';
        }
    }

    // Load stored data
    function loadStoredData() {
        browserAPI.storage.local.get(['portalData', 'classroomData'], (result) => {
            // Update portal UI
            if (result.portalData) {
                updatePortalUI(result.portalData);
            }

            // Update classroom UI
            if (result.classroomData) {
                updateClassroomUI(result.classroomData);
            }
        });
    }

    // Update Portal UI
    function updatePortalUI(data) {
        portalStatusDot.classList.add('synced');
        portalStatusText.textContent = 'Synced';

        // Update stats
        const timetableCount = Array.isArray(data.timetable)
            ? data.timetable.length
            : ((data.timetable?.weekA?.length || 0) + (data.timetable?.weekB?.length || 0));
        statClasses.textContent = data.classes?.length || timetableCount || 0;
        statNotices.textContent = data.notices?.length || 0;
        statGrades.textContent = data.grades?.length || 0;

        // Update last sync time
        if (data.lastUpdated) {
            portalLastSync.textContent = formatTimeAgo(data.lastUpdated);
        }
    }

    // Update Classroom UI
    function updateClassroomUI(data) {
        classroomStatusDot.classList.add('synced');
        classroomStatusText.textContent = 'Synced';

        // Update stats
        statCourses.textContent = data.courses?.length || 0;
        const assignments = data.items?.filter(i => i.type === 'assignment')?.length || 0;
        const materials = data.items?.filter(i => i.type === 'material')?.length || 0;
        statAssignments.textContent = assignments;
        statMaterials.textContent = materials;

        // Update last sync time
        if (data.lastUpdated) {
            classroomLastSync.textContent = formatTimeAgo(data.lastUpdated);
        }
    }

    // Format time ago
    function formatTimeAgo(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMins = Math.floor((now - date) / 60000);

        if (diffMins < 1) return 'Synced just now';
        if (diffMins < 60) return `Synced ${diffMins}m ago`;
        if (diffMins < 1440) return `Synced ${Math.floor(diffMins / 60)}h ago`;
        return `Synced ${date.toLocaleDateString()}`;
    }

    // Portal sync button
    portalSyncBtn.addEventListener('click', async () => {
        portalSyncBtn.disabled = true;
        portalSyncIcon.classList.add('spinning');
        portalSyncText.textContent = 'Syncing...';

        if (currentSite === 'millennium') {
            // Trigger sync on current tab
            const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
            browserAPI.tabs.sendMessage(tab.id, { type: 'FULL_SYNC' }).then(response => {
                handlePortalSyncResponse(response);
            }).catch(() => {
                handlePortalSyncResponse(null);
            });
        } else {
            // Open portal
            portalSyncText.textContent = 'Opening...';
            browserAPI.tabs.create({ url: 'https://millennium.education/portal/' }).then(() => {
                portalSyncBtn.disabled = false;
                portalSyncIcon.classList.remove('spinning');
                portalSyncText.textContent = 'Sync Portal';
            });
        }
    });

    // Classroom quick sync button
    classroomSyncBtn.addEventListener('click', async () => {
        classroomSyncBtn.disabled = true;
        classroomDeepSyncBtn.disabled = true;
        classroomSyncIcon.classList.add('spinning');
        classroomSyncText.textContent = 'Syncing...';

        if (currentSite === 'classroom') {
            // Trigger sync on current tab
            const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
            browserAPI.tabs.sendMessage(tab.id, { type: 'CLASSROOM_SYNC' }).then(response => {
                handleClassroomSyncResponse(response);
            }).catch(() => {
                handleClassroomSyncResponse(null);
            });
        } else {
            // Open classroom
            classroomSyncText.textContent = 'Opening...';
            browserAPI.tabs.create({ url: 'https://classroom.google.com/' }).then(() => {
                classroomSyncBtn.disabled = false;
                classroomDeepSyncBtn.disabled = false;
                classroomSyncIcon.classList.remove('spinning');
                classroomSyncText.textContent = 'Quick Sync';
            });
        }
    });

    // Classroom deep sync button
    classroomDeepSyncBtn.addEventListener('click', async () => {
        classroomSyncBtn.disabled = true;
        classroomDeepSyncBtn.disabled = true;
        classroomDeepSyncIcon.classList.add('spinning');
        classroomDeepSyncText.textContent = 'Starting...';

        if (currentSite === 'classroom') {
            // Trigger deep sync on current tab
            const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
            browserAPI.tabs.sendMessage(tab.id, { type: 'CLASSROOM_DEEP_SYNC' }).then(response => {
                handleClassroomSyncResponse(response, true);
            }).catch(() => {
                handleClassroomSyncResponse(null, true);
            });
        } else {
            // Open classroom first, then deep sync will start
            classroomDeepSyncText.textContent = 'Opening...';
            const newTab = await browserAPI.tabs.create({ url: 'https://classroom.google.com/' });
            
            // Listen for tab load, then trigger deep sync
            const listener = (tabId, info) => {
                if (tabId === newTab.id && info.status === 'complete') {
                    browserAPI.tabs.onUpdated.removeListener(listener);
                    setTimeout(() => {
                        browserAPI.tabs.sendMessage(newTab.id, { type: 'CLASSROOM_DEEP_SYNC' }).then(response => {
                            handleClassroomSyncResponse(response, true);
                        }).catch(() => {
                            handleClassroomSyncResponse(null, true);
                        });
                    }, 2000);
                }
            };
            browserAPI.tabs.onUpdated.addListener(listener);
        }
    });

    // Handle portal sync response
    function handlePortalSyncResponse(response) {
        portalSyncBtn.disabled = false;
        portalSyncIcon.classList.remove('spinning');
        portalSyncText.textContent = currentSite === 'millennium' ? 'Sync Now' : 'Sync Portal';

        if (response?.success) {
            updatePortalUI(response.data);
            portalStatusText.textContent = 'Synced!';
        } else {
            portalStatusText.textContent = 'Sync failed';
        }
    }

    // Handle classroom sync response
    function handleClassroomSyncResponse(response, isDeepSync = false) {
        classroomSyncBtn.disabled = false;
        classroomDeepSyncBtn.disabled = false;
        classroomSyncIcon.classList.remove('spinning');
        classroomDeepSyncIcon.classList.remove('spinning');
        classroomSyncText.textContent = 'Quick Sync';
        classroomDeepSyncText.textContent = 'Deep Sync';

        if (response?.success) {
            updateClassroomUI(response.data);
            classroomStatusText.textContent = isDeepSync ? 'Deep synced!' : 'Synced!';
        } else {
            classroomStatusText.textContent = response?.error || 'Sync failed';
        }
    }

    // Open dashboard button
    openDashboardBtn.addEventListener('click', () => {
        browserAPI.tabs.create({ url: 'http://localhost:3000/dashboard' });
    });

    // Listen for sync progress updates
    browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'SYNC_PROGRESS') {
            const { current, total, page } = message.progress;
            portalSyncIcon.classList.add('spinning');
            portalSyncText.textContent = `${current}/${total}...`;
        }

        if (message.type === 'SYNC_COMPLETE') {
            handlePortalSyncResponse({ success: true, data: message.data });
        }

        if (message.type === 'CLASSROOM_SYNC_COMPLETE') {
            handleClassroomSyncResponse({ success: true, data: message.data });
        }
    });

    // Initialize
    await detectCurrentSite();
    loadStoredData();
});
