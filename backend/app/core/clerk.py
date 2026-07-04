"""
RAGLense - Clerk Authentication Integration

Provides token verification for Clerk JWTs using JWKS keys.
Includes TTL-based JWKS cache to handle key rotation.
"""

import time
import httpx
import logging
from jose import jwt, JWTError
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Cache for JWKS keys with TTL to handle key rotation
_jwks_cache: dict = {}
_jwks_cache_timestamp: float = 0.0
_JWKS_CACHE_TTL_SECONDS: int = 900  # 15 minutes


async def fetch_clerk_jwks(jwks_url: str, force_refresh: bool = False) -> dict:
    """Fetch and cache JWKS keys from Clerk with TTL-based expiry."""
    global _jwks_cache, _jwks_cache_timestamp

    now = time.time()
    cache_valid = _jwks_cache and (now - _jwks_cache_timestamp) < _JWKS_CACHE_TTL_SECONDS

    if cache_valid and not force_refresh:
        return _jwks_cache

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(jwks_url)
            response.raise_for_status()
            _jwks_cache = response.json()
            _jwks_cache_timestamp = now
            logger.info("Refreshed Clerk JWKS cache successfully.")
            return _jwks_cache
    except Exception as e:
        logger.error(f"Failed to fetch Clerk JWKS from {jwks_url}: {e}")
        # Return stale cache if available rather than failing completely
        if _jwks_cache:
            logger.warning("Using stale JWKS cache due to fetch failure.")
            return _jwks_cache
        return {}


async def verify_clerk_token(token: str) -> dict:
    """Decode and verify a Clerk session JWT token against Clerk JWKS."""
    jwks_url = settings.CLERK_JWKS_URL

    # Dev bypass ONLY in development mode — never in production/staging
    if not jwks_url:
        if settings.is_development:
            try:
                payload = jwt.get_unverified_claims(token)
                logger.warning(
                    "⚠️  Decoded Clerk token WITHOUT signature verification "
                    "(CLERK_JWKS_URL is empty, APP_ENV=development). "
                    "This is INSECURE and must not be used in production."
                )
                return payload
            except JWTError as e:
                raise ValueError(f"Invalid token format: {e}") from e
        else:
            raise ValueError(
                "CLERK_JWKS_URL must be configured in production/staging. "
                "Cannot verify Clerk tokens without JWKS endpoint."
            )

    # Fetch keys (with TTL cache)
    jwks = await fetch_clerk_jwks(jwks_url)
    if not jwks or "keys" not in jwks:
        raise ValueError("Could not retrieve Clerk JWKS keys for verification.")

    try:
        # Get token header to match key ID (kid)
        headers = jwt.get_unverified_header(token)
        kid = headers.get("kid")
        if not kid:
            raise ValueError("Token header missing 'kid' key identifier.")

        # Find matching key
        public_key = None
        for key in jwks["keys"]:
            if key.get("kid") == kid:
                public_key = key
                break

        if not public_key:
            # Key not found — try refreshing JWKS in case of key rotation
            logger.info(f"Key ID '{kid}' not found in cache, refreshing JWKS...")
            jwks = await fetch_clerk_jwks(jwks_url, force_refresh=True)
            for key in jwks.get("keys", []):
                if key.get("kid") == kid:
                    public_key = key
                    break

        if not public_key:
            raise ValueError(f"No matching key ID '{kid}' found in Clerk JWKS.")

        # Verify token signature using matched public key
        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            options={"verify_aud": False},  # clerk sets aud to project URL
        )
        return payload

    except JWTError as e:
        raise ValueError(f"Clerk signature verification failed: {e}") from e
