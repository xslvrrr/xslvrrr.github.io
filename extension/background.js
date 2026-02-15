// Background service worker
// Handles communication and full sync orchestration

const APP_URL = 'http://localhost:3000';

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Millennium Sync BG] Message:', message.type);

    if (message.type === 'PORTAL_DATA') {
        handleQuickSync(message.data, sendResponse);
        return true;
    }

    if (message.type === 'SEND_TO_APP') {
        console.log('[Millennium Sync BG] Forwarding data to app API...');
        sendDataToApp(message.data).then(result => {
            sendResponse(result);
        }).catch(error => {
            sendResponse({ success: false, error: error.message });
        });
        return true;
    }

    if (message.type === 'CLASSROOM_DATA') {
        console.log('[Millennium Sync BG] Received Classroom data:', message.data);
        handleClassroomSync(message.data, sendResponse);
        return true;
    }

    if (message.type === 'TRIGGER_FULL_SYNC') {
        triggerFullSync(sendResponse);
        return true;
    }

    if (message.type === 'TRIGGER_CLASSROOM_SYNC') {
        triggerClassroomSync(sendResponse, 'CLASSROOM_SYNC');
        return true;
    }

    if (message.type === 'TRIGGER_CLASSROOM_DEEP_SYNC') {
        triggerClassroomSync(sendResponse, 'CLASSROOM_DEEP_SYNC');
        return true;
    }

    if (message.type === 'TRIGGER_CLASSROOM_INCREMENTAL_SYNC') {
        triggerClassroomSync(sendResponse, 'CLASSROOM_INCREMENTAL_SYNC');
        return true;
    }

    if (message.type === 'CHECK_EXTENSION') {
        sendResponse({ installed: true, version: chrome.runtime.getManifest().version });
        return true;
    }

    if (message.type === 'GET_STORED_DATA') {
        chrome.storage.local.get(['portalData', 'classroomData'], (result) => {
            sendResponse({ 
                data: result.portalData || null,
                classroomData: result.classroomData || null
            });
        });
        return true;
    }
})

// Handle quick sync
async function handleQuickSync(data, sendResponse) {
    console.log('[Millennium Sync BG] Quick sync received');

    // Store locally
    chrome.storage.local.set({ portalData: data }, () => {
        console.log('[Millennium Sync BG] Data stored');
    });

    // Send to app
    try {
        const result = await sendDataToApp(data);
        sendResponse({ success: true, result });
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}

// Handle Classroom sync
async function handleClassroomSync(data, sendResponse) {
    console.log('[Millennium Sync BG] Classroom sync received');

    // Store locally
    chrome.storage.local.set({ classroomData: data }, () => {
        console.log('[Millennium Sync BG] Classroom data stored locally');
    });

    // Send to app
    try {
        const result = await sendClassroomDataToApp(data);
        sendResponse({ success: true, result });
    } catch (error) {
        console.error('[Millennium Sync BG] Classroom sync error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Trigger classroom sync on current/new tab
// syncType can be: 'CLASSROOM_SYNC', 'CLASSROOM_DEEP_SYNC', 'CLASSROOM_INCREMENTAL_SYNC'
async function triggerClassroomSync(sendResponse, syncType = 'CLASSROOM_SYNC') {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab || !tab.url?.includes('classroom.google.com')) {
            // Not on Classroom, open it
            chrome.tabs.create({ url: 'https://classroom.google.com/' }, (newTab) => {
                chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                    if (tabId === newTab.id && info.status === 'complete') {
                        chrome.tabs.onUpdated.removeListener(listener);
                        setTimeout(() => {
                            chrome.tabs.sendMessage(newTab.id, { type: syncType }, (response) => {
                                sendResponse(response);
                            });
                        }, 2000);
                    }
                });
            });
        } else {
            // Already on Classroom
            chrome.tabs.sendMessage(tab.id, { type: syncType }, (response) => {
                sendResponse(response);
            });
        }
    } catch (error) {
        console.error('[Millennium Sync BG] Classroom sync trigger error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Send Classroom data to the Next.js app
async function sendClassroomDataToApp(data) {
    const response = await fetch(`${APP_URL}/api/extension/classroom-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
}

// Trigger full sync on current tab
async function triggerFullSync(sendResponse) {
    try {
        // Get current tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab || !tab.url?.includes('millennium.education/portal')) {
            // Not on portal, open it
            chrome.tabs.create({ url: 'https://millennium.education/portal/' }, (newTab) => {
                // Wait for tab to load then sync
                chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                    if (tabId === newTab.id && info.status === 'complete') {
                        chrome.tabs.onUpdated.removeListener(listener);
                        setTimeout(() => {
                            startSyncOnTab(newTab.id, sendResponse);
                        }, 1000);
                    }
                });
            });
        } else {
            // Already on portal, start sync
            startSyncOnTab(tab.id, sendResponse);
        }
    } catch (error) {
        console.error('[Millennium Sync BG] Error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Start sync on a specific tab
function startSyncOnTab(tabId, sendResponse) {
    // Tell the content script to show popup and start full sync
    chrome.tabs.sendMessage(tabId, { type: 'START_FULL_SYNC' });

    // Request full sync
    chrome.tabs.sendMessage(tabId, { type: 'FULL_SYNC' }, async (response) => {
        if (chrome.runtime.lastError) {
            console.error('[Millennium Sync BG] Sync error:', chrome.runtime.lastError);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
            return;
        }

        if (response?.success && response.data) {
            // Store the data
            chrome.storage.local.set({ portalData: response.data });

            // Send to app
            try {
                const result = await sendDataToApp(response.data);

                // Notify content script sync is complete
                chrome.tabs.sendMessage(tabId, {
                    type: 'SYNC_COMPLETE',
                    data: response.data
                });

                sendResponse({ success: true, data: response.data, result });
            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
        } else {
            sendResponse({ success: false, error: response?.error || 'Unknown error' });
        }
    });
}

// Send data to the Next.js app
async function sendDataToApp(data) {
    const response = await fetch(`${APP_URL}/api/extension/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
}

// Handle extension install/update
chrome.runtime.onInstalled.addListener((details) => {
    console.log('[Millennium Sync] Installed:', details.reason);

    if (details.reason === 'install') {
        // Open onboarding or instructions
        chrome.tabs.create({ url: 'http://localhost:3000/extension-installed' });
    }
});

// Listen for external messages (from web page)
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    if (message.type === 'CHECK_EXTENSION') {
        sendResponse({ installed: true, version: chrome.runtime.getManifest().version });
    }

    if (message.type === 'GET_STORED_DATA') {
        chrome.storage.local.get(['portalData'], (result) => {
            sendResponse({ data: result.portalData || null });
        });
        return true;
    }
});
