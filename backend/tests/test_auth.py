"""
RAGLens Tests — Authentication & JWT/Clerk validation (test_auth.py)

Tests:
  1. Custom JWT: valid token → payload extracted correctly
  2. Custom JWT: expired token → ValueError raised
  3. Custom JWT: tampered signature → ValueError raised
  4. Clerk user auto-provision: new Clerk user is created in DB on first login
  5. RBAC: owner always gets "owner" role
  6. RBAC: non-member gets None role
"""

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio


# ── JWT Helper Tests ────────────────────────────────────────────────────────────

class TestJWTVerification:
    """Unit tests for app.core.security.verify_access_token."""

    def test_valid_token_returns_payload(self):
        """A correctly signed, non-expired token should decode cleanly."""
        from app.core.security import create_access_token, verify_access_token

        user_id = str(uuid.uuid4())
        # create_access_token takes a subject string (the user id)
        # extra claims can be passed via extra_claims kwarg
        token = create_access_token(subject=user_id, extra_claims={"email": "a@b.com"})
        payload = verify_access_token(token)
        assert "sub" in payload
        assert payload["email"] == "a@b.com"

    def test_expired_token_raises(self):
        """Tokens with exp in the past must raise ValueError."""
        import jose.jwt as jwt
        from app.core.config import get_settings

        settings = get_settings()
        expired_payload = {
            "sub": str(uuid.uuid4()),
            "exp": datetime.now(UTC) - timedelta(hours=1),
        }
        token = jwt.encode(expired_payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

        from app.core.security import verify_access_token
        with pytest.raises(ValueError):
            verify_access_token(token)

    def test_tampered_token_raises(self):
        """A token with a modified signature segment must raise ValueError."""
        from app.core.security import create_access_token, verify_access_token

        token = create_access_token({"sub": str(uuid.uuid4())})
        # Corrupt the last few characters of the signature
        tampered = token[:-5] + "XXXXX"

        with pytest.raises(ValueError):
            verify_access_token(tampered)


# ── Clerk Auto-Provision Tests ──────────────────────────────────────────────────

class TestClerkUserProvision:
    """
    Tests that a Clerk JWT causes auto-provisioning of a new User row.
    We patch verify_clerk_token so no real HTTP call is made.
    """

    @pytest.mark.asyncio
    async def test_new_clerk_user_is_provisioned(self, async_db):
        """
        When a valid Clerk token arrives for an unknown user, get_current_user
        must create and flush a new User row into the session.
        """
        from app.api.v1.deps import get_current_user
        from fastapi.security import HTTPAuthorizationCredentials

        clerk_sub = f"user_clerk_{uuid.uuid4().hex[:16]}"
        fake_clerk_payload = {
            "sub": clerk_sub,
            "email": "clerk_new@example.com",
            "primary_email_address": "clerk_new@example.com",
        }

        # Mock both verify_access_token (raises) and verify_clerk_token (succeeds)
        with (
            patch("app.api.v1.deps.verify_access_token", side_effect=ValueError("not custom JWT")),
            patch("app.core.clerk.verify_clerk_token", new=AsyncMock(return_value=fake_clerk_payload)),
        ):
            creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="fake.clerk.token")
            user = await get_current_user(creds, async_db)

        assert user is not None
        assert user.email == "clerk_new@example.com"
        assert user.is_active is True

    @pytest.mark.asyncio
    async def test_existing_user_is_returned(self, async_db, mock_user):
        """An existing user should be fetched, not duplicated."""
        from app.core.security import create_access_token
        from app.api.v1.deps import get_current_user
        from fastapi.security import HTTPAuthorizationCredentials

        # subject must be the UUID string — deps.py does uuid.UUID(payload["sub"])
        token = create_access_token(subject=str(mock_user.id))
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

        user = await get_current_user(creds, async_db)
        assert user.id == mock_user.id


# ── RBAC get_kb_role Tests ──────────────────────────────────────────────────────

class TestKBRoleChecks:

    @pytest.mark.asyncio
    async def test_owner_gets_owner_role(self, async_db, mock_kb, mock_user):
        """The KB owner should always receive 'owner' role."""
        from app.api.v1.deps import get_kb_role

        role = await get_kb_role(mock_kb.id, mock_user, async_db)
        assert role == "owner"

    @pytest.mark.asyncio
    async def test_non_member_gets_none(self, async_db, mock_kb):
        """A user with no membership should receive None."""
        from app.infrastructure.db.models.user import User
        from app.api.v1.deps import get_kb_role

        stranger = User(
            id=uuid.uuid4(),
            email="stranger@test.com",
            hashed_password="pw",
            full_name="Stranger",
            is_active=True,
            is_verified=True,
        )
        async_db.add(stranger)
        await async_db.flush()

        role = await get_kb_role(mock_kb.id, stranger, async_db)
        assert role is None
