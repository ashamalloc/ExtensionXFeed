chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "fetchFeed" && request.authToken) {
    fetch("https://api.twitter.com/2/timeline/home.json", {
      headers: {
        "Authorization": `Bearer ${request.authToken}`,
        "Content-Type": "application/json"
      },
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} - ${res.statusText}`);
        }
        return res.json();
      })
      .then((data) => {
        sendResponse({ success: true, feed: data });
      })
      .catch((err) => {
        sendResponse({ success: false, error: err.message });
      });

    return true; // Required to keep `sendResponse` alive for async
  }
});
