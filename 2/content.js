// Content Script for Twitter Feed Mirror Extension
class TwitterContentScript {
    constructor() {
        this.isTwitter = this.checkIfTwitter();
        this.init();
    }

    init() {
        if (!this.isTwitter) return;

        console.log('Twitter Feed Mirror: Content script loaded');
        
        // Send initial auth status to background
        this.sendAuthStatus();
        
        // Listen for messages from popup or background
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true;
        });

        // Watch for auth status changes
        this.watchAuthStatus();
    }

    checkIfTwitter() {
        return window.location.hostname.includes('twitter.com') || 
               window.location.hostname.includes('x.com');
    }

    watchAuthStatus() {
        // Watch for navigation changes
        let lastAuthStatus = null;
        setInterval(() => {
            const currentAuthStatus = this.isAuthenticated();
            if (currentAuthStatus !== lastAuthStatus) {
                lastAuthStatus = currentAuthStatus;
                this.sendAuthStatus();
            }
        }, 5000);
    }

    isAuthenticated() {
        const authIndicators = [
            '[data-testid="SideNav_AccountSwitcher_Button"]',
            '[data-testid="AppTabBar_Profile_Link"]',
            '[aria-label="Profile"]',
            '[data-testid="primaryColumn"] [data-testid="UserName"]'
        ];
        return authIndicators.some(selector => document.querySelector(selector));
    }

    sendAuthStatus() {
        const isAuthenticated = this.isAuthenticated();
        chrome.runtime.sendMessage({
            type: 'UPDATE_BADGE',
            data: { authenticated: isAuthenticated }
        }).catch(error => {
            console.log('Failed to send auth status:', error);
        });
    }

    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.type) {
                case 'GET_AUTH_STATUS':
                    const isAuthenticated = this.isAuthenticated();
                    sendResponse({ success: true, authenticated: isAuthenticated });
                    break;
                case 'EXTRACT_COOKIES_INFO':
                    const cookieInfo = await this.getCookieInfo();
                    sendResponse({ success: true, data: cookieInfo });
                    break;
                case 'CHECK_USER_INFO':
                    const userInfo = await this.getUserInfo();
                    sendResponse({ success: true, data: userInfo });
                    break;
                case 'INJECT_NOTIFICATION':
                    this.showInPageNotification(message.data);
                    sendResponse({ success: true });
                    break;
                default:
                    sendResponse({ success: false, error: 'Unknown message type' });
            }
        } catch (error) {
            console.error('Content script message handling error:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    async getCookieInfo() {
        return {
            domain: window.location.hostname,
            path: window.location.pathname,
            authenticated: this.isAuthenticated(),
            timestamp: new Date().toISOString()
        };
    }

    async getUserInfo() {
        try {
            const userInfo = {};
            
            // Try multiple selectors for user name
            const nameSelectors = [
                '[data-testid="SideNav_AccountSwitcher_Button"] [dir="ltr"]',
                '[data-testid="UserName"] span',
                '[aria-label*="Profile"] span'
            ];
            
            for (const selector of nameSelectors) {
                const element = document.querySelector(selector);
                if (element && element.textContent.trim()) {
                    userInfo.name = element.textContent.trim();
                    break;
                }
            }

            // Try to get username from URL or page elements
            const urlMatch = window.location.pathname.match(/^\/([a-zA-Z0-9_]+)$/);
            if (urlMatch) {
                userInfo.username = urlMatch[1];
            } else {
                // Try other selectors for username
                const usernameElement = document.querySelector('[data-testid="UserName"] [dir="ltr"]');
                if (usernameElement) {
                    userInfo.username = usernameElement.textContent.replace('@', '').trim();
                }
            }

            return userInfo;
        } catch (error) {
            console.error('User info extraction failed:', error);
            return {};
        }
    }

    showInPageNotification(data) {
        // Remove any existing notifications
        const existing = document.querySelector('.twitter-mirror-notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = 'twitter-mirror-notification';
        notification.style.cssText = `
            position: fixed; top: 20px; right: 20px; background: #1d4ed8; color: white;
            padding: 12px 16px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px; max-width: 320px; transition: all 0.3s ease;
            cursor: pointer;
        `;
        notification.innerHTML = `
            <div style="font-weight: 600; margin-bottom: 4px;">Twitter Feed Mirror</div>
            <div>${data.message}</div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.transform = 'translateX(100%)';
                notification.style.opacity = '0';
                setTimeout(() => notification.remove(), 300);
            }
        }, 5000);
        
        // Click to dismiss
        notification.addEventListener('click', () => {
            notification.style.transform = 'translateX(100%)';
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        });
    }
}

// Initialize content script when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new TwitterContentScript());
} else {
    new TwitterContentScript();
}