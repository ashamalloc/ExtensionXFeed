// Chrome Extension Popup JavaScript
class TwitterFeedMirror {
    constructor() {
        this.apiEndpoint = 'http://localhost:8000';
        this.validationToken = null;
        this.extractedCookies = null;
        this.friendToken = null;
        this.pendingRequests = [];
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadStoredData();
        this.setupTabs();
        this.checkPendingRequests(); // Initial check
    }

    bindEvents() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        document.getElementById('extract-cookies')?.addEventListener('click', () => this.extractCookies());
        document.getElementById('validate-cookies')?.addEventListener('click', () => this.validateCookies());
        document.getElementById('copy-token')?.addEventListener('click', () => this.copyToken());
        document.getElementById('request-access')?.addEventListener('click', () => this.requestAccess());
        document.getElementById('fetch-feed')?.addEventListener('click', () => this.fetchFeed());
        document.getElementById('refresh-feed')?.addEventListener('click', () => this.fetchFeed());
        document.getElementById('clear-storage')?.addEventListener('click', () => this.clearStorage());
        document.getElementById('api-endpoint')?.addEventListener('change', (e) => {
            this.apiEndpoint = e.target.value;
            this.saveToStorage('apiEndpoint', this.apiEndpoint);
        });
        document.getElementById('fetch-endpoint')?.addEventListener('change', (e) => {
            this.apiEndpoint = e.target.value;
            this.saveToStorage('apiEndpoint', this.apiEndpoint);
        });
    }

    setupTabs() {
        const tabs = document.querySelectorAll('.tab-btn');
        const contents = document.querySelectorAll('.tab-content');
        tabs.forEach(tab => {
            if (tab.classList.contains('active')) {
                const targetTab = tab.dataset.tab;
                contents.forEach(content => {
                    content.classList.toggle('active', content.id === `${targetTab}-tab`);
                });
            }
        });
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });
    }

    async extractCookies() {
        this.showStatus('extraction-status', 'Extracting Twitter cookies...', 'loading');
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab.url.includes('twitter.com') && !tab.url.includes('x.com')) {
                throw new Error('Please navigate to Twitter/X.com first');
            }
            const response = await chrome.runtime.sendMessage({ type: 'EXTRACT_COOKIES' });
            if (response.success) {
                this.extractedCookies = response.cookies;
                await this.saveToStorage('extractedCookies', this.extractedCookies);
                this.showStatus('extraction-status', 'Cookies extracted successfully!', 'success');
                document.getElementById('validate-cookies').disabled = false;
            } else {
                throw new Error(response.error || 'Cookie extraction failed');
            }
        } catch (error) {
            console.error('Cookie extraction error:', error);
            this.showStatus('extraction-status', `Error: ${error.message}`, 'error');
        }
    }

    async validateCookies() {
        if (!this.extractedCookies) {
            this.showStatus('validation-status', 'Please extract cookies first', 'error');
            return;
        }
        this.showStatus('validation-status', 'Validating cookies...', 'loading');
        try {
            const cleanEndpoint = this.apiEndpoint.trim().replace(/\/$/, '');
            const response = await fetch(`${cleanEndpoint}/validate-cookies`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.extractedCookies)
            });
            const data = await response.json();
            console.log('Validation response:', data); // Debug
            if (response.ok && data.valid) {
                this.validationToken = data.validation_token;
                await this.saveToStorage('validationToken', this.validationToken);
                this.displayToken(data);
                this.startPollingForRequests();
            } else {
                throw new Error(data.error || 'Cookie validation failed');
            }
        } catch (error) {
            console.error('Validation error:', error);
            let errorMessage = 'Cannot connect to server';
            if (error.message.includes('Failed to fetch')) {
                errorMessage = `Server not reachable at ${this.apiEndpoint}. Check if it’s running at http://127.0.0.1:8000`;
            } else if (error.message.includes('CORS')) {
                errorMessage = 'CORS issue detected. Ensure backend allows this extension.';
            } else {
                errorMessage = `Validation failed: ${error.message}`;
            }
            this.showStatus('validation-status', errorMessage, 'error');
        }
    }

    displayToken(data) {
        const tokenDisplay = document.getElementById('token-display');
        const tokenValue = document.getElementById('validation-token');
        tokenValue.textContent = data.validation_token;
        tokenDisplay.classList.remove('hidden');
        const statusEl = document.getElementById('validation-status');
        statusEl.innerHTML = `
            <div class="status success">
                Token generated: ${data.validation_token}<br>
                ${data.user ? `Authenticated as: <strong>${data.user.name}</strong> (@${data.user.screen_name})<br>Expires: ${new Date(data.expires_at).toLocaleString()}` : 'No user info available'}
            </div>
        `;
    }

    async copyToken() {
        if (this.validationToken) {
            await navigator.clipboard.writeText(this.validationToken);
            const btn = document.getElementById('copy-token');
            const originalText = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(() => { btn.textContent = originalText; }, 2000);
        }
    }

    async startPollingForRequests() {
        setInterval(() => this.checkPendingRequests(), 10000);
        this.checkPendingRequests();
    }

    async checkPendingRequests() {
        try {
            const cleanEndpoint = this.apiEndpoint.trim().replace(/\/$/, '');
            const response = await fetch(`${cleanEndpoint}/health`, {
                method: 'GET'
            });
            const data = await response.json();
            if (response.ok) {
                chrome.runtime.sendMessage({ type: 'CHECK_TWITTER_AUTH' });
                const requestsList = document.getElementById('pending-requests');
                requestsList.innerHTML = this.pendingRequests.map(req => `
                    <div class="request-item">
                        <span class="request-info">Request from ${req.friendName}</span>
                        <div class="request-actions">
                            <button class="btn btn-small btn-primary" onclick="this.parentNode.parentNode.remove();window.TwitterFeedMirror.approveRequest('${req.token}', true)">Approve</button>
                            <button class="btn btn-small btn-danger" onclick="this.parentNode.parentNode.remove();window.TwitterFeedMirror.approveRequest('${req.token}', false)">Deny</button>
                        </div>
                    </div>
                `).join('');
                requestsList.classList.toggle('hidden', !this.pendingRequests.length);
            }
        } catch (error) {
            console.error('Pending requests check failed:', error);
        }
    }

    approveRequest(friendToken, approve) {
        fetch(`${this.apiEndpoint.trim().replace(/\/$/, '')}/approve-friend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ friend_validation_token: friendToken, approve })
        }).then(response => response.json()).then(data => {
            if (data.success) {
                this.pendingRequests = this.pendingRequests.filter(req => req.token !== friendToken);
                this.checkPendingRequests();
            }
        }).catch(error => console.error('Approve request failed:', error));
    }

    async requestAccess() {
        const friendToken = document.getElementById('friend-token').value.trim();
        if (!friendToken) {
            this.showStatus('request-status', 'Please enter your friend\'s validation token', 'error');
            return;
        }
        this.showStatus('request-status', 'Requesting access...', 'loading');
        try {
            const cleanEndpoint = this.apiEndpoint.trim().replace(/\/$/, '');
            const response = await fetch(`${cleanEndpoint}/request-friend-feed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ friend_validation_token: friendToken })
            });
            const data = await response.json();
            if (response.ok && data.success) {
                this.showStatus('request-status', 'Access requested! Awaiting approval...', 'info');
                this.friendToken = friendToken;
                await this.saveToStorage('friendToken', friendToken);
                document.getElementById('fetch-feed').disabled = false;
                // Notify friend (simulated via background)
                chrome.runtime.sendMessage({ type: 'NOTIFY_REQUEST', data: { friendName: 'Friend', message: 'New access request' } });
            } else {
                throw new Error(data.error || 'Access request failed');
            }
        } catch (error) {
            console.error('Access request error:', error);
            this.showStatus('request-status', `Error: ${error.message}`, 'error');
        }
    }

    async fetchFeed() {
        const friendToken = document.getElementById('friend-token').value.trim();
        const limit = parseInt(document.getElementById('tweet-limit').value);
        if (!friendToken) {
            this.showStatus('feed-status', 'Please enter your friend\'s validation token', 'error');
            return;
        }
        this.showStatus('feed-status', 'Fetching friend\'s feed...', 'loading');
        try {
            const cleanEndpoint = this.apiEndpoint.trim().replace(/\/$/, '');
            const response = await fetch(`${cleanEndpoint}/home-feed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ friend_validation_token: friendToken, limit: limit })
            });
            const data = await response.json();
            console.log('Feed response:', data); // Debug
            if (response.ok && data.success) {
                this.displayFeed(data);
                this.showStatus('feed-status', `Loaded ${data.count} tweets`, 'success');
                document.getElementById('refresh-feed').classList.remove('hidden');
            } else {
                throw new Error(data.error || 'Failed to fetch feed');
            }
        } catch (error) {
            console.error('Feed fetch error:', error);
            this.showStatus('feed-status', `Error: ${error.message}`, 'error');
        }
    }

    displayFeed(data) {
        const container = document.getElementById('feed-container');
        const header = document.getElementById('feed-header');
        const tweetsList = document.getElementById('tweets-list');
        header.innerHTML = `
            <div>
                <strong>${data.authenticated_user.name}</strong>'s Twitter Feed
                <span style="color: #6b7280; font-weight: normal;">
                    • ${data.count} tweets • Updated ${new Date(data.timestamp).toLocaleString()}
                </span>
            </div>
        `;
        tweetsList.innerHTML = data.tweets.map(tweet => this.renderTweet(tweet)).join('');
        container.classList.remove('hidden');
    }

    renderTweet(tweet) {
        const createdAt = new Date(tweet.created_at);
        const timeAgo = this.getTimeAgo(createdAt);
        return `
            <div class="tweet">
                <div class="tweet-header">
                    <span class="tweet-user">${this.escapeHtml(tweet.user.name)}</span>
                    <span class="tweet-handle">@${this.escapeHtml(tweet.user.screen_name)}</span>
                    <span class="tweet-date">${timeAgo}</span>
                </div>
                <div class="tweet-text">${this.escapeHtml(tweet.text)}</div>
                <div class="tweet-stats">
                    <div class="tweet-stat"><span>🔄</span><span>${tweet.retweet_count}</span></div>
                    <div class="tweet-stat"><span>❤️</span><span>${tweet.favorite_count}</span></div>
                </div>
            </div>
        `;
    }

    getTimeAgo(date) {
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);
        if (diffInSeconds < 60) return `${diffInSeconds}s`;
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h`;
        return `${Math.floor(diffInSeconds / 86400)}d`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showStatus(elementId, message, type) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = message;
            element.className = `status ${type}`;
            element.classList.remove('hidden');
        }
    }

    async saveToStorage(key, value) {
        await chrome.storage.local.set({ [key]: value });
    }

    async loadFromStorage(key) {
        const result = await chrome.storage.local.get(key);
        return result[key];
    }

    async loadStoredData() {
        this.apiEndpoint = await this.loadFromStorage('apiEndpoint') || 'http://localhost:8000';
        this.validationToken = await this.loadFromStorage('validationToken');
        this.extractedCookies = await this.loadFromStorage('extractedCookies');
        this.friendToken = await this.loadFromStorage('friendToken');
        document.getElementById('api-endpoint').value = this.apiEndpoint;
        document.getElementById('fetch-endpoint').value = this.apiEndpoint;
        if (this.friendToken) document.getElementById('friend-token').value = this.friendToken;
        if (this.extractedCookies) {
            document.getElementById('validate-cookies').disabled = false;
            this.showStatus('extraction-status', 'Cookies already extracted', 'success');
        }
        if (this.validationToken) {
            document.getElementById('validation-token').textContent = this.validationToken;
            document.getElementById('token-display').classList.remove('hidden');
        }
    }

    async clearStorage() {
        if (confirm('Are you sure you want to clear all stored data?')) {
            await chrome.storage.local.clear();
            location.reload();
        }
    }
}

window.TwitterFeedMirror = new TwitterFeedMirror();
document.addEventListener('DOMContentLoaded', () => {
    // Ensure global access for inline event handlers
});