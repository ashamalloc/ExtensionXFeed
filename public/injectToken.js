// Script to inject auth_token into document.cookie
function setAuthToken(token) {
  document.cookie = `auth_token=${token}; path=/; domain=.twitter.com`;
}
