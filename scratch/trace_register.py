import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.core.config import get_settings
from app.infrastructure.db.models.user import User
from app.core.security import hash_password, create_access_token, create_refresh_token
from app.api.v1.schemas.auth import UserResponse, TokenResponse, AuthResponse
import traceback

settings = get_settings()

async def run_test():
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = async_sessionmaker(engine, expire_on_commit=False)
    
    async with async_session() as db:
        try:
            print("1. Hashing password...")
            hashed = hash_password("SecretTestPassword123!")
            print("Hashed:", hashed)
            
            print("2. Creating User object...")
            user = User(
                email="test_val_error@gmail.com",
                hashed_password=hashed,
                full_name="Test Value Error",
                organization="Test Org"
            )
            db.add(user)
            await db.flush()
            print("3. Flushed user, ID:", user.id)
            
            print("4. Creating access token...")
            access_token = create_access_token(subject=str(user.id))
            print("Access Token:", access_token)
            
            print("5. Model validation...")
            validated = UserResponse.model_validate(user)
            print("Validated:", validated)
        except Exception as e:
            print("FAILED WITH EXCEPTION:")
            traceback.print_exc()

asyncio.run(run_test())
