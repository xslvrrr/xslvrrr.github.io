// Background script for Firefox
// Handles communication and full sync orchestration

const APP_URL = 'http://localhost:3000';
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Listen for messages from content script and popup
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
        sendResponse({ installed: true, version: browserAPI.runtime.getManifest().version });
        return true;
    }

    if (message.type === 'GET_STORED_DATA') {
        browserAPI.storage.local.get(['portalData', 'classroomData']).then((result) => {
            sendResponse({ 
                data: result.portalData || null,
                classroomData: result.classroomData || null
            });
        });
        return true;
    }
});

// Handle quick sync
async function handleQuickSync(data, sendResponse) {
    console.log('[Millennium Sync BG] Quick sync received');
    browserAPI.storage.local.set({ portalData: data });

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
    browserAPI.storage.local.set({ classroomData: data });

    try {
        const result = await sendClassroomDataToApp(data);
        sendResponse({ success: true, result });
    } catch (error) {
        console.error('[Millennium Sync BG] Classroom sync error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Trigger classroom sync
// syncType can be: 'CLASSROOM_SYNC', 'CLASSROOM_DEEP_SYNC', 'CLASSROOM_INCREMENTAL_SYNC'
async function triggerClassroomSync(sendResponse, syncType = 'CLASSROOM_SYNC') {
    try {
        const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];

        if (!tab || !tab.url?.includes('classroom.google.com')) {
            const newTab = await browserAPI.tabs.create({ url: 'https://classroom.google.com/' });
            
            const listener = (tabId, info) => {
                if (tabId === newTab.id && info.status === 'complete') {
                    browserAPI.tabs.onUpdated.removeListener(listener);
                    setTimeout(() => {
                        browserAPI.tabs.sendMessage(newTab.id, { type: syncType })
                            .then(response => sendResponse(response))
                            .catch(error => sendResponse({ success: false, error: error.message }));
                    }, 2000);
                }
            };
            browserAPI.tabs.onUpdated.addListener(listener);
        } else {
            browserAPI.tabs.sendMessage(tab.id, { type: syncType })
                .then(response => sendResponse(response))
                .catch(error => sendResponse({ success: false, error: error.message }));
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

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
}

// Trigger full portal sync
async function triggerFullSync(sendResponse) {
    try {
        const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];

        if (!tab || !tab.url?.includes('millennium.education/portal')) {
            const newTab = await browserAPI.tabs.create({ url: 'https://millennium.education/portal/' });
            
            const listener = (tabId, info) => {
                if (tabId === newTab.id && info.status === 'complete') {
                    browserAPI.tabs.onUpdated.removeListener(listener);
                    setTimeout(() => startSyncOnTab(newTab.id, sendResponse), 1000);
                }
            };
            browserAPI.tabs.onUpdated.addListener(listener);
        } else {
            startSyncOnTab(tab.id, sendResponse);
        }
    } catch (error) {
        console.error('[Millennium Sync BG] Error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Start sync on a specific tab
async function startSyncOnTab(tabId, sendResponse) {
    try {
        browserAPI.tabs.sendMessage(tabId, { type: 'START_FULL_SYNC' }).catch(() => {});
    } catch (e) {}

    try {
        const response = await browserAPI.tabs.sendMessage(tabId, { type: 'FULL_SYNC' });
        
        if (response?.success && response.data) {
            browserAPI.storage.local.set({ portalData: response.data });

            try {
                const result = await sendDataToApp(response.data);
                browserAPI.tabs.sendMessage(tabId, { type: 'SYNC_COMPLETE', data: response.data }).catch(() => {});
                sendResponse({ success: true, data: response.data, result });
            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
        } else {
            sendResponse({ success: false, error: response?.error || 'Unknown error' });
        }
    } catch (error) {
        console.error('[Millennium Sync BG] Sync error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Send data to the Next.js app
async function sendDataToApp(data) {
    const response = await fetch(`${APP_URL}/api/extension/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
}

// Handle extension install/update
browserAPI.runtime.onInstalled.addListener((details) => {
    console.log('[Millennium Sync] Installed:', details.reason);
    if (details.reason === 'install') {
        browserAPI.tabs.create({ url: 'http://localhost:3000/extension-installed' });
    }
});

// Listen for external messages
if (browserAPI.runtime.onMessageExternal) {
    browserAPI.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
        if (message.type === 'CHECK_EXTENSION') {
            sendResponse({ installed: true, version: browserAPI.runtime.getManifest().version });
        }
        if (message.type === 'GET_STORED_DATA') {
            browserAPI.storage.local.get(['portalData']).then((result) => {
                sendResponse({ data: result.portalData || null });
            });
            return true;
        }
    });
}
