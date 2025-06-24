# Twitter Feed Viewer via Shared Token Extension

A Chrome extension + backend project that allows one Twitter user to share their feed access (read-only) with another user via a session token. The extension uses cookie-based token extraction, user consent notification, and backend validation to allow secure sharing of Twitter feeds.

##  Features

- Chrome extension to extract session token from Twitter (twid and auth_token)
- Token validation and user authentication via Python backend
- Secure request & approval system for token sharing
- Shared token enables fetching and displaying of Twitter feeds (10/20/30/40 tweets)
- Read-only access for the receiver
- UI with feed display in the extension popup or app page
- DOM manipulation and Twikit used to fetch data
- Real-time notifications and consent system

---

## ⚙️ Tech Stack

- **Frontend (Extension)**: HTML, CSS, JavaScript
- **Twitter Feed Access**: `twikit`, DOM scraping (as fallback)
- **Backend**: Python (Flask or FastAPI)
- **Browser API**: Chrome Extensions API, localStorage
- **Communication**: Fetch API + CORS proxy setup (if required)
- **Token Management**: Cookie extraction, user approval, token sharing

---

## 📂 Folder Structure

ExtensionXFeed/
├── updated-frontend/
│ ├── manifest.json
│ ├── background.js
│ ├── popup.js
│ ├── popup.html
│ ├── content.js
│ ├── popup.css
│ ├── extract_cookies.js
│ └── icons/
│ └── icon.png
├──twitter-feed-mirror-extension/
│ ├── main.py
│ ├── requirements.txt

---

## Project Workflow

### 1. **Token Extraction**

- User A installs the extension and logs into Twitter
- Clicks **“Extract Token”** in popup
- The extension fetches session cookie 
- Sends token to backend for validation

### 2. **Authentication & Token Sharing**

- Backend validates that token is live by calling Twitter's internal APIs
- User A can **share token** via copying the token ID or link
- User B pastes this token in their extension/app

### 3. **Approval Notification**

- User A gets a **notification popup** in their extension:
  - "User B wants to access your feed"
  - Buttons: **Approve / Reject**
- If approved, backend marks the token as shared and linked to User B

### 4. **Feed Fetching**

- User B now uses the shared token to fetch User A's Twitter feed via the backend
- Backend proxies feed fetch request using Twikit or Twitter web API calls
- User B can view User A's timeline in the extension/app (10/20/30 tweets, as selected)

---

## Security & Privacy

- Only **read-only access**; no write/delete/post operations
- Consent-based token sharing — no unauthorized access
- Token stored in memory 
- Token expires when the user logs out of Twitter and is valid for 1 day

---

## Setup Instructions

### Backend (Python Flask Example)

1. Create a virtual environment and install dependencies:

bash
cd server/
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

2. Start Server
uvicorn main:app --reload --port 5000

### Chrome Extension

1. Go to `chrome://extensions/`
2. Enable **Developer Mode**
3. Click **Load Unpacked** and select the `ExtensionXFeed/updated-frontend` folder
4. Log in to Twitter on a new tab
5. Click the extension twiiter feed extension
6. Click on extract twitter cookies tab


