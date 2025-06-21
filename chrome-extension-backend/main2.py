from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from twikit import Client
from typing import List, Dict, Any, Optional
import tempfile
import json
import os
import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
import uuid
import threading
from functools import wraps

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# In-memory storage
VALIDATED_SESSIONS = {}  # Store user sessions (including friends)
FRIEND_PERMISSIONS = {}  # Store friend permissions
CLEANUP_THREAD = None

def cleanup_expired_sessions():
    """Background thread to clean up expired sessions and permissions"""
    while True:
        try:
            current_time = datetime.now().timestamp()
            expired_tokens = [token for token, session in VALIDATED_SESSIONS.items() if current_time > session["expires_at"]]
            for token in expired_tokens:
                del VALIDATED_SESSIONS[token]
            expired_permissions = [token for token, perm in FRIEND_PERMISSIONS.items() if current_time > perm["expires_at"]]
            for token in expired_permissions:
                del FRIEND_PERMISSIONS[token]
            if expired_tokens or expired_permissions:
                logger.info(f"Cleaned up {len(expired_tokens)} sessions and {len(expired_permissions)} permissions")
        except Exception as e:
            logger.error(f"Error in cleanup thread: {e}")
        threading.Event().wait(300)

# Rate limiting decorator
REQUEST_COUNTS = {}
RATE_LIMIT_WINDOW = 60
MAX_REQUESTS_PER_WINDOW = 30

def rate_limit(func):
    @wraps(func)
    async def wrapper(*args, **kwargs):
        client_id = "default"
        current_time = datetime.now().timestamp()
        if client_id not in REQUEST_COUNTS:
            REQUEST_COUNTS[client_id] = []
        REQUEST_COUNTS[client_id] = [req_time for req_time in REQUEST_COUNTS[client_id] if current_time - req_time < RATE_LIMIT_WINDOW]
        if len(REQUEST_COUNTS[client_id]) >= MAX_REQUESTS_PER_WINDOW:
            raise HTTPException(status_code=429, detail="Rate limit exceeded")
        REQUEST_COUNTS[client_id].append(current_time)
        return await func(*args, **kwargs)
    return wrapper

@asynccontextmanager
async def lifespan(app: FastAPI):
    global CLEANUP_THREAD
    logger.info("Starting Twitter Feed API")
    CLEANUP_THREAD = threading.Thread(target=cleanup_expired_sessions, daemon=True)
    CLEANUP_THREAD.start()
    yield
    logger.info("Shutting down Twitter Feed API")

app = FastAPI(title="Twitter Feed API", description="API for fetching Twitter feeds with friend access", version="1.2.2", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["chrome-extension://*", "http://localhost:3000", "http://127.0.0.1:3000"], allow_credentials=True, allow_methods=["GET", "POST"], allow_headers=["*"])

class TokenInput(BaseModel):
    auth_token: str = Field(..., min_length=1, description="Twitter auth token")
    ct0: str = Field(..., min_length=1, description="Twitter ct0 token")
    cookie: str = Field(..., min_length=1, description="Full cookie string")

class FriendRequest(BaseModel):
    friend_validation_token: str = Field(..., min_length=1, description="Friend's validation token")

class HomeFeedRequest(BaseModel):
    friend_validation_token: str = Field(..., min_length=1, description="Friend's validation token to view their feed")
    limit: int = Field(default=20, ge=1, le=100, description="Number of tweets to return")

class TweetResponse(BaseModel):
    id: str
    text: str
    created_at: str
    user: Dict[str, str]
    retweet_count: int
    favorite_count: int
    url: Optional[str] = None

class FeedResponse(BaseModel):
    success: bool
    tweets: List[TweetResponse]
    count: int
    authenticated_user: Dict[str, str]
    timestamp: str
    feed_type: str = "home"

class ValidationResponse(BaseModel):
    valid: bool
    user: Optional[Dict[str, str]] = None
    validation_token: str
    timestamp: str
    expires_at: str
    error: Optional[str] = None

class PermissionResponse(BaseModel):
    success: bool
    friend_validation_token: str
    permitted: bool
    permission_token: str
    timestamp: str
    expires_at: str
    error: Optional[str] = None

# Utility functions (unchanged)
async def safe_await(coro):
    try:
        if coro is None:
            return None
        if asyncio.iscoroutine(coro):
            return await coro
        return coro
    except Exception as e:
        logger.error(f"Error in safe_await: {e}")
        return None

def parse_cookies(auth_token: str, ct0: str, cookie_string: str) -> Dict[str, str]:
    if not auth_token or not auth_token.strip():
        raise ValueError("auth_token is required and cannot be empty")
    if not ct0 or not ct0.strip():
        raise ValueError("ct0 is required and cannot be empty")
    cookies_dict = {"auth_token": auth_token.strip(), "ct0": ct0.strip()}
    try:
        if cookie_string and cookie_string.strip():
            for item in cookie_string.split(";"):
                item = item.strip()
                if "=" in item and item:
                    try:
                        key, value = item.split("=", 1)
                        key = key.strip()
                        value = value.strip()
                        if key and value and key not in cookies_dict:
                            cookies_dict[key] = value
                    except ValueError:
                        continue
        logger.info(f"Parsed cookies: {', '.join(cookies_dict.keys())}")
        return cookies_dict
    except Exception as e:
        logger.error(f"Error parsing cookies: {e}")
        return {"auth_token": auth_token.strip(), "ct0": ct0.strip()}

def extract_user_data(user_data, method_used: str) -> Dict[str, Any]:
    try:
        if user_data is None:
            return None
        if hasattr(user_data, 'id'):
            return {
                "id": str(user_data.id),
                "name": getattr(user_data, 'name', getattr(user_data, 'display_name', 'Unknown')),
                "screen_name": getattr(user_data, 'screen_name', getattr(user_data, 'username', 'unknown')),
                "method_used": method_used
            }
        elif isinstance(user_data, dict):
            return {
                "id": str(user_data.get('id', user_data.get('user_id', 'unknown'))),
                "name": user_data.get('name', user_data.get('display_name', 'Unknown')),
                "screen_name": user_data.get('screen_name', user_data.get('username', 'unknown')),
                "method_used": method_used
            }
        else:
            user_str = str(user_data)
            return {
                "id": "extracted_user",
                "name": "Authenticated User",
                "screen_name": "authenticated",
                "method_used": f"{method_used} (fallback)",
                "raw_data": user_str[:100]
            }
    except Exception as e:
        logger.error(f"Error extracting user data: {e}")
        return {
            "id": "error_user",
            "name": "Error User",
            "screen_name": "error",
            "method_used": f"{method_used} (error)",
            "error": str(e)
        }

async def try_alternative_auth_verification(client: Client) -> Optional[Dict[str, Any]]:
    try:
        logger.info("Trying to verify auth via user timeline...")
        if hasattr(client, 'get_user_tweets'):
            result = await safe_await(client.get_user_tweets('me', count=1))
            if result and len(result) > 0:
                logger.info("Authentication verified via user timeline access")
                return {
                    "id": "timeline_verified",
                    "name": "Authenticated User",
                    "screen_name": "authenticated",
                    "method_used": "timeline_verification"
                }
    except Exception as e:
        logger.warning(f"Timeline verification failed: {e}")
    try:
        logger.info("Trying to verify auth via authenticated search...")
        search_result = client.search_tweet("test", "Latest")
        tweets = await safe_await(search_result)
        if tweets and len(tweets) > 0:
            logger.info("Authentication seems to work - search returned results")
            return {
                "id": "search_verified",
                "name": "Authenticated User",
                "screen_name": "authenticated",
                "method_used": "search_verification",
                "note": f"Found {len(tweets)} tweets in search"
            }
    except Exception as e:
        logger.error(f"Search verification failed: {e}")
    try:
        logger.info("Checking client properties for user info...")
        properties_to_check = ['user_id', 'current_user_id', 'authenticated_user_id', '_user', '_current_user', 'me']
        for prop in properties_to_check:
            if hasattr(client, prop):
                value = getattr(client, prop)
                if value:
                    logger.info(f"Found user info in client property: {prop}")
                    return {
                        "id": str(value) if not isinstance(value, dict) else str(value.get('id', 'property_user')),
                        "name": "Authenticated User",
                        "screen_name": "authenticated",
                        "method_used": f"client_property_{prop}",
                        "property_value": str(value)[:100]
                    }
    except Exception as e:
        logger.warning(f"Property check failed: {e}")
    return None

async def get_user_info_compatible(client: Client) -> Optional[Dict[str, Any]]:
    methods_to_try = [("get_me", True), ("me", False), ("get_user", True), ("user", False), ("get_authenticated_user", True), ("authenticated_user", False), ("current_user", False), ("get_current_user", True)]
    for method_name, is_async in methods_to_try:
        if hasattr(client, method_name):
            try:
                logger.info(f"Trying method: {method_name} (async: {is_async})")
                method = getattr(client, method_name)
                if callable(method):
                    if is_async:
                        try:
                            result = await method()
                        except TypeError:
                            result = method()
                    else:
                        result = method()
                        if asyncio.iscoroutine(result):
                            result = await result
                else:
                    result = method
                if result:
                    logger.info(f"Successfully got user info via {method_name}")
                    return extract_user_data(result, method_name)
            except Exception as e:
                logger.warning(f"Method {method_name} failed: {e}")
                continue
    return await try_alternative_auth_verification(client)

async def create_authenticated_client(tokens: TokenInput) -> tuple[Client, str, Optional[Dict[str, Any]]]:
    temp_file = None
    try:
        client = Client('en-US')
        cookies_dict = parse_cookies(tokens.auth_token, tokens.ct0, tokens.cookie)
        logger.info(f"Processing cookies. Keys found: {list(cookies_dict.keys())}")
        required_cookies = ['auth_token', 'ct0']
        missing_cookies = [cookie for cookie in required_cookies if not cookies_dict.get(cookie)]
        if missing_cookies:
            raise Exception(f"Missing required cookies: {missing_cookies}")
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(cookies_dict, f)
            temp_file = f.name
        logger.info("Loading cookies into client...")
        result = client.load_cookies(temp_file)
        if asyncio.iscoroutine(result):
            await result
        logger.info("Cookies loaded successfully")
        logger.info("Testing authentication...")
        user_info = await get_user_info_compatible(client)
        if user_info:
            logger.info(f"Authentication successful for user: {user_info}")
            return client, temp_file, user_info
        else:
            try:
                logger.info("Attempting final authentication test...")
                test_search = client.search_tweet("twitter", "Latest")
                test_result = await safe_await(test_search)
                if test_result:
                    logger.info("Authentication confirmed via API test")
                    return client, temp_file, {
                        "id": "api_confirmed",
                        "name": "Authenticated User",
                        "screen_name": "authenticated",
                        "method_used": "final_api_test"
                    }
            except Exception as e:
                logger.error(f"Final API test failed: {e}")
            raise Exception("Could not verify authentication - all verification methods failed")
    except Exception as e:
        if temp_file and os.path.exists(temp_file):
            try:
                os.unlink(temp_file)
            except:
                pass
        raise Exception(f"Client creation failed: {str(e)}")

def format_tweet(tweet) -> Dict[str, Any]:
    try:
        tweet_id = str(getattr(tweet, 'id', 'unknown'))
        user_screen_name = getattr(tweet.user, 'screen_name', 'unknown') if hasattr(tweet, 'user') else 'unknown'
        return {
            "id": tweet_id,
            "text": getattr(tweet, 'text', getattr(tweet, 'full_text', 'No text available')),
            "created_at": str(getattr(tweet, 'created_at', datetime.now().isoformat())),
            "user": {
                "id": str(getattr(tweet.user, 'id', 'unknown')) if hasattr(tweet, 'user') else 'unknown',
                "name": getattr(tweet.user, 'name', 'Unknown') if hasattr(tweet, 'user') else 'Unknown',
                "screen_name": user_screen_name,
            },
            "retweet_count": getattr(tweet, 'retweet_count', getattr(tweet, 'public_metrics', {}).get('retweet_count', 0)),
            "favorite_count": getattr(tweet, 'favorite_count', getattr(tweet, 'public_metrics', {}).get('like_count', 0)),
            "url": f"https://twitter.com/{user_screen_name}/status/{tweet_id}" if user_screen_name != 'unknown' and tweet_id != 'unknown' else None
        }
    except Exception as e:
        logger.error(f"Error formatting tweet: {e}")
        return {
            "id": "error",
            "text": "Error processing tweet",
            "created_at": datetime.now().isoformat(),
            "user": {"id": "unknown", "name": "Unknown", "screen_name": "unknown"},
            "retweet_count": 0,
            "favorite_count": 0,
            "url": None
        }

async def fetch_home_timeline(client: Client, limit: int = 20) -> List[Any]:
    timeline_methods = [("get_home_timeline", lambda: client.get_home_timeline(count=limit)), ("home_timeline", lambda: client.home_timeline(count=limit)), ("get_timeline", lambda: client.get_timeline(count=limit)), ("timeline", lambda: client.timeline(count=limit)), ("get_home_tweets", lambda: client.get_home_tweets(count=limit)), ("home_tweets", lambda: client.home_tweets(count=limit)), ("get_feed", lambda: client.get_feed(count=limit)), ("feed", lambda: client.feed(count=limit))]
    for method_name, method_call in timeline_methods:
        method_attr = method_name.split('(')[0]
        if hasattr(client, method_attr):
            try:
                logger.info(f"Trying to fetch home timeline via: {method_name}")
                result = await safe_await(method_call())
                if result and len(result) > 0:
                    logger.info(f"Successfully fetched {len(result)} tweets via {method_name}")
                    return result
                else:
                    logger.warning(f"Method {method_name} returned empty result")
            except Exception as e:
                logger.warning(f"Method {method_name} failed: {e}")
                continue
    logger.info("All timeline methods failed, trying user tweets as fallback...")
    user_tweet_methods = [("get_user_tweets", lambda user: client.get_user_tweets(user, count=limit)), ("user_tweets", lambda user: client.user_tweets(user, count=limit))]
    user_identifiers = ['me', 'self', None]
    for method_name, method_call in user_tweet_methods:
        if hasattr(client, method_name):
            for user_id in user_identifiers:
                try:
                    logger.info(f"Trying {method_name} with user_id: {user_id}")
                    result = await safe_await(method_call(user_id))
                    if result and len(result) > 0:
                        logger.info(f"Successfully fetched {len(result)} user tweets via {method_name}")
                        return result
                except Exception as e:
                    logger.warning(f"Method {method_name} with user {user_id} failed: {e}")
                    continue
    logger.error("All methods to fetch home timeline failed")
    return []

# API Endpoints
@app.post("/validate-cookies", response_model=ValidationResponse)
@rate_limit
async def validate_cookies(data: TokenInput):
    temp_file = None
    try:
        client, temp_file, user_info = await create_authenticated_client(data)
        validation_token = str(uuid.uuid4())
        expires_at = datetime.now() + timedelta(hours=1)
        VALIDATED_SESSIONS[validation_token] = {
            "user_info": user_info,
            "tokens": data,
            "expires_at": expires_at.timestamp()
        }
        logger.info(f"Validation successful for user: {user_info.get('screen_name', 'unknown')}, token: {validation_token}")
        return ValidationResponse(
            valid=True,
            user=user_info,
            validation_token=validation_token,
            timestamp=datetime.now().isoformat(),
            expires_at=expires_at.isoformat()
        )
    except Exception as e:
        logger.error(f"Cookie validation failed: {e}")
        return ValidationResponse(
            valid=False,
            error=str(e),
            validation_token="",
            timestamp=datetime.now().isoformat(),
            expires_at=""
        )
    finally:
        if temp_file and os.path.exists(temp_file):
            try:
                os.unlink(temp_file)
            except:
                pass

@app.post("/home-feed", response_model=FeedResponse)
@rate_limit
async def get_home_feed(request: HomeFeedRequest):
    temp_file = None
    try:
        friend_token = request.friend_validation_token
        if friend_token not in VALIDATED_SESSIONS:
            raise HTTPException(status_code=401, detail="Invalid or expired friend validation token")
        session = VALIDATED_SESSIONS[friend_token]
        if datetime.now().timestamp() > session["expires_at"]:
            del VALIDATED_SESSIONS[friend_token]
            raise HTTPException(status_code=401, detail="Friend validation token expired")

        if friend_token not in FRIEND_PERMISSIONS or not FRIEND_PERMISSIONS[friend_token].get("permitted", False):
            raise HTTPException(status_code=403, detail="No permission to access friend's feed")

        friend_tokens = session["tokens"]
        client, temp_file, friend_user_info = await create_authenticated_client(friend_tokens)
        logger.info(f"Fetching friend's feed for: {friend_user_info.get('screen_name', 'unknown')}")

        home_tweets = await fetch_home_timeline(client, request.limit)
        tweet_data = []
        if home_tweets:
            for tweet in home_tweets[:request.limit]:
                formatted_tweet = format_tweet(tweet)
                if formatted_tweet["id"] != "error":
                    tweet_data.append(formatted_tweet)

        return FeedResponse(
            success=True,
            tweets=tweet_data,
            count=len(tweet_data),
            authenticated_user=friend_user_info or {},
            timestamp=datetime.now().isoformat(),
            feed_type="home"
        )
    except HTTPException as e:
        logger.error(f"Home feed error: {e.detail}")
        raise e
    except Exception as e:
        logger.error(f"Home feed error: {e}")
        raise HTTPException(status_code=400, detail=f"Home feed error: {str(e)}")
    finally:
        if temp_file and os.path.exists(temp_file):
            try:
                os.unlink(temp_file)
            except:
                pass

@app.post("/request-friend-feed", response_model=PermissionResponse)
@rate_limit
async def request_friend_feed(request: FriendRequest):
    friend_token = request.friend_validation_token
    if friend_token not in VALIDATED_SESSIONS:
        raise HTTPException(status_code=404, detail="Friend's validation token not found")
    session = VALIDATED_SESSIONS[friend_token]
    if datetime.now().timestamp() > session["expires_at"]:
        del VALIDATED_SESSIONS[friend_token]
        raise HTTPException(status_code=401, detail="Friend's validation token expired")
    permission_token = str(uuid.uuid4())
    expires_at = datetime.now() + timedelta(hours=1)
    FRIEND_PERMISSIONS[friend_token] = {
        "permitted": False,
        "permission_token": permission_token,
        "expires_at": expires_at.timestamp()
    }
    logger.info(f"Requested access to friend's feed with token: {permission_token}")
    return PermissionResponse(
        success=True,
        friend_validation_token=friend_token,
        permitted=False,
        permission_token=permission_token,
        timestamp=datetime.now().isoformat(),
        expires_at=expires_at.isoformat()
    )

@app.post("/approve-friend", response_model=PermissionResponse)
@rate_limit
async def approve_friend(request: dict):
    friend_token = request.get("friend_validation_token")
    approve = request.get("approve", False)
    if friend_token not in FRIEND_PERMISSIONS:
        raise HTTPException(status_code=404, detail="Permission token not found")
    perm = FRIEND_PERMISSIONS[friend_token]
    perm["permitted"] = approve
    logger.info(f"Friend approval for token {friend_token}: {approve}")
    return PermissionResponse(
        success=True,
        friend_validation_token=friend_token,
        permitted=approve,
        permission_token=perm["permission_token"],
        timestamp=datetime.now().isoformat(),
        expires_at=datetime.fromtimestamp(perm["expires_at"]).isoformat()
    )

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "active_sessions": len(VALIDATED_SESSIONS)
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)