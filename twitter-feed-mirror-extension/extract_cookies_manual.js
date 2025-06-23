function extractTwitterCookies() {
    console.log("Extracting Twitter cookies...");
    
   
    const cookies = document.cookie.split(';').reduce((acc, cookie) => {
        const [name, value] = cookie.trim().split('=');
        if (name && value) {
            acc[name] = value;
        }
        return acc;
    }, {});
    
   
    const authToken = cookies['auth_token'];
    const ct0 = cookies['ct0'];
    
    if (!authToken || !ct0) {
        console.error("Required cookies not found. Make sure you're logged in to Twitter.");
        return null;
    }
    
  
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
    
  
    navigator.clipboard.writeText(JSON.stringify(result, null, 2))
        .then(() => console.log("Cookie data copied to clipboard!"))
        .catch(err => console.error("Failed to copy to clipboard:", err));
    
    return result;
}


extractTwitterCookies();
