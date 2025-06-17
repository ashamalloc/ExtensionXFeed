(function () {
  const token = document.cookie
    .split("; ")
    .find(row => row.startsWith("auth_token="))
    ?.split("=")[1];

  if (token) {
    localStorage.setItem("twitter_auth_token", token);
    console.log("Token injected:", token);
  }
})();

