
class TwitterContentScript {
    constructor() {
        this.isTwitter = this.checkIfTwitter();
        this.authStatus = null;
        this.init();
    }

    init() {
        if (!this.isTwitter) return;

        console.log('Twitter Feed Mirror: Content script loaded');

        this.checkAuthStatus();
        
       
        this.monitorAuthChanges();
        
     
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true;
        });
    }

    checkIfTwitter() {
        return window.location.hostname.includes('twitter.com') || 
               window.location.hostname.includes('x.com');
    }

    async checkAuthStatus() {
        try {
            
            const authIndicators = [
                '[data-testid="SideNav_AccountSwitcher_Button"]',
                '[data-testid="AppTabBar_Profile_Link"]',
                '[aria-label="Profile"]',
                '[data-testid="confirmationSheetConfirm"]'
            ];

            let isAuthenticated = false;
            
            for (const selector of authIndicators) {
                if (document.querySelector(selector)) {
                    isAuthenticated = true;
                    break;
                }
            }

         
            if (!isAuthenticated) {
                const urlMatch = window.location.pathname.match(/^\/[a-zA-Z0-9_]+$/);
                const homeIndicator = document.querySelector('[data-testid="primaryColumn"]');
                isAuthenticated = !!(urlMatch && homeIndicator);
            }

            this.authStatus = isAuthenticated;
            
     
            chrome.runtime.sendMessage({
                type: 'UPDATE_BADGE',
                data: { authenticated: isAuthenticated }
            });

            return isAuthenticated;

        } catch (error) {
            console.error('Auth status check failed:', error);
            return false;
        }
    }

    monitorAuthChanges() {

        let currentUrl = window.location.href;
        
        const observer = new MutationObserver(() => {
            if (window.location.href !== currentUrl) {
                currentUrl = window.location.href;
                setTimeout(() => this.checkAuthStatus(), 1000);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

   
        this.monitorLoginLogout();
    }

    monitorLoginLogout() {
  
        const loginSelectors = [
            '[data-testid="loginButton"]',
            '[data-testid="signupButton"]',
            '[data-testid="ocfEnterTextTextInput"]'
        ];

        const logoutSelectors = [
            '[data-testid="confirmationSheetConfirm"]',
            'a[href="/logout"]'
        ];


        setInterval(() => {
            const wasAuthenticated = this.authStatus;
            this.checkAuthStatus().then(isAuthenticated => {
                if (wasAuthenticated !== isAuthenticated) {
                    this.notifyAuthChange(isAuthenticated);
                }
            });
        }, 5000);
    }

    async notifyAuthChange(isAuthenticated) {
        console.log(`Twitter auth status changed: ${isAuthenticated}`);
        
        chrome.runtime.sendMessage({
            type: 'AUTH_STATUS_CHANGED',
            data: { authenticated: isAuthenticated }
        });
    }

    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.type) {
                case 'GET_AUTH_STATUS':
                    const authStatus = await this.checkAuthStatus();
                    sendResponse({ success: true, authenticated: authStatus });
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

                case 'SHOW_FRIEND_REQUEST':
                    this.showFriendRequestNotification(message.data);
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
            authenticated: this.authStatus,
            timestamp: new Date().toISOString()
        };
    }

    async getUserInfo() {
        try {
           
            const userInfo = {};

           
            const profileButton = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
            if (profileButton) {
                const nameElement = profileButton.querySelector('[dir="ltr"]');
                if (nameElement) {
                    userInfo.name = nameElement.textContent.trim();
                }
            }

           
            const usernameElement = document.querySelector('[data-testid="UserName"]');
            if (usernameElement) {
                const handleElement = usernameElement.querySelector('[dir="ltr"]');
                if (handleElement) {
                    userInfo.username = handleElement.textContent.replace('@', '').trim();
                }
            }

           
            const urlMatch = window.location.pathname.match(/^\/([a-zA-Z0-9_]+)$/);
            if (urlMatch && !userInfo.username) {
                userInfo.username = urlMatch[1];
            }

            return userInfo;

        } catch (error) {
            console.error('User info extraction failed:', error);
            return {};
        }
    }

    showInPageNotification(data) {
       
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #1d4ed8;
            color: white;
            padding: 12px 16px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            max-width: 320px;
            transition: all 0.3s ease;
        `;

        notification.innerHTML = `
            <div style="font-weight: 600; margin-bottom: 4px;">Twitter Feed Mirror</div>
            <div>${data.message}</div>
        `;

        document.body.appendChild(notification);

      
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 5000);

        
        notification.addEventListener('click', () => {
            notification.style.transform = 'translateX(100%)';
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        });
    }

    showFriendRequestNotification(data) {
     
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: white;
            color: #1e293b;
            padding: 16px;
            border-radius: 12px;
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            max-width: 350px;
            border: 1px solid #e2e8f0;
            transition: all 0.3s ease;
        `;

        notification.innerHTML = `
            <div style="font-weight: 600; margin-bottom: 8px; color: #1d4ed8;">
                🔗 Twitter Feed Mirror
            </div>
            <div style="margin-bottom: 12px;">
                <strong>${data.friendName || 'Someone'}</strong> wants to access your Twitter feed
            </div>
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
                <button class="friend-req-deny" style="
                    padding: 6px 12px;
                    border: 1px solid #d1d5db;
                    background: white;
                    color: #374151;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 500;
                ">Deny</button>
                <button class="friend-req-approve" style="
                    padding: 6px 12px;
                    border: none;
                    background: #3b82f6;
                    color: white;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 500;
                ">Approve</button>
            </div>
        `;

  
        const approveBtn = notification.querySelector('.friend-req-approve');
        const denyBtn = notification.querySelector('.friend-req-deny');

        approveBtn.addEventListener('click', () => {
            this.handleFriendRequestAction(data.permissionToken, true);
            document.body.removeChild(notification);
        });

        denyBtn.addEventListener('click', () => {
            this.handleFriendRequestAction(data.permissionToken, false);
            document.body.removeChild(notification);
        });

        document.body.appendChild(notification);

        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 30000);
    }

    async handleFriendRequestAction(permissionToken, approve) {
        try {
            await chrome.runtime.sendMessage({
                type: 'FRIEND_REQUEST_ACTION',
                data: {
                    permissionToken: permissionToken,
                    approve: approve
                }
            });

           
            this.showInPageNotification({
                message: `Friend request ${approve ? 'approved' : 'denied'} successfully`
            });

        } catch (error) {
            console.error('Error handling friend request:', error);
            this.showInPageNotification({
                message: `Error: ${error.message}`
            });
        }
    }
}


if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new TwitterContentScript();
    });
} else {
    new TwitterContentScript();
}
