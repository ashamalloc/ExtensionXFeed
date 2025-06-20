from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import asyncio
from twikit import Client
import os

app = FastAPI()

# Allow frontend from your extension (or local dev)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For dev; tighten this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/tweets/{screen_name}")
async def get_tweets(screen_name: str):
    if os.path.exists("twitter.json"):
        os.remove("twitter.json")

    client = Client(language='en-US')
    await client.login(
        auth_info_1="mani8888kumari",
        auth_info_2=None,
        password="785#Twitter",
        cookies_file="twitter.json",
        enable_ui_metrics=True
    )

    user = await client.get_user_by_screen_name(screen_name)
    tweets = await user.get_tweets("Tweets", count=5)
    tweet_list = []
    for tweet in tweets:
        tweet_list.append({
            "text": tweet.text,
            "time": str(tweet.created_at)
        })
    return tweet_list
