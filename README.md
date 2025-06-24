# FeedMirror Project

FeedMirror is a two-part project consisting of a Python FastAPI backend and a Chrome extension frontend. The system allows users to view Twitter (X) feeds using authentication tokens, providing a seamless experience between the browser extension and backend API.

---

## Project Structure

```
feedmirror-project-2/
├── twitter-feedmirror-backend/   # FastAPI backend for Twitter feed mirroring
│   ├── main.py           # Main FastAPI application
│   ├── requirements.txt  # Python dependencies
│   └── ...
└── updated-frontend/  # Chrome extension frontend
    ├── manifest.json     # Chrome extension manifest (v3)
    ├── background.js     # Background service worker
    ├── content.js        # Content script for Twitter/X
    ├── popup.html        # Extension popup UI
    ├── popup.js          # Popup logic
    ├── package.json      # Frontend dependencies (React)
    └── ...
```

---

## Backend: FastAPI (feedmirror-backend)

- **Framework:** FastAPI
- **Main file:** `main.py`
- **Dependencies:**
  - fastapi
  - uvicorn
  - twikit
  - pydantic
- **Features:**
  - Provides API endpoints for authentication and fetching Twitter feeds
  - Uses in-memory session validation with expiration
  - CORS enabled for frontend communication

### Setup & Run
```bash
# Install dependencies
pip install -r requirements.txt

# Run the FastAPI server
uvicorn main:app --reload
```

---

## Frontend: Chrome Extension (feedmirror-frontend)

- **Manifest Version:** 3
- **Tech Stack:** React (for popup UI), vanilla JS for background/content scripts
- **Key Files:**
  - `manifest.json`: Extension configuration
  - `background.js`: Handles background tasks and API communication
  - `content.js`: Injected into Twitter/X pages
  - `popup.html` & `popup.js`: User interface
  - `package.json`: React dependencies and build scripts
- **Permissions:**
  - Storage, activeTab, access to Twitter/X and backend API

### Setup & Build
```bash
# Install dependencies
npm install

# Build the extension
npm run build
```

### Load Extension in Chrome
1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `feedmirror-frontend` folder

---

## Usage
1. Start the backend FastAPI server.
2. Load the Chrome extension in your browser.
3. Use the popup to authenticate and view Twitter feeds.

---

## Authors
- Asha Kumari
- Tvisha
- Manisha

---

## Notes
- Ensure you have valid Twitter authentication tokens for full functionality.
- The backend uses in-memory session storage; for production, consider persistent storage and enhanced security.
