// Configuration
const API_BASE_URL = 'http://localhost:8000';
let validationToken = null;
let currentTab = 'home';

// DOM Elements
const elements = {
    // Status
    status: document.getElementById('status'),
    
    // Tabs
    tabs: document.querySelectorAll('.tab'),
    homeTab: document.getElementById('home-tab'),
    searchTab: document.getElementById('search-tab'),
    
    // Home feed form
    authToken: document.getElementById('auth_token'),
    ct0: document.getElementById('ct0'),
    cookie: document.getElementById('cookie'),
    limit: document.getElementById('limit'),
    
    // Search form
    searchAuthToken: document.getElementById('search_auth_token'),
    searchCt0: document.getElementById('search_ct0'),
    searchCookie: document.getElementById('search_cookie'),
    searchQuery: document.getElementById('search_query'),
    searchType: document.getElementById('search_type'),
    searchLimit: document.getElementById('search_limit'),
    
    // Buttons
    validateBtn: document.getElementById('validateBtn'),
    fetchFeedBtn: document.getElementById('fetchFeedBtn'),
    searchBtn: document.getElementById('searchBtn'),
    extractBtn: document.getElementById('extractBtn'),
    
    // Results
    tweetsContainer: document.getElementById('tweets-container')
};

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    loadStoredTokens();
    setupEventListeners();
    checkApiHealth();
});

// Event Listeners
function setupEventListeners() {
    // Tab switching
    elements.tabs.forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
    
    // Home feed buttons
    elements.validateBtn.addEventListener('click', validateTokens);
    elements.fetchFeedBtn.addEventListener('click', fetchHomeFeed);
    elements.extractBtn.addEventListener('click', extractTokensFromCurrentTab);
    
    // Search button
    elements.searchBtn.addEventListener('click', searchTweets);
    
    // Auto-save tokens
    [elements.authToken, elements.ct0, elements.cookie].forEach(input => {
        input.addEventListener('input', saveTokens);
    });
}

// Tab Management
function switchTab(tabName) {
    currentTab = tabName;
    
    // Update tab buttons
    elements.tabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    
    // Show/hide tab content
    elements.homeTab.classList.toggle('hidden', tabName !== 'home');
    elements.searchTab.classList.toggle('hidden', tabName !== 'search');
    
    // Clear previous results
    clearResults();
}

// Token Management
function saveTokens() {
    const tokens = {
        auth_token: elements.authToken.value,
        ct0: elements.ct0.value,
        cookie: elements.cookie.value
    };
    
    chrome.storage.local.set({ tokens }, () => {
        console.log('Tokens saved');
    });
}

function loadStoredTokens() {
    chrome.storage.local.get(['tokens'], (result) => {
        if (result.tokens) {
            elements.authToken.value = result.tokens.auth_token || '';
            elements.ct0.value = result.tokens.ct0 || '';
            elements.cookie.value = result.tokens.cookie || '';
            
            // Copy to search form
            elements.searchAuthToken.value = result.tokens.auth_token || '';
            elements.searchCt0.value = result.tokens.ct0 || '';
            elements.searchCookie.value = result.tokens.cookie || '';
        }
    });
}

// Token Extraction
function extractTokensFromCurrentTab() {
    showLoading(elements.extractBtn, 'Extracting...');
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        
        if (!tab.url.includes('twitter.com') && !tab.url.includes('x.com')) {
            showStatus('Please navigate to Twitter/X.com first', 'error');
            hideLoading(elements.extractBtn, 'Extract from Current Tab');
            return;
        }
        
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: extractTwitterCookies
        }, (results) => {
            hideLoading(elements.extractBtn, 'Extract from Current Tab');
            
            if (chrome.runtime.lastError) {
                showStatus('Failed to extract tokens: ' + chrome.runtime.lastError.message, 'error');
                return;
            }
            
            if (results && results[0] && results[0].result) {
                const cookies = results[0].result;
                
                if (cookies.auth_token && cookies.ct0) {
                    elements.authToken.value = cookies.auth_token;
                    elements.ct0.value = cookies.ct0;
                    elements.cookie.value = cookies.fullCookie || '';
                    
                    // Copy to search form
                    elements.searchAuthToken.value = cookies.auth_token;
                    elements.searchCt0.value = cookies.ct0;
                    elements.searchCookie.value = cookies.fullCookie || '';
                    
                    saveTokens();
                    showStatus('✅ Tokens extracted successfully!', 'success');
                } else {
                    showStatus('Required tokens not found. Make sure you\'re logged into Twitter.', 'error');
                }
            } else {
                showStatus('Failed to extract tokens from current tab', 'error');
            }
        });
    });
}

// This function runs in the content script context
function extractTwitterCookies() {
    try {
        const cookies = {};
        const cookieString = document.cookie;
        
        // Parse individual cookies
        cookieString.split(';').forEach(cookie => {
            const [name, value] = cookie.trim().split('=');
            if (name && value) {
                cookies[name] = value;
            }
        });
        
        return {
            auth_token: cookies.auth_token || '',
            ct0: cookies.ct0 || '',
            fullCookie: cookieString
        };
    } catch (error) {
        console.error('Error extracting cookies:', error);
        return null;
    }
}

// API Functions
async function checkApiHealth() {
    try {
        const response = await fetch(`${API_BASE_URL}/health`);
        if (response.ok) {
            console.log('API is healthy');
        } else {
            showStatus('⚠️ API server not responding. Make sure it\'s running on localhost:8000', 'error');
        }
    } catch (error) {
        showStatus('❌ Cannot connect to API server. Start your FastAPI server first.', 'error');
    }
}

async function validateTokens() {
    const tokens = getTokens();
    if (!validateRequiredFields(tokens)) return;
    
    showLoading(elements.validateBtn, 'Validating...');
    
    try {
        const response = await fetch(`${API_BASE_URL}/validate-cookies`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(tokens)
        });
        
        const data = await response.json();
        
        if (data.valid) {
            validationToken = data.validation_token;
            elements.fetchFeedBtn.disabled = false;
            showStatus(`✅ Validated! Welcome ${data.user?.name || 'User'}`, 'success');
        } else {
            showStatus(`❌ Validation failed: ${data.error}`, 'error');
        }
    } catch (error) {
        showStatus(`❌ Validation error: ${error.message}`, 'error');
    }
    
    hideLoading(elements.validateBtn, 'Validate Tokens');
}

async function fetchHomeFeed() {
    if (!validationToken) {
        showStatus('Please validate tokens first', 'error');
        return;
    }
    
    const tokens = getTokens();
    showLoading(elements.fetchFeedBtn, 'Fetching...');
    
    try {
        const response = await fetch(`${API_BASE_URL}/home-feed`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                tokens,
                limit: parseInt(elements.limit.value),
                validation_token: validationToken
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            displayTweets(data.tweets, `Home Feed (${data.count} tweets)`);
            showStatus(`✅ Fetched ${data.count} tweets from home feed`, 'success');
        } else {
            showStatus(`❌ Failed to fetch feed`, 'error');
        }
    } catch (error) {
        showStatus(`❌ Feed error: ${error.message}`, 'error');
    }
    
    hideLoading(elements.fetchFeedBtn, 'Fetch Feed');
}

async function searchTweets() {
    const tokens = {
        auth_token: elements.searchAuthToken.value,
        ct0: elements.searchCt0.value,
        cookie: elements.searchCookie.value
    };
    
    if (!validateRequiredFields(tokens, 'search')) return;
    
    showLoading(elements.searchBtn, 'Searching...');
    
    try {
        const response = await fetch(`${API_BASE_URL}/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                tokens,
                query: elements.searchQuery.value || 'twitter',
                tweet_type: elements.searchType.value,
                limit: parseInt(elements.searchLimit.value)
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            displayTweets(data.tweets, `Search: "${elements.searchQuery.value}" (${data.count} results)`);
            showStatus(`✅ Found ${data.count} tweets`, 'success');
        } else {
            showStatus(`❌ Search failed`, 'error');
        }
    } catch (error) {
        showStatus(`❌ Search error: ${error.message}`, 'error');
    }
    
    hideLoading(elements.searchBtn, 'Search Tweets');
}

// Helper Functions
function getTokens() {
    return {
        auth_token: elements.authToken.value.trim(),
        ct0: elements.ct0.value.trim(),
        cookie: elements.cookie.value.trim()
    };
}

function validateRequiredFields(tokens, context = 'home') {
    if (!tokens.auth_token || !tokens.ct0) {
        showStatus('❌ Auth Token and CT0 Token are required', 'error');
        return false;
    }
    return true;
}

function displayTweets(tweets, title) {
    if (!tweets || tweets.length === 0) {
        elements.tweetsContainer.innerHTML = '<div class="tweet">No tweets found</div>';
        elements.tweetsContainer.classList.remove('hidden');
        return;
    }
    
    const tweetsHtml = tweets.map(tweet => `
        <div class="tweet">
            <div class="tweet-header">
                <span class="tweet-user">@${tweet.user.screen_name} • ${tweet.user.name}</span>
                <span>${new Date(tweet.created_at).toLocaleDateString()}</span>
            </div>
            <div class="tweet-text">${escapeHtml(tweet.text)}</div>
            <div class="tweet-stats">
                <span>❤️ ${tweet.favorite_count}</span>
                <span>🔄 ${tweet.retweet_count}</span>
                ${tweet.url ? `<a href="${tweet.url}" target="_blank" style="color: #1da1f2;">View</a>` : ''}
            </div>
        </div>
    `).join('');
    
    elements.tweetsContainer.innerHTML = `
        <div style="margin-bottom: 15px; font-weight: 600; color: #1da1f2;">${title}</div>
        ${tweetsHtml}
    `;
    elements.tweetsContainer.classList.remove('hidden');
}

function showStatus(message, type) {
    elements.status.textContent = message;
    elements.status.className = `status ${type}`;
    elements.status.classList.remove('hidden');
    
    if (type === 'success') {
        setTimeout(() => {
            elements.status.classList.add('hidden');
        }, 3000);
    }
}

function showLoading(button, text) {
    const btnText = button.querySelector('.btn-text');
    const spinner = button.querySelector('.loading-spinner');
    
    btnText.textContent = text;
    spinner.classList.remove('hidden');
    button.disabled = true;
}

function hideLoading(button, originalText) {
    const btnText = button.querySelector('.btn-text');
    const spinner = button.querySelector('.loading-spinner');
    
    btnText.textContent = originalText;
    spinner.classList.add('hidden');
    button.disabled = false;
}

function clearResults() {
    elements.tweetsContainer.classList.add('hidden');
    elements.status.classList.add('hidden');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}