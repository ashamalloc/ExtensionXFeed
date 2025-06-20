// Content script for Twitter pages
class TwitterContentScript {
    constructor() {
        this.init();
    }

    init() {
        // Add indicator that extension is active
        this.addExtensionIndicator();
        
        // Listen for messages from popup
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            this.handleMessage(request, sender, sendResponse);
            return true; // Keep message channel open for async responses
        });
        
        console.log('Twitter Feed Extension: Content script loaded');
    }

    addExtensionIndicator() {
        // Add a small indicator to show extension is active
        const indicator = document.createElement('div');
        indicator.id = 'twitter-extension-indicator';
        indicator.innerHTML = '🐦 Extension Active';
        indicator.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: #1da1f2;
            color: white;
            padding: 5px 10px;
            border-radius: 15px;
            font-size: 12px;
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            opacity: 0.8;
            pointer-events: none;
        `;
        
        document.body.appendChild(indicator);
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            indicator.style.opacity = '0';
            setTimeout(() => indicator.remove(), 300);
        }, 3000);
    }

    async handleMessage(request, sender, sendResponse) {
        try {
            switch (request.action) {
                case 'getCookies':
                    const cookies = await this.extractCookies();
                    sendResponse({ success: true, cookies });
                    break;
                    
                case 'injectTweets':
                    this.injectTweets(request.tweets);
                    sendResponse({ success: true });
                    break;
                    
                case 'highlightTweets':
                    this.highlightTweets(request.query);
                    sendResponse({ success: true });
                    break;
                    
                default:
                    sendResponse({ success: false, error: 'Unknown action' });
            }
        } catch (error) {
            console.error('Content script error:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    async extractCookies() {
        // This method helps extract cookies from the current page
        // The actual cookie extraction is done via the chrome.cookies API in popup.js
        return {
            domain: window.location.hostname,
            url: window.location.href,
            timestamp: Date.now()
        };
    }

    injectTweets(tweets) {
        // Create a tweets display panel on the Twitter page
        const existingPanel = document.getElementById('extension-tweets-panel');
        if (existingPanel) {
            existingPanel.remove();
        }

        const panel = document.createElement('div');
        panel.id = 'extension-tweets-panel';
        panel.style.cssText = `
            position: fixed;
            top: 60px;
            right: 20px;
            width: 350px;
            max-height: 500px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
            z-index: 10000;
            overflow-y: auto;
            border: 1px solid #e1e5e9;
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            padding: 15px;
            border-bottom: 1px solid #e1e5e9;
            background: #f8f9fa;
            border-radius: 12px 12px 0 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
        header.innerHTML = `
            <h3 style="margin: 0; color: #333; font-size: 16px;">Extension Results</h3>
            <button id="close-panel" style="background: none; border: none; font-size: 18px; cursor: pointer; color: #666;">×</button>
        `;

        const content = document.createElement('div');
        content.style.padding = '15px';

        tweets.forEach(tweet => {
            const tweetEl = this.createTweetElement(tweet);
            content.appendChild(tweetEl);
        });

        panel.appendChild(header);
        panel.appendChild(content);
        document.body.appendChild(panel);

        // Close button functionality
        document.getElementById('close-panel').addEventListener('click', () => {
            panel.remove();
        });

        // Auto-close after 30 seconds
        setTimeout(() => {
            if (document.getElementById('extension-tweets-panel')) {
                panel.remove();
            }
        }, 30000);
    }

    createTweetElement(tweet) {
        const div = document.createElement('div');
        div.style.cssText = `
            border-bottom: 1px solid #e1e5e9;
            padding: 12px 0;
            cursor: pointer;
        `;
        div.innerHTML = `
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <strong style="color: #333; margin-right: 5px;">${this.escapeHtml(tweet.user.name)}</strong>
                <span style="color: #666; font-size: 14px;">@${this.escapeHtml(tweet.user.screen_name)}</span>
            </div>
            <div style="color: #333; line-height: 1.4; margin-bottom: 8px;">${this.escapeHtml(tweet.text)}</div>
            <div style="display: flex; justify-content: space-between; font-size: 12px; color: #666;">
                <span>♥ ${tweet.favorite_count} 🔄 ${tweet.retweet_count}</span>
                <span>${new Date(tweet.created_at).toLocaleDateString()}</span>
            </div>
        `;

        // Click to open tweet
        if (tweet.url) {
            div.addEventListener('click', () => {
                window.open(tweet.url, '_blank');
            });
        }

        return div;
    }

    highlightTweets(query) {
        // Highlight tweets on the current page that match the search query
        const tweets = document.querySelectorAll('[data-testid="tweet"]');
        const queryLower = query.toLowerCase();

        tweets.forEach(tweet => {
            const text = tweet.textContent.toLowerCase();
            if (text.includes(queryLower)) {
                tweet.style.border = '2px solid #1da1f2';
                tweet.style.borderRadius = '8px';
                tweet.style.backgroundColor = '#f0f8ff';
                
                // Remove highlight after 5 seconds
                setTimeout(() => {
                    tweet.style.border = '';
                    tweet.style.borderRadius = '';
                    tweet.style.backgroundColor = '';
                }, 5000);
            }
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize content script
new TwitterContentScript();