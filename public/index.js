document.getElementById('save-token').addEventListener('click', async () => {
  const accountName = document.getElementById('username-input').value.trim();
  const authToken = document.getElementById('token-input').value.trim();

  if (!accountName || !authToken) {
    showError("Please enter both account name and token");
    return;
  }

  // Verify token first
  const { valid, error, user } = await new Promise(resolve => {
    chrome.runtime.sendMessage(
      { action: 'checkToken', token: authToken },
      resolve
    );
  });

  if (!valid) {
    showError(`Invalid token: ${error}`);
    return;
  }

  // Save verified token
  try {
    await chrome.storage.local.set({ 
      [accountName]: {
        token: authToken,
        username: user.username,
        id: user.id
      }
    });
    showSuccess("Token saved successfully!");
    updateAccountList();
  } catch (error) {
    showError("Failed to save token: " + error.message);
  }
});