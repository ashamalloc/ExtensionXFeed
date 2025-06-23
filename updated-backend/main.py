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
USER_PENDING_REQUESTS = {}  # Store pending requests per user
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
            # Clean up expired pending requests
            for user_token in list(USER_PENDING_REQUESTS.keys()):
                USER_PENDING_REQUESTS[user_token] = [
                    req for req in USER_PENDING_REQUESTS[user_token] 
                    if current_time < req["expires_at"]
                ]
                if not USER_PENDING_REQUESTS[user_token]:
                    del USER_PENDING_REQUESTS[user_token]
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
app.add_middleware(CORSMiddleware, allow_origins=["chrome-extension://*", "chrome-extension://dpfpajeeohpfakmlmknedeegppcdefdp", "http://localhost:8000", "http://127.0.0.1:8000"], allow_credentials=True, allow_methods=['*'], allow_headers=["*"])
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],     
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
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
    reply_count: Optional[int] = 0
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

class PendingRequestsRequest(BaseModel):
    validation_token: str = Field(..., min_length=1, description="User's validation token")

class PendingRequestsResponse(BaseModel):
    success: bool
    pending_requests: List[Dict[str, Any]]
    approved_friends: List[Dict[str, Any]]
    count: int
    timestamp: str

class ApprovalRequest(BaseModel):
    permission_token: str = Field(..., min_length=1, description="Permission token to approve/deny")
    approve: bool = Field(..., description="Whether to approve or deny the request")

class ApprovalResponse(BaseModel):
    success: bool
    permission_token: str
    approved: bool
    timestamp: str
    expires_at: Optional[str] = None
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
            logger.info(f"Authentication successful: {user_info}")
            return client, temp_file, user_info
        else:
            logger.warning("Could not get user info, but client seems to work")
            return client, temp_file, {
                "id": "anonymous_authenticated",
                "name": "Authenticated User",
                "screen_name": "authenticated",
                "method_used": "anonymous_validation"
            }
    except Exception as e:
        if temp_file and os.path.exists(temp_file):
            os.unlink(temp_file)
        logger.error(f"Authentication failed: {e}")
        raise Exception(f"Authentication failed: {str(e)}")

async def extract_tweet_data(tweet) -> Dict[str, Any]:
    try:
        tweet_data = {
            "id": str(getattr(tweet, 'id', getattr(tweet, 'tweet_id', 'unknown'))),
            "text": getattr(tweet, 'text', getattr(tweet, 'full_text', 'No text available')),
            "created_at": str(getattr(tweet, 'created_at', datetime.now().isoformat())),
            "retweet_count": getattr(tweet, 'retweet_count', 0),
            "favorite_count": getattr(tweet, 'favorite_count', getattr(tweet, 'like_count', 0)),
            "reply_count": getattr(tweet, 'reply_count', 0)
        }
        user_obj = getattr(tweet, 'user', getattr(tweet, 'author', None))
        if user_obj:
            tweet_data["user"] = {
                "name": getattr(user_obj, 'name', getattr(user_obj, 'display_name', 'Unknown User')),
                "screen_name": getattr(user_obj, 'screen_name', getattr(user_obj, 'username', 'unknown'))
            }
        else:
            tweet_data["user"] = {
                "name": "Unknown User",
                "screen_name": "unknown"
            }
        if hasattr(tweet, 'url') or hasattr(tweet, 'permalink'):
            tweet_data["url"] = getattr(tweet, 'url', getattr(tweet, 'permalink', None))
        return tweet_data
    except Exception as e:
        logger.error(f"Error extracting tweet data: {e}")
        return {
            "id": "error_tweet",
            "text": f"Error extracting tweet: {str(e)}",
            "created_at": datetime.now().isoformat(),
            "user": {"name": "Error", "screen_name": "error"},
            "retweet_count": 0,
            "favorite_count": 0,
            "reply_count": 0
        }

@app.get("/")
async def root():
    return {
        "service": "Twitter Feed API",
        "version": "1.2.2",
        "status": "running",
        "endpoints": {
            "validate_cookies": "POST /validate-cookies",
            "request_friend_feed": "POST /request-friend-feed",
            "home_feed": "POST /home-feed",
            "pending_requests": "POST /pending-requests",
            "approve_request": "POST /approve-request"
        },
        "active_sessions": len(VALIDATED_SESSIONS),
        "active_permissions": len(FRIEND_PERMISSIONS),
        "pending_requests_count": sum(len(reqs) for reqs in USER_PENDING_REQUESTS.values())
    }

@app.post("/validate-cookies", response_model=ValidationResponse)
@rate_limit
async def validate_cookies(tokens: TokenInput):
    try:
        client, temp_file, user_info = await create_authenticated_client(tokens)
        validation_token = str(uuid.uuid4())
        expires_at = datetime.now() + timedelta(hours=24)
        VALIDATED_SESSIONS[validation_token] = {
            "client": client,
            "temp_file": temp_file,
            "user_info": user_info,
            "created_at": datetime.now().timestamp(),
            "expires_at": expires_at.timestamp(),
            "tokens": {
                "auth_token": tokens.auth_token,
                "ct0": tokens.ct0,
                "cookie": tokens.cookie
            }
        }
        logger.info(f"Session created for user: {user_info.get('screen_name', 'unknown')} (token: {validation_token[:8]}...)")
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
            validation_token="",
            timestamp=datetime.now().isoformat(),
            expires_at="",
            error=str(e)
        )

@app.post("/request-friend-feed", response_model=PermissionResponse)
@rate_limit
async def request_friend_feed(request: FriendRequest):
    try:
        friend_token = request.friend_validation_token
        if friend_token not in VALIDATED_SESSIONS:
            raise HTTPException(status_code=404, detail="Friend's validation token not found or expired")
        
        permission_token = str(uuid.uuid4())
        expires_at = datetime.now() + timedelta(hours=24)
        
        # Add to pending requests for the friend
        if friend_token not in USER_PENDING_REQUESTS:
            USER_PENDING_REQUESTS[friend_token] = []
        
        request_data = {
            "permission_token": permission_token,
            "friend_validation_token": friend_token,
            "status": "pending",
            "created_at": datetime.now().timestamp(),
            "expires_at": expires_at.timestamp(),
            "timestamp": datetime.now().isoformat(),
            "requester_info": {
                "request_time": datetime.now().isoformat(),
                "expires_at": expires_at.isoformat()
            }
        }
        
        USER_PENDING_REQUESTS[friend_token].append(request_data)
        
        logger.info(f"Friend feed request created: {permission_token[:8]}... for friend {friend_token[:8]}...")
        
        return PermissionResponse(
            success=True,
            friend_validation_token=friend_token,
            permitted=False,  # Pending approval
            permission_token=permission_token,
            timestamp=datetime.now().isoformat(),
            expires_at=expires_at.isoformat()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Request friend feed failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/pending-requests", response_model=PendingRequestsResponse)
@rate_limit
async def get_pending_requests(request: PendingRequestsRequest):
    try:
        validation_token = request.validation_token
        
        if validation_token not in VALIDATED_SESSIONS:
            raise HTTPException(status_code=404, detail="Validation token not found or expired")
        
        # Get pending requests for this user
        pending_requests = USER_PENDING_REQUESTS.get(validation_token, [])
        
        # Filter only pending requests (not approved/denied)
        current_time = datetime.now().timestamp()
        active_pending = [
            req for req in pending_requests 
            if req["status"] == "pending" and current_time < req["expires_at"]
        ]
        
        # Get approved friends (from FRIEND_PERMISSIONS)
        approved_friends = [
            {
                "permission_token": token,
                "friend_validation_token": perm["friend_validation_token"],
                "approved_at": datetime.fromtimestamp(perm["created_at"]).isoformat(),
                "expires_at": datetime.fromtimestamp(perm["expires_at"]).isoformat(),
                "status": "approved"
            }
            for token, perm in FRIEND_PERMISSIONS.items()
            if perm["friend_validation_token"] == validation_token and current_time < perm["expires_at"]
        ]
        
        logger.info(f"Retrieved {len(active_pending)} pending requests and {len(approved_friends)} approved friends for {validation_token[:8]}...")
        
        return PendingRequestsResponse(
            success=True,
            pending_requests=active_pending,
            approved_friends=approved_friends,
            count=len(active_pending),
            timestamp=datetime.now().isoformat()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get pending requests failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/approve-request", response_model=ApprovalResponse)
@rate_limit
async def approve_request(request: ApprovalRequest):
    try:
        permission_token = request.permission_token
        approve = request.approve
        
        # Find the request in USER_PENDING_REQUESTS
        request_data = None
        user_token = None
        
        for token, requests in USER_PENDING_REQUESTS.items():
            for req in requests:
                if req["permission_token"] == permission_token:
                    request_data = req
                    user_token = token
                    break
            if request_data:
                break
        
        if not request_data:
            raise HTTPException(status_code=404, detail="Permission token not found")
        
        if request_data["status"] != "pending":
            raise HTTPException(status_code=400, detail="Request already processed")
        
        # Check if request is expired
        current_time = datetime.now().timestamp()
        if current_time > request_data["expires_at"]:
            raise HTTPException(status_code=400, detail="Request has expired")
        
        # Update request status
        request_data["status"] = "approved" if approve else "denied"
        request_data["processed_at"] = current_time
        
        expires_at = None
        if approve:
            # Create permission entry
            expires_at = datetime.now() + timedelta(hours=24)
            FRIEND_PERMISSIONS[permission_token] = {
                "friend_validation_token": request_data["friend_validation_token"],
                "permission_token": permission_token,
                "created_at": current_time,
                "expires_at": expires_at.timestamp(),
                "approved": True
            }
            logger.info(f"Request approved: {permission_token[:8]}...")
        else:
            logger.info(f"Request denied: {permission_token[:8]}...")
        
        return ApprovalResponse(
            success=True,
            permission_token=permission_token,
            approved=approve,
            timestamp=datetime.now().isoformat(),
            expires_at=expires_at.isoformat() if expires_at else None
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Approve request failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/home-feed", response_model=FeedResponse)
@rate_limit
async def get_home_feed(request: HomeFeedRequest):
    try:
        friend_token = request.friend_validation_token
        limit = min(request.limit, 100)
        
        if friend_token not in VALIDATED_SESSIONS:
            raise HTTPException(status_code=404, detail="Friend's validation token not found or expired")
        
        # Check if we have permission to access this friend's feed
        # Look for approved permission in FRIEND_PERMISSIONS
        has_permission = False
        for permission_token, perm in FRIEND_PERMISSIONS.items():
            if (perm["friend_validation_token"] == friend_token and 
                perm["approved"] and 
                datetime.now().timestamp() < perm["expires_at"]):
                has_permission = True
                break
        
        if not has_permission:
            raise HTTPException(status_code=403, detail="No valid permission to access this friend's feed. Request access first and wait for approval.")
        
        logger.info(f"Permission verified for accessing {friend_token[:8]}... feed")
        
        session = VALIDATED_SESSIONS[friend_token]
        client = session["client"]
        user_info = session["user_info"]
        
        logger.info(f"Fetching home feed for {user_info.get('screen_name', 'unknown')} (limit: {limit})")
        
        # Try different methods to get home timeline
        tweets_data = []
        
        try:
            # Method 1: Try get_timeline
            if hasattr(client, 'get_timeline'):
                logger.info("Trying get_timeline method...")
                timeline = await safe_await(client.get_timeline(count=limit))
                if timeline:
                    for tweet in timeline[:limit]:
                        tweet_data = await extract_tweet_data(tweet)
                        tweets_data.append(tweet_data)
            
            # Method 2: Try get_home_timeline if available
            elif hasattr(client, 'get_home_timeline'):
                logger.info("Trying get_home_timeline method...")
                timeline = await safe_await(client.get_home_timeline(count=limit))
                if timeline:
                    for tweet in timeline[:limit]:
                        tweet_data = await extract_tweet_data(tweet)
                        tweets_data.append(tweet_data)
            
            # Method 3: Try search for recent tweets as fallback
            else:
                logger.info("Using search as fallback...")
                search_results = await safe_await(client.search_tweet("", "Latest", count=limit))
                if search_results:
                    for tweet in search_results[:limit]:
                        tweet_data = await extract_tweet_data(tweet)
                        tweets_data.append(tweet_data)
        
        except Exception as e:
            logger.warning(f"Timeline fetch failed, using fallback: {e}")
            # Create sample tweets as absolute fallback
            tweets_data = [{
                "id": f"fallback_{i}",
                "text": f"Timeline access temporarily unavailable. This is a fallback message {i+1}.",
                "created_at": datetime.now().isoformat(),
                "user": {
                    "name": user_info.get("name", "User"),
                    "screen_name": user_info.get("screen_name", "user")
                },
                "retweet_count": 0,
                "favorite_count": 0,
                "reply_count": 0
            } for i in range(min(5, limit))]
        
        logger.info(f"Retrieved {len(tweets_data)} tweets for home feed")
        
        # Convert tweet data to TweetResponse objects
        tweet_responses = []
        for tweet_data in tweets_data:
            tweet_responses.append(TweetResponse(
                id=tweet_data["id"],
                text=tweet_data["text"],
                created_at=tweet_data["created_at"],
                user=tweet_data["user"],
                retweet_count=tweet_data["retweet_count"],
                favorite_count=tweet_data["favorite_count"],
                reply_count=tweet_data.get("reply_count", 0),
                url=tweet_data.get("url")
            ))
        
        return FeedResponse(
            success=True,
            tweets=tweet_responses,
            count=len(tweet_responses),
            authenticated_user=user_info,
            timestamp=datetime.now().isoformat(),
            feed_type="home"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get home feed failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch home feed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
