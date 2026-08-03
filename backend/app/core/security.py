"""
RAGLense - Security Utilities

JWT token management, password hashing, and authentication helpers.
"""

from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
from jose import JWTError, jwt

from app.core.config import get_settings

settings = get_settings()


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt."""
    # Truncate to 72 bytes if needed as per bcrypt spec
    passwd_bytes = password.encode("utf-8")[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(passwd_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a hashed password."""
    try:
        passwd_bytes = plain_password.encode("utf-8")[:72]
        hashed_bytes = hashed_password.encode("utf-8")
        return bcrypt.checkpw(passwd_bytes, hashed_bytes)
    except Exception:
        return False


def create_access_token(
    subject: str | int,
    extra_claims: dict[str, Any] | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    """Create a JWT access token."""
    if expires_delta is None:
        expires_delta = timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)

    now = datetime.now(UTC)
    expire = now + expires_delta

    to_encode: dict[str, Any] = {
        "sub": str(subject),
        "exp": expire,
        "iat": now,
        "type": "access",
    }
    if extra_claims:
        to_encode.update(extra_claims)

    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(
    subject: str | int,
    expires_delta: timedelta | None = None,
) -> str:
    """Create a JWT refresh token."""
    if expires_delta is None:
        expires_delta = timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)

    now = datetime.now(UTC)
    expire = now + expires_delta

    to_encode: dict[str, Any] = {
        "sub": str(subject),
        "exp": expire,
        "iat": now,
        "type": "refresh",
    }

    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT token."""
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        return payload
    except JWTError as e:
        raise ValueError(f"Invalid token: {e}") from e


def verify_access_token(token: str) -> dict[str, Any]:
    """Decode an access token and verify it's the right type."""
    payload = decode_token(token)
    if payload.get("type") != "access":
        raise ValueError("Invalid token type: expected access token")
    return payload


def verify_refresh_token(token: str) -> dict[str, Any]:
    """Decode a refresh token and verify it's the right type."""
    payload = decode_token(token)
    if payload.get("type") != "refresh":
        raise ValueError("Invalid token type: expected refresh token")
    return payload
