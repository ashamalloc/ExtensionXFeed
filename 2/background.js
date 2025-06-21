// Background Service Worker for Twitter Feed Mirror Extension
class BackgroundService {
    constructor() {
        this.authStatus = new Map(); // Store auth status per tab
        this.init();
    }

    init() {
        // Handle extension installation
        chrome.runtime.onInstalled.addListener((details) => {
            if (details.reason === 'install') {
                console.log('Twitter Feed Mirror extension installed');
                this.setupDefaultSettings();
            }
        });

        // Handle messages from popup and content scripts
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true;
        });

        // Handle tab updates to check for Twitter pages
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete' && this.isTwitterUrl(tab.url)) {
                this.checkTabAuthStatus(tabId, tab.url);
            }
        });

        // Handle tab activation to update auth status
        chrome.tabs.onActivated.addListener((activeInfo) => {
            chrome.tabs.get(activeInfo.tabId, (tab) => {
                if (tab && this.isTwitterUrl(tab.url)) {
                    this.checkTabAuthStatus(activeInfo.tabId, tab.url);
                }
            });
        });

        // Handle tab removal to clean up auth status
        chrome.tabs.onRemoved.addListener((tabId) => {
            this.authStatus.delete(tabId);
        });

        // Block problematic Twitter requests to prevent CORS issues
        this.setupWebRequestBlocking();

        // Listen for cookie changes
        chrome.cookies.onChanged.addListener((changeInfo) => {
            this.handleCookieChange(changeInfo);
        });

        // Handle notification clicks
        chrome.notifications.onClicked.addListener((notificationId) => {
            this.handleNotificationClick(notificationId);
        });

        chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
            this.handleNotificationButtonClick(notificationId, buttonIndex);
        });
    }

    setupWebRequestBlocking() {
        // Block problematic requests that cause CORS issues
        if (chrome.webRequest && chrome.webRequest.onBeforeRequest) {
            chrome.webRequest.onBeforeRequest.addListener(
                (details) => {
                    const problematicUrls = [
                        'personalization_id_sync',
                        'clientEventJavascript',
                        'web/log',
                        'analytics'
                    ];
                    
                    if (problematicUrls.some(url => details.url.includes(url))) {
                        console.log('Blocking problematic request:', details.url);
                        return { cancel: true };
                    }
                },
                { 
                    urls: [
                        "*://*.twitter.com/*", 
                        "*://*.x.com/*",
                        "*://analytics.twitter.com/*",
                        "*://analytics.x.com/*"
                    ] 
                },
                ["blocking"]
            );
        }
    }

    async setupDefaultSettings() {
        try {
            const defaultSettings = {
                apiEndpoint: 'http://localhost:8000',
                autoExtractCookies: false,
                notifyOnRequests: true,
                theme: 'light',
                pollInterval: 10000
            };
            await chrome.storage.local.set({ settings: defaultSettings });
        } catch (error) {
            console.error('Failed to setup default settings:', error);
        }
    }

    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.type) {
                case 'EXTRACT_COOKIES':
                    const cookies = await this.extractTwitterCookies();
                    sendResponse({ success: true, cookies });
                    break;

                case 'CHECK_TWITTER_AUTH':
                    const tabId = sender.tab?.id;
                    const authenticated = tabId ? this.authStatus.get(tabId) : false;
                    sendResponse({ success: true, authenticated });
                    break;

                case 'NOTIFY_REQUEST':
                    await this.showNotification(message.data);
                    sendResponse({ success: true });
                    break;

                case 'UPDATE_BADGE':
                    const senderTabId = sender.tab?.id;
                    if (senderTabId) {
                        await this.updateBadge(senderTabId, message.data);
                        this.authStatus.set(senderTabId, message.data.authenticated);
                    }
                    sendResponse({ success: true });
                    break;

                case 'GET_AUTH_STATUS':
                    const currentTabId = sender.tab?.id;
                    const currentAuth = currentTabId ? this.authStatus.get(currentTabId) : false;
                    sendResponse({ success: true, authenticated: currentAuth });
                    break;

                case 'INJECT_NOTIFICATION':
                    // Forward to content script
                    if (sender.tab?.id) {
                        chrome.tabs.sendMessage(sender.tab.id, {
                            type: 'INJECT_NOTIFICATION',
                            data: message.data
                        });
                    }
                    sendResponse({ success: true });
                    break;

                default:
                    sendResponse({ success: false, error: 'Unknown message type' });
            }
        } catch (error) {
            console.error('Background script error:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    async extractTwitterCookies() {
        try {
            // Get cookies from both domains
            const [twitterCookies, xCookies] = await Promise.all([
                chrome.cookies.getAll({ domain: '.twitter.com' }),
                chrome.cookies.getAll({ domain: '.x.com' })
            ]);

            const allCookies = [...twitterCookies, ...xCookies];
            
            // Find required auth cookies
            const authToken = allCookies.find(cookie => cookie.name === 'auth_token')?.value;
            const ct0 = allCookies.find(cookie => cookie.name === 'ct0')?.value;
            
            if (!authToken) {
                throw new Error('Twitter auth_token cookie not found. Please log in to Twitter/X first.');
            }
            
            if (!ct0) {
                throw new Error('Twitter ct0 cookie not found. Please refresh Twitter/X and try again.');
            }

            // Build cookie string
            const cookieString = allCookies
                .filter(cookie => cookie.value && this.isImportantCookie(cookie))
                .map(cookie => `${cookie.name}=${cookie.value}`)
                .join('; ');

            return {
                auth_token: authToken,
                ct0: ct0,
                cookie: cookieString,
                extracted_at: new Date().toISOString(),
                domains: [...new Set(allCookies.map(c => c.domain))],
                count: allCookies.length
            };
        } catch (error) {
            console.error('Cookie extraction failed:', error);
            throw new Error(`Cookie extraction failed: ${error.message}`);
        }
    }

    isImportantCookie(cookie) {
        const importantCookies = [
            'auth_token', 'ct0', 'twid', 'kdt', 'remember_checked_on',
            'guest_id', 'personalization_id', 'lang', 'at_check'
        ];
        return importantCookies.includes(cookie.name);
    }

    async checkTabAuthStatus(tabId, url) {
        try {
            // Inject script to check auth status
            const results = await chrome.scripting.executeScript({
                target: { tabId: tabId },
                function: () => {
                    const authIndicators = [
                        '[data-testid="SideNav_AccountSwitcher_Button"]',
                        '[data-testid="AppTabBar_Profile_Link"]',
                        '[aria-label="Profile"]',
                        '[data-testid="primaryColumn"] [data-testid="UserName"]'
                    ];
                    return authIndicators.some(selector => document.querySelector(selector));
                }
            });

            const isAuthenticated = results[0]?.result || false;
            const previousAuth = this.authStatus.get(tabId);
            
            if (previousAuth !== isAuthenticated) {
                this.authStatus.set(tabId, isAuthenticated);
                await this.updateBadge(tabId, { authenticated: isAuthenticated });
                
                // Notify popup if it's open
                try {
                    await chrome.runtime.sendMessage({
                        type: 'AUTH_STATUS_CHANGED',
                        data: { authenticated: isAuthenticated, tabId }
                    });
                } catch (error) {
                    // Popup might not be open, ignore error
                }
            }
        } catch (error) {
            console.error('Auth status check failed for tab', tabId, ':', error);
            // Don't throw, just log the error
        }
    }

    async showNotification(data) {
        try {
            const notificationId = data.id || `notification-${Date.now()}`;
            const notificationOptions = {
                type: 'basic',
                iconUrl: chrome.runtime.getURL('icons/icon48.png') || '/icons/icon48.png',
                title: data.title || 'Twitter Feed Mirror',
                message: data.message || 'New notification',
                priority: 1
            };

            if (data.type === 'friend_request') {
                notificationOptions.title = 'New Friend Request';
                notificationOptions.message = `${data.friendName || 'Someone'} wants to access your Twitter feed`;
                notificationOptions.buttons = [
                    { title: 'Approve' }, 
                    { title: 'Deny' }
                ];
                // Store notification data for handling clicks
                await chrome.storage.local.set({
                    [`notification-${notificationId}`]: data
                });
            }

            await chrome.notifications.create(notificationId, notificationOptions);
        } catch (error) {
            console.error('Failed to show notification:', error);
        }
    }

    async handleNotificationClick(notificationId) {
        try {
            // Open popup or focus extension
            chrome.action.openPopup();
        } catch (error) {
            console.error('Failed to handle notification click:', error);
        }
    }

    async handleNotificationButtonClick(notificationId, buttonIndex) {
        try {
            const notificationData = await chrome.storage.local.get(`notification-${notificationId}`);
            const data = notificationData[`notification-${notificationId}`];
            
            if (data && data.type === 'friend_request') {
                const approve = buttonIndex === 0; // First button is approve
                // Handle friend request approval/denial
                // This would typically make an API call
                console.log(`Friend request ${approve ? 'approved' : 'denied'} for:`, data.friendName);
            }
            
            // Clear notification data
            await chrome.storage.local.remove(`notification-${notificationId}`);
            chrome.notifications.clear(notificationId);
        } catch (error) {
            console.error('Failed to handle notification button click:', error);
        }
    }

    async updateBadge(tabId, data) {
        if (!tabId) return;
        
        try {
            if (data?.authenticated !== undefined) {
                await chrome.action.setBadgeText({
                    tabId: tabId,
                    text: data.authenticated ? '✓' : '✗'
                });
                await chrome.action.setBadgeBackgroundColor({
                    tabId: tabId,
                    color: data.authenticated ? '#10b981' : '#ef4444'
                });
                await chrome.action.setTitle({
                    tabId: tabId,
                    title: `Twitter Feed Mirror - ${data.authenticated ? 'Authenticated' : 'Not authenticated'}`
                });
            } else {
                await chrome.action.setBadgeText({ tabId: tabId, text: '' });
                await chrome.action.setTitle({ tabId: tabId, title: 'Twitter Feed Mirror' });
            }
        } catch (error) {
            console.error('Badge update failed:', error);
        }
    }

    isTwitterUrl(url) {
        if (!url) return false;
        try {
            const parsedUrl = new URL(url);
            return parsedUrl.hostname.includes('twitter.com') || 
                   parsedUrl.hostname.includes('x.com');
        } catch (error) {
            return false;
        }
    }

    async handleCookieChange(changeInfo) {
        if (!changeInfo.cookie) return;
        
        const cookie = changeInfo.cookie;
        if (this.isTwitterCookie(cookie)) {
            console.log(`Twitter cookie ${changeInfo.removed ? 'removed' : 'updated'}: ${cookie.name}`);
            
            // Check auth status for all Twitter tabs
            try {
                const tabs = await chrome.tabs.query({
                    url: ["*://*.twitter.com/*", "*://*.x.com/*"]
                });
                
                for (const tab of tabs) {
                    if (tab.id) {
                        this.checkTabAuthStatus(tab.id, tab.url);
                    }
                }
            } catch (error) {
                console.error('Failed to update auth status after cookie change:', error);
            }
        }
    }

    isTwitterCookie(cookie) {
        if (!cookie) return false;
        
        const twitterDomains = ['.twitter.com', '.x.com', 'twitter.com', 'x.com'];
        const importantCookies = ['auth_token', 'ct0', 'twid', 'kdt'];
        
        return twitterDomains.some(domain => cookie.domain.includes(domain)) &&
               importantCookies.includes(cookie.name);
    }
}

// Initialize the background service
const backgroundService = new BackgroundService();