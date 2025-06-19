// Twitter API v2 authentication
const TWITTER_API_KEY = 'YOUR_API_KEY'; // From developer portal
const TWITTER_API_SECRET = 'YOUR_API_SECRET'; // From developer portal
let bearerToken = null;

async function getBearerToken() {
  if (bearerToken) return bearerToken;
  
  const credentials = btoa(`${TWITTER_API_KEY}:${TWITTER_API_SECRET}`);
  const response = await fetch('https://api.twitter.com/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
    },
    body: 'grant_type=client_credentials'
  });
  
  const data = await response.json();
  bearerToken = data.access_token;
  return bearerToken;
}

async function verifyUserToken(userToken) {
  try {
    const bearer = await getBearerToken();
    const response = await fetch('https://api.twitter.com/2/users/me', {
      headers: {
        'Authorization': `Bearer ${bearer}`,
        'Cookie': `auth_token=${userToken}`
      }
    });
    
    if (response.status === 401) {
      return { valid: false, error: "Invalid or expired token" };
    }
    
    if (!response.ok) {
      return { valid: false, error: `API error: ${response.status}` };
    }
    
    const userData = await response.json();
    return { valid: true, user: userData.data };
    
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkToken') {
    verifyUserToken(request.token)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ valid: false, error }));
    return true; // Required for async response
  }
  
  // Other message handlers...
});