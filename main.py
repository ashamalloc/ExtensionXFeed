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

# Initialize FastAPI app
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
        return None

def parse_cookies(auth_token: str, ct0: str, cookie_string: str) -> Dict[str, str]:
    """Enhanced cookie parsing with validation"""
    cookies_dict = {
        "auth_token": auth_token.strip(),
        "ct0": ct0.strip(),
    }
    
    # Validate basic cookie format
    if not auth_token or not ct0:
        raise ValueError("auth_token and ct0 are required")
    
    # Add other cookies from full cookie string
    try:
        for item in cookie_string.split(";"):
            if "=" in item:
                key, value = item.strip().split("=", 1)
                key = key.strip()
                value = value.strip()
                
                if key and value and key not in cookies_dict:
                    cookies_dict[key] = value
        
        logger.info(f"Parsed cookies: {', '.join(cookies_dict.keys())}")
        
        # Log cookie lengths for debugging (without exposing actual values)
        for key, value in cookies_dict.items():
            logger.info(f"Cookie {key}: length {len(value)}")
        
        return cookies_dict
        
    except Exception as e:
        logger.error(f"Error parsing cookies: {e}")
        return {
            "auth_token": auth_token.strip(),
            "ct0": ct0.strip(),
        }

def extract_user_data(user_data, method_used: str) -> Dict[str, Any]:
    """Extract user data from various user object formats"""
    try:
        # Handle different user object types
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
            # Fallback - try to convert to string and extract basic info
            user_str = str(user_data)
            return {
                "id": "extracted_user",
                "name": "Authenticated User",
                "screen_name": "authenticated",
                "method_used": f"{method_used} (fallback)",
                "raw_data": user_str[:100]  # First 100 chars for debugging
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
    """Try alternative methods to verify authentication"""
    
    # Method 1: Try to access user timeline/tweets
    try:
        logger.info("Trying to verify auth via user timeline...")
        # Some twikit versions have get_user_tweets or similar
        if hasattr(client, 'get_user_tweets'):
            # Try to get your own tweets (this would require being authenticated)
            result = await safe_await(client.get_user_tweets('self', count=1))
            if result:
                logger.info("Authentication verified via user timeline access")
                return {
                    "id": "timeline_verified",
                    "name": "Authenticated User",
                    "screen_name": "authenticated",
                    "method_used": "timeline_verification"
                }
    except Exception as e:
        logger.warning(f"Timeline verification failed: {e}")
    
    # Method 2: Try search with a very specific query that would require auth
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
    
    # Method 3: Try to access client properties that might contain user info
    try:
        logger.info("Checking client properties for user info...")
        properties_to_check = ['user_id', 'current_user_id', 'authenticated_user_id', '_user', '_current_user']
        
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
    """Get user info using compatible methods across twikit versions"""
    
    # First, let's try the most common twikit methods
    methods_to_try = [
        ("get_me", True),  # (method_name, is_async)
        ("me", False),
        ("get_user", True),
        ("user", False),
        ("get_authenticated_user", True),
        ("authenticated_user", False),
        ("current_user", False),
        ("get_current_user", True),
    ]
    
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
                            # Method might not be async despite our assumption
                            result = method()
                    else:
                        result = method()
                        # Check if result is actually a coroutine
                        if asyncio.iscoroutine(result):
                            result = await result
                else:
                    # It's a property
                    result = method
                
                if result:
                    logger.info(f"Successfully got user info via {method_name}")
                    return extract_user_data(result, method_name)
                        
            except Exception as e:
                logger.warning(f"Method {method_name} failed: {e}")
                continue
    
    # Try alternative approaches
    return await try_alternative_auth_verification(client)

async def create_authenticated_client(tokens: TokenInput) -> tuple[Client, str, Optional[Dict[str, Any]]]:
    """Create and authenticate a Twitter client with improved error handling"""
    client = Client('en-US')
    cookies_dict = parse_cookies(tokens.auth_token, tokens.ct0, tokens.cookie)
    
    logger.info(f"Processing cookies. Keys found: {list(cookies_dict.keys())}")
    
    # Validate required cookies
    required_cookies = ['auth_token', 'ct0']
    missing_cookies = [cookie for cookie in required_cookies if not cookies_dict.get(cookie)]
    
    if missing_cookies:
        raise Exception(f"Missing required cookies: {missing_cookies}")
    
    # Create temporary file for cookies
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        json.dump(cookies_dict, f)
        temp_file = f.name
    
    try:
        # Load cookies
        logger.info("Loading cookies into client...")
        result = client.load_cookies(temp_file)
        if asyncio.iscoroutine(result):
            await result
        logger.info("Cookies loaded successfully")
        
        # Test authentication with detailed logging
        logger.info("Testing authentication...")
        user_info = await get_user_info_compatible(client)
        
        if user_info:
            logger.info(f"Authentication successful: {user_info}")
            return client, temp_file, user_info
        else:
            # Before failing, let's try one more simple test
            try:
                logger.info("Attempting final authentication test...")
                # Try a simple API call that would fail if not authenticated
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
@app.post("/simple-auth-test")
async def simple_auth_test(data: TokenInput):
    """Test authentication with better compatibility"""
    temp_file = None
    try:
        client, temp_file, user_info = await create_authenticated_client(data)
        
        return {
            "success": True,
            "user": user_info,
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

@app.post("/search")
async def search_tweets(request: SearchRequest):
    """Search for tweets with specified query"""
    temp_file = None
    try:
        client, temp_file, user_info = await create_authenticated_client(request.tokens)
        
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
            "authenticated_user": user_info,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Search error: {e}")
        raise HTTPException(status_code=400, detail=f"Search error: {str(e)}")
    
    finally:
        if temp_file and os.path.exists(temp_file):
            os.unlink(temp_file)

@app.post("/validate-cookies")
async def validate_cookies(data: TokenInput):
    """Validate Twitter authentication cookies"""
    temp_file = None
    try:
        client, temp_file, user_info = await create_authenticated_client(data)
        
        return {
            "valid": True,
            "user": user_info,
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

@app.post("/debug-auth-detailed")
async def debug_auth_detailed(data: TokenInput):
    """Detailed debugging for authentication issues"""
    temp_file = None
    try:
        # Step 1: Validate input cookies
        logger.info("=== STEP 1: Validating input cookies ===")
        cookies_dict = parse_cookies(data.auth_token, data.ct0, data.cookie)
        
        auth_info = {
            "auth_token_length": len(data.auth_token),
            "ct0_length": len(data.ct0), 
            "cookie_string_length": len(data.cookie),
            "parsed_cookies_count": len(cookies_dict),
            "parsed_cookies_keys": list(cookies_dict.keys())
        }
        
        # Step 2: Create client and load cookies
        logger.info("=== STEP 2: Creating client and loading cookies ===")
        client = Client('en-US')
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(cookies_dict, f)
            temp_file = f.name
        
        result = client.load_cookies(temp_file)
        if asyncio.iscoroutine(result):
            await result
        
        # Step 3: Test various client methods
        logger.info("=== STEP 3: Testing client methods ===")
        client_info = {
            "client_type": str(type(client)),
            "client_dir": [attr for attr in dir(client) if not attr.startswith('_')],
            "user_methods": [attr for attr in dir(client) if 'user' in attr.lower()],
            "me_methods": [attr for attr in dir(client) if 'me' in attr.lower()],
            "auth_methods": [attr for attr in dir(client) if 'auth' in attr.lower()],
        }
        
        # Step 4: Try authentication methods one by one
        logger.info("=== STEP 4: Testing authentication methods ===")
        auth_results = {}
        
        test_methods = [
            ("get_me", True),
            ("me", False), 
            ("get_user", True),
            ("user", False),
            ("get_authenticated_user", True),
            ("authenticated_user", False),
        ]
        
        for method_name, is_async in test_methods:
            if hasattr(client, method_name):
                try:
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
                    
                    auth_results[method_name] = {
                        "success": True,
                        "result_type": str(type(result)),
                        "result_has_id": hasattr(result, 'id') if result else False,
                        "result_has_name": hasattr(result, 'name') if result else False,
                        "result_str": str(result)[:200] if result else "None"
                    }
                except Exception as e:
                    auth_results[method_name] = {
                        "success": False,
                        "error": str(e),
                        "error_type": str(type(e))
                    }
            else:
                auth_results[method_name] = {"success": False, "error": "Method not found"}
        
        # Step 5: Try API calls
        logger.info("=== STEP 5: Testing API calls ===")
        api_test_results = {}
        
        try:
            search_result = client.search_tweet("test", "Latest")
            tweets = await safe_await(search_result)
            api_test_results["search_test"] = {
                "success": True,
                "tweets_count": len(tweets) if tweets else 0,
                "tweets_type": str(type(tweets)) if tweets else "None"
            }
        except Exception as e:
            api_test_results["search_test"] = {
                "success": False,
                "error": str(e),
                "error_type": str(type(e))
            }
        
        return {
            "success": True,
            "debug_info": {
                "auth_info": auth_info,
                "client_info": client_info,
                "auth_results": auth_results,
                "api_test_results": api_test_results,
            },
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "error_type": str(type(e)),
            "timestamp": datetime.now().isoformat()
        }
    
    finally:
        if temp_file and os.path.exists(temp_file):
            os.unlink(temp_file)

@app.post("/debug-twikit-methods")
async def debug_twikit_methods(data: TokenInput):
    """Debug what methods are available in the twikit client"""
    temp_file = None
    try:
        # Parse cookies and create client
        cookies_dict = parse_cookies(data.auth_token, data.ct0, data.cookie)
        client = Client('en-US')
        
        # Save and load cookies
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(cookies_dict, f)
            temp_file = f.name
        
        result = client.load_cookies(temp_file)
        if asyncio.iscoroutine(result):
            await result
        
        # Get all available methods
        all_methods = [method for method in dir(client) if not method.startswith('_')]
        user_related_methods = [method for method in all_methods if 'user' in method.lower() or 'me' in method.lower()]
        
        # Test which methods actually exist and are callable
        callable_methods = {}
        for method_name in user_related_methods:
            method = getattr(client, method_name, None)
            if method:
                callable_methods[method_name] = {
                    "callable": callable(method),
                    "type": str(type(method)),
                    "doc": getattr(method, '__doc__', 'No documentation')[:100] if hasattr(method, '__doc__') else None
                }
        
        return {
            "success": True,
            "twikit_version": hasattr(client, '__version__'),
            "total_methods": len(all_methods),
            "all_methods": all_methods,
            "user_related_methods": user_related_methods,
            "callable_methods": callable_methods,
            "has_get_me": hasattr(client, 'get_me'),
            "has_me": hasattr(client, 'me'),
            "has_user": hasattr(client, 'user'),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }
    
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
            "POST /simple-auth-test": "Test authentication with better compatibility",
            "POST /validate-cookies": "Validate authentication cookies",
            "POST /search": "Search tweets with detailed options",
            "POST /debug-twikit-methods": "Debug available twikit methods",
            "POST /debug-auth-detailed": "Detailed authentication debugging",
            "GET /health": "Health check",
            "GET /": "API information"
        },
        "timestamp": datetime.now().isoformat()
    }
