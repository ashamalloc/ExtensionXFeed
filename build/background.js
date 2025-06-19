chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkToken') {
    checkToken(request.token)
      .then(isValid => sendResponse({ valid: isValid }))
      .catch(() => sendResponse({ valid: false }));
    return true;
  }
  // ...existing code...
});

async function checkToken(token) {
  const headers = {
    'Authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
    'Cookie': `auth_token=${token}`
  };
  const resp = await fetch('https://api.twitter.com/1.1/account/verify_credentials.json', { headers });
  return resp.ok;
}