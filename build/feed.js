class FeedViewer {
  constructor() {
    this.currentToken = null;
    this.currentAccount = null;
    this.tweets = [];
    this.isLoading = false;
    this.init();
  }

  async init() {
    await this.loadToken();
    this.setupUI();
    this.loadFeed();
    this.setupEventListeners();
    this.setupThemeObserver();
  }

  // 1. Token and Account Management
  async loadToken() {
    try {
      const params = new URLSearchParams(window.location.search);
      this.currentAccount = params.get('account');
      
      if (!this.currentAccount) {
        throw new Error("No account specified in URL");
      }

      const result = await chrome.storage.local.get([this.currentAccount]);
      this.currentToken = result[this.currentAccount];
      
      if (!this.currentToken) {
        throw new Error(`No token found for account: ${this.currentAccount}`);
      }
      
      document.getElementById('current-username').textContent = this.currentAccount;
      await this.populateAccountSelector();
      
    } catch (error) {
      console.error("Token loading failed:", error);
      this.showError(error.message);
      throw error;
    }
  }

  async populateAccountSelector() {
    const accounts = await chrome.storage.local.get(null);
    const selector = document.getElementById('account-selector');
    
    // Clear existing options except the default
    while (selector.options.length > 1) {
      selector.remove(1);
    }
    
    // Add all saved accounts except current
    Object.keys(accounts).forEach(account => {
      if (account !== "undefined" && account !== this.currentAccount) {
        const option = new Option(account, account);
        selector.add(option);
      }
    });
  }

  // 2. Feed Data Handling
async loadFeed() {
  if (this.isLoading) return;
  try {
    this.isLoading = true;
    this.showLoading(true);

    // Fetch via background script
    const feedData = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'fetchFeed', token: this.currentToken },
        (feed) => resolve(feed)
      );
    });

    if (!feedData || !Array.isArray(feedData.globalObjects?.tweets)) {
      throw new Error("No tweet data received");
    }

    // Convert Twitter API response to array of tweets
    const tweetsObj = feedData.globalObjects.tweets;
    const usersObj = feedData.globalObjects.users;
    this.tweets = Object.values(tweetsObj).map(tweet => ({
      id: tweet.id_str,
      text: tweet.full_text,
      created_at: tweet.created_at,
      user: {
        id: tweet.user_id_str,
        name: usersObj[tweet.user_id_str]?.name || 'Unknown',
        screen_name: usersObj[tweet.user_id_str]?.screen_name || 'unknown',
        profile_image_url: usersObj[tweet.user_id_str]?.profile_image_url_https || ''
      },
      public_metrics: {
        retweet_count: tweet.retweet_count,
        reply_count: tweet.reply_count,
        like_count: tweet.favorite_count
      }
    }));

    this.renderFeed();

  } catch (error) {
    console.error("Feed loading failed:", error);
    this.showError(this.formatErrorMessage(error));
  } finally {
    this.isLoading = false;
    this.showLoading(false);
  }
}

  // async fetchOfficialFeed() {
  //   try {
  //     const response = await fetch('https://api.twitter.com/2/home_timeline?expansions=author_id&tweet.fields=created_at,public_metrics&user.fields=profile_image_url', {
  //       headers: {
  //         'Authorization': `Bearer ${this.currentToken}`,
  //         'Content-Type': 'application/json'
  //       }
  //     });
      
  //     if (!response.ok) {
  //       throw new Error(`API Error: ${response.status}`);
  //     }
      
  //     return response.json();
      
  //   } catch (error) {
  //     console.warn("Official API failed, falling back to custom:", error);
  //     return null;
  //   }
  // }

  // async fetchCustomAPI() {
  //   try {
  //     // This mimics the internal Twitter API calls
  //     const response = await fetch('https://twitter.com/i/api/2/timeline/home.json', {
  //       headers: {
  //         'Authorization': `Bearer ${this.currentToken}`,
  //         'x-twitter-auth-type': 'OAuth2Session',
  //         'x-twitter-active-user': 'yes',
  //         'x-csrf-token': this.getCSRFToken()
  //       }
  //     });
      
  //     if (!response.ok) throw new Error(`Custom API Error: ${response.status}`);
  //     return this.parseCustomResponse(await response.json());
      
  //   } catch (error) {
  //     console.error("Custom API failed:", error);
  //     throw error;
  //   }
  // }

  parseCustomResponse(data) {
    // Transform the custom API response to match official API format
    if (!data?.globalObjects?.tweets) {
      throw new Error("Invalid custom API response");
    }
    
    const { tweets, users } = data.globalObjects;
    const tweetArray = Object.values(tweets);
    
    return {
      data: tweetArray.map(tweet => ({
        id: tweet.id_str,
        text: tweet.full_text,
        created_at: tweet.created_at,
        user: {
          id: tweet.user_id_str,
          name: users[tweet.user_id_str]?.name || 'Unknown',
          screen_name: users[tweet.user_id_str]?.screen_name || 'unknown',
          profile_image_url: users[tweet.user_id_str]?.profile_image_url_https || ''
        },
        public_metrics: {
          retweet_count: tweet.retweet_count,
          reply_count: tweet.reply_count,
          like_count: tweet.favorite_count
        }
      }))
    };
  }

  getCSRFToken() {
    // Extract from cookies if available
    const match = document.cookie.match(/ct0=([^;]+)/);
    return match ? match[1] : '';
  }

  // 3. Rendering Functions
  renderFeed() {
    const feedContainer = document.getElementById('feed');
    
    if (!this.tweets.length) {
      feedContainer.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" width="48" height="48">
            <path d="M23 3v14h-2V5H5V3h18zM10 17v2h12v-2H10zm-4-4v2h16v-2H6zM3 9v2h18V9H3z"/>
          </svg>
          <p>No tweets found in this feed</p>
        </div>
      `;
      return;
    }
    
    feedContainer.innerHTML = this.tweets.map(tweet => `
      <div class="tweet-card" data-tweet-id="${tweet.id}">
        <img src="${this.ensureHttps(tweet.user.profile_image_url)}" 
             alt="${tweet.user.name}" 
             class="tweet-avatar"
             onerror="this.src='https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png'">
        
        <div class="tweet-content">
          <div class="tweet-header">
            <span class="tweet-author">${tweet.user.name}</span>
            <span class="tweet-username">@${tweet.user.screen_name}</span>
            <span class="tweet-time">· ${this.formatTime(tweet.created_at)}</span>
          </div>
          
          <div class="tweet-text">${this.escapeHtml(tweet.text)}</div>
          
          <div class="tweet-actions">
            <div class="tweet-action" title="Reply">
              <svg viewBox="0 0 24 24">
                <path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z"/>
              </svg>
              <span>${tweet.public_metrics?.reply_count || 0}</span>
            </div>
            
            <div class="tweet-action" title="Retweet">
              <svg viewBox="0 0 24 24">
                <path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"/>
              </svg>
              <span>${tweet.public_metrics?.retweet_count || 0}</span>
            </div>
            
            <div class="tweet-action" title="Like">
              <svg viewBox="0 0 24 24">
                <path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"/>
              </svg>
              <span>${tweet.public_metrics?.like_count || 0}</span>
            </div>
            
            <div class="tweet-action" title="View on Twitter">
              <svg viewBox="0 0 24 24">
                <path d="M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.248 0v-7h2v7h-2z"/>
              </svg>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  }

  // 4. Utility Functions
  formatTime(dateString) {
    try {
      const date = new Date(dateString);
      if (isNaN(date)) return '';
      
      const now = new Date();
      const diffInSeconds = Math.floor((now - date) / 1000);
      
      if (diffInSeconds < 60) return `${diffInSeconds}s`;
      if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m`;
      if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h`;
      
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
      });
    } catch {
      return '';
    }
  }

  ensureHttps(url) {
    if (!url) return '';
    return url.startsWith('http:') ? url.replace('http:', 'https:') : url;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  formatErrorMessage(error) {
    if (error.message.includes('401')) return 'Session expired. Please refresh your token.';
    if (error.message.includes('429')) return 'Rate limit exceeded. Try again later.';
    if (error.message.includes('Failed to fetch')) return 'Network error. Check your connection.';
    return error.message || 'Failed to load feed';
  }

  // 5. UI State Management
  showLoading(show) {
    document.getElementById('loading').style.display = show ? 'flex' : 'none';
  }

  showError(message) {
    const feedContainer = document.getElementById('feed');
    feedContainer.innerHTML = `
      <div class="error-message">
        <svg viewBox="0 0 24 24" width="48" height="48">
          <path d="M13 13h-2V7h2v6zm0 4h-2v-2h2v2z"/>
          <path d="M11.983 2C6.472 2 2 6.477 2 12s4.472 10 9.983 10C17.493 22 22 17.523 22 12S17.493 2 11.983 2zM12 20c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z"/>
        </svg>
        <p>${this.escapeHtml(message)}</p>
        <button id="retry-btn" class="primary-btn">Try Again</button>
      </div>
    `;
  }

  // 6. Event Handling
  setupEventListeners() {
    // Refresh button
    document.getElementById('refresh-feed').addEventListener('click', () => {
      this.loadFeed();
    });
    
    // Account switcher
    document.getElementById('account-selector').addEventListener('change', (e) => {
      if (e.target.value) {
        window.location.href = `feed.html?account=${encodeURIComponent(e.target.value)}`;
      }
    });
    
    // Retry button (dynamically added)
    document.addEventListener('click', (e) => {
      if (e.target.id === 'retry-btn') {
        this.loadFeed();
      }
    });
    
    // Tweet actions
    document.addEventListener('click', (e) => {
      const tweetAction = e.target.closest('.tweet-action');
      if (!tweetAction) return;
      
      const tweetCard = tweetAction.closest('.tweet-card');
      const tweetId = tweetCard?.dataset?.tweetId;
      if (!tweetId) return;
      
      if (tweetAction.title === 'View on Twitter') {
        window.open(`https://twitter.com/i/status/${tweetId}`, '_blank');
      }
    });
  }

  setupThemeObserver() {
    // Watch for dark/light mode changes
    const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleColorSchemeChange = (e) => {
      document.documentElement.setAttribute(
        'data-theme', 
        e.matches ? 'dark' : 'light'
      );
    };
    
    darkModeMediaQuery.addListener(handleColorSchemeChange);
    handleColorSchemeChange(darkModeMediaQuery);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  try {
    new FeedViewer();
  } catch (error) {
    console.error("Failed to initialize FeedViewer:", error);
    document.getElementById('feed').innerHTML = `
      <div class="error-message">
        <p>Failed to initialize: ${error.message}</p>
      </div>
    `;
  }
});
// Example usage in popup or feed.js
function testToken(token) {
  chrome.runtime.sendMessage({ action: 'checkToken', token }, (response) => {
    if (response && response.valid) {
      alert('Token is valid!');
    } else {
      alert('Token is invalid or expired.');
    }
  });
}