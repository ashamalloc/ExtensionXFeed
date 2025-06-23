// Chrome Extension Popup JavaScript
class TwitterFeedMirror {
    constructor() {
        this.apiEndpoint = 'http://localhost:8000';
        this.validationToken = null;
        this.extractedCookies = null;
        this.pendingRequests = [];
        this.approvedFriends = [];
        this.requestPollingInterval = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadStoredData();
        this.setupTabs();
    }

    bindEvents() {
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Allow Permission tab events
        document.getElementById('extract-cookies').addEventListener('click', () => this.extractCookies());
        document.getElementById('validate-cookies').addEventListener('click', () => this.validateCookies());
        document.getElementById('copy-token').addEventListener('click', () => this.copyToken());

        // Fetch Friend's Feed tab events
        document.getElementById('request-access').addEventListener('click', () => this.requestAccess());
        document.getElementById('fetch-feed').addEventListener('click', () => this.fetchFeed());
        document.getElementById('refresh-feed').addEventListener('click', () => this.fetchFeed());

        // Friend Requests tab events
        document.getElementById('refresh-requests').addEventListener('click', () => this.refreshPendingRequests());

        // Utility events
        document.getElementById('clear-storage').addEventListener('click', () => this.clearStorage());

        // Auto-save endpoint changes
        document.getElementById('api-endpoint').addEventListener('change', (e) => {
            this.apiEndpoint = e.target.value;
            this.saveToStorage('apiEndpoint', this.apiEndpoint);
        });

        document.getElementById('fetch-endpoint').addEventListener('change', (e) => {
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
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });

        // Load data when switching to requests tab
        if (tabName === 'requests' && this.validationToken) {
            this.refreshPendingRequests();
        }
    }

    async loadStoredData() {
        try {
            const result = await chrome.storage.local.get([
                'apiEndpoint',
                'validationToken',
                'extractedCookies',
                'friendToken'
            ]);

            if (result.apiEndpoint) {
                this.apiEndpoint = result.apiEndpoint;
                document.getElementById('api-endpoint').value = result.apiEndpoint;
                document.getElementById('fetch-endpoint').value = result.apiEndpoint;
            }

            if (result.validationToken) {
                this.validationToken = result.validationToken;
                document.getElementById('validation-token').textContent = result.validationToken;
                document.getElementById('token-display').classList.remove('hidden');
                this.startRequestPolling();
            }

            if (result.extractedCookies) {
                this.extractedCookies = result.extractedCookies;
                document.getElementById('validate-cookies').disabled = false;
            }

            if (result.friendToken) {
                document.getElementById('friend-token').value = result.friendToken;
                // Check if we have approval for this friend token
                this.checkFriendTokenStatus(result.friendToken);
            }

        } catch (error) {
            console.error('Error loading stored data:', error);
        }
    }

    async saveToStorage(key, value) {
        try {
            await chrome.storage.local.set({ [key]: value });
        } catch (error) {
            console.error('Error saving to storage:', error);
        }
    }

    async extractCookies() {
        this.showStatus('extraction-status', 'Extracting Twitter cookies...', 'loading');
        
        try {
            // Get current tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab.url.includes('twitter.com') && !tab.url.includes('x.com')) {
                throw new Error('Please navigate to Twitter/X.com first');
            }

            // Get cookies from Twitter domain
            const cookies = await chrome.cookies.getAll({ domain: '.twitter.com' });
            const xCookies = await chrome.cookies.getAll({ domain: '.x.com' });
            
            const allCookies = [...cookies, ...xCookies];
            
            // Extract required cookies
            const authToken = allCookies.find(cookie => cookie.name === 'auth_token')?.value;
            const ct0 = allCookies.find(cookie => cookie.name === 'ct0')?.value;
            
            if (!authToken || !ct0) {
                throw new Error('Required Twitter cookies not found. Please log in to Twitter first.');
            }

            // Build cookie string
            const cookieString = allCookies
                .map(cookie => `${cookie.name}=${cookie.value}`)
                .join('; ');

            this.extractedCookies = {
                auth_token: authToken,
                ct0: ct0,
                cookie: cookieString
            };

            await this.saveToStorage('extractedCookies', this.extractedCookies);
            
            this.showStatus('extraction-status', 'Cookies extracted successfully!', 'success');
            document.getElementById('validate-cookies').disabled = false;

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
        console.log('API Endpoint:', this.apiEndpoint);
        console.log('Extracted cookies:', this.extractedCookies);

        try {
            // Clean up the API endpoint URL
            const cleanEndpoint = this.apiEndpoint.trim().replace(/\/$/, '');
            const fullUrl = `${cleanEndpoint}/validate-cookies`;
            console.log('Full URL:', fullUrl);
            
            const response = await fetch(fullUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(this.extractedCookies)
            });

            console.log('Response status:', response.status);
            console.log('Response headers:', Object.fromEntries(response.headers.entries()));

            const data = await response.json();
            console.log('Response data:', data);

            if (response.ok && data.valid) {
                this.validationToken = data.validation_token;
                await this.saveToStorage('validationToken', this.validationToken);
                
                this.showStatus('validation-status', 'Cookies validated successfully!', 'success');
                this.displayToken(data);
                this.startRequestPolling();
            } else {
                throw new Error(data.error || 'Cookie validation failed');
            }

        } catch (error) {
            console.error('Validation error:', error);
            
            // More specific error messages
            let errorMessage = 'Cannot connect to server';
            if (error.message.includes('Failed to fetch')) {
                errorMessage = `Server not reachable at ${this.apiEndpoint}. Try: http://127.0.0.1:8000 or check if your local server is running`;
            } else if (error.message.includes('CORS')) {
                errorMessage = 'Server blocked the request - CORS configuration needed';
            } else {
                errorMessage = `Connection failed: ${error.message}`;
            }
            
            this.showStatus('validation-status', errorMessage, 'error');
        }
    }

    displayToken(data) {
        const tokenDisplay = document.getElementById('token-display');
        const tokenValue = document.getElementById('validation-token');
        
        tokenValue.textContent = data.validation_token;
        tokenDisplay.classList.remove('hidden');

        // Show user info if available
        if (data.user) {
            const statusEl = document.getElementById('validation-status');
            statusEl.innerHTML = `
                <div class="status success">
                    Authenticated as: <strong>${data.user.name}</strong> (@${data.user.screen_name})
                    <br>Token expires: ${new Date(data.expires_at).toLocaleString()}
                </div>
            `;
        }
    }

    async copyToken() {
        if (this.validationToken) {
            await navigator.clipboard.writeText(this.validationToken);
            
            const btn = document.getElementById('copy-token');
            const originalText = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        }
    }

    startRequestPolling() {
        // Poll for friend requests every 10 seconds
        if (this.requestPollingInterval) {
            clearInterval(this.requestPollingInterval);
        }
        
        this.requestPollingInterval = setInterval(() => {
            this.checkPendingRequests();
        }, 10000);
        
        // Initial check
        this.checkPendingRequests();
    }

    async checkPendingRequests() {
        if (!this.validationToken) return;

        try {
            const cleanEndpoint = this.apiEndpoint.trim().replace(/\/$/, '');
            const response = await fetch(`${cleanEndpoint}/pending-requests`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    validation_token: this.validationToken
                })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.pendingRequests = data.pending_requests || [];
                    this.approvedFriends = data.approved_friends || [];
                    this.updateRequestsBadge();
                    
                    // Update UI if on requests tab
                    const requestsTab = document.getElementById('requests-tab');
                    if (requestsTab.classList.contains('active')) {
                        this.displayPendingRequests();
                        this.displayApprovedFriends();
                    }
                }
            }
        } catch (error) {
            console.error('Error checking pending requests:', error);
        }
    }

    updateRequestsBadge() {
        const requestsTab = document.querySelector('[data-tab="requests"]');
        const existingBadge = requestsTab.querySelector('.badge');
        
        if (existingBadge) {
            existingBadge.remove();
        }
        
        if (this.pendingRequests.length > 0) {
            const badge = document.createElement('span');
            badge.className = 'badge';
            badge.textContent = this.pendingRequests.length;
            requestsTab.appendChild(badge);
        }
    }

    async refreshPendingRequests() {
        if (!this.validationToken) {
            this.showStatus('requests-status', 'Please validate your cookies first', 'error');
            return;
        }

        this.showStatus('requests-status', 'Refreshing requests...', 'loading');
        
        try {
            await this.checkPendingRequests();
            this.displayPendingRequests();
            this.displayApprovedFriends();
            this.showStatus('requests-status', 'Requests updated', 'success');
            
            // Hide status after 2 seconds
            setTimeout(() => {
                document.getElementById('requests-status').classList.add('hidden');
            }, 2000);
            
        } catch (error) {
            console.error('Error refreshing requests:', error);
            this.showStatus('requests-status', `Error: ${error.message}`, 'error');
        }
    }

    displayPendingRequests() {
        const container = document.getElementById('pending-requests-list');
        
        if (this.pendingRequests.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">👥</div>
                    <div class="empty-title">No pending requests</div>
                    <div class="empty-text">Friend requests will appear here when someone wants to access your feed</div>
                </div>
            `;
            return;
        }

        container.innerHTML = this.pendingRequests.map(request => `
            <div class="request-item" data-permission-token="${request.permission_token}">
                <div class="request-info">
                    <div class="request-title">Friend Request</div>
                    <div class="request-details">
                        Requested: ${new Date(request.timestamp).toLocaleString()}
                        <br>Expires: ${new Date(request.expires_at).toLocaleString()}
                    </div>
                </div>
                <div class="request-actions">
                    <button class="btn btn-danger btn-small deny-request" data-token="${request.permission_token}">
                        Deny
                    </button>
                    <button class="btn btn-success btn-small approve-request" data-token="${request.permission_token}">
                        Approve
                    </button>
                </div>
            </div>
        `).join('');

        // Add event listeners to action buttons
        container.querySelectorAll('.approve-request').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const token = e.target.getAttribute('data-token');
                this.handleFriendRequestAction(token, true, e.target);
            });
        });

        container.querySelectorAll('.deny-request').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const token = e.target.getAttribute('data-token');
                this.handleFriendRequestAction(token, false, e.target);
            });
        });
    }

    displayApprovedFriends() {
        const container = document.getElementById('approved-friends-list');
        
        if (this.approvedFriends.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">✅</div>
                    <div class="empty-title">No approved friends</div>
                    <div class="empty-text">Approved friends will appear here</div>
                </div>
            `;
            return;
        }

        container.innerHTML = this.approvedFriends.map(friend => `
            <div class="request-item">
                <div class="request-info">
                    <div class="request-title">Approved Friend</div>
                    <div class="request-details">
                        Approved: ${new Date(friend.approved_at).toLocaleString()}
                        <br>Expires: ${new Date(friend.expires_at).toLocaleString()}
                    </div>
                </div>
                <div class="request-actions">
                    <button class="btn btn-danger btn-small revoke-access" data-token="${friend.permission_token}">
                        Revoke
                    </button>
                </div>
            </div>
        `).join('');

        // Add event listeners to revoke buttons
        container.querySelectorAll('.revoke-access').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const token = e.target.getAttribute('data-token');
                this.handleFriendRequestAction(token, false, e.target);
            });
        });
    }

    async handleFriendRequestAction(permissionToken, approve, buttonElement) {
        // Add processing state to button
        buttonElement.classList.add('processing');
        buttonElement.disabled = true;
        const originalText = buttonElement.textContent;

        try {
            const cleanEndpoint = this.apiEndpoint.trim().replace(/\/$/, '');
            const response = await fetch(`${cleanEndpoint}/approve-request`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    permission_token: permissionToken,
                    approve: approve
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Remove the request item from the list
                const requestItem = buttonElement.closest('.request-item');
                if (requestItem) {
                    requestItem.style.opacity = '0.5';
                    requestItem.style.transform = 'translateX(-100%)';
                    setTimeout(() => {
                        requestItem.remove();
                    }, 300);
                }

                // Update local arrays
                this.pendingRequests = this.pendingRequests.filter(
                    req => req.permission_token !== permissionToken
                );

                if (approve) {
                    // Add to approved friends (this would need the friend data from API)
                    this.approvedFriends.push({
                        permission_token: permissionToken,
                        approved_at: new Date().toISOString(),
                        expires_at: data.expires_at || new Date(Date.now() + 24*60*60*1000).toISOString()
                    });
                }

                this.updateRequestsBadge();
                
                // Show success message
                this.showStatus('requests-status', 
                    `Friend request ${approve ? 'approved' : 'denied'} successfully`, 
                    'success'
                );

                // Refresh the displays
                setTimeout(() => {
                    this.displayPendingRequests();
                    this.displayApprovedFriends();
                }, 300);

            } else {
                throw new Error(data.error || 'Failed to process friend request');
            }

        } catch (error) {
            console.error('Error processing friend request:', error);
            this.showStatus('requests-status', `Error: ${error.message}`, 'error');
            
            // Restore button state
            buttonElement.classList.remove('processing');
            buttonElement.disabled = false;
        }

        // Hide status after 3 seconds
        setTimeout(() => {
            document.getElementById('requests-status').classList.add('hidden');
        }, 3000);
    }

    async requestAccess() {
        const friendToken = document.getElementById('friend-token').value.trim();
        
        if (!friendToken) {
            this.showStatus('request-status', 'Please enter your friend\'s validation token', 'error');
            return;
        }

        // First check if we already have approved access
        this.showStatus('request-status', 'Checking access status...', 'loading');
        
        try {
            const cleanEndpoint = this.apiEndpoint.trim().replace(/\/$/, '');
            
            // Check if we already have permission by trying to fetch feed
            const testResponse = await fetch(`${cleanEndpoint}/home-feed`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    friend_validation_token: friendToken,
                    limit: 1
                })
            });

            if (testResponse.ok) {
                // We already have access!
                this.showStatus('request-status', 'Access already approved! You can fetch the feed.', 'success');
                await this.saveToStorage('friendToken', friendToken);
                document.getElementById('fetch-feed').disabled = false;
                return;
            }

            // If we don't have access, request it
            this.showStatus('request-status', 'Requesting access...', 'loading');
            
            const response = await fetch(`${cleanEndpoint}/request-friend-feed`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    friend_validation_token: friendToken
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                this.showStatus('request-status', 'Access requested! Waiting for friend approval...', 'info');
                await this.saveToStorage('friendToken', friendToken);
                
                // Start polling to check for approval
                this.startApprovalPolling(friendToken);
            } else {
                throw new Error(data.error || 'Access request failed');
            }

        } catch (error) {
            console.error('Access request error:', error);
            this.showStatus('request-status', `Error: ${error.message}`, 'error');
        }
    }

    startApprovalPolling(friendToken) {
        // Poll every 3 seconds to check if the friend has approved the request
        const pollInterval = setInterval(async () => {
            try {
                const cleanEndpoint = this.apiEndpoint.trim().replace(/\/$/, '');
                
                // Test if we have access now
                const testResponse = await fetch(`${cleanEndpoint}/home-feed`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        friend_validation_token: friendToken,
                        limit: 1
                    })
                });

                if (testResponse.ok) {
                    // Access approved!
                    clearInterval(pollInterval);
                    this.showStatus('request-status', 'Access approved! You can now fetch the feed.', 'success');
                    document.getElementById('fetch-feed').disabled = false;
                }
            } catch (error) {
                // Continue polling on error
                console.log('Polling for approval...', error.message);
            }
        }, 3000);

        // Stop polling after 5 minutes
        setTimeout(() => {
            clearInterval(pollInterval);
        }, 300000);
    }

    async checkFriendTokenStatus(friendToken) {
        try {
            const cleanEndpoint = this.apiEndpoint.trim().replace(/\/$/, '');
            
            // Test if we have access to this friend's feed
            const testResponse = await fetch(`${cleanEndpoint}/home-feed`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    friend_validation_token: friendToken,
                    limit: 1
                })
            });

            if (testResponse.ok) {
                // We have approved access
                this.showStatus('request-status', 'Access approved! You can fetch the feed.', 'success');
                document.getElementById('fetch-feed').disabled = false;
            } else {
                // No access yet - either pending or need to request
                this.showStatus('request-status', 'Click "Request Access" to ask for feed permission', 'info');
                document.getElementById('fetch-feed').disabled = true;
            }
        } catch (error) {
            console.error('Error checking friend token status:', error);
            document.getElementById('fetch-feed').disabled = true;
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
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    friend_validation_token: friendToken,
                    limit: limit
                })
            });

            const data = await response.json();

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

        // Display feed header
        header.innerHTML = `
            <div>
                <strong>${data.authenticated_user.name}</strong>'s Twitter Feed
                <span style="color: #6b7280; font-weight: normal;">
                    • ${data.count} tweets • Updated ${new Date(data.timestamp).toLocaleTimeString()}
                </span>
            </div>
        `;

        // Display tweets
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
                    <div class="tweet-stat">
                        <span>💬</span>
                        <span>${tweet.reply_count || 0}</span>
                    </div>
                    <div class="tweet-stat">
                        <span>🔄</span>
                        <span>${tweet.retweet_count}</span>
                    </div>
                    <div class="tweet-stat">
                        <span>❤️</span>
                        <span>${tweet.favorite_count}</span>
                    </div>
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
        element.textContent = message;
        element.className = `status ${type}`;
        element.classList.remove('hidden');
    }

    async clearStorage() {
        if (confirm('This will clear all stored data including tokens and cookies. Continue?')) {
            await chrome.storage.local.clear();
            location.reload();
        }
    }
}

// Initialize the popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new TwitterFeedMirror();
});
