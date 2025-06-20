// Twitter Feed Content Script
// This script runs on web pages and handles displaying Twitter feeds

class TwitterFeedInjector {
    constructor() {
        this.API_BASE_URL = 'http://localhost:8000';
        this.isInjected = false;
        this.feedContainer = null;
        this.currentValidationToken = null;
        this.isLoading = false;
        this.feedData = null;
        
        this.init();
    }

    init() {
        // Listen for messages from popup
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            this.handleMessage(request, sender, sendResponse);
            return true; // Keep message channel open for async responses
        });

        // Check if we should auto-inject on page load
        this.checkAutoInject();
    }

    async handleMessage(request, sender, sendResponse) {
        try {
            switch (request.action) {
                case 'INJECT_FEED':
                    await this.injectFeed(request.data);
                    sendResponse({ success: true });
                    break;
                
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
                
                case 'TOGGLE_FEED':
                    this.toggleFeed();
                    sendResponse({ success: true });
                    break;
                
                case 'REMOVE_FEED':
                    this.removeFeed();
                    sendResponse({ success: true });
                    break;
                
                case 'CHECK_INJECTION_STATUS':
                    sendResponse({ isInjected: this.isInjected });
                    break;
                
                default:
                    sendResponse({ error: 'Unknown action' });
            }
        } catch (error) {
            console.error('Content script error:', error);
            sendResponse({ error: error.message });
        }
    }

    async validateCookies(tokens) {
        try {
            const response = await fetch(`${this.API_BASE_URL}/validate-cookies`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(tokens)
            });

            const result = await response.json();
            
            if (result.valid) {
                this.currentValidationToken = result.validation_token;
                // Store validation token for future use
                chrome.storage.local.set({ 
                    validationToken: result.validation_token,
                    validationExpires: result.expires_at,
                    userInfo: result.user
                });
            }
            
            return result;
        } catch (error) {
            console.error('Cookie validation error:', error);
            return { valid: false, error: error.message };
        }
    }

    async getHomeFeed(data) {
        try {
            if (!this.currentValidationToken) {
                // Try to get validation token from storage
                const stored = await chrome.storage.local.get(['validationToken', 'validationExpires']);
                if (stored.validationToken && new Date(stored.validationExpires) > new Date()) {
                    this.currentValidationToken = stored.validationToken;
                } else {
                    throw new Error('No valid authentication token. Please validate cookies first.');
                }
            }

            const requestData = {
                tokens: data.tokens,
                limit: data.limit || 20,
                validation_token: this.currentValidationToken
            };

            const response = await fetch(`${this.API_BASE_URL}/home-feed`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestData)
            });

            const result = await response.json();
            
            if (result.success) {
                this.feedData = result;
            }
            
            return result;
        } catch (error) {
            console.error('Home feed error:', error);
            return { success: false, error: error.message };
        }
    }

    async searchTweets(data) {
        try {
            const response = await fetch(`${this.API_BASE_URL}/search`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();
            
            if (result.success) {
                this.feedData = result;
            }
            
            return result;
        } catch (error) {
            console.error('Search error:', error);
            return { success: false, error: error.message };
        }
    }

    async injectFeed(feedData) {
        if (this.isInjected) {
            this.updateFeedContent(feedData);
            return;
        }

        this.createFeedContainer();
        this.updateFeedContent(feedData);
        this.isInjected = true;
        
        // Notify popup about injection status
        chrome.runtime.sendMessage({ 
            action: 'FEED_INJECTED', 
            data: { isInjected: true } 
        });
    }

    createFeedContainer() {
        // Remove existing container if it exists
        if (this.feedContainer) {
            this.feedContainer.remove();
        }

        // Create main container
        this.feedContainer = document.createElement('div');
        this.feedContainer.id = 'twitter-feed-extension';
        this.feedContainer.innerHTML = `
            <div class="twitter-feed-header">
                <h3>Twitter Feed</h3>
                <div class="twitter-feed-controls">
                    <button id="twitter-feed-refresh" title="Refresh Feed">🔄</button>
                    <button id="twitter-feed-minimize" title="Minimize">−</button>
                    <button id="twitter-feed-close" title="Close">×</button>
                </div>
            </div>
            <div class="twitter-feed-content">
                <div class="twitter-feed-loading">Loading tweets...</div>
            </div>
        `;

        // Add styles
        this.injectStyles();

        // Add event listeners
        this.addEventListeners();

        // Inject into page
        document.body.appendChild(this.feedContainer);
        
        // Make it draggable
        this.makeDraggable();
    }

    injectStyles() {
        if (document.getElementById('twitter-feed-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'twitter-feed-styles';
        styles.textContent = `
            #twitter-feed-extension {
                position: fixed;
                top: 20px;
                right: 20px;
                width: 350px;
                max-height: 80vh;
                background: #ffffff;
                border: 1px solid #e1e8ed;
                border-radius: 16px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                z-index: 10000;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                overflow: hidden;
                resize: both;
                min-width: 300px;
                min-height: 200px;
            }

            .twitter-feed-header {
                background: #1da1f2;
                color: white;
                padding: 12px 16px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: move;
                user-select: none;
            }

            .twitter-feed-header h3 {
                margin: 0;
                font-size: 16px;
                font-weight: 700;
            }

            .twitter-feed-controls {
                display: flex;
                gap: 4px;
            }

            .twitter-feed-controls button {
                background: rgba(255,255,255,0.2);
                border: none;
                color: white;
                width: 24px;
                height: 24px;
                border-radius: 50%;
                cursor: pointer;
                font-size: 14px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background-color 0.2s;
            }

            .twitter-feed-controls button:hover {
                background: rgba(255,255,255,0.3);
            }

            .twitter-feed-content {
                max-height: calc(80vh - 60px);
                overflow-y: auto;
                padding: 0;
            }

            .twitter-feed-loading {
                padding: 20px;
                text-align: center;
                color: #657786;
            }

            .twitter-tweet {
                border-bottom: 1px solid #e1e8ed;
                padding: 12px 16px;
                transition: background-color 0.2s;
            }

            .twitter-tweet:hover {
                background-color: #f7f9fa;
            }

            .twitter-tweet:last-child {
                border-bottom: none;
            }

            .tweet-user {
                display: flex;
                align-items: center;
                margin-bottom: 8px;
            }

            .tweet-user-name {
                font-weight: 700;
                color: #14171a;
                margin-right: 4px;
            }

            .tweet-user-handle {
                color: #657786;
                font-size: 14px;
            }

            .tweet-text {
                color: #14171a;
                line-height: 1.4;
                margin-bottom: 8px;
                word-wrap: break-word;
            }

            .tweet-meta {
                display: flex;
                justify-content: space-between;
                align-items: center;
                color: #657786;
                font-size: 12px;
            }

            .tweet-stats {
                display: flex;
                gap: 16px;
            }

            .tweet-stat {
                display: flex;
                align-items: center;
                gap: 4px;
            }

            .tweet-date {
                color: #657786;
            }

            .tweet-url {
                color: #1da1f2;
                text-decoration: none;
                font-size: 12px;
            }

            .tweet-url:hover {
                text-decoration: underline;
            }

            .twitter-feed-error {
                padding: 20px;
                text-align: center;
                color: #e0245e;
                background: #ffeef0;
                margin: 10px;
                border-radius: 8px;
            }

            .twitter-feed-empty {
                padding: 20px;
                text-align: center;
                color: #657786;
            }

            #twitter-feed-extension.minimized .twitter-feed-content {
                display: none;
            }

            #twitter-feed-extension.minimized {
                height: auto;
            }

            /* Scrollbar styling */
            .twitter-feed-content::-webkit-scrollbar {
                width: 6px;
            }

            .twitter-feed-content::-webkit-scrollbar-track {
                background: #f1f1f1;
            }

            .twitter-feed-content::-webkit-scrollbar-thumb {
                background: #c1c1c1;
                border-radius: 3px;
            }

            .twitter-feed-content::-webkit-scrollbar-thumb:hover {
                background: #a8a8a8;
            }
        `;

        document.head.appendChild(styles);
    }

    addEventListeners() {
        // Close button
        const closeBtn = this.feedContainer.querySelector('#twitter-feed-close');
        closeBtn.addEventListener('click', () => this.removeFeed());

        // Minimize button
        const minimizeBtn = this.feedContainer.querySelector('#twitter-feed-minimize');
        minimizeBtn.addEventListener('click', () => this.toggleMinimize());

        // Refresh button
        const refreshBtn = this.feedContainer.querySelector('#twitter-feed-refresh');
        refreshBtn.addEventListener('click', () => this.refreshFeed());
    }

    makeDraggable() {
        const header = this.feedContainer.querySelector('.twitter-feed-header');
        let isDragging = false;
        let startX, startY, startLeft, startTop;

        header.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = parseInt(document.defaultView.getComputedStyle(this.feedContainer).left, 10);
            startTop = parseInt(document.defaultView.getComputedStyle(this.feedContainer).top, 10);
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        const onMouseMove = (e) => {
            if (!isDragging) return;
            e.preventDefault();
            this.feedContainer.style.left = (startLeft + e.clientX - startX) + 'px';
            this.feedContainer.style.top = (startTop + e.clientY - startY) + 'px';
            this.feedContainer.style.right = 'auto';
        };

        const onMouseUp = () => {
            isDragging = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
    }

    updateFeedContent(feedData) {
        if (!this.feedContainer) return;

        const content = this.feedContainer.querySelector('.twitter-feed-content');
        
        if (feedData.error) {
            content.innerHTML = `
                <div class="twitter-feed-error">
                    <strong>Error:</strong> ${feedData.error}
                </div>
            `;
            return;
        }

        if (!feedData.tweets || feedData.tweets.length === 0) {
            content.innerHTML = `
                <div class="twitter-feed-empty">
                    No tweets found
                </div>
            `;
            return;
        }

        const tweetsHTML = feedData.tweets.map(tweet => `
            <div class="twitter-tweet">
                <div class="tweet-user">
                    <span class="tweet-user-name">${this.escapeHtml(tweet.user.name)}</span>
                    <span class="tweet-user-handle">@${this.escapeHtml(tweet.user.screen_name)}</span>
                </div>
                <div class="tweet-text">${this.escapeHtml(tweet.text)}</div>
                <div class="tweet-meta">
                    <div class="tweet-stats">
                        <span class="tweet-stat">
                            <span>🔄</span>
                            <span>${tweet.retweet_count}</span>
                        </span>
                        <span class="tweet-stat">
                            <span>❤️</span>
                            <span>${tweet.favorite_count}</span>
                        </span>
                    </div>
                    <div class="tweet-date">
                        ${this.formatDate(tweet.created_at)}
                        ${tweet.url ? `<a href="${tweet.url}" target="_blank" class="tweet-url">View</a>` : ''}
                    </div>
                </div>
            </div>
        `).join('');

        content.innerHTML = tweetsHTML;
    }

    toggleMinimize() {
        this.feedContainer.classList.toggle('minimized');
        const btn = this.feedContainer.querySelector('#twitter-feed-minimize');
        btn.textContent = this.feedContainer.classList.contains('minimized') ? '+' : '−';
    }

    toggleFeed() {
        if (this.feedContainer) {
            this.feedContainer.style.display = 
                this.feedContainer.style.display === 'none' ? 'block' : 'none';
        }
    }

    removeFeed() {
        if (this.feedContainer) {
            this.feedContainer.remove();
            this.feedContainer = null;
        }
        
        const styles = document.getElementById('twitter-feed-styles');
        if (styles) {
            styles.remove();
        }
        
        this.isInjected = false;
        
        // Notify popup
        chrome.runtime.sendMessage({ 
            action: 'FEED_REMOVED', 
            data: { isInjected: false } 
        });
    }

    async refreshFeed() {
        if (!this.feedData) return;
        
        const content = this.feedContainer.querySelector('.twitter-feed-content');
        content.innerHTML = '<div class="twitter-feed-loading">Refreshing...</div>';
        
        // Request refresh from popup/background
        chrome.runtime.sendMessage({ 
            action: 'REFRESH_FEED_REQUEST'
        });
    }

    async checkAutoInject() {
        // Check if auto-inject is enabled and we have valid credentials
        const settings = await chrome.storage.local.get([
            'autoInject', 
            'validationToken', 
            'validationExpires',
            'cachedTokens'
        ]);
        
        if (settings.autoInject && settings.validationToken && 
            new Date(settings.validationExpires) > new Date()) {
            
            this.currentValidationToken = settings.validationToken;
            
            if (settings.cachedTokens) {
                try {
                    const feedResult = await this.getHomeFeed({
                        tokens: settings.cachedTokens,
                        limit: 10
                    });
                    
                    if (feedResult.success) {
                        this.injectFeed(feedResult);
                    }
                } catch (error) {
                    console.error('Auto-inject failed:', error);
                }
            }
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatDate(dateString) {
        try {
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now - date;
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffDays = Math.floor(diffHours / 24);

            if (diffHours < 1) {
                const diffMins = Math.floor(diffMs / (1000 * 60));
                return `${diffMins}m`;
            } else if (diffHours < 24) {
                return `${diffHours}h`;
            } else if (diffDays < 7) {
                return `${diffDays}d`;
            } else {
                return date.toLocaleDateString();
            }
        } catch (error) {
            return 'Unknown';
        }
    }
}

// Initialize the content script
const twitterFeedInjector = new TwitterFeedInjector();

// Handle page navigation (for SPAs)
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        // Page changed, check if we should auto-inject
        setTimeout(() => {
            twitterFeedInjector.checkAutoInject();
        }, 1000);
    }
}).observe(document, { subtree: true, childList: true });

console.log('Twitter Feed Content Script loaded');