// feed-ui/feed.js
class FeedViewer {
  constructor() {
    this.currentToken = null;
    this.init();
  }

  async init() {
    await this.loadToken();
    this.setupUI();
    this.loadFeed();
    this.setupEventListeners();
  }

  // 1. Load saved token from storage
  async loadToken() {
    const accountName = new URLSearchParams(window.location.search).get('account');
    const result = await chrome.storage.local.get([accountName]);
    this.currentToken = result[accountName];
    
    if (!this.currentToken) {
      document.getElementById('feed').innerHTML = `
        <div class="error">
          <p>No token found for ${accountName}</p>
          <button id="retry-btn">Retry</button>
        </div>
      `;
      throw new Error("Token not found");
    }
    
    document.getElementById('current-username').textContent = accountName;
  }

  // 2. Fetch and render feed
  async loadFeed() {
    try {
      this.showLoading(true);
      
      const feed = await this.fetchFeedData();
      this.renderFeed(feed);
      
    } catch (error) {
      console.error("Feed load failed:", error);
      this.showError(error.message);
    } finally {
      this.showLoading(false);
    }
  }

  // 3. API request to Twitter
  async fetchFeedData() {
    const response = await fetch('https://api.twitter.com/2/home_timeline', {
      headers: {
        'Authorization': `Bearer ${this.currentToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    return response.json();
  }

  // 4. Render tweets to DOM
  renderFeed(feedData) {
    const feedContainer = document.getElementById('feed');
    feedContainer.innerHTML = feedData.data.map(tweet => `
      <div class="tweet-card">
        <div class="tweet-header">
          <img src="${tweet.user.profile_image_url}" class="avatar">
          <span class="user-name">${tweet.user.name}</span>
          <span class="user-handle">@${tweet.user.screen_name}</span>
        </div>
        <div class="tweet-content">${tweet.text}</div>
        <div class="tweet-actions">
          <span class="tweet-date">${new Date(tweet.created_at).toLocaleString()}</span>
        </div>
      </div>
    `).join('');
  }

  // 5. UI Helpers
  showLoading(show) {
    document.getElementById('loading').style.display = show ? 'flex' : 'none';
  }

  showError(message) {
    document.getElementById('feed').innerHTML = `
      <div class="error">
        <p>${message}</p>
        <button id="retry-btn">Retry Loading</button>
      </div>
    `;
  }

  // 6. Event listeners
  setupEventListeners() {
    document.getElementById('close-feed').addEventListener('click', () => {
      window.close(); // Closes the full-page view
    });

    document.addEventListener('click', (e) => {
      if (e.target.id === 'retry-btn') this.loadFeed();
    });
  }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => new FeedViewer());