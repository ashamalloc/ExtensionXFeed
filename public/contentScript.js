// Professional feed injection with error handling
class FeedRenderer {
  constructor() {
    this.feedContainer = null;
    this.observer = null;
    this.init();
  }

  init() {
    this.injectStyles();
    this.setupMutationObserver();
  }

  injectStyles() {
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = chrome.runtime.getURL('feed.css');
    document.head.appendChild(style);
  }

  setupMutationObserver() {
    this.observer = new MutationObserver(() => {
      const timeline = document.querySelector('[aria-label="Timeline"]');
      if (timeline && !this.feedContainer) {
        this.replaceFeedContainer(timeline);
      }
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
  }

  replaceFeedContainer(originalTimeline) {
    this.feedContainer = document.createElement('div');
    this.feedContainer.id = 'x-feed-viewer-container';
    originalTimeline.parentNode.replaceChild(this.feedContainer, originalTimeline);
    
    chrome.runtime.sendMessage({ action: 'getCurrentFeed' }, (response) => {
      this.renderFeed(response.feed);
    });
  }

  renderFeed(feedData) {
    if (!this.feedContainer) return;
    
    this.feedContainer.innerHTML = `
      <div class="feed-header">
        <h2>Custom Feed View</h2>
      </div>
      <div class="tweets-container">
        ${feedData.map(tweet => this.createTweetElement(tweet)).join('')}
      </div>
    `;
  }

  createTweetElement(tweet) {
    return `
      <div class="tweet-card">
        <div class="tweet-header">
          <img src="${tweet.user.profile_image_url}" alt="Profile" class="avatar">
          <span class="username">@${tweet.user.screen_name}</span>
        </div>
        <div class="tweet-content">
          ${tweet.full_text}
        </div>
        <div class="tweet-footer">
          <span class="timestamp">${new Date(tweet.created_at).toLocaleString()}</span>
        </div>
      </div>
    `;
  }
}

new FeedRenderer();