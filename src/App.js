import React, { useState, useEffect } from "react";

function App() {
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [tweets, setTweets] = useState([]);

  // Load token if already saved
  useEffect(() => {
    chrome.storage.local.get("token", (data) => {
      if (data.token) setToken(data.token);
    });
  }, []);

  // Handle token save
  const handleSave = () => {
    if (!token.trim()) {
      setMessage("Please enter a valid token.");
      return;
    }

    // Optional: Test token before saving
    fetch("http://localhost:5000/twitter-feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          chrome.storage.local.set({ token }, () => {
            setMessage("Token is valid and saved!");
          });
        } else {
          setMessage("Token is not valid.");
        }
      })
      .catch((err) => {
        console.error(err);
        setMessage("Error validating token.");
      });
  };

  // Fetch feed using saved token
  const fetchFeed = async () => {
    if (!token.trim()) {
      setMessage("Enter a valid token");
      return;
    }

    try {
      const res = await fetch("http://localhost:5000/twitter-feed", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();

      if (data.success) {
        const tweetsObj = data.feed.globalObjects?.tweets || {};
        const tweetList = Object.values(tweetsObj);
        setTweets(tweetList);
        setMessage(`Fetched ${tweetList.length} tweets`);
      } else {
        setMessage(`Error: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
      setMessage(`Fetch failed: ${err.message}`);
    }
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

      {tweets.length > 0 && (
        <div
          style={{
            maxHeight: 250,
            overflowY: "auto",
            border: "1px solid #ccc",
            padding: "8px",
            borderRadius: "4px",
          }}
        >
          {tweets.map((tweet) => (
            <div key={tweet.id_str} style={{ marginBottom: 10 }}>
              <strong>@{tweet.user?.screen_name || "user"}</strong>
              <p style={{ margin: 0 }}>{tweet.full_text || tweet.text}</p>
              <hr />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
