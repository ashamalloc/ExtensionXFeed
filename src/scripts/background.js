chrome.identity.launchWebAuthFlow({
  url: `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=${encodeURIComponent(chrome.identity.getRedirectURL())}&scope=tweet.read%20users.read&state=STATE_STRING&code_challenge=PKCE_CHALLENGE&code_challenge_method=S256`,
  interactive: true
}, (redirectUrl) => {
  if (chrome.runtime.lastError || !redirectUrl) {
    console.error("Auth failed:", chrome.runtime.lastError);
    return;
  }
  // Extract authorization code from redirect URL
  const code = new URL(redirectUrl).searchParams.get('code');
  // Exchange code for token (Member A will likely handle this)
});

