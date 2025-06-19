from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from twikit import Client

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class TokenInput(BaseModel):
    auth_token: str
    ct0: str
    cookie: str  # Full cookie string

@app.post("/fetch-feed")
async def fetch_feed(data: TokenInput):
    try:
        # Save cookies into a file so twikit can read it
        cookies_dict = {
            "auth_token": data.auth_token,
            "ct0": data.ct0,
        }

        for item in data.cookie.split(";"):
            if "=" in item:
                k, v = item.strip().split("=", 1)
                cookies_dict[k.strip()] = v.strip()

        # Save as cookies.json
        import json
        with open("cookies.json", "w") as f:
            json.dump(cookies_dict, f)

        # Init client and load cookies from file
        client = Client()
        client.load_cookies("cookies.json")  # ✅ this method is supported

        # Confirm login works
        client.fetch_user()
        home = client.timeline.get_home_timeline()

        return {"tweets": home}
    except Exception as e:
        return {"error": str(e)}
