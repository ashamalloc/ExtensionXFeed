import React, { useState } from "react";
import "./App.css";

function App() {
  const [username, setUsername] = useState("");
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchFeed = async () => {
    const trimmedUsername = username.trim();
    if (!trimmedUsername) return alert("Please enter a username");

    const token = localStorage.getItem("twitter_auth_token");
    const ct0 = localStorage.getItem("twitter_ct0");
    const TWITTER_BEARER =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA"; 

    if (!token || !ct0) return alert("Missing auth_token or ct0");

    setLoading(true);
    try {
        const res = await fetch("http://localhost:5000/twitter-feed", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TWITTER_BEARER}`,
          "x-csrf-token": ct0,
        },
        body: JSON.stringify({ username: trimmedUsername }),
      });

      const data = await res.json();
      if (data.success) {
        setFeed(data.feed);
      } else {
        setFeed([]);
        alert("Error: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      setFeed([]);
      alert("Network error: " + err.message);
    } finally {
      setLoading(false);
    }
  };
  

  return (
    <div className="app">
      <h2>Twitter Feed Viewer</h2>

      <input
        type="text"
        placeholder="Enter Twitter username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />

      <button onClick={fetchFeed} disabled={loading}>
        {loading ? "Fetching..." : "Get Feed"}
      </button>

      <ul className="feed-list">
        {feed.length === 0 && !loading ? (
          <li>No tweets to display</li>
        ) : (
          feed.map((item) => (
            <li key={item.id || item.text.slice(0, 20)} className="feed-item">
              <strong>@{username.trim()}</strong>: {item.full_text || item.text}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

export default App;
