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
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Lifespan context manager for cleanup
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Twitter Feed API")
    yield
    logger.info("Shutting down Twitter Feed API")

app = FastAPI(
    title="Twitter Feed API",
    description="API for fetching Twitter feeds using twikit",
    version="1.0.0",
    lifespan=lifespan
)

# Allow CORS (for frontend extension communication)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enhanced request models
class TokenInput(BaseModel):
    auth_token: str = Field(..., description="Twitter auth token")
    ct0: str = Field(..., description="Twitter ct0 token")
    cookie: str = Field(..., description="Full cookie string")

class SearchRequest(BaseModel):
    tokens: TokenInput
    query: str = Field(default="twitter", description="Search query")
    tweet_type: str = Field(default="Latest", description="Tweet type: Latest, Top, etc.")
    limit: int = Field(default=10, ge=1, le=50, description="Number of tweets to return")

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

# Utility functions
async def safe_await(coro):
    """Safely await a coroutine, handling cases where it might not be awaitable"""
    try:
        if coro is None:
            return None
        if asyncio.iscoroutine(coro):
            return await coro
        else:
            return coro
    except Exception as e:
        logger.error(f"Error in safe_await: {e}")
        logger.error(f"Coroutine type: {type(coro)}")
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")
        return None

def parse_cookies(auth_token: str, ct0: str, cookie_string: str) -> Dict[str, str]:
    """Parse and structure cookies from input"""
    cookies_dict = {
        "auth_token": auth_token,
        "ct0": ct0,
    }
    
    # Add other cookies from full cookie string
    try:
        for item in cookie_string.split(";"):
            if "=" in item:
                key, value = item.strip().split("=", 1)
                if key and value and key not in cookies_dict:
                    # Clean up key and value
                    key = key.strip()
                    value = value.strip()
                    cookies_dict[key] = value
        
        logger.info(f"Parsed cookies: {', '.join(cookies_dict.keys())}")
        
        # Check for essential cookies
        essential_cookies = ["auth_token", "ct0"]
        missing_cookies = [cookie for cookie in essential_cookies if not cookies_dict.get(cookie)]
        if missing_cookies:
            logger.warning(f"Missing essential cookies: {missing_cookies}")
        
        return cookies_dict
        
    except Exception as e:
        logger.error(f"Error parsing cookies: {e}")
        # Return basic cookies even if parsing fails
        return {
            "auth_token": auth_token,
            "ct0": ct0,
        }

async def create_authenticated_client(tokens: TokenInput) -> tuple[Client, str]:
    """Create and authenticate a Twitter client"""
    client = Client('en-US')
    cookies_dict = parse_cookies(tokens.auth_token, tokens.ct0, tokens.cookie)
    
    # Debug: Log cookie information (without sensitive values)
    logger.info(f"Processing cookies. Keys found: {list(cookies_dict.keys())}")
    logger.info(f"auth_token length: {len(tokens.auth_token) if tokens.auth_token else 0}")
    logger.info(f"ct0 length: {len(tokens.ct0) if tokens.ct0 else 0}")
    
    # Create temporary file for cookies
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        json.dump(cookies_dict, f)
        temp_file = f.name
    
    logger.info(f"Cookies saved to temporary file: {temp_file}")
    
    try:
        # Load cookies with better error handling
        try:
            result = client.load_cookies(temp_file)
            if asyncio.iscoroutine(result):
                await result
            logger.info("Cookies loaded successfully")
        except Exception as load_error:
            logger.error(f"Failed to load cookies: {load_error}")
            raise Exception(f"Cookie loading failed: {str(load_error)}")
        
        # Test authentication with detailed error reporting
        try:
            logger.info("Attempting to authenticate...")
            
            # Try different methods to get user info
            methods_to_try = [
                ("get_me", lambda: client.get_me()),
                ("get_user_by_screen_name", lambda: client.get_user_by_screen_name("twitter")),  # Test with a known user
            ]
            
            for method_name, method_func in methods_to_try:
                try:
                    logger.info(f"Trying {method_name}...")
                    result = method_func()
                    logger.info(f"{method_name} call type: {type(result)}")
                    
                    if asyncio.iscoroutine(result):
                        user_data = await result
                    else:
                        user_data = result
                    
                    logger.info(f"{method_name} result type: {type(user_data)}")
                    
                    if user_data and method_name == "get_me":
                        logger.info(f"Successfully authenticated as: {getattr(user_data, 'name', 'Unknown')} (@{getattr(user_data, 'screen_name', 'unknown')})")
                        return client, temp_file
                    elif user_data and method_name == "get_user_by_screen_name":
                        logger.info(f"API connection successful - able to fetch user data")
                        # Now try get_me again
                        me_result = client.get_me()
                        me = await safe_await(me_result) if asyncio.iscoroutine(me_result) else me_result
                        if me:
                            logger.info(f"Successfully authenticated as: {getattr(me, 'name', 'Unknown')} (@{getattr(me, 'screen_name', 'unknown')})")
                            return client, temp_file
                        else:
                            logger.warning("get_me still returns None even though API connection works")
                    
                except Exception as method_error:
                    logger.error(f"{method_name} failed: {method_error}")
                    continue
            
            raise Exception("All authentication methods failed")
            
        except Exception as auth_error:
            logger.error(f"Authentication error details: {auth_error}")
            logger.error(f"Error type: {type(auth_error)}")
            import traceback
            logger.error(f"Full traceback: {traceback.format_exc()}")
            raise Exception(f"Authentication failed: {str(auth_error)}")
        
    except Exception as e:
        # Clean up on error
        if os.path.exists(temp_file):
            os.unlink(temp_file)
        raise Exception(f"Client creation failed: {str(e)}")

def format_tweet(tweet) -> Dict[str, Any]:
    """Format a tweet object into a standardized dictionary"""
    try:
        tweet_id = str(getattr(tweet, 'id', 'unknown'))
        user_screen_name = getattr(tweet.user, 'screen_name', 'unknown') if hasattr(tweet, 'user') else 'unknown'
        
        return {
            "id": tweet_id,
            "text": getattr(tweet, 'text', 'No text available'),
            "created_at": str(getattr(tweet, 'created_at', datetime.now().isoformat())),
            "user": {
                "id": str(getattr(tweet.user, 'id', 'unknown')) if hasattr(tweet, 'user') else 'unknown',
                "name": getattr(tweet.user, 'name', 'Unknown') if hasattr(tweet, 'user') else 'Unknown',
                "screen_name": user_screen_name,
            },
            "retweet_count": getattr(tweet, 'retweet_count', 0),
            "favorite_count": getattr(tweet, 'favorite_count', 0),
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

# API Endpoints
@app.post("/fetch-feed", response_model=FeedResponse)
async def fetch_feed(data: TokenInput):
    """Fetch user's Twitter feed"""
    temp_file = None
    try:
        client, temp_file = await create_authenticated_client(data)
        
        # Get authenticated user info
        me_result = client.get_me()
        me = await safe_await(me_result)
        
        tweets = []
        
        # Method 1: Try to get user's own tweets
        try:
            user_tweets_result = client.get_user_tweets(me.id, 'Tweets')
            user_tweets = await safe_await(user_tweets_result)
            if user_tweets:
                tweets = user_tweets[:20]  # Limit to 20
                logger.info(f"Got {len(tweets)} user tweets")
        except Exception as e1:
            logger.warning(f"get_user_tweets failed: {e1}")
        
        # Method 2: If no tweets from user, try home timeline (if available)
        if not tweets:
            try:
                # Note: Home timeline might require different permissions
                search_result = client.search_tweet('python OR javascript OR coding', 'Latest')
                search_tweets = await safe_await(search_result)
                if search_tweets:
                    tweets = search_tweets[:15]
                    logger.info(f"Got {len(tweets)} search tweets as fallback")
            except Exception as e2:
                logger.warning(f"Fallback search failed: {e2}")
        
        # Format tweets
        tweet_data = []
        for tweet in tweets:
            formatted_tweet = format_tweet(tweet)
            if formatted_tweet["id"] != "error":
                tweet_data.append(formatted_tweet)
        
        return FeedResponse(
            success=True,
            tweets=tweet_data,
            count=len(tweet_data),
            authenticated_user={
                "id": str(getattr(me, 'id', 'unknown')),
                "name": getattr(me, 'name', 'Unknown'),
                "screen_name": getattr(me, 'screen_name', 'unknown')
            },
            timestamp=datetime.now().isoformat()
        )
        
    except Exception as e:
        logger.error(f"Error in fetch_feed: {e}")
        raise HTTPException(status_code=400, detail=f"Error fetching feed: {str(e)}")
    
    finally:
        if temp_file and os.path.exists(temp_file):
            os.unlink(temp_file)

@app.post("/validate-cookies")
async def validate_cookies(data: TokenInput):
    """Validate Twitter authentication cookies"""
    temp_file = None
    try:
        client, temp_file = await create_authenticated_client(data)
        
        # Get user info
        me_result = client.get_me()
        me = await safe_await(me_result)
        
        return {
            "valid": True,
            "user": {
                "id": str(getattr(me, 'id', 'unknown')),
                "name": getattr(me, 'name', 'Unknown'),
                "screen_name": getattr(me, 'screen_name', 'unknown')
            },
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Cookie validation failed: {e}")
        return {
            "valid": False,
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }
    
    finally:
        if temp_file and os.path.exists(temp_file):
            os.unlink(temp_file)

@app.post("/search")
async def search_tweets(request: SearchRequest):
    """Search for tweets with specified query"""
    temp_file = None
    try:
        client, temp_file = await create_authenticated_client(request.tokens)
        
        # Search tweets
        search_result = client.search_tweet(request.query, request.tweet_type)
        tweets = await safe_await(search_result)
        
        tweet_data = []
        if tweets:
            limited_tweets = tweets[:request.limit]
            for tweet in limited_tweets:
                formatted_tweet = format_tweet(tweet)
                if formatted_tweet["id"] != "error":
                    tweet_data.append(formatted_tweet)
        
        return {
            "success": True,
            "tweets": tweet_data,
            "count": len(tweet_data),
            "query": request.query,
            "tweet_type": request.tweet_type,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Search error: {e}")
        raise HTTPException(status_code=400, detail=f"Search error: {str(e)}")
    
    finally:
        if temp_file and os.path.exists(temp_file):
            os.unlink(temp_file)

@app.get("/search/{query}")
async def search_tweets_get(
    query: str,
    auth_token: str = Query(...),
    ct0: str = Query(...),
    cookie: str = Query(...),
    limit: int = Query(default=10, ge=1, le=50),
    tweet_type: str = Query(default="Latest")
):
    """GET endpoint for searching tweets"""
    tokens = TokenInput(auth_token=auth_token, ct0=ct0, cookie=cookie)
    request = SearchRequest(tokens=tokens, query=query, limit=limit, tweet_type=tweet_type)
    return await search_tweets(request)

@app.get("/user-info")
async def get_user_info(
    auth_token: str = Query(...),
    ct0: str = Query(...),
    cookie: str = Query(...)
):
    """Get authenticated user information"""
    tokens = TokenInput(auth_token=auth_token, ct0=ct0, cookie=cookie)
    temp_file = None
    
    try:
        client, temp_file = await create_authenticated_client(tokens)
        me_result = client.get_me()
        me = await safe_await(me_result)
        
        return {
            "success": True,
            "user": {
                "id": str(getattr(me, 'id', 'unknown')),
                "name": getattr(me, 'name', 'Unknown'),
                "screen_name": getattr(me, 'screen_name', 'unknown'),
                "description": getattr(me, 'description', ''),
                "followers_count": getattr(me, 'followers_count', 0),
                "following_count": getattr(me, 'following_count', 0),
                "tweets_count": getattr(me, 'tweets_count', 0),
            },
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error getting user info: {e}")
        raise HTTPException(status_code=400, detail=f"Error getting user info: {str(e)}")
    
    finally:
        if temp_file and os.path.exists(temp_file):
            os.unlink(temp_file)

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "service": "Twitter Feed API"
    }

@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "message": "Twitter Feed API is running",
        "version": "1.0.0",
        "endpoints": {
            "POST /fetch-feed": "Fetch user's Twitter feed",
            "POST /validate-cookies": "Validate authentication cookies",
            "POST /search": "Search tweets with detailed options",
            "GET /search/{query}": "Search tweets via GET request",
            "GET /user-info": "Get authenticated user information",
            "GET /health": "Health check",
            "GET /": "API information"
        },
        "timestamp": datetime.now().isoformat()
    }

@app.post("/simple-auth-test")
async def simple_auth_test(data: TokenInput):
    """Simplified authentication test with common fixes"""
    temp_file = None
    try:
        # Parse cookies
        cookies_dict = parse_cookies(data.auth_token, data.ct0, data.cookie)
        
        # Create client
        client = Client('en-US')
        
        # Save cookies
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(cookies_dict, f)
            temp_file = f.name
        
        # Load cookies
        client.load_cookies(temp_file)
        logger.info("Cookies loaded successfully")
        
        # Test authentication - try synchronous first
        try:
            logger.info("Trying synchronous get_me...")
            me = client.get_me()
            
            # Check if it's a coroutine
            if asyncio.iscoroutine(me):
                logger.info("get_me returned coroutine, awaiting...")
                me = await me
            
            if me:
                return {
                    "success": True,
                    "method": "synchronous" if not asyncio.iscoroutine(client.get_me()) else "asynchronous",
                    "user": {
                        "id": str(getattr(me, 'id', 'unknown')),
                        "name": getattr(me, 'name', 'Unknown'),
                        "screen_name": getattr(me, 'screen_name', 'unknown')
                    },
                    "timestamp": datetime.now().isoformat()
                }
            else:
                return {
                    "success": False,
                    "error": "get_me returned None",
                    "timestamp": datetime.now().isoformat()
                }
                
        except Exception as sync_error:
            logger.error(f"Synchronous approach failed: {sync_error}")
            
            # Try async approach
            try:
                logger.info("Trying asynchronous get_me...")
                me_coro = client.get_me()
                me = await me_coro
                
                if me:
                    return {
                        "success": True,
                        "method": "asynchronous",
                        "user": {
                            "id": str(getattr(me, 'id', 'unknown')),
                            "name": getattr(me, 'name', 'Unknown'),
                            "screen_name": getattr(me, 'screen_name', 'unknown')
                        },
                        "timestamp": datetime.now().isoformat()
                    }
                else:
                    return {
                        "success": False,
                        "error": "Async get_me also returned None",
                        "sync_error": str(sync_error),
                        "timestamp": datetime.now().isoformat()
                    }
                    
            except Exception as async_error:
                return {
                    "success": False,
                    "error": "Both sync and async methods failed",
                    "sync_error": str(sync_error),
                    "async_error": str(async_error),
                    "timestamp": datetime.now().isoformat()
                }
        
    except Exception as e:
        logger.error(f"Simple auth test failed: {e}")
        return {
            "success": False,
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }
    
    finally:
        if temp_file and os.path.exists(temp_file):
            os.unlink(temp_file)

@app.post("/test-cookie-parsing")
async def test_cookie_parsing(data: TokenInput):
    """Test just the cookie parsing without authentication"""
    try:
        cookies_dict = parse_cookies(data.auth_token, data.ct0, data.cookie)
        
        # Validate essential cookies
        validation_results = {}
        essential_cookies = ["auth_token", "ct0", "twid"]
        
        for cookie_name in essential_cookies:
            if cookie_name in cookies_dict and cookies_dict[cookie_name]:
                validation_results[cookie_name] = {
                    "present": True,
                    "length": len(cookies_dict[cookie_name]),
                    "starts_with": cookies_dict[cookie_name][:10] + "..." if len(cookies_dict[cookie_name]) > 10 else cookies_dict[cookie_name]
                }
            else:
                validation_results[cookie_name] = {
                    "present": False,
                    "length": 0,
                    "error": "Missing or empty"
                }
        
        return {
            "success": True,
            "total_cookies": len(cookies_dict),
            "cookie_names": list(cookies_dict.keys()),
            "essential_cookies_validation": validation_results,
            "has_cf_bm": "__cf_bm" in cookies_dict,
            "has_guest_id": "guest_id" in cookies_dict,
            "has_personalization_id": "personalization_id" in cookies_dict,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

@app.get("/test-twikit")
async def test_twikit():
    """Test if twikit library is working properly"""
    try:
        from twikit import Client
        
        # Test basic client creation
        client = Client('en-US')
        
        # Test if we can call methods without authentication
        info = {
            "twikit_imported": True,
            "client_created": True,
            "client_type": str(type(client)),
            "available_methods": [method for method in dir(client) if not method.startswith('_')],
            "test_timestamp": datetime.now().isoformat()
        }
        
        return info
        
    except ImportError as e:
        return {
            "error": f"Failed to import twikit: {str(e)}",
            "twikit_imported": False
        }
    except Exception as e:
        return {
            "error": f"Error testing twikit: {str(e)}",
            "twikit_imported": True,
            "client_created": False
        }

@app.post("/debug-auth")
async def debug_auth(data: TokenInput):
    """Debug authentication process step by step"""
    temp_file = None
    debug_info = {
        "step": "starting",
        "cookies_parsed": False,
        "cookies_loaded": False,
        "client_created": False,
        "get_me_called": False,
        "authenticated": False,
        "errors": []
    }
    
    try:
        # Step 1: Parse cookies
        debug_info["step"] = "parsing_cookies"
        cookies_dict = parse_cookies(data.auth_token, data.ct0, data.cookie)
        debug_info["cookies_parsed"] = True
        debug_info["cookie_count"] = len(cookies_dict)
        debug_info["cookie_keys"] = list(cookies_dict.keys())
        
        # Step 2: Create client
        debug_info["step"] = "creating_client"
        client = Client('en-US')
        debug_info["client_created"] = True
        
        # Step 3: Save cookies to temp file
        debug_info["step"] = "saving_cookies"
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(cookies_dict, f)
            temp_file = f.name
        debug_info["temp_file_created"] = True
        
        # Step 4: Load cookies
        debug_info["step"] = "loading_cookies"
        try:
            result = client.load_cookies(temp_file)
            if asyncio.iscoroutine(result):
                await result
            debug_info["cookies_loaded"] = True
        except Exception as e:
            debug_info["errors"].append(f"Cookie loading error: {str(e)}")
            return debug_info
        
        # Step 5: Test get_me
        debug_info["step"] = "calling_get_me"
        try:
            # Try different approaches based on twikit version
            me_result = client.get_me()
            debug_info["get_me_called"] = True
            debug_info["get_me_type"] = str(type(me_result))
            
            # Handle both sync and async versions
            if asyncio.iscoroutine(me_result):
                debug_info["get_me_is_coroutine"] = True
                me = await me_result
            else:
                debug_info["get_me_is_coroutine"] = False
                me = me_result
            
            debug_info["get_me_result_type"] = str(type(me))
            debug_info["get_me_result_value"] = str(me) if me else "None"
            
            if me:
                debug_info["authenticated"] = True
                debug_info["user_info"] = {
                    "id": str(getattr(me, 'id', 'unknown')),
                    "name": getattr(me, 'name', 'Unknown'),
                    "screen_name": getattr(me, 'screen_name', 'unknown'),
                    "has_id": hasattr(me, 'id'),
                    "has_name": hasattr(me, 'name'),
                    "has_screen_name": hasattr(me, 'screen_name'),
                    "all_attributes": [attr for attr in dir(me) if not attr.startswith('_')]
                }
            else:
                debug_info["errors"].append("get_me returned None or falsy value")
                debug_info["me_is_none"] = me is None
                debug_info["me_bool_value"] = bool(me)
                
        except Exception as e:
            debug_info["errors"].append(f"get_me error: {str(e)}")
            debug_info["error_type"] = str(type(e))
            import traceback
            debug_info["traceback"] = traceback.format_exc()
        
        debug_info["step"] = "completed"
        return debug_info
        
    except Exception as e:
        debug_info["errors"].append(f"General error: {str(e)}")
        import traceback
        debug_info["traceback"] = traceback.format_exc()
        return debug_info
    
    finally:
        if temp_file and os.path.exists(temp_file):
            os.unlink(temp_file)
