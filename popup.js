document.getElementById("fetch").addEventListener("click", () => {
  const screenName = document.getElementById("screenName").value;
  fetch(`http://localhost:8000/tweets/${screenName}`)
    .then(res => res.json())
    .then(tweets => {
      const list = document.getElementById("tweets");
      list.innerHTML = "";
      tweets.forEach(tweet => {
        const li = document.createElement("li");
        li.textContent = `${tweet.time}: ${tweet.text}`;
        list.appendChild(li);
      });
    })
    .catch(err => console.error("Error:", err));
});
