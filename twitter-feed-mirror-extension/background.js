class BackgroundService {
    constructor() {
        this.init();
    }

    init() {
       
        chrome.runtime.onInstalled.addListener((details) => {
            if (details.reason === 'install') {
                console.log('Twitter Feed Mirror extension installed');
                this.setupDefaultSettings();
            }
        });

       
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; 
        });

       
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete' && this.isTwitterUrl(tab.url)) {
                this.updateBadge(tabId);
            }
        });

       
        chrome.cookies.onChanged.addListener((changeInfo) => {
            if (this.isTwitterCookie(changeInfo.cookie)) {
                this.handleCookieChange(changeInfo);
            }
        });

      
        chrome.notifications.onClicked.addListener((notificationId) => {
            this.handleNotificationClick(notificationId);
        });

        chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
            this.handleNotificationButtonClick(notificationId, buttonIndex);
        });
    }

    async setupDefaultSettings() {
        const defaultSettings = {
            apiEndpoint: 'http://localhost:8000',
            autoExtractCookies: false,
            notifyOnRequests: true,
            theme: 'light'
        };

        await chrome.storage.local.set({ settings: defaultSettings });
    }

    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.type) {
                case 'EXTRACT_COOKIES':
                    const cookies = await this.extractTwitterCookies();
                    sendResponse({ success: true, cookies });
                    break;

                case 'CHECK_TWITTER_AUTH':
                    const authStatus = await this.checkTwitterAuth();
                    sendResponse({ success: true, authenticated: authStatus });
                    break;

                case 'NOTIFY_REQUEST':
                    await this.showNotification(message.data);
                    sendResponse({ success: true });
                    break;

                case 'UPDATE_BADGE':
                    await this.updateBadge(sender.tab?.id, message.data);
                    sendResponse({ success: true });
                    break;

                case 'FRIEND_REQUEST_ACTION':
                    await this.handleFriendRequestAction(message.data);
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
            
            const twitterCookies = await chrome.cookies.getAll({ domain: '.twitter.com' });
            const xCookies = await chrome.cookies.getAll({ domain: '.x.com' });
            
            const allCookies = [...twitterCookies, ...xCookies];
            
            
            const authToken = allCookies.find(cookie => cookie.name === 'auth_token')?.value;
            const ct0 = allCookies.find(cookie => cookie.name === 'ct0')?.value;
            
            if (!authToken || !ct0) {
                throw new Error('Required Twitter authentication cookies not found');
            }

           
                .filter(cookie => cookie.value) 
                .map(cookie => `${cookie.name}=${cookie.value}`)
                .join('; ');

            return {
                auth_token: authToken,
                ct0: ct0,
                cookie: cookieString,
                extracted_at: new Date().toISOString(),
                domains: [...new Set(allCookies.map(c => c.domain))]
            };

        } catch (error) {
            console.error('Cookie extraction failed:', error);
            throw error;
        }
    }

    async checkTwitterAuth() {
        try {
            const cookies = await this.extractTwitterCookies();
            return !!(cookies.auth_token && cookies.ct0);
        } catch (error) {
            return false;
        }
    }

    async showNotification(data) {
        const notificationOptions = {
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'Twitter Feed Mirror',
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
            
          
            await chrome.storage.local.set({
                [`notification_${data.id}`]: {
                    permissionToken: data.permissionToken,
                    friendName: data.friendName,
                    timestamp: Date.now()
                }
            });
        }

        await chrome.notifications.create(data.id || 'default', notificationOptions);
    }

    async handleNotificationClick(notificationId) {
        
        try {
            await chrome.action.openPopup();
        } catch (error) {
            console.error('Failed to open popup:', error);
        }
        
       
        chrome.notifications.clear(notificationId);
    }

    async handleNotificationButtonClick(notificationId, buttonIndex) {
        try {
            
            const result = await chrome.storage.local.get(`notification_${notificationId}`);
            const requestData = result[`notification_${notificationId}`];
            
            if (!requestData) {
                console.error('No request data found for notification:', notificationId);
                return;
            }

            const approve = buttonIndex === 0; 
            
            
            const settings = await chrome.storage.local.get('settings');
            const apiEndpoint = settings.settings?.apiEndpoint || 'http://localhost:8000';
            
            const response = await fetch(`${apiEndpoint}/approve-request`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    permission_token: requestData.permissionToken,
                    approve: approve
                })
            });

            const data = await response.json();
            
            if (response.ok && data.success) {
               
                await this.showNotification({
                    id: `approval_${Date.now()}`,
                    message: `Friend request ${approve ? 'approved' : 'denied'} successfully`,
                    type: 'success'
                });
            } else {
                throw new Error(data.error || 'Failed to process friend request');
            }

        } catch (error) {
            console.error('Error handling friend request action:', error);
            await this.showNotification({
                id: `error_${Date.now()}`,
                message: `Error: ${error.message}`,
                type: 'error'
            });
        }
        
       
        chrome.notifications.clear(notificationId);
        chrome.storage.local.remove(`notification_${notificationId}`);
    }

    async handleFriendRequestAction(data) {
        
        try {
            const settings = await chrome.storage.local.get('settings');
            const apiEndpoint = settings.settings?.apiEndpoint || 'http://localhost:8000';
            
            const response = await fetch(`${apiEndpoint}/approve-request`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    permission_token: data.permissionToken,
                    approve: data.approve
                })
            });

            const result = await response.json();
            
            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Failed to process friend request');
            }

            return result;

        } catch (error) {
            console.error('Error processing friend request:', error);
            throw error;
        }
    }

    async updateBadge(tabId, data) {
        if (!tabId) return;

        try {
            if (data?.count) {
                await chrome.action.setBadgeText({
                    tabId: tabId,
                    text: String(data.count)
                });
                await chrome.action.setBadgeBackgroundColor({
                    tabId: tabId,
                    color: '#3b82f6'
                });
            } else {
                await chrome.action.setBadgeText({
                    tabId: tabId,
                    text: ''
                });
            }
        } catch (error) {
            console.error('Badge update failed:', error);
        }
    }

    isTwitterUrl(url) {
        if (!url) return false;
        return url.includes('twitter.com') || url.includes('x.com');
    }

    isTwitterCookie(cookie) {
        if (!cookie) return false;
        const twitterDomains = ['.twitter.com', '.x.com', 'twitter.com', 'x.com'];
        const importantCookies = ['auth_token', 'ct0', 'twid', 'kdt'];
        
        return twitterDomains.some(domain => cookie.domain.includes(domain)) &&
               importantCookies.includes(cookie.name);
    }

    async handleCookieChange(changeInfo) {
      
        if (changeInfo.removed) {
            console.log(`Twitter cookie removed: ${changeInfo.cookie.name}`);
        } else {
            console.log(`Twitter cookie updated: ${changeInfo.cookie.name}`);
        }

  
        try {
            await chrome.runtime.sendMessage({
                type: 'COOKIE_CHANGED',
                data: {
                    name: changeInfo.cookie.name,
                    removed: changeInfo.removed
                }
            });
        } catch (error) {
            
        }
    }
}


new BackgroundService();
