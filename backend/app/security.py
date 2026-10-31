from datetime import UTC, datetime, timedelta
import hashlib
import secrets
import uuid

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from .config import Settings
from .models import User

_password_hasher = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1)


def hash_secret(value: str) -> str:
    return _password_hasher.hash(value)


def verify_secret(value: str, stored_hash: str | None) -> bool:
    if not stored_hash:
        return False
    try:
        return _password_hasher.verify(stored_hash, value)
    except (InvalidHashError, VerificationError, VerifyMismatchError):
        return False


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def create_access_token(user: User, session_id: uuid.UUID, settings: Settings, now: datetime | None = None) -> tuple[str, int]:
    issued = now or datetime.now(UTC)
    lifetime = settings.access_token_expire_minutes * 60
    claims = {
        "sub": str(user.id),
        "sid": str(session_id),
        "type": "access",
        "iat": issued,
        "exp": issued + timedelta(seconds=lifetime),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(claims, settings.token_secret, algorithm=settings.jwt_algorithm), lifetime


def create_refresh_token(user: User, session_id: uuid.UUID, settings: Settings, now: datetime | None = None) -> tuple[str, datetime]:
    issued = now or datetime.now(UTC)
    expires = issued + timedelta(days=settings.refresh_token_expire_days)
    claims = {
        "sub": str(user.id),
        "sid": str(session_id),
        "type": "refresh",
        "iat": issued,
        "exp": expires,
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(claims, settings.token_secret, algorithm=settings.jwt_algorithm), expires


def decode_token(token: str, settings: Settings, expected_type: str) -> dict:
    claims = jwt.decode(token, settings.token_secret, algorithms=[settings.jwt_algorithm])
    if claims.get("type") != expected_type:
        raise jwt.InvalidTokenError("Wrong token type.")
    return claims


def user_display_name(user: User) -> str | None:
    if user.doctor_profile:
        return user.doctor_profile.doctor_name
    if user.patient_profile:
        return user.patient_profile.full_name
    return user.email or user.phone_number
