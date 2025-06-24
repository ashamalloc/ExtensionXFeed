Twitter Feed Mirror

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
Local Server: A FastAPI server (e.g., main2.py) running on http://localhost:8000.



