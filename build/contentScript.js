const script = document.createElement("script");
script.src = chrome.runtime.getURL("injectToken.js");
script.onload = () => script.remove();
(document.head || document.documentElement).appendChild(script);
