ExtensionXFeed

Description: A Chrome extension that allows you to securely share your Twitter feed, manage friend permissions, accept requests, and view permission tokens.

Overview
ExtensionXFeed is a Chrome extension designed for secure sharing of Twitter (X) feeds between friends. It extracts authentication cookies, generates validation tokens, manages friend permissions, and allows acceptance of access requests. The extension includes features to monitor shared feeds and permission tokens, integrating with a local API server for validation, feed retrieval, and permission management.

Features
Allow Permission: Extract Twitter cookies, validate them, and generate a shareable validation token. Manage incoming friend requests and accept or deny them.
Fetch Friend's Feed: Request and display a friend's Twitter feed using their validation token.
Friends feed: View your friends shared feed.
Friend Requests: Manage permissions for friends, including accepting or denying access requests.
Secure Cookie Handling: Utilizes Chrome's Cookies API for safe authentication cookie management.
Local API Integration: Connects to a local server (http://localhost:8000) for validation, feed retrieval, and permission token/permission management.
User-Friendly UI: Tab-based interface with real-time status updates and error handling.

Installation
Prerequisites
Chrome Browser: Version 88 or higher.
Node.js and Python: For running the local API server (optional, for development).
Local Server: A FastAPI server (e.g., main.py) running on http://localhost:8000.


HOW TO USE:
main.py-backend 
requirement.py contains all dependencies needed to run the backend uvicorn is placed in the file itself so server would automatically run when u execute on VS code or any other editor, to deploy on cloud u can install heroku-cli by installing extension fopr VS Code.

All API-endpoints tested on Postman as well and verified.

CORS error solved by allowOrigins=["*"], user can change extension id as well if error is encountered in integrating backend and frontend. Data such as validation tokens and user data stored in memory as well as in json files like session.json, requests.json and permission.josn.

Load the frontend on chrome as load unpacked and pin the extension if u want.
File Structure
manifest.json: Extension manifest with permissions and settings.
popup.html: Popup UI with "Allow Permission", "Fetch Friend's Feed", and "Friend View" tabs, including request management.
popup.js: JavaScript logic for the popup, including permission token and request handling.
popup.css: Styles for the popup interface.
content.js: Content script to monitor Twitter pages.
background.js: Background service worker for message handling.
extract_cookies_manual.js: Manual cookie extraction script for debugging.
icons/: Icon files for the extension.

No build step is required; edit files directly and reload the extension in Chrome.



Friend’s Role: The friend uses a browser extension to automatically extract their Twitter cookies, which are validated by a backend API to generate a validation_token. The friend then approves the user’s request to access their feeed.

User’s Role: The user enters the friend’s validation_token (shared after approval) to fetch and display the friend’s Twitter home feed.

Workflow:
Friend extracts cookies and gets a validation_token via /validate-cookies.
User requests access using the validation_token and this generates a permission token via /request-friend-feed.
Friend view the request via validation token and returns a list of pending requests and approved friends (those who you gave permission) along with the permission tokens /pending-requests
Friend approves the request via,input is permission token, moves permission token to FRIEND_PERMISSIONS storage /approve-request.
Searches FRIEND_PERMISSIONS for any approved permission token that grants access to that friend's feed ,User fetches the feed via /home-feed using the validation_token.



