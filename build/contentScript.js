chrome.storage.local.get("token", ({ token }) => {
  if (!token) {
    console.error("No token found in storage");
    return;
  }

  chrome.runtime.sendMessage(
    { type: "fetchFeed", authToken: token },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error("Runtime error:", chrome.runtime.lastError.message);
        return;
      }

      if (response?.success) {
        console.log("Feed:", response.feed);
      } else {
        console.error("Error fetching feed:", response?.error);
      }
    }
  );
});
