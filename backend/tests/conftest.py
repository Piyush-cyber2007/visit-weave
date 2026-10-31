import asyncio
from dataclasses import dataclass
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from backend.app.config import Settings
from backend.app.main import create_app
from backend.app.models import Base, DoctorProfile, User
from backend.app.security import hash_secret
from backend.app.database import create_session_factory
from backend.app.roles import Role


@dataclass
class AuthHarness:
    client: TestClient
    engine: object
    session_factory: async_sessionmaker
    settings: Settings


@pytest.fixture

def auth_harness(tmp_path: Path):
    database_path = tmp_path / "isolated-auth-tests.sqlite3"
    database_url = f"sqlite+aiosqlite:///{database_path.as_posix()}"
    engine = create_async_engine(database_url, poolclass=NullPool)
    session_factory = create_session_factory(engine)

    async def create_schema() -> None:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

    asyncio.run(create_schema())
    settings = Settings(
        environment="development",
        database_url=database_url,
        jwt_secret_key="test-only-secret-" + ("x" * 48),
        auth_internal_secret="test-internal-secret",
        otp_expire_minutes=5,
        otp_max_attempts=3,
        otp_resend_cooldown_seconds=0,
        otp_max_requests_per_hour=20,
    )
    app = create_app(settings=settings, engine=engine)
    with TestClient(app) as client:
        yield AuthHarness(client, engine, session_factory, settings)
    asyncio.run(engine.dispose())


@pytest.fixture

def add_doctor(auth_harness: AuthHarness):
    def provision(
        email: str = "doctor@example.test",
        password: str = "CorrectHorseBattery9!",
        active: bool = True,
    ) -> None:
        async def create() -> None:
            async with auth_harness.session_factory() as session:
                user = User(
                    email=email,
                    password_hash=hash_secret(password),
                    role=Role.DOCTOR,
                    is_active=active,
                    is_verified=True,
                    doctor_profile=DoctorProfile(doctor_name="Dr. Test Provider", specialization="General Medicine"),
                )
                session.add(user)
                await session.commit()
        asyncio.run(create())
    return provision
