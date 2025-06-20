// Background service worker for Twitter Feed Extension
class TwitterExtensionBackground {
    constructor() {
        this.init();
    }

    init() {
        // Listen for extension installation
        chrome.runtime.onInstalled.addListener((details) => {
            this.handleInstall(details);
        });

        // Listen for messages from popup and content scripts
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            this.handleMessage(request, sender, sendResponse);
            return true; // Keep message channel open for async responses
        });

        // Listen for tab updates to inject content script if needed
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            this.handleTabUpdate(tabId, changeInfo, tab);
        });

        console.log('Twitter Feed Extension: Background script loaded');
    }

    handleInstall(details) {
        if (details.reason === 'install') {
            console.log('Twitter Feed Extension installed');
            // Set default settings
            chrome.storage.local.set({
                apiUrl: 'http://localhost:8000',
                autoExtract: true,
                defaultQuery: 'twitter',
                defaultLimit: 10
            });
        }
    }

    async handleMessage(request, sender, sendResponse) {
        try {
            switch (request.action) {
                case 'extractCookies':
                    const cookieData = await this.extractTwitterCookies();
                    sendResponse({ success: true, data: cookieData });
                    break;

                case 'checkApiStatus':
                    const apiStatus = await this.checkApiStatus();
                    sendResponse({ success: true, status: apiStatus });
                    break;

                case 'openTwitterTab':
                    await this.openTwitterTab();
                    sendResponse({ success: true });
                    break;

                default:
                    sendResponse({ success: false, error: 'Unknown action' });
            }
        } catch (error) {
            console.error('Background script error:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    async extractTwitterCookies() {
        try {
            // Get cookies from both twitter.com an