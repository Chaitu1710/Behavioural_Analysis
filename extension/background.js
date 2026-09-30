/**
 * Digital Behavioral Fingerprinting & Web Analytics System
 * Background Service Worker (background.js - Manifest V3)
 * Handles session state, tab domain parsing, idle listener, telemetry aggregation and API flushing.
 */

const BACKEND_API_URL = 'http://localhost:5000/api/telemetry';

// Persistent Session & User Identifiers
let userId = null;
let sessionId = null;

// Tracking state variables
let currentTabId = null;
let currentDomain = null;
let domainSwitchesCount = 0;
let tabStartTime = Date.now();
let activeTabDurationTotal = 0; // accumulated seconds for active tab
let idleStartTime = null;
let idleStateDurationTotal = 0; // accumulated seconds idle

// Content telemetry cache (scroll velocity, mouse activity)
let latestScrollVelocity = 0;
let latestMouseActivity = 0;

// Initialize user & session IDs from storage or create new ones
async function initializeSession() {
  const result = await chrome.storage.local.get(['userId', 'sessionId']);
  if (result.userId) {
    userId = result.userId;
  } else {
    userId = 'usr_' + Math.random().toString(36).substring(2, 10);
    await chrome.storage.local.set({ userId });
  }

  sessionId = 'sess_' + Math.random().toString(36).substring(2, 10);
  console.log(`[Behavioral Tracker] Session initialized: User=${userId}, Session=${sessionId}`);
}

initializeSession();

// Configure Idle Detection (15 seconds threshold)
chrome.idle.setDetectionInterval(15);

chrome.idle.onStateChanged.addListener((newState) => {
  console.log(`[Behavioral Tracker] Idle state changed to: ${newState}`);
  if (newState === 'idle' || newState === 'locked') {
    idleStartTime = Date.now();
  } else if (newState === 'active') {
    if (idleStartTime) {
      const durationSec = (Date.now() - idleStartTime) / 1000;
      idleStateDurationTotal += durationSec;
      idleStartTime = null;
    }
  }
});

// Helper: Extract clean domain hostname from URL
function extractDomain(url) {
  try {
    if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
      return 'system/internal';
    }
    const parsed = new URL(url);
    return parsed.hostname;
  } catch (e) {
    return 'unknown';
  }
}

// Track Tab Switching
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const now = Date.now();
  if (tabStartTime) {
    activeTabDurationTotal += (now - tabStartTime) / 1000;
  }
  tabStartTime = now;

  currentTabId = activeInfo.tabId;
  domainSwitchesCount++;

  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    const domain = extractDomain(tab.url);
    if (domain !== currentDomain) {
      currentDomain = domain;
    }
  } catch (err) {
    // Tab info unavailable
  }
});

// Track Tab URL updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === currentTabId && changeInfo.url) {
    const newDomain = extractDomain(changeInfo.url);
    if (newDomain !== currentDomain) {
      currentDomain = newDomain;
      domainSwitchesCount++;
    }
  }
});

// Listen to Content Script messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CONTENT_TELEMETRY') {
    latestScrollVelocity = message.scrollVelocity || 0;
    latestMouseActivity = message.mouseActivityScore || 0;
    sendResponse({ status: 'received' });
  }
  return true;
});

// Flush Telemetry Payload to Express Backend
async function flushTelemetry() {
  const now = new Date();
  
  // Update active tab duration accumulator
  if (tabStartTime) {
    activeTabDurationTotal += (Date.now() - tabStartTime) / 1000;
    tabStartTime = Date.now();
  }

  const activeHour = now.getHours();

  const payload = {
    userId: userId || 'usr_default',
    sessionId: sessionId || 'sess_default',
    activeTabDuration: parseFloat(activeTabDurationTotal.toFixed(2)),
    domainSwitches: domainSwitchesCount,
    idleStateDuration: parseFloat(idleStateDurationTotal.toFixed(2)),
    scrollVelocity: latestScrollVelocity,
    mouseActivityScore: latestMouseActivity,
    activeHour: activeHour,
    currentDomain: currentDomain || 'unknown',
    timestamp: now.toISOString()
  };

  console.log('[Behavioral Tracker] Sending Telemetry Payload:', payload);

  try {
    const response = await fetch(BACKEND_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      console.log('[Behavioral Tracker] Telemetry ingested successfully');
      // Reset window counters after successful sync
      domainSwitchesCount = 0;
      activeTabDurationTotal = 0;
      idleStateDurationTotal = 0;
    } else {
      console.warn('[Behavioral Tracker] API responded with error:', response.status);
    }
  } catch (err) {
    console.error('[Behavioral Tracker] Failed to transmit telemetry to backend:', err.message);
    // Queue offline if backend is unreachable
    cacheTelemetryOffline(payload);
  }
}

async function cacheTelemetryOffline(payload) {
  try {
    const { offlineQueue = [] } = await chrome.storage.local.get(['offlineQueue']);
    offlineQueue.push(payload);
    // Keep max 50 records offline
    if (offlineQueue.length > 50) offlineQueue.shift();
    await chrome.storage.local.set({ offlineQueue });
  } catch (e) {
    console.error('Failed to cache offline:', e);
  }
}

// Flush telemetry every 10 seconds
setInterval(flushTelemetry, 10000);
