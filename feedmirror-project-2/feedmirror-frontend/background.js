// Twitter Feed Extension Background Script
// Handles API communication, session management, and coordination between components

class TwitterFeedBackground {
    constructor() {
        this.API_BASE_URL = 'http://localhost:8000';
        this.validationToken = null;
        this.userInfo = null;
        this.sessionExpiry = null;
        this.cachedTokens = null;
        this.feedCache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
        this.apiRequestQueue = [];
        this.isProcessingQueue = false;
        this.rateLimitDelay = 2000; // 2 seconds between requests
        
        this.init();
    }

    init() {
        // Set up event listeners
        this.setupMessageHandlers();
        this.setupAlarms();
        this.setupContextMenus();
        this.setupInstallHandler();
        
        // Initialize session from storage
        this.initializeSession();
        
        console.log('Twitter Feed Background Script initialized');
    }

    setupMessageHandlers() {
        // Listen for messages from popup and content scripts
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            this.handleMessage(request, sender, sendResponse);
            return true; // Keep message channel open for async responses
        });

        // Handle external messages (from websites)
        chrome.runtime.onMessageExternal?.addListener((request, sender, sendResponse) => {
            this.handleExternalMessage(request, sender, sendResponse);
            return true;
        });
    }

    setupAlarms() {
        // Create periodic alarms for maintenance tasks
        chrome.alarms.create('sessionCleanup', { periodInMinutes: 15 });
        chrome.alarms.create('cacheCleanup', { periodInMinutes: 5 });
        chrome.alarms.create('feedRefresh', { periodInMinutes: 10 });

        chrome.alarms.onAlarm.addListener((alarm) => {
            this.handleAlarm(alarm);
        });
    }

    setupContextMenus() {
        // Create context menus
        chrome.contextMenus.removeAll(() => {
            chrome.contextMenus.create({
                id: 'showTwitterFeed',
                title: 'Show Twitter Feed',
                contexts: ['page']
            });

            chrome.contextMenus.create({
                id: 'hideTwitterFeed',
                title: 'Hide Twitter Feed',
                contexts: ['page']
            });

            chrome.contextMenus.create({
                id: 'refreshFeed',
                title: 'Refresh Twitter Feed',
                contexts: ['page']
            });
        });

        chrome.contextMenus.onClicked.addListener((info, tab) => {
            this.handleContextMenuClick(info, tab);
        });
    }

    setupInstallHandler() {
        chrome.runtime.onInstalled.addListener((details) => {
            if (details.reason === 'install') {
                this.handleInstall();
            } else if (details.reason === 'update') {
                this.handleUpdate(details.previousVersion);
            }
        });
    }

    async initializeSession() {
        try {
            const stored = await chrome.storage.local.get([
                'validationToken',
                'validationExpires', 
                'userInfo',
                'cachedTokens',
                'settings'
            ]);

            if (stored.validationToken && stored.validationExpires) {
                const expiryDate = new Date(stored.validationExpires);
                if (expiryDate > new Date()) {
                    this.validationToken = stored.validationToken;
                    this.sessionExpiry = expiryDate;
                    this.userInfo = stored.userInfo;
                    this.cachedTokens = stored.cachedTokens;
                    console.log('Session restored from storage');
                } else {
                    console.log('Stored session expired, clearing...');
                    await this.clearSession();
                }
            }

            // Initialize default settings if not present
            if (!stored.settings) {
                await this.initializeDefaultSettings();
            }
        } catch (error) {
            console.error('Error initializing session:', error);
        }
    }

    async initializeDefaultSettings() {
        const defaultSettings = {
            autoInject: false,
            feedUpdateInterval: 10, // minutes
            maxTweetsPerFeed: 20,
            showNotifications: true,
            darkMode: false,
            compactView: false,
            filterRetweets: false,
            filterReplies: false
        };

        await chrome.storage.local.set({ settings: defaultSettings });
        console.log('Default settings initialized');
    }

    async handleMessage(request, sender, sendResponse) {
        try {
            console.log('Background received message:', request.action);

            switch (request.action) {
                case 'VALIDATE_COOKIES':
                    const validationResult = await this.validateCookies(request.data);
                    sendResponse(validationResult);
                    break;

                case 'GET_HOME_FEED':
                    const feedResult = await this.getHomeFeed(request.data);
                    sendResponse(feedResult);
                    break;

                case 'SEARCH_TWEETS':
                    const searchResult = await this.searchTweets(request.data);
                    sendResponse(searchResult);
                    break;

                case 'GET_SESSION_STATUS':
                    sendResponse(await this.getSessionStatus());
                    break;

                case 'CLEAR_SESSION':
                    await this.clearSession();
                    sendResponse({ success: true });
                    break;

                case 'INJECT_FEED_TO_TAB':
                    await this.injectFeedToTab(request.data);
                    sendResponse({ success: true });
                    break;

                case 'GET_SETTINGS':
                    const settings = await this.getSettings();
                    sendResponse(settings);
                    break;

                case 'UPDATE_SETTINGS':
                    await this.updateSettings(request.data);
                    sendResponse({ success: true });
                    break;

                case 'REFRESH_FEED_REQUEST':
                    await this.handleFeedRefreshRequest(sender);
                    sendResponse({ success: true });
                    break;

                case 'GET_CACHED_FEED':
                    const cachedFeed = this.getCachedFeed(request.data.type, request.data.key);
                    sendResponse(cachedFeed);
                    break;

                case 'FEED_INJECTED':
                case 'FEED_REMOVED':
                    // Update badge and state
                    await this.updateExtensionState(sender.tab);
                    sendResponse({ success: true });
                    break;

                default:
                    sendResponse({ error: 'Unknown action' });
            }
        } catch (error) {
            console.error('Background message handler error:', error);
            sendResponse({ error: error.message });
        }
    }

    async handleExternalMessage(request, sender, sendResponse) {
        // Handle messages from external websites if needed
        console.log('External message received:', request, sender);
        sendResponse({ error: 'External messages not supported' });
    }

    async handleAlarm(alarm) {
        console.log('Alarm triggered:', alarm.name);

        switch (alarm.name) {
            case 'sessionCleanup':
                await this.cleanupExpiredSession();
                break;
            case 'cacheCleanup':
                this.cleanupExpiredCache();
                break;
            case 'feedRefresh':
                await this.autoRefreshFeeds();
                break;
        }
    }

    async handleContextMenuClick(info, tab) {
        try {
            switch (info.menuItemId) {
                case 'showTwitterFeed':
                    await this.showFeedInTab(tab.id);
                    break;
                case 'hideTwitterFeed':
                    await this.hideFeedInTab(tab.id);
                    break;
                case 'refreshFeed':
                    await this.refreshFeedInTab(tab.id);
                    break;
            }
        } catch (error) {
            console.error('Context menu handler error:', error);
        }
    }

    async handleInstall() {
        // Open welcome page
        chrome.tabs.create({
            url: chrome.runtime.getURL('welcome.html')
        });

        // Set up initial state
        await this.initializeDefaultSettings();
        
        console.log('Extension installed successfully');
    }

    async handleUpdate(previousVersion) {
        console.log(`Extension updated from ${previousVersion}`);
        
        // Handle migration if needed
        await this.migrateSettings(previousVersion);
    }

    // API Methods
    async validateCookies(tokens) {
        try {
            const response = await this.makeAPIRequest('/validate-cookies', {
                method: 'POST',
                body: JSON.stringify(tokens)
            });

            const result = await response.json();

            if (result.valid) {
                // Store session data
                this.validationToken = result.validation_token;
                this.sessionExpiry = new Date(result.expires_at);
                this.userInfo = result.user;
                this.cachedTokens = tokens;

                await chrome.storage.local.set({
                    validationToken: result.validation_token,
                    validationExpires: result.expires_at,
                    userInfo: result.user,
                    cachedTokens: tokens
                });

                // Update badge
                await this.updateBadge('✓', '#4CAF50');
                
                console.log('Cookies validated successfully');
            } else {
                await this.updateBadge('✗', '#F44336');
            }

            return result;
        } catch (error) {
            console.error('Cookie validation error:', error);
            await this.updateBadge('!', '#FF9800');
            return { valid: false, error: error.message };
        }
    }

    async getHomeFeed(data) {
        try {
            // Check cache first
            const cacheKey = `home_feed_${data.limit || 20}`;
            const cached = this.getCachedFeed('home', cacheKey);
            if (cached) {
                console.log('Returning cached home feed');
                return cached;
            }

            // Ensure we have a valid session
            if (!this.validationToken || !this.isSessionValid()) {
                throw new Error('Invalid or expired session. Please validate cookies first.');
            }

            const requestData = {
                tokens: this.cachedTokens,
                limit: data.limit || 20,
                validation_token: this.validationToken
            };

            const response = await this.makeAPIRequest('/home-feed', {
                method: 'POST',
                body: JSON.stringify(requestData)
            });

            const result = await response.json();

            if (result.success) {
                // Cache the result
                this.setCachedFeed('home', cacheKey, result);
                console.log('Home feed fetched successfully');
            }

            return result;
        } catch (error) {
            console.error('Home feed error:', error);
            return { success: false, error: error.message };
        }
    }

    async searchTweets(data) {
        try {
            // Check cache first
            const cacheKey = `search_${data.query}_${data.limit || 10}`;
            const cached = this.getCachedFeed('search', cacheKey);
            if (cached) {
                console.log('Returning cached search results');
                return cached;
            }

            const response = await this.makeAPIRequest('/search', {
                method: 'POST',
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (result.success) {
                // Cache the result
                this.setCachedFeed('search', cacheKey, result);
                console.log('Search completed successfully');
            }

            return result;
        } catch (error) {
            console.error('Search error:', error);
            return { success: false, error: error.message };
        }
    }

    async makeAPIRequest(endpoint, options = {}) {
        // Add to queue to handle rate limiting
        return new Promise((resolve, reject) => {
            this.apiRequestQueue.push({
                endpoint,
                options: {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        ...options.headers
                    },
                    ...options
                },
                resolve,
                reject
            });

            this.processQueue();
        });
    }

    async processQueue() {
        if (this.isProcessingQueue || this.apiRequestQueue.length === 0) {
            return;
        }

        this.isProcessingQueue = true;

        while (this.apiRequestQueue.length > 0) {
            const request = this.apiRequestQueue.shift();
            
            try {
                const response = await fetch(`${this.API_BASE_URL}${request.endpoint}`, request.options);
                
                if (!response.ok) {
                    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
                }

                request.resolve(response);
            } catch (error) {
                request.reject(error);
            }

            // Rate limiting delay
            if (this.apiRequestQueue.length > 0) {
                await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));
            }
        }

        this.isProcessingQueue = false;
    }

    // Session Management
    isSessionValid() {
        return this.validationToken && this.sessionExpiry && new Date() < this.sessionExpiry;
    }

    async getSessionStatus() {
        return {
            isValid: this.isSessionValid(),
            userInfo: this.userInfo,
            expiresAt: this.sessionExpiry?.toISOString(),
            hasTokens: !!this.cachedTokens
        };
    }

    async clearSession() {
        this.validationToken = null;
        this.sessionExpiry = null;
        this.userInfo = null;
        this.cachedTokens = null;
        this.feedCache.clear();

        await chrome.storage.local.remove([
            'validationToken',
            'validationExpires',
            'userInfo',
            'cachedTokens'
        ]);

        await this.updateBadge('', '#666666');
        console.log('Session cleared');
    }

    async cleanupExpiredSession() {
        if (!this.isSessionValid()) {
            await this.clearSession();
        }
    }

    // Cache Management
    setCachedFeed(type, key, data) {
        const cacheKey = `${type}_${key}`;
        this.feedCache.set(cacheKey, {
            data,
            timestamp: Date.now()
        });
    }

    getCachedFeed(type, key) {
        const cacheKey = `${type}_${key}`;
        const cached = this.feedCache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
            return cached.data;
        }

        if (cached) {
            this.feedCache.delete(cacheKey);
        }

        return null;
    }

    cleanupExpiredCache() {
        const now = Date.now();
        for (const [key, value] of this.feedCache.entries()) {
            if (now - value.timestamp > this.cacheExpiry) {
                this.feedCache.delete(key);
            }
        }
        console.log('Cache cleanup completed');
    }

    // Tab Management
    async injectFeedToTab(data) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (tab) {
                await chrome.tabs.sendMessage(tab.id, {
                    action: 'INJECT_FEED',
                    data: data
                });
            }
        } catch (error) {
            console.error('Error injecting feed to tab:', error);
        }
    }

    async showFeedInTab(tabId) {
        try {
            // Get home feed and inject
            const feedData = await this.getHomeFeed({ limit: 20 });
            
            if (feedData.success) {
                await chrome.tabs.sendMessage(tabId, {
                    action: 'INJECT_FEED',
                    data: feedData
                });
            }
        } catch (error) {
            console.error('Error showing feed in tab:', error);
        }
    }

    async hideFeedInTab(tabId) {
        try {
            await chrome.tabs.sendMessage(tabId, {
                action: 'REMOVE_FEED'
            });
        } catch (error) {
            console.error('Error hiding feed in tab:', error);
        }
    }

    async refreshFeedInTab(tabId) {
        try {
            // Clear cache and get fresh feed
            this.feedCache.clear();
            const feedData = await this.getHomeFeed({ limit: 20 });
            
            if (feedData.success) {
                await chrome.tabs.sendMessage(tabId, {
                    action: 'INJECT_FEED',
                    data: feedData
                });
            }
        } catch (error) {
            console.error('Error refreshing feed in tab:', error);
        }
    }

    async handleFeedRefreshRequest(sender) {
        if (sender.tab) {
            await this.refreshFeedInTab(sender.tab.id);
        }
    }

    async updateExtensionState(tab) {
        try {
            const response = await chrome.tabs.sendMessage(tab.id, {
                action: 'CHECK_INJECTION_STATUS'
            });

            if (response?.isInjected) {
                await this.updateBadge('ON', '#4CAF50');
            } else {
                await this.updateBadge('', '#666666');
            }
        } catch (error) {
            // Tab might not have content script
            console.log('Could not check injection status');
        }
    }

    // Settings Management
    async getSettings() {
        const result = await chrome.storage.local.get('settings');
        return result.settings || {};
    }

    async updateSettings(newSettings) {
        const currentSettings = await this.getSettings();
        const updatedSettings = { ...currentSettings, ...newSettings };
        
        await chrome.storage.local.set({ settings: updatedSettings });
        console.log('Settings updated:', updatedSettings);
    }

    async migrateSettings(previousVersion) {
        // Handle settings migration between versions
        console.log('Migrating settings from version:', previousVersion);
        // Add migration logic here as needed
    }

    // Auto-refresh functionality
    async autoRefreshFeeds() {
        const settings = await this.getSettings();
        
        if (!settings.autoRefresh || !this.isSessionValid()) {
            return;
        }

        try {
            // Clear cache to force fresh data
            this.feedCache.clear();
            
            // Notify active tabs to refresh if they have feeds
            const tabs = await chrome.tabs.query({});
            
            for (const tab of tabs) {
                try {
                    await chrome.tabs.sendMessage(tab.id, {
                        action: 'AUTO_REFRESH_FEED'
                    });
                } catch (error) {
                    // Tab doesn't have content script, ignore
                }
            }
            
            console.log('Auto-refresh completed');
        } catch (error) {
            console.error('Auto-refresh error:', error);
        }
    }

    // Badge Management
    async updateBadge(text, color) {
        try {
            await chrome.action.setBadgeText({ text });
            await chrome.action.setBadgeBackgroundColor({ color });
        } catch (error) {
            console.error('Error updating badge:', error);
        }
    }

    // Notification Management
    async showNotification(title, message, type = 'basic') {
        const settings = await this.getSettings();
        
        if (!settings.showNotifications) {
            return;
        }

        try {
            await chrome.notifications.create({
                type: type,
                iconUrl: chrome.runtime.getURL('icons/icon128.png'),
                title: title,
                message: message
            });
        } catch (error) {
            console.error('Error showing notification:', error);
        }
    }
}

// Initialize the background script
const twitterFeedBackground = new TwitterFeedBackground();

// Handle service worker lifecycle
self.addEventListener('activate', event => {
    console.log('Service worker activated');
});

self.addEventListener('install', event => {
    console.log('Service worker installed');
});