class TwitterExtension {
    constructor() {
        this.apiUrl = 'http://localhost:8000';
        this.isAuthenticated = false;
        this.init();
    }

    init() {
        this.loadSavedData();
        this.bindEvents();
        this.checkAuthStatus();
    }

    bindEvents() {
        // Auth buttons
        document.getElementById('testAuth').addEventListener('click', () => this.testAuthentication());
        document.getElementById('extractCookies').addEventListener('click', () => this.extractCookies());
        
        // Search button
        document.getElementById('searchTweets').addEventListener('click', () => this.searchTweets());
        
        // Auto-save inputs
        ['authToken', 'ct0Token', 'cookieString'].forEach(id => {
            document.getElementById(id).addEventListener('input', () => this.saveData());
        });
    }

    async loadSavedData() {
        try {
            const data = await chrome.storage.local.get(['authToken', 'ct0Token', 'cookieString']);
            if (data.authToken) document.getElementById('authToken').value = data.authToken;
            if (data.ct0Token) document.getElementById('ct0Token').value = data.ct0Token;
            if (data.cookieString) document.getElementById('cookieString').value = data.cookieString;
        } catch (error) {
            console.error('Error loading saved data:', error);
        }
    }

    async saveData() {
        try {
            await chrome.storage.local.set({
                authToken: document.getElementById('authToken').value,
                ct0Token: document.getElementById('ct0Token').value,
                cookieString: document.getElementById('cookieString').value
            });
        } catch (error) {
            console.error('Error saving data:', error);
        }
    }

    showStatus(message, type = 'loading') {
        const status = document.getElementById('status');
        status.className = `status ${type} show`;
        status.innerHTML = type === 'loading' ? 
            `<span class="loading-spinner"></span>${message}` : message;
        
        if (type !== 'loading') {
            setTimeout(() => {
                status.classList.remove('show');
            }, 3000);
        }
    }

    getTokens() {
        return {
            auth_token: document.getElementById('authToken').value.trim(),
            ct0: document.getElementById('ct0Token').value.trim(),
            cookie: document.getElementById('cookieString').value.trim()
        };
    }

    validateTokens(tokens) {
        if (!tokens.auth_token || !tokens.ct0) {
            throw new Error('Auth token and CT0 token are required');
        }
        if (tokens.auth_token.length < 10 || tokens.ct0.length < 10) {
            throw new Error('Tokens seem too short. Please check your input.');
        }
    }

    async testAuthentication() {
        try {
            const tokens = this.getTokens();
            this.validateTokens(tokens);
            
            this.showStatus('Testing authentication...', 'loading');
            
            const response = await fetch(`${this.apiUrl}/simple-auth-test`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(tokens)
            });

            const data = await response.json();
            
            if (data.success) {
                this.isAuthenticated = true;
                document.getElementById('searchTweets').disabled = false;
                this.showStatus(`✅ Authenticated as ${data.user.name} (@${data.user.screen_name})`, 'success');
            } else {
                this.isAuthenticated = false;
                this.showStatus(`❌ Authentication failed: ${data.error}`, 'error');
            }
        } catch (error) {
            this.isAuthenticated = false;
            this.showStatus(`❌ Error: ${error.message}`, 'error');
        }
    }

    async extractCookies() {
        try {
            this.showStatus('Extracting cookies from Twitter...', 'loading');
            
            // Get current tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab.url.includes('twitter.com') && !tab.url.includes('x.com')) {
                throw new Error('Please navigate to Twitter/X first');
            }

            // Extract cookies from the current Twitter tab
            const cookies = await chrome.cookies.getAll({ domain: '.twitter.com' });
            const xCookies = await chrome.cookies.getAll({ domain: '.x.com' });
            
            const allCookies = [...cookies, ...xCookies];
            
            const authToken = allCookies.find(c => c.name === 'auth_token')?.value;
            const ct0 = allCookies.find(c => c.name === 'ct0')?.value;
            
            if (!authToken || !ct0) {
                throw new Error('Could not find required cookies. Make sure you are logged in to Twitter.');
            }

            // Build cookie string
            const cookieString = allCookies.map(c => `${c.name}=${c.value}`).join('; ');
            
            // Fill the form
            document.getElementById('authToken').value = authToken;
            document.getElementById('ct0Token').value = ct0;
            document.getElementById('cookieString').value = cookieString;
            
            await this.saveData();
            this.showStatus('✅ Cookies extracted successfully!', 'success');
            
            // Auto-test authentication
            setTimeout(() => this.testAuthentication(), 1000);
            
        } catch (error) {
            this.showStatus(`❌ Error extracting cookies: ${error.message}`, 'error');
        }
    }

    async searchTweets() {
        try {
            if (!this.isAuthenticated) {
                throw new Error('Please authenticate first');
            }

            const tokens = this.getTokens();
            const query = document.getElementById('searchQuery').value.trim() || 'twitter';
            const tweetType = document.getElementById('tweetType').value;
            const limit = parseInt(document.getElementById('tweetLimit').value) || 10;

            this.showStatus(`Searching for "${query}"...`, 'loading');

            const response = await fetch(`${this.apiUrl}/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tokens,
                    query,
                    tweet_type: tweetType,
                    limit
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || 'Search failed');
            }

            if (data.success) {
                this.displayTweets(data.tweets);
                this.showStatus(`✅ Found ${data.count} tweets`, 'success');
            } else {
                throw new Error('Search returned no results');
            }

        } catch (error) {
            this.showStatus(`❌ Search error: ${error.message}`, 'error');
        }
    }

    displayTweets(tweets) {
        const results = document.getElementById('results');
        
        if (!tweets || tweets.length === 0) {
            results.innerHTML = '<div class="no-results">No tweets found</div>';
            return;
        }

        const fragment = document.createDocumentFragment();
        
        tweets.forEach(tweet => {
            const tweetEl = this.createTweetElement(tweet);
            fragment.appendChild(tweetEl);
        });

        results.innerHTML = '';
        results.appendChild(fragment);
    }

    createTweetElement(tweet) {
        const div = document.createElement('div');
        div.className = 'tweet';
        
        const date = new Date(tweet.created_at).toLocaleDateString();
        
        div.innerHTML = `
            <div class="tweet-user">
                <span class="tweet-user-name">${this.escapeHtml(tweet.user.name)}</span>
                <span class="tweet-user-handle">@${this.escapeHtml(tweet.user.screen_name)}</span>
            </div>
            <div class="tweet-text">${this.escapeHtml(tweet.text)}</div>
            <div class="tweet-meta">
                <div class="tweet-stats">
                    <span>♥ ${tweet.favorite_count}</span>
                    <span>🔄 ${tweet.retweet_count}</span>
                </div>
                <div class="tweet-date">${date}</div>
            </div>
        `;

        // Add click handler to open tweet
        if (tweet.url) {
            div.style.cursor = 'pointer';
            div.addEventListener('click', () => {
                chrome.tabs.create({ url: tweet.url });
            });
        }

        return div;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async checkAuthStatus() {
        const tokens = this.getTokens();
        if (tokens.auth_token && tokens.ct0) {
            // Auto-test if tokens are present
            setTimeout(() => this.testAuthentication(), 500);
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new TwitterExtension();
});