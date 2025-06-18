document.getElementById('account-switcher').addEventListener('change', (e) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.runtime.sendMessage({
      action: 'fetchFeed',
      token: e.target.value === 'default' ? null : storedTokens[e.target.value]
    });
  });
});

document.getElementById('save-token').addEventListener('click', async () => {
  const accountName = document.getElementById('username-input').value.trim();
  const authToken = document.getElementById('token-input').value.trim();

  if (!accountName || !authToken) {
    showError("Please enter both account name and token");
    return;
  }

  try {
    // Save to chrome.storage.local
    await chrome.storage.local.set({ 
      [accountName]: authToken  // Saves as { "John's Feed": "abc123token" }
    });
    showSuccess("Token saved successfully!");
    updateAccountList(); // Refresh dropdown
  } catch (error) {
    showError("Failed to save token: " + error.message);
  }
});

// Helper: Update account dropdown
async function updateAccountList() {
  const accounts = await chrome.storage.local.get(null);
  const switcher = document.getElementById('account-switcher');
  
  switcher.innerHTML = '<option value="">-- Select Account --</option>';
  Object.keys(accounts).forEach(account => {
    if (account !== "undefined") {  // Skip undefined keys
      const option = document.createElement('option');
      option.value = account;
      option.textContent = account;
      switcher.appendChild(option);
    }
  });
}

// Load accounts on popup open
updateAccountList();