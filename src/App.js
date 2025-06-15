import React, { useState, useEffect } from "react";

function App() {
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");

  // Load token if already saved
  useEffect(() => {
    chrome.storage.local.get("token", (data) => {
      if (data.token) setToken(data.token);
    });
  }, []);

  const handleSave = () => {
    if (!token.trim()) {
      setMessage("Please enter a valid token.");
      return;
    }

    chrome.storage.local.set({ token }, () => {
      setMessage("Token saved!");
    });
  };

  const fetchFeed = () => {
    if (!token.trim()) {
      setMessage("Enter a valid token");
      return;
    }

    chrome.runtime.sendMessage(
      { type: "fetchFeed", authToken: token },
      (response) => {
        if (response?.success) {
          const tweets = response.feed.globalObjects?.tweets || {};
          setMessage(`Fetched ${Object.keys(tweets).length} tweets`);
        } else {
          setMessage(`Error: ${response?.error || "No response"}`);
        }
      }
    );
  };

  return (
    <div className="popup" style={{ padding: 16, width: 300 }}>
      <h2>Twitter Feed Viewer</h2>

      <input
        type="text"
        placeholder="Enter auth token"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        style={{ width: "100%", marginBottom: 10 }}
      />

      <div style={{ display: "flex", gap: "10px", marginBottom: 10 }}>
        <button onClick={handleSave}>Save Token</button>
        <button onClick={fetchFeed}>Fetch Feed</button>
      </div>

      <p>{message}</p>
    </div>
  );
}

export default App;

