// Manual Cookie Extraction Script for Twitter
// Run this in Chrome DevTools console while on twitter.com

function extractTwitterCookies() {
    console.log("Extracting Twitter cookies...");
    
    // Get all cookies for the current domain
    const cookies = document.cookie.split(';').reduce((acc, cookie) => {
        const [name, value] = cookie.trim().split('=');
        if (name && value) {
            acc[name] = value;
        }
        return acc;
    }, {});
    
    // Find required cookies
    const authToken = cookies['auth_token'];
    const ct0 = cookies['ct0'];
    
    if (!authToken || !ct0) {
        console.error("Required cookies not found. Make sure you're logged in to Twitter.");
        return null;
    }
    
    // Build cookie string
    const cookieString = document.cookie;
    
    const result = {
        auth_token: authToken,
        ct0: ct0,
        cookie: cookieString
    };
    
    console.log("Cookies extracted successfully:");
    console.log("Auth Token:", authToken.substring(0, 20) + "...");
    console.log("CT0 Token:", ct0.substring(0, 20) + "...");
    console.log("Full cookie string length:", cookieString.length);
    
    // Copy to clipboard
    navigator.clipboard.writeText(JSON.stringify(result, null, 2))
        .then(() => console.log("Cookie data copied to clipboard!"))
        .catch(err => console.error("Failed to copy to clipboard:", err));
    
    return result;
}

// Run the extraction
extractTwitterCookies();
