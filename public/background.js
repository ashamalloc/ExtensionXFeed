// Store tokens and handle feed fetching
const tokens = {};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'storeToken':
      tokens[request.username] = request.token;
      chrome.storage.local.set({ tokens });
      break;
      
    case 'fetchFeed':
      fetchXFeed(request.token)
        .then(feed => sendResponse(feed))
        .catch(err => console.error(err));
      return true; // Required for async sendResponse
  }
});

async function fetchXFeed(token) {
  const headers = {
    'Authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
    'Cookie': `auth_token=${token}`
  };
  
  const response = await fetch('https://api.twitter.com/2/home_timeline.json?tweet_mode=extended', { headers });
  return response.json();
}