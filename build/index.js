document.getElementById('account-switcher').addEventListener('change', (e) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.runtime.sendMessage({
      action: 'fetchFeed',
      token: e.target.value === 'default' ? null : storedTokens[e.target.value]
    });
  });
});

document.getElementById('add-token').addEventListener('click', () => {
  const token = prompt('Paste the auth_token:');
  if (token) {
    chrome.runtime.sendMessage({ 
      action: 'storeToken', 
      username: `friend_${Date.now()}`, 
      token 
    });
  }
});